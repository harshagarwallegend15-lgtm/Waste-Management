const { requireAuth, getProfile } = require('../lib/supabase.cjs');

/** Middleware: ensures an authenticated user exists with a profile. */
async function authRequired(req, res, next) {
  try {
    const { user, token } = await requireAuth(req);
    const profile = await getProfile(user.id);
    if (!profile) {
      return res.status(403).json({ error: 'Profile not found' });
    }
    req.user = user;
    req.token = token;
    req.profile = profile;
    next();
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message });
  }
}

/** Middleware factory: allows only listed roles. */
function roleGuard(...roles) {
  return (req, res, next) => {
    if (!req.profile || !roles.includes(req.profile.role)) {
      return res.status(403).json({ error: 'Forbidden for your role' });
    }
    next();
  };
}

module.exports = { authRequired, roleGuard };
