const express = require('express');
const router = express.Router();
const { admin, db } = require('../lib/supabase.cjs');

// Roles a visitor may grant themselves through Google OAuth. `admin` is
// deliberately excluded: it is a privileged role and must never be derivable
// from a request query/body. The optional GOOGLE_ADMIN_EMAILS allowlist is the
// only way an admin account can be provisioned through this flow.
const PUBLIC_GOOGLE_ROLES = ['resident', 'collector'];
const ADMIN_EMAILS = new Set(
  (process.env.GOOGLE_ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

function roleIsRequestable(role) {
  return PUBLIC_GOOGLE_ROLES.includes(role) || (role === 'admin' && ADMIN_EMAILS.size > 0);
}

function emailMayBeAdmin(email) {
  return !!email && ADMIN_EMAILS.has(String(email).toLowerCase());
}

/**
 * GET /api/auth/google
 * Initiates Google OAuth via Supabase.
 * Query: { role } — resident or collector (admin requires GOOGLE_ADMIN_EMAILS).
 * Returns the Supabase OAuth URL for the client to navigate to.
 */
router.get('/', async (req, res) => {
  try {
    const role = req.query.role || 'resident';
    if (!roleIsRequestable(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) return res.status(500).json({ error: 'SUPABASE_URL is not configured' });

    const callbackUrl = `${req.protocol}://${req.get('host')}/auth/callback.html?role=${encodeURIComponent(role)}`;

    // Build Supabase OAuth URL
    const authUrl = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(callbackUrl)}`;

    res.json({ url: authUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/auth/google/callback
 * Receives the Supabase access_token after Google OAuth.
 * Creates a profile if one doesn't exist for this user.
 * Body: { access_token, role }
 */
router.post('/callback', async (req, res) => {
  try {
    const { access_token, role } = req.body;
    if (!access_token) return res.status(400).json({ error: 'access_token is required' });

    const userRole = role || 'resident';
    if (!roleIsRequestable(userRole)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Verify the token and get user info
    const { data: userData, error: userError } = await admin.auth.getUser(access_token);
    if (userError || !userData?.user) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }

    const user = userData.user;
    const userId = user.id;
    const email = user.email;
    if (!email) return res.status(400).json({ error: 'Google account has no email address' });

    // An allowlisted Google identity is always an admin, regardless of which
    // login page the request started from. This keeps GOOGLE_ADMIN_EMAILS
    // authoritative even if the user opens the resident page by habit.
    const isAdminEmail = emailMayBeAdmin(email);

    // Never let a client promote itself to admin. Only explicitly allowlisted
    // Google identities may be provisioned as admins.
    if (userRole === 'admin' && !isAdminEmail) {
      return res.status(403).json({ error: 'This account is not permitted to sign in as admin' });
    }

    // Check if profile already exists
    const { data: existingProfile } = await db
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (existingProfile) {
      if (existingProfile.active === false) {
        return res.status(403).json({ error: 'Account inactive' });
      }
      // Upgrade a profile provisioned before this email was allowlisted.
      // Otherwise return the stored role — never apply a client-supplied role.
      let profile = existingProfile;
      if (isAdminEmail && existingProfile.role !== 'admin') {
        const { data: upgraded, error: upErr } = await db
          .from('profiles')
          .update({ role: 'admin' })
          .eq('id', userId)
          .select()
          .single();
        if (upErr) return res.status(400).json({ error: 'Could not update role: ' + upErr.message });
        profile = upgraded;
      }
      return res.json({
        session: { access_token, user },
        profile,
      });
    }

    // New Google user — create profile
    let areaId = null;

    // Auto-assign area for all new Google users (residents + collectors)
    const { data: areas } = await db.from('areas').select('id, name');
    if (areas?.length) {
      if (userRole === 'collector') {
        // Collectors: prefer the area with the FEWEST pending requests, then
        // the area with the most residents as a tie-breaker.
        let best = areas[0];
        let bestLoad = Infinity;
        for (const a of areas) {
          const { count } = await db
            .from('collection_requests')
            .select('id', { count: 'exact', head: true })
            .eq('area_id', a.id)
            .eq('status', 'pending');
          const load = count || 0;
          if (load < bestLoad) {
            bestLoad = load;
            best = a;
          }
        }
        if (bestLoad === 0) {
          let topCount = -1;
          for (const a of areas) {
            const { count } = await db
              .from('profiles')
              .select('id', { count: 'exact', head: true })
              .eq('area_id', a.id)
              .eq('role', 'resident');
            if ((count || 0) > topCount) {
              topCount = count || 0;
              best = a;
            }
          }
        }
        areaId = best.id;
      } else {
        // Residents: assign first available area (they can change later via society picker)
        areaId = areas[0].id;
      }
    }

    const name = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0];

    const { data: profile, error: pErr } = await db
      .from('profiles')
      .insert({
        id: userId,
        email,
        role: isAdminEmail ? 'admin' : userRole,
        name,
        phone: null,
        address_text: null,
        gps_lat: null,
        gps_lng: null,
        society_id: null,
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
