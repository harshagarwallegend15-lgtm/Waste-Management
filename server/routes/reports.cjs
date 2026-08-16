const express = require('express');
const router = express.Router();
const multer = require('multer');
const { db, uploadPhoto } = require('../lib/supabase.cjs');
const { authRequired, roleGuard } = require('../middleware/auth.cjs');
const { logEvent, checkReportDuplicate } = require('../lib/verify.cjs');
const { assertGarbagePhoto } = require('../lib/garbage.cjs');
const { awardReportPoints } = require('../lib/points.cjs');
const { recomputeSocietyScore } = require('../lib/scoring.cjs');
const { checkChallengeCompletions } = require('../lib/challenges.cjs');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const PHOTO_BUCKET = 'waste-photos';

// ---- Create a dumping report (resident) ----
router.post('/', authRequired, roleGuard('resident'), upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Photo is required' });
    try {
      await assertGarbagePhoto(req.file.buffer, { label: 'photo' });
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message });
    }
    const { gps_lat, gps_lng, description } = req.body;
    const url = await uploadPhoto(PHOTO_BUCKET, `reports/${req.profile.id}`, req.file.originalname || 'report.jpg', req.file.buffer, req.file.mimetype);
    if (!url) return res.status(500).json({ error: 'Photo upload failed' });

    const { data, error } = await db
      .from('dumping_reports')
      .insert({
        reporter_id: req.profile.id,
        society_id: req.profile.society_id,
        area_id: req.profile.area_id,
        photo_url: url,
        gps_lat: gps_lat != null ? Number(gps_lat) : null,
        gps_lng: gps_lng != null ? Number(gps_lng) : null,
        description: description || null,
        status: 'pending',
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ report: data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ---- Resident: my reports ----
router.get('/mine', authRequired, roleGuard('resident'), async (req, res) => {
  const { data, error } = await db
    .from('dumping_reports')
    .select('*')
    .eq('reporter_id', req.profile.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  return res.json({ reports: data });
});

// ---- List reports (admin) ----
router.get('/all', authRequired, roleGuard('admin'), async (req, res) => {
  const { data, error } = await db
    .from('dumping_reports')
    .select('*, profiles!dumping_reports_reporter_id_fkey(name)')
    .order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  return res.json({ reports: data });
});

// ---- Admin: verify / reject / mark duplicate ----
router.post('/:id/verify', authRequired, roleGuard('admin'), async (req, res) => {
  try {
    const { verdict, reason } = req.body;
    if (!['verified', 'rejected', 'duplicate'].includes(verdict)) {
      return res.status(400).json({ error: 'verdict must be verified, rejected or duplicate' });
    }
    const { data: report, error } = await db.from('dumping_reports').select('*').eq('id', req.params.id).single();
    if (error || !report) return res.status(404).json({ error: 'Report not found' });

    const isDuplicate = verdict === 'duplicate' || (verdict === 'verified' && await checkReportDuplicate(report));

    const finalVerdict = isDuplicate ? 'duplicate' : verdict;

    const { error: uErr } = await db
      .from('dumping_reports')
      .update({ status: finalVerdict, verified_by: req.profile.id, verified_at: new Date().toISOString() })
      .eq('id', report.id);
    if (uErr) return res.status(400).json({ error: uErr.message });

    await logEvent({
      entity_type: 'report',
      entity_id: report.id,
      verifier: req.profile.email,
      verdict: finalVerdict === 'duplicate' ? 'rejected' : finalVerdict,
      reasons: [{ check: 'admin', reason: reason || (isDuplicate ? 'Duplicate report (same location/time)' : 'Manual review') }],
    });

    let points = null;
    if (finalVerdict === 'verified' && report.status !== 'verified') {
      points = await awardReportPoints(report);
      recomputeSocietyScore(report.society_id).catch(() => {});
      checkChallengeCompletions(report.society_id).catch(() => {});
    }

    return res.json({ report_id: report.id, status: finalVerdict, points });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
