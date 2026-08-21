const express = require('express');
const router = express.Router();
const { db } = require('../lib/supabase.cjs');
const { authRequired, roleGuard } = require('../middleware/auth.cjs');
const { logEvent } = require('../lib/verify.cjs');
const { awardCollectionPoints, awardReportPoints } = require('../lib/points.cjs');
const { recomputeSocietyScore } = require('../lib/scoring.cjs');
const { checkChallengeCompletions } = require('../lib/challenges.cjs');

router.use(authRequired, roleGuard('admin'));

// ---- Dashboard aggregates: KPIs, hotspots, trends, area breakdown, collector activity ----
router.get('/dashboard', async (req, res) => {
  const { data: areas } = await db.from('areas').select('id, name');
  const { data: societies } = await db.from('societies').select('id, name, area_id');

  // KPIs
  const [{ count: residents }, { count: collectors }, { count: requests }, { count: verifiedRequests },
    { count: pendingReports }, { count: verifiedReports }, { count: openProblems }, { count: flaggedRequests },
    { count: pendingRequests }, { count: collectedRequests }, { count: rejectedRequests }] =
    await Promise.all([
      db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'resident'),
      db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'collector'),
      db.from('collection_requests').select('id', { count: 'exact', head: true }),
      db.from('collection_requests').select('id', { count: 'exact', head: true }).eq('status', 'verified'),
      db.from('dumping_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      db.from('dumping_reports').select('id', { count: 'exact', head: true }).eq('status', 'verified'),
      db.from('society_problems').select('id', { count: 'exact', head: true }).neq('status', 'resolved'),
      db.from('collection_requests').select('id', { count: 'exact', head: true }).eq('status', 'flagged'),
      db.from('collection_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      db.from('collection_requests').select('id', { count: 'exact', head: true }).eq('status', 'collected'),
      db.from('collection_requests').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
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

  // Area breakdown: requests + verified per area
  const { data: allRequests } = await db
    .from('collection_requests')
    .select('area_id, status');
  const { data: allReports } = await db
    .from('dumping_reports')
    .select('area_id, status');
  const areaBreakdown = buildAreaBreakdown(allRequests || [], allReports || [], areas || [], societies || []);

  // Collector activity: last request + stats per collector
  const { data: allCollectors } = await db
    .from('profiles')
    .select('id, name, area_id, areas(name)')
    .eq('role', 'collector');
  const collectorActivity = await buildCollectorActivity(allCollectors || []);

  // Recent activity feed: last 25 events across all tables
  const feed = await buildActivityFeed();

  return res.json({
    kpis: {
      residents, collectors, requests, verified_requests: verifiedRequests,
      pending_reports: pendingReports, verified_reports: verifiedReports,
      open_problems: openProblems, flagged_requests: flaggedRequests,
      pending_requests: pendingRequests, collected_requests: collectedRequests,
      rejected_requests: rejectedRequests,
    },
    hotspots,
    trends,
    areaBreakdown,
    collectorActivity,
    feed,
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

function buildAreaBreakdown(requests, reports, areas, societies) {
  const areaMap = {};
  areas.forEach((a) => (areaMap[a.id] = { name: a.name, requests: 0, verified: 0, flagged: 0, pending: 0, societies: new Set() }));
  societies.forEach((s) => {
    if (s.area_id && areaMap[s.area_id]) areaMap[s.area_id].societies.add(s.name);
  });
  requests.forEach((r) => {
    if (!r.area_id || !areaMap[r.area_id]) return;
    areaMap[r.area_id].requests++;
    if (r.status === 'verified') areaMap[r.area_id].verified++;
    if (r.status === 'flagged') areaMap[r.area_id].flagged++;
    if (r.status === 'pending') areaMap[r.area_id].pending++;
  });
  const reportCounts = {};
  reports.forEach((r) => {
    if (!r.area_id) return;
    reportCounts[r.area_id] = (reportCounts[r.area_id] || 0) + 1;
  });
  return Object.values(areaMap)
    .filter((a) => a.requests > 0 || reportCounts[a.name])
    .map((a) => ({
      name: a.name,
      requests: a.requests,
      verified: a.verified,
      flagged: a.flagged,
      pending: a.pending,
      verifyRate: a.requests > 0 ? Math.round((a.verified / a.requests) * 100) : 0,
      reports: reportCounts[a.name] || 0,
      societies: [...a.societies],
    }))
    .sort((a, b) => b.requests - a.requests);
}

async function buildCollectorActivity(collectors) {
  const results = [];
  for (const c of collectors) {
    const { data: lastRequest } = await db
      .from('collection_requests')
      .select('id, status, before_timestamp, after_timestamp')
      .eq('collector_id', c.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { count: totalCompleted } = await db
      .from('collection_requests')
      .select('id', { count: 'exact', head: true })
      .eq('collector_id', c.id)
      .eq('status', 'verified');
    const { count: pendingAssigned } = await db
      .from('collection_requests')
      .select('id', { count: 'exact', head: true })
      .eq('collector_id', c.id)
      .in('status', ['pending', 'collected']);
    results.push({
      id: c.id,
      name: c.name,
      area: c.areas?.name || '—',
      area_id: c.area_id,
      lastRequest: lastRequest || null,
      totalCompleted: totalCompleted || 0,
      pendingAssigned: pendingAssigned || 0,
    });
  }
  return results;
}

async function buildActivityFeed() {
  const [reqs, reports, problems, txns] = await Promise.all([
    db.from('collection_requests').select('id, status, created_at, resident_id, collector_id').order('created_at', { ascending: false }).limit(15),
    db.from('dumping_reports').select('id, status, created_at, reporter_id').order('created_at', { ascending: false }).limit(10),
    db.from('society_problems').select('id, title, status, created_at, resident_id').order('created_at', { ascending: false }).limit(10),
    db.from('points_transactions').select('id, user_id, amount, reason, created_at').order('created_at', { ascending: false }).limit(10),
  ]);
  const events = [];
  (reqs.data || []).forEach((r) => {
    events.push({ type: 'request', status: r.status, timestamp: r.created_at, detail: `Collection request ${r.status}` });
  });
  (reports.data || []).forEach((r) => {
    events.push({ type: 'report', status: r.status, timestamp: r.created_at, detail: `Dumping report ${r.status}` });
  });
  (problems.data || []).forEach((p) => {
    events.push({ type: 'problem', status: p.status, timestamp: p.created_at, detail: `Problem: ${p.title} (${p.status})` });
  });
  (txns.data || []).forEach((t) => {
    events.push({ type: 'points', timestamp: t.created_at, detail: `+${t.amount} pts — ${t.reason}` });
  });
  events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return events.slice(0, 30);
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
