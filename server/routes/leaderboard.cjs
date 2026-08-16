const express = require('express');
const router = express.Router();
const { db } = require('../lib/supabase.cjs');
const { authRequired, roleGuard } = require('../middleware/auth.cjs');
const { recomputeAllSocietyScores } = require('../lib/scoring.cjs');

// ---- Leaderboards (admin + role dashboards) ----
router.get('/all', authRequired, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  let societyList = [];
  const fetchScores = async () => {
    const { data } = await db
      .from('society_scores')
      .select('*, societies(name)')
      .eq('period_end', today)
      .order('score', { ascending: false });
    return data || [];
  };

  societyList = await fetchScores();
  if (societyList.length === 0) {
    // Nothing computed for the current period yet — compute on demand
    await recomputeAllSocietyScores().catch(() => {});
    societyList = await fetchScores();
  }
  if (societyList.length === 0) {
    const { data: prev } = await db
      .from('society_scores')
      .select('*, societies(name)')
      .eq('period_end', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10))
      .order('score', { ascending: false });
    societyList = prev || [];
  }

  const [residents, collectors] = await Promise.all([
    db
      .from('profiles')
      .select('id, name, points, society_id, societies(name)')
      .eq('role', 'resident')
      .order('points', { ascending: false })
      .limit(50),
    db
      .from('profiles')
      .select('id, name, points, area_id, areas(name)')
      .eq('role', 'collector')
      .order('points', { ascending: false })
      .limit(50),
  ]);

  return res.json({
    residents: residents.data || [],
    collectors: collectors.data || [],
    societies: societyList,
  });
});

module.exports = router;
