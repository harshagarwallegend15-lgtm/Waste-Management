const express = require('express');
const router = express.Router();
const { db } = require('../lib/supabase.cjs');
const { authRequired, roleGuard } = require('../middleware/auth.cjs');
const { recomputeSocietyScore } = require('../lib/scoring.cjs');

/** Haversine distance in kilometres between two lat/lng points. */
function distanceKm(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// The societies.geolocation columns arrive via schema.sql. Until that migration
// is applied to a live database, selecting them errors — so probe once and fall
// back to a coords-free query (distance ranking simply stays disabled).
let _gpsAvailable = null;
async function gpsColumnsAvailable() {
  if (_gpsAvailable !== null) return _gpsAvailable;
  const { error } = await db.from('societies').select('id, gps_lat, gps_lng').limit(1);
  _gpsAvailable = !(error && /gps_lat/i.test(error.message));
  return _gpsAvailable;
}

const COORDS_FIELDS = 'id, name, address, gps_lat, gps_lng, area_id, areas(name)';
const NO_COORDS_FIELDS = 'id, name, address, area_id, areas(name)';

// "Societies in your city": how far from the traced location we still show a
// society. Configurable per deployment.
const CITY_RADIUS_KM = parseFloat(process.env.SOCIETY_CITY_RADIUS_KM) || 5;

/** Societies for signup/meta use, with gps when the migration is applied. */
async function getMetaSocieties() {
  const fields = (await gpsColumnsAvailable()) ? COORDS_FIELDS : NO_COORDS_FIELDS;
  const { data, error } = await db.from('societies').select(fields).order('name');
  if (error) return [];
  return data || [];
}

/**
 * Switch the calling resident's society (e.g. after moving). Updates their
 * profile society + area, optionally their saved GPS pin, and refreshes the
 * scores of both the old and the new society so live rankings stay accurate.
 */
router.patch('/me', authRequired, roleGuard('resident'), async (req, res) => {
  try {
    const { society_id, gps_lat, gps_lng } = req.body;
    if (!society_id) return res.status(400).json({ error: 'society_id is required' });

    const gpsAvailable = await gpsColumnsAvailable();
    const fields = gpsAvailable ? 'id, area_id, name, gps_lat, gps_lng' : 'id, area_id, name';
    const { data: society, error: sErr } = await db
      .from('societies')
      .select(fields)
      .eq('id', society_id)
      .single();
    if (sErr || !society) return res.status(400).json({ error: 'Invalid society' });

    const oldSocietyId = req.profile.society_id;
    const update = {
      society_id: society.id,
      area_id: society.area_id,
    };
    if (Number.isFinite(parseFloat(gps_lat)) && Number.isFinite(parseFloat(gps_lng))) {
      update.gps_lat = parseFloat(gps_lat);
      update.gps_lng = parseFloat(gps_lng);
    } else if (gpsAvailable && society.gps_lat != null && society.gps_lng != null && req.profile.gps_lat == null) {
      // No pin yet — use the society pin as a sensible default.
      update.gps_lat = society.gps_lat;
      update.gps_lng = society.gps_lng;
    }

    const { data: profile, error: pErr } = await db
      .from('profiles')
      .update(update)
      .eq('id', req.profile.id)
      .select()
      .single();
    if (pErr) return res.status(400).json({ error: pErr.message });

    if (oldSocietyId && oldSocietyId !== society.id) recomputeSocietyScore(oldSocietyId).catch(() => {});
    recomputeSocietyScore(society.id).catch(() => {});

    return res.json({ profile, society_name: society.name });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/**
 * Live societies list for a resident. When lat/lng are provided, only the
 * societies within CITY_RADIUS_KM of the traced location are returned
 * ("societies in your city"), ranked nearest-first, each with realtime
 * aggregates: member count, open problems, pending pickups, verified pickups
 * today and the current society score. The resident's own society is always
 * included (their card must never vanish). Without a location we return only
 * the resident's own society — never a full dump of every society.
 */
router.get('/nearby', authRequired, async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const hasGps = Number.isFinite(lat) && Number.isFinite(lng);
    const gpsAvailable = await gpsColumnsAvailable();

    const fields = gpsAvailable ? COORDS_FIELDS : NO_COORDS_FIELDS;
    const { data: societies, error } = await db
      .from('societies')
      .select(fields)
      .order('name');
    if (error) return res.status(400).json({ error: error.message });

    const distances = {};
    if (hasGps && gpsAvailable) {
      for (const s of societies || []) distances[s.id] = distanceKm(lat, lng, s.gps_lat, s.gps_lng);
    }

    let visible = (societies || []).filter((s) => {
      if (s.id === req.profile.society_id) return true;
      const d = distances[s.id];
      return d != null && d <= CITY_RADIUS_KM;
    });
    if (!hasGps || !gpsAvailable) {
      visible = (societies || []).filter((s) => s.id === req.profile.society_id);
    }

    const ids = visible.map((s) => s.id);
    const today = new Date().toISOString().slice(0, 10);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    // Aggregate all live metrics in as few queries as possible.
    const countBy = (rows) => {
      const m = {};
      for (const r of rows || []) m[r.society_id] = (m[r.society_id] || 0) + 1;
      return m;
    };
    const [members, openProblems, pendingReq, verifiedToday, curScores, prevScores] = await Promise.all([
      ids.length ? db.from('profiles').select('society_id').eq('role', 'resident').in('society_id', ids) : Promise.resolve({ data: [] }),
      ids.length ? db.from('society_problems').select('society_id').in('society_id', ids).neq('status', 'resolved') : Promise.resolve({ data: [] }),
      ids.length ? db.from('collection_requests').select('society_id').in('society_id', ids).eq('status', 'pending') : Promise.resolve({ data: [] }),
      ids.length ? db.from('collection_requests').select('society_id').in('society_id', ids).eq('status', 'verified').gte('verified_at', todayStart.toISOString()) : Promise.resolve({ data: [] }),
      ids.length ? db.from('society_scores').select('society_id, score').eq('period_end', today) : Promise.resolve({ data: [] }),
      ids.length ? db.from('society_scores').select('society_id, score').eq('period_end', weekAgo) : Promise.resolve({ data: [] }),
    ]);

    const memberCounts = countBy(members.data);
    const problemCounts = countBy(openProblems.data);
    const pendingCounts = countBy(pendingReq.data);
    const verifiedTodayCounts = countBy(verifiedToday.data);
    const scoreMap = {};
    (curScores.data || []).forEach((s) => { scoreMap[s.society_id] = s.score; });
    (prevScores.data || []).forEach((s) => { if (scoreMap[s.society_id] == null) scoreMap[s.society_id] = s.score; });

    const out = visible.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      area: s.areas?.name || null,
      area_id: s.area_id,
      gps_lat: gpsAvailable ? s.gps_lat : null,
      gps_lng: gpsAvailable ? s.gps_lng : null,
      distance_km: hasGps && gpsAvailable ? distances[s.id] : null,
      members: memberCounts[s.id] || 0,
      open_problems: problemCounts[s.id] || 0,
      pending_requests: pendingCounts[s.id] || 0,
      verified_today: verifiedTodayCounts[s.id] || 0,
      score: scoreMap[s.id] ?? null,
    }));

    if (hasGps && gpsAvailable) out.sort((a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9));

    return res.json({
      societies: out,
      origin: hasGps ? { lat, lng } : null,
      city_radius_km: CITY_RADIUS_KM,
      region: out.length ? null : nearestArea(lat, lng, societies),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/**
 * Public, minimal society list for the signup dropdown — societies only within
 * CITY_RADIUS_KM of the traced location, nearest first. No live aggregates, no
 * auth required. Empty when no GPS was provided (the client then shows an
 * "enable location" prompt instead of dumping every society on the platform).
 * When no society is registered near the traced location, `region` carries the
 * nearest registered area so the resident can still sign up under it.
 */
router.get('/options', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const hasGps = Number.isFinite(lat) && Number.isFinite(lng);
    const gpsAvailable = await gpsColumnsAvailable();
    if (!hasGps || !gpsAvailable) {
      return res.json({ societies: [], region: null, city_radius_km: CITY_RADIUS_KM });
    }

    const { data: societies, error } = await db.from('societies').select(COORDS_FIELDS);
    if (error) return res.status(400).json({ error: error.message });

    const out = (societies || [])
      .map((s) => ({ s, distance_km: distanceKm(lat, lng, s.gps_lat, s.gps_lng) }))
      .filter((x) => x.distance_km != null && x.distance_km <= CITY_RADIUS_KM)
      .sort((a, b) => a.distance_km - b.distance_km)
      .map(({ s, distance_km }) => ({
        id: s.id,
        name: s.name,
        address: s.address,
        area_id: s.area_id,
        area: s.areas?.name || null,
        distance_km,
      }));

    const region = out.length ? null : nearestArea(lat, lng, societies);

    return res.json({ societies: out, region, city_radius_km: CITY_RADIUS_KM });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/** Nearest registered area to a point, derived from the nearest society's area. */
function nearestArea(lat, lng, societies) {
  let best = null;
  for (const s of societies || []) {
    const d = distanceKm(lat, lng, s.gps_lat, s.gps_lng);
    if (d == null) continue;
    if (!best || d < best.distance_km) {
      best = { name: s.areas?.name || 'Your area', area_id: s.area_id, distance_km: d };
    }
  }
  return best;
}

/** Recompute the given society's score (fire and forget, e.g. after a switch). */
function refreshSocietyScore(societyId) {
  if (societyId) recomputeSocietyScore(societyId).catch(() => {});
}

module.exports = { router, refreshSocietyScore, getMetaSocieties };
