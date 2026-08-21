const express = require('express');
const router = express.Router();
const { db } = require('../lib/supabase.cjs');
const { authRequired, roleGuard } = require('../middleware/auth.cjs');

// ---- My points + transaction history ----
router.get('/me', authRequired, async (req, res) => {
  const { data: fresh, error: fErr } = await db
    .from('profiles')
    .select('points')
    .eq('id', req.profile.id)
    .single();
  const points = fErr ? req.profile.points : (fresh?.points ?? req.profile.points);

  const { data, error } = await db
    .from('points_transactions')
    .select('*')
    .eq('user_id', req.profile.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return res.status(400).json({ error: error.message });
  return res.json({ points, transactions: data || [] });
});

module.exports = router;
