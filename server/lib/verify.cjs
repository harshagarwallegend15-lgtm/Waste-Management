const sharp = require('sharp');
const { db } = require('./supabase.cjs');
const { similarity } = require('./cv.cjs');
const { groqComparePhotos } = require('./ai.cjs');

// Tuneable thresholds (override via env)
const MAX_GPS_DISTANCE_M = Number(process.env.CV_GPS_MAX_M || 300);   // generous doorstep tolerance
const MAX_TIME_DELTA_H = Number(process.env.CV_TIME_MAX_H || 72);      // request can be created up to 3 days before pickup
const LOCAL_VERIFIED = Number(process.env.CV_VERIFIED || 0.82);        // >= this → auto-verified locally
const AI_BAND_MIN = Number(process.env.CV_AI_MIN || 0.55);             // in [AI_BAND_MIN, LOCAL_VERIFIED) → ask AI vision
const EMPTY_FG_SCORE = 0.03;                                           // after-photo with almost no foreground → suspicious

/** Preprocess an image to a canonical form: EXIF-oriented, ≤512px, JPEG quality 85. */
async function preprocess(buf, contentType) {
  return sharp(buf)
    .rotate()
    .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function minutesBetween(a, b) {
  if (!a || !b) return null;
  return Math.abs(new Date(a) - new Date(b)) / 60000;
}

/**
 * Download an image. If the URL points at Supabase Storage (private bucket),
 * exchange it for a short-lived signed URL using the server client first.
 */
async function download(url) {
  let target = url;
  try {
    const parsed = new URL(url);
    const storageMark = '/storage/v1/object/public/';
    const idx = parsed.pathname.indexOf(storageMark);
    if (idx !== -1) {
      const objectPath = parsed.pathname.slice(idx + storageMark.length);
      const bucket = objectPath.split('/')[0];
      const object = objectPath.slice(bucket.length + 1);
      const { data, error } = await db.storage.from(bucket).createSignedUrl(object, 300);
      if (!error && data?.signedUrl) target = data.signedUrl;
    }
  } catch { /* not a URL we can sign — fetch directly */ }
  const res = await fetch(target);
  if (!res.ok) throw new Error('Could not fetch image: ' + url);
  const buf = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get('content-type') || 'image/jpeg';
  return { buf, type };
}

/**
 * Verify a collection by comparing the resident's before-photo to the
 * collector's after-photo using the hybrid CV pipeline.
 *
 * req must contain: before_photo_url, before_gps_lat/lng, before_timestamp,
 * after_gps_lat/lng, after_timestamp, resident_id, collector_id.
 * afterBuffer: the collector's freshly uploaded photo buffer.
 */
async function verifyCollection(reqRow, afterBuffer) {
  const reasons = [];

  // --- 1. Local heuristic pass ---
  if (!reqRow.before_photo_url) {
    reasons.push({ check: 'photo', reason: 'Resident before-photo is missing — cannot compare' });
    const event = await logEvent({
      entity_type: 'collection', entity_id: reqRow.id, verifier: 'auto',
      verdict: 'flagged', cv_score: null, reasons,
    });
    const { error: uErr } = await db.from('collection_requests')
      .update({ status: 'flagged', cv_method: 'local', verified_at: null }).eq('id', reqRow.id);
    if (uErr) throw uErr;
    return { verdict: 'flagged', cv_score: null, cv_method: 'local', reasons, event, ai_reason: '' };
  }

  const { buf: beforeBuf, type: beforeType } = await download(reqRow.before_photo_url);
  const [beforeCanon, afterCanon] = await Promise.all([
    preprocess(beforeBuf, beforeType),
    preprocess(afterBuffer),
  ]);

  const { score: localScore, parts } = await similarity(beforeCanon, afterCanon);
  let cvMethod = 'local';
  let verdict = 'flagged';
  let cvScore = localScore;
  let aiReason = '';

  // Emptiness sanity: if the after-photo contains almost no foreground/edges,
  // the collector may have photographed an empty doorstep instead of the waste.
  const afterFg = parts.fg;
  const afterEdge = parts.edge;
  const emptyAfter = afterFg != null && afterFg < EMPTY_FG_SCORE && afterEdge < 0.06;
  if (emptyAfter) {
    reasons.push({ check: 'local_cv', reason: 'After-photo appears empty (no foreground objects detected)' });
    verdict = 'flagged';
  }

  // --- 2. AI vision band ---
  if (!emptyAfter && localScore >= LOCAL_VERIFIED) {
    verdict = 'verified';
  } else if (!emptyAfter && localScore >= AI_BAND_MIN) {
    cvMethod = 'hybrid';
    try {
      const ai = await groqComparePhotos(reqRow.before_photo_url, reqRow.after_photo_url);
      cvScore = ai.verdict === 'verified' ? Math.max(localScore, ai.confidence) : Math.min(localScore, ai.confidence);
      verdict = ai.verdict;
      aiReason = ai.reason;
      reasons.push({ check: 'ai_vision', reason: aiReason, confidence: ai.confidence });
    } catch (e) {
      reasons.push({ check: 'ai_vision', reason: 'AI unavailable: ' + e.message });
      verdict = 'flagged';
    }
  } else if (!emptyAfter) {
    reasons.push({ check: 'local_cv', reason: `Low similarity score (${localScore.toFixed(2)})` });
    verdict = 'flagged';
  }

  // --- 3. GPS + time constraints ---
  const gpsDistance = haversineMeters(
    reqRow.before_gps_lat, reqRow.before_gps_lng,
    reqRow.after_gps_lat, reqRow.after_gps_lng
  );
  const timeDeltaMin = minutesBetween(reqRow.before_timestamp, reqRow.after_timestamp);
  const timeDeltaH = timeDeltaMin == null ? null : timeDeltaMin / 60;

  if (gpsDistance != null && gpsDistance > MAX_GPS_DISTANCE_M) {
    reasons.push({ check: 'gps', reason: `Distance ${Math.round(gpsDistance)}m exceeds ${MAX_GPS_DISTANCE_M}m` });
    verdict = 'flagged';
  } else if (gpsDistance != null) {
    reasons.push({ check: 'gps', reason: `Distance ${Math.round(gpsDistance)}m` });
  }
  if (timeDeltaH != null && timeDeltaH > MAX_TIME_DELTA_H) {
    reasons.push({ check: 'time', reason: `Time window ${timeDeltaH.toFixed(1)}h exceeds ${MAX_TIME_DELTA_H}h` });
    verdict = 'flagged';
  } else if (timeDeltaH != null) {
    reasons.push({ check: 'time', reason: `Time window ${timeDeltaH.toFixed(1)}h` });
  }

  // --- 4. Persist event + update request ---
  const signalSummary = Object.entries(parts)
    .map(([k, v]) => `${k}:${(v || 0).toFixed(2)}`)
    .join(', ');
  reasons.push({ check: 'signals', reason: signalSummary });
  const event = await logEvent({
    entity_type: 'collection',
    entity_id: reqRow.id,
    verifier: 'auto',
    verdict,
    cv_score: cvScore,
    gps_distance: gpsDistance,
    time_delta: timeDeltaMin == null ? null : Math.round(timeDeltaMin),
    reasons,
  });

  const { error: uErr } = await db
    .from('collection_requests')
    .update({
      status: verdict === 'verified' ? 'verified' : 'flagged',
      match_score: cvScore,
      cv_method: cvMethod,
      verified_at: verdict === 'verified' ? new Date().toISOString() : null,
    })
    .eq('id', reqRow.id);
  if (uErr) throw uErr;

  return {
    verdict, cv_score: cvScore, cv_method: cvMethod,
    gps_distance: gpsDistance, time_delta_min: timeDeltaMin,
    reasons, signals: parts, event, ai_reason: aiReason,
  };
}

/** Log a verification event (auto or admin). */
async function logEvent({ entity_type, entity_id, verifier, verdict, cv_score, gps_distance, time_delta, reasons }) {
  const { data, error } = await db
    .from('verification_events')
    .insert({
      entity_type, entity_id, verifier, verdict,
      cv_score, gps_distance, time_delta,
      reasons: reasons || [],
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Verify a dumping report. Since it's a single photo of a real scene, human review
 *  + duplicate detection is the primary check; returns true if unique enough. */
async function checkReportDuplicate(reportRow) {
  const { data } = await db
    .from('dumping_reports')
    .select('id, gps_lat, gps_lng, report_timestamp, status')
    .eq('status', 'verified')
    .neq('id', reportRow.id);
  if (!data) return false;
  for (const other of data) {
    const d = haversineMeters(reportRow.gps_lat, reportRow.gps_lng, other.gps_lat, other.gps_lng);
    const mins = minutesBetween(reportRow.report_timestamp, other.report_timestamp);
    if (d != null && d < 30 && mins != null && mins < 7 * 24 * 60) return true;
  }
  return false;
}

module.exports = { verifyCollection, logEvent, checkReportDuplicate, haversineMeters };
