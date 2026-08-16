const express = require('express');
const router = express.Router();
const { db } = require('../lib/supabase.cjs');
const { authRequired, roleGuard } = require('../middleware/auth.cjs');

// ---- My points + transaction history ----
router.get('/me', authRequired, async (req, res) => {
  const { data, error } = await db
    .from('points_transactions')
    .select('*')
    .eq('user_id', req.profile.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return res.status(400).json({ error: error.message });
  return res.json({ points: req.profile.points, transactions: data || [] });
});

module.exports = router;
