const express = require('express');
const router = express.Router();
const { admin, db } = require('../lib/supabase.cjs');
const { authRequired } = require('../middleware/auth.cjs');

const VALID_ROLES = ['resident', 'collector'];

/** Auto-assign a collector to the area with the highest pending-request load. */
async function autoAssignArea() {
  const { data: areas, error } = await db.from('areas').select('id, name');
  if (error || !areas?.length) return null;
  let best = areas[0];
  let bestLoad = -1;
  for (const a of areas) {
    const { count } = await db
      .from('collection_requests')
      .select('id', { count: 'exact', head: true })
      .eq('area_id', a.id)
      .eq('status', 'pending');
    if (count > bestLoad) {
      bestLoad = count;
      best = a;
    }
  }
  // Fallback: tie-break by resident count, then first
  if (bestLoad === 0) {
    let topCount = -1;
    for (const a of areas) {
      const { count } = await db
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('area_id', a.id)
        .eq('role', 'resident');
      if (count > topCount) {
        topCount = count;
        best = a;
      }
    }
  }
  return best;
}

router.post('/register', async (req, res) => {
  try {
    const { email, password, role, name, phone, address_text, gps_lat, gps_lng, society_id, area_id } = req.body;

    if (!email || !password || !name) return res.status(400).json({ error: 'email, password, name are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Role must be resident or collector' });

    let society = null;
    let residentArea = null;
    if (role === 'resident') {
      if (society_id) {
        const s = await db.from('societies').select('id, area_id').eq('id', society_id).single();
        if (s.error) return res.status(400).json({ error: 'Invalid society' });
        society = s.data;
        residentArea = { id: society.area_id };
      } else if (area_id) {
        // No society registered near the resident yet — sign up under the area.
        const a = await db.from('areas').select('id, name').eq('id', area_id).single();
        if (a.error) return res.status(400).json({ error: 'Invalid area' });
        residentArea = a.data;
      } else {
        return res.status(400).json({ error: 'Residents must pick their society (or an area when none is registered nearby)' });
      }
    }

    const { data: authData, error: authError } = await (async () => {
      // Service role: create user but require email confirmation.
      if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return admin.auth.admin.createUser({
          email,
          password,
          email_confirm: false,
          user_metadata: { role, name },
        });
      }
      return admin.auth.signUp({ email, password, options: { data: { role, name } } });
    })();
    if (authError) return res.status(400).json({ error: authError.message });

    const userId = authData.user.id;
    const area = role === 'collector' ? await autoAssignArea() : residentArea;

    const { data: profile, error: pErr } = await db
      .from('profiles')
      .insert({
        id: userId,
        email,
        role,
        name,
        phone: phone || null,
        address_text: address_text || null,
        gps_lat: gps_lat ?? null,
        gps_lng: gps_lng ?? null,
        society_id: role === 'resident' ? (society_id ?? null) : null,
        area_id: role === 'collector' ? (area?.id ?? null) : (residentArea?.id ?? null),
      })
      .select()
      .single();

    if (pErr) {
      return res.status(400).json({ error: 'Profile creation failed: ' + pErr.message });
    }

    return res.status(201).json({ user: authData.user, profile, area_name: area?.name || null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
    const { data, error } = await admin.auth.signInWithPassword({ email, password });
    if (error) {
      const msg = error.message.includes('Email not confirmed')
        ? 'Please verify your email first. Check your inbox for the confirmation link.'
        : 'Invalid credentials';
      return res.status(401).json({ error: msg });
    }

    const { data: profile } = await db.from('profiles').select('*').eq('id', data.user.id).single();
    if (!profile || !profile.active) return res.status(403).json({ error: 'Account inactive' });

    return res.json({ session: { access_token: data.session.access_token, user: data.user }, profile });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/me', authRequired, (req, res) => {
  return res.json({ user: req.user, profile: req.profile });
});

/**
 * POST /api/auth/confirm
 * Verifies email confirmation token from Supabase.
 * Body: { token, token_hash, type } — from the confirmation email link.
 */
router.post('/confirm', async (req, res) => {
  try {
    const { token, token_hash, type } = req.body;
    if (!token && !token_hash) return res.status(400).json({ error: 'Token is required' });

    let data, error;

    if (token_hash) {
      // TokenHash flow (recommended — works with email scanners)
      const result = await admin.auth.verifyOtp({
        token_hash,
        type: type || 'email',
      });
      data = result.data;
      error = result.error;
    } else if (token) {
      // Legacy token flow
      const result = await admin.auth.verifyOtp({
        token,
        type: type || 'signup',
      });
      data = result.data;
      error = result.error;
    }

    if (error) return res.status(400).json({ error: 'Invalid or expired confirmation link' });

    return res.json({ message: 'Email verified successfully', user: data.user });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
