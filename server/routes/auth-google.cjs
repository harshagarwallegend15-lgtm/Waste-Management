const express = require('express');
const router = express.Router();
const { admin, db } = require('../lib/supabase.cjs');

const VALID_GOOGLE_ROLES = ['resident', 'collector', 'admin'];

/**
 * POST /api/auth/google
 * Initiates Google OAuth via Supabase.
 * Body: { role } — the role the user is signing up as.
 * Redirects the client to the Supabase OAuth URL.
 */
router.get('/', async (req, res) => {
  try {
    const role = req.query.role || 'resident';
    if (!VALID_GOOGLE_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const callbackUrl = `${req.protocol}://${req.get('host')}/auth/callback.html?role=${role}`;

    // Build Supabase OAuth URL
    const authUrl = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(callbackUrl)}`;

    res.json({ url: authUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/auth/google-callback
 * Receives the Supabase access_token after Google OAuth.
 * Creates a profile if one doesn't exist for this user.
 * Body: { access_token, role }
 */
router.post('/callback', async (req, res) => {
  try {
    const { access_token, role } = req.body;
    if (!access_token) return res.status(400).json({ error: 'access_token is required' });
    if (!VALID_GOOGLE_ROLES.includes(role || 'resident')) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const userRole = role || 'resident';

    // Verify the token and get user info
    const { data: userData, error: userError } = await admin.auth.getUser(access_token);
    if (userError || !userData?.user) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }

    const user = userData.user;
    const userId = user.id;
    const email = user.email;
    const name = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0];
    const avatar = user.user_metadata?.avatar_url || null;

    // Check if profile already exists
    const { data: existingProfile } = await db
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (existingProfile) {
      // Profile exists — return it
      return res.json({
        session: { access_token, user },
        profile: existingProfile,
      });
    }

    // New Google user — create profile
    let areaId = null;
    let societyId = null;

    if (userRole === 'collector') {
      // Auto-assign area (reuse logic from register)
      const { data: areas } = await db.from('areas').select('id, name');
      if (areas?.length) {
        let best = areas[0];
        let bestLoad = -1;
        for (const a of areas) {
          const { count } = await db
            .from('collection_requests')
            .select('id', { count: 'exact', head: true })
            .eq('area_id', a.id)
            .eq('status', 'pending');
          if (count > bestLoad) { bestLoad = count; best = a; }
        }
        if (bestLoad === 0) {
          let topCount = -1;
          for (const a of areas) {
            const { count } = await db
              .from('profiles')
              .select('id', { count: 'exact', head: true })
              .eq('area_id', a.id)
              .eq('role', 'resident');
            if (count > topCount) { topCount = count; best = a; }
          }
        }
        areaId = best.id;
      }
    }

    const { data: profile, error: pErr } = await db
      .from('profiles')
      .insert({
        id: userId,
        email,
        role: userRole,
        name,
        phone: null,
        address_text: null,
        gps_lat: null,
        gps_lng: null,
        society_id: societyId,
        area_id: areaId,
      })
      .select()
      .single();

    if (pErr) {
      return res.status(400).json({ error: 'Profile creation failed: ' + pErr.message });
    }

    return res.json({
      session: { access_token, user },
      profile,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
