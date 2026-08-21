const express = require('express');
const router = express.Router();
const multer = require('multer');
const { db, uploadPhoto } = require('../lib/supabase.cjs');
const { authRequired, roleGuard } = require('../middleware/auth.cjs');
const { verifyCollection } = require('../lib/verify.cjs');
const { assertGarbagePhoto } = require('../lib/garbage.cjs');
const { awardCollectionPoints } = require('../lib/points.cjs');
const { recomputeSocietyScore } = require('../lib/scoring.cjs');
const { checkChallengeCompletions } = require('../lib/challenges.cjs');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const PHOTO_BUCKET = 'waste-photos';

// ---- Resident creates a collection request ----
router.post(
  '/',
  authRequired,
  roleGuard('resident'),
  upload.single('photo'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Before-photo is required' });
      try {
        await assertGarbagePhoto(req.file.buffer, { label: 'before-photo' });
      } catch (e) {
        return res.status(e.status || 400).json({ error: e.message });
      }
      const { waste_type, gps_lat, gps_lng } = req.body;
      const url = await uploadPhoto(PHOTO_BUCKET, `requests/${req.profile.id}`, req.file.originalname || 'photo.jpg', req.file.buffer, req.file.mimetype);
      if (!url) return res.status(500).json({ error: 'Photo upload failed' });

      // Derive area_id: profile → society lookup → fallback to first area
      let areaId = req.profile.area_id;
      if (!areaId && req.profile.society_id) {
        const { data: society } = await db
          .from('societies')
          .select('area_id')
          .eq('id', req.profile.society_id)
          .single();
        if (society?.area_id) areaId = society.area_id;
      }
      if (!areaId) {
        const { data: firstArea } = await db
          .from('areas')
          .select('id')
          .limit(1)
          .single();
        if (firstArea?.id) areaId = firstArea.id;
      }
      if (!areaId) return res.status(400).json({ error: 'No area configured. Please select a society first.' });

      const { data, error } = await db
        .from('collection_requests')
        .insert({
          resident_id: req.profile.id,
          society_id: req.profile.society_id,
          area_id: areaId,
          waste_type: waste_type || 'mixed',
          status: 'pending',
          before_photo_url: url,
          before_gps_lat: gps_lat != null ? Number(gps_lat) : null,
          before_gps_lng: gps_lng != null ? Number(gps_lng) : null,
          before_timestamp: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });
      return res.status(201).json({ request: data });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
);

// ---- Resident: my requests ----
router.get('/mine', authRequired, roleGuard('resident'), async (req, res) => {
  const { data, error } = await db
    .from('collection_requests')
    .select('*')
    .eq('resident_id', req.profile.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  return res.json({ requests: data });
});

// ---- Collector: residents in my area with pending requests ----
router.get('/area-residents', authRequired, roleGuard('collector'), async (req, res) => {
  const areaId = req.profile.area_id;
  if (!areaId) return res.status(400).json({ error: 'You have not been assigned an area yet' });

  // Residents with area_id set directly
  const { data: directResidents } = await db
    .from('profiles')
    .select('id, name, address_text, gps_lat, gps_lng, phone, society_id, society_id, societies(name, area_id)')
    .eq('role', 'resident')
    .eq('area_id', areaId);

  // Also find residents whose society is in this area but profile.area_id may be null
  const { data: societyResidents } = await db
    .from('profiles')
    .select('id, name, address_text, gps_lat, gps_lng, phone, society_id, societies(name, area_id)')
    .eq('role', 'resident')
    .is('area_id', null)
    .not('society_id', 'is', null);

  // Filter societyResidents to only those whose society maps to this area
  const filteredSociety = (societyResidents || []).filter(
    (r) => r.societies?.area_id === areaId
  );

  // Merge and dedupe by id
  const residentMap = {};
  (directResidents || []).forEach((r) => { residentMap[r.id] = r; });
  filteredSociety.forEach((r) => { if (!residentMap[r.id]) residentMap[r.id] = r; });
  const residents = Object.values(residentMap);

  if (!residents.length) return res.json({ area_id: areaId, residents: [] });

  // Also fetch requests with null area_id that belong to these residents
  const residentIds = residents.map((r) => r.id);
  const { data: directRequests } = await db
    .from('collection_requests')
    .select('*')
    .eq('area_id', areaId)
    .in('status', ['pending', 'collected'])
    .order('created_at', { ascending: false });

  // Also get requests with null area_id from these residents (backfill gap)
  const { data: nullAreaRequests } = await db
    .from('collection_requests')
    .select('*')
    .is('area_id', null)
    .in('status', ['pending', 'collected'])
    .in('resident_id', residentIds.length ? residentIds : ['__none__'])
    .order('created_at', { ascending: false });

  const byResident = {};
  [...(directRequests || []), ...(nullAreaRequests || [])].forEach((r) => {
    if (!byResident[r.resident_id]) byResident[r.resident_id] = [];
    byResident[r.resident_id].push(r);
  });

  const out = residents.map((r) => ({
    ...r,
    pending_requests: byResident[r.id] || [],
  }));

  return res.json({ area_id: areaId, residents: out });
});

// ---- Collector: complete a request with after-photo → auto CV verify ----
router.post(
  '/:id/complete',
  authRequired,
  roleGuard('collector'),
  upload.single('photo'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'After-photo is required' });
      try {
        await assertGarbagePhoto(req.file.buffer, { label: 'after-photo' });
      } catch (e) {
        return res.status(e.status || 400).json({ error: e.message });
      }
      const { data: request, error } = await db
        .from('collection_requests')
        .select('*')
        .eq('id', req.params.id)
        .single();
      if (error || !request) return res.status(404).json({ error: 'Request not found' });
      if (request.status !== 'pending' && request.status !== 'collected') {
        return res.status(409).json({ error: `Request is already ${request.status}` });
      }
      // Area check: direct match OR society-based match for null-area requests
      let areaMatch = request.area_id === req.profile.area_id;
      if (!areaMatch && !request.area_id && request.society_id) {
        const { data: society } = await db
          .from('societies')
          .select('area_id')
          .eq('id', request.society_id)
          .single();
        areaMatch = society?.area_id === req.profile.area_id;
      }
      if (!areaMatch) {
        return res.status(403).json({ error: 'This request is not in your assigned area' });
      }

      const afterGpsLat = req.body.gps_lat != null ? Number(req.body.gps_lat) : null;
      const afterGpsLng = req.body.gps_lng != null ? Number(req.body.gps_lng) : null;
      const afterUrl = await uploadPhoto(PHOTO_BUCKET, `requests/${request.resident_id}`, req.file.originalname || 'after.jpg', req.file.buffer, req.file.mimetype);
      if (!afterUrl) return res.status(500).json({ error: 'After-photo upload failed' });

      // Record collected state first
      const { data: collected, error: uErr } = await db
        .from('collection_requests')
        .update({
          status: 'collected',
          collector_id: req.profile.id,
          after_photo_url: afterUrl,
          after_gps_lat: afterGpsLat,
          after_gps_lng: afterGpsLng,
          after_timestamp: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id)
        .select()
        .single();
      if (uErr) return res.status(400).json({ error: uErr.message });

      // Run hybrid CV verification
      const verification = await verifyCollection(collected, req.file.buffer);

      // Award points only on verified
      let points = null;
      if (verification.verdict === 'verified') {
        points = await awardCollectionPoints(collected);
        recomputeSocietyScore(collected.society_id).catch(() => {});
        checkChallengeCompletions(collected.society_id).catch(() => {});
      }

      return res.json({ verification, points, collected_id: collected.id });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
);

module.exports = router;
