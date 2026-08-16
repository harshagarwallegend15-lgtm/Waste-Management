const express = require('express');
const router = express.Router();
const { db } = require('../lib/supabase.cjs');
const { authRequired, roleGuard } = require('../middleware/auth.cjs');
const { logEvent } = require('../lib/verify.cjs');
const { awardCollectionPoints, awardReportPoints } = require('../lib/points.cjs');
const { recomputeSocietyScore } = require('../lib/scoring.cjs');
const { checkChallengeCompletions } = require('../lib/challenges.cjs');

router.use(authRequired, roleGuard('admin'));

// ---- Dashboard aggregates: KPIs, hotspots, trends ----
router.get('/dashboard', async (req, res) => {
  const { data: areas } = await db.from('areas').select('id, name');
  const { data: societies } = await db.from('societies').select('id, name, area_id');

  // KPIs
  const [{ count: residents }, { count: collectors }, { count: requests }, { count: verifiedRequests },
    { count: pendingReports }, { count: verifiedReports }, { count: openProblems }, { count: flaggedRequests }] =
    await Promise.all([
      db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'resident'),
      db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'collector'),
      db.from('collection_requests').select('id', { count: 'exact', head: true }),
      db.from('collection_requests').select('id', { count: 'exact', head: true }).eq('status', 'verified'),
      db.from('dumping_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      db.from('dumping_reports').select('id', { count: 'exact', head: true }).eq('status', 'verified'),
      db.from('society_problems').select('id', { count: 'exact', head: true }).neq('status', 'resolved'),
      db.from('collection_requests').select('id', { count: 'exact', head: true }).eq('status', 'flagged'),
    ]);

  // Hotspots: cluster verified reports by proximity
  const { data: reports } = await db
    .from('dumping_reports')
    .select('id, gps_lat, gps_lng, report_timestamp, status, area_id')
    .eq('status', 'verified');
  const hotspots = buildHotspots(reports || [], areas || []);

  // Trends: last 14 days of requests
  const { data: trendRequests } = await db
    .from('collection_requests')
    .select('created_at, status')
    .gte('created_at', new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString());
  const { data: trendReports } = await db
    .from('dumping_reports')
    .select('created_at, status')
    .gte('created_at', new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString());

  const trends = buildTrends(trendRequests || [], trendReports || []);

  return res.json({
    kpis: {
      residents, collectors, requests, verified_requests: verifiedRequests,
      pending_reports: pendingReports, verified_reports: verifiedReports,
      open_problems: openProblems, flagged_requests: flaggedRequests,
    },
    hotspots,
    trends,
  });
});

function buildHotspots(reports, areas) {
  const areaMap = {};
  areas.forEach((a) => (areaMap[a.id] = a.name));

  // simple grid clustering (0.005 deg ~ 500m)
  const clusters = {};
  reports.forEach((r) => {
    if (r.gps_lat == null || r.gps_lng == null) return;
    const key = `${Math.round(r.gps_lat * 200)},${Math.round(r.gps_lng * 200)}`;
    if (!clusters[key]) clusters[key] = { lat: r.gps_lat, lng: r.gps_lng, count: 0, reports: [], area: areaMap[r.area_id] };
    clusters[key].count++;
    clusters[key].reports.push({ id: r.id, timestamp: r.report_timestamp });
  });
  return Object.values(clusters)
    .filter((c) => c.count >= 1)
    .sort((a, b) => b.count - a.count)
    .map((c) => ({
      lat: c.lat,
      lng: c.lng,
      count: c.count,
      area: c.area,
      sample: c.reports.slice(0, 5),
    }));
}

function buildTrends(requests, reports) {
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    days.push(d.toISOString().slice(0, 10));
  }
  const map = {};
  days.forEach((d) => (map[d] = { date: d, requests: 0, verified: 0, reports: 0, verified_reports: 0 }));
  requests.forEach((r) => {
    const d = r.created_at.slice(0, 10);
    if (map[d]) {
      map[d].requests++;
      if (r.status === 'verified') map[d].verified++;
    }
  });
  reports.forEach((r) => {
    const d = r.created_at.slice(0, 10);
    if (map[d]) {
      map[d].reports++;
      if (r.status === 'verified') map[d].verified_reports++;
    }
  });
  return Object.values(map);
}

// ---- Collections list with verification status ----
router.get('/collections', async (req, res) => {
  const { data, error } = await db
    .from('collection_requests')
    .select('*, residents:profiles!collection_requests_resident_id_fkey(name), collectors:profiles!collection_requests_collector_id_fkey(name)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return res.status(400).json({ error: error.message });
  return res.json({ collections: data });
});

// ---- Override a flagged/rejected collection ----
router.post('/collections/:id/override', async (req, res) => {
  try {
    const { verdict, reason } = req.body;
    if (!['verified', 'rejected'].includes(verdict)) return res.status(400).json({ error: 'verdict must be verified or rejected' });
    const { data: request } = await db.from('collection_requests').select('*').eq('id', req.params.id).single();
    if (!request) return res.status(404).json({ error: 'Request not found' });

    const alreadyVerified = request.status === 'verified';
    const { error: uErr } = await db
      .from('collection_requests')
      .update({ status: verdict, verified_by: req.profile.id, verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', request.id);
    if (uErr) return res.status(400).json({ error: uErr.message });

    await logEvent({
      entity_type: 'collection',
      entity_id: request.id,
      verifier: req.profile.email,
      verdict,
      cv_score: request.match_score,
      reasons: [{ check: 'admin_override', reason: reason || 'Manual decision' }],
    });

    let points = null;
    if (verdict === 'verified' && !alreadyVerified) {
      points = await awardCollectionPoints(request);
      recomputeSocietyScore(request.society_id).catch(() => {});
      checkChallengeCompletions(request.society_id).catch(() => {});
    }
    return res.json({ request_id: request.id, status: verdict, points });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ---- Full drill-down for a user (photos, ledger, events, scores) ----
router.get('/users/:id/detail', async (req, res) => {
  const { data: profile } = await db.from('profiles').select('*, societies(name), areas(name)').eq('id', req.params.id).single();
  if (!profile) return res.status(404).json({ error: 'User not found' });

  const [txns, requests, reports, problems] = await Promise.all([
    db.from('points_transactions').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }),
    db.from('collection_requests').select('*').eq('resident_id', profile.id).order('created_at', { ascending: false }),
    db.from('dumping_reports').select('*').eq('reporter_id', profile.id).order('created_at', { ascending: false }),
    db.from('society_problems').select('*').eq('resident_id', profile.id).order('created_at', { ascending: false }),
  ]);

  return res.json({
    profile,
    transactions: txns.data || [],
    requests: requests.data || [],
    reports: reports.data || [],
    problems: problems.data || [],
  });
});

module.exports = router;
