const express = require('express');
const router = express.Router();
const { db } = require('../lib/supabase.cjs');
const { authRequired, roleGuard } = require('../middleware/auth.cjs');
const { computeProgress, TYPES } = require('../lib/challenges.cjs');

// ---- List challenges with per-society progress + completion state ----
// Residents see their own society; admins see all societies.
router.get('/', authRequired, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const { data: challenges } = await db
    .from('challenges')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  const isAdmin = req.profile.role === 'admin';
  let societies = null;
  if (isAdmin) {
    const { data: all } = await db.from('societies').select('id, name');
    societies = all || [];
  } else if (req.profile.society_id) {
    const { data: mine } = await db.from('societies').select('id, name').eq('id', req.profile.society_id).single();
    societies = mine ? [mine] : [];
  } else {
    societies = [];
  }

  const { data: completions } = await db.from('challenge_completions').select('*');

  const out = [];
  for (const challenge of challenges || []) {
    const rows = [];
    for (const society of societies) {
      const progress = await computeProgress(challenge, society.id);
      const completion = (completions || []).find(
        (c) => c.challenge_id === challenge.id && c.society_id === society.id
      );
      rows.push({
        society_id: society.id,
        society_name: society.name,
        progress,
        target: challenge.target,
        completed: !!completion,
        completed_at: completion?.completed_at || null,
        reward_awarded: completion?.reward_awarded || false,
      });
    }
    out.push({ ...challenge, progress_rows: rows, days_left: challenge.status === 'active' ? daysLeft(challenge.ends_at) : null });
  }

  const active = out.filter((c) => c.status === 'active');
  const history = out.filter((c) => c.status !== 'active');
  return res.json({
    active,
    history,
    types: TYPES,
    today,
  });
});

function daysLeft(endDate) {
  const end = new Date(endDate + 'T23:59:59');
  return Math.max(0, Math.ceil((end - new Date()) / (24 * 3600 * 1000)));
}

// ---- Create a challenge (admin) ----
router.post('/', authRequired, roleGuard('admin'), async (req, res) => {
  const { title, description, challenge_type, target, reward_points, starts_at, ends_at } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!TYPES[challenge_type]) return res.status(400).json({ error: 'Invalid challenge type' });
  const targetNum = Number(target);
  if (!Number.isFinite(targetNum) || targetNum <= 0) return res.status(400).json({ error: 'Target must be a positive number' });
  const reward = Number(reward_points) || 25;
  if (!starts_at || !ends_at) return res.status(400).json({ error: 'Start and end dates are required' });
  if (ends_at < starts_at) return res.status(400).json({ error: 'End date must be after start date' });

  const { data, error } = await db
    .from('challenges')
    .insert({
      title: title.trim(),
      description: description || null,
      challenge_type,
      target: targetNum,
      reward_points: reward,
      starts_at: starts_at.slice(0, 10),
      ends_at: ends_at.slice(0, 10),
      status: 'active',
      created_by: req.profile.id,
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json({ challenge: data });
});

// ---- Update / close a challenge (admin) ----
router.patch('/:id', authRequired, roleGuard('admin'), async (req, res) => {
  const { title, description, challenge_type, target, reward_points, starts_at, ends_at, status } = req.body;
  const patch = {};
  if (title !== undefined) patch.title = title.trim();
  if (description !== undefined) patch.description = description;
  if (challenge_type !== undefined) {
    if (!TYPES[challenge_type]) return res.status(400).json({ error: 'Invalid challenge type' });
    patch.challenge_type = challenge_type;
  }
  if (target !== undefined) {
    const n = Number(target);
    if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: 'Target must be a positive number' });
    patch.target = n;
  }
  if (reward_points !== undefined) patch.reward_points = Number(reward_points) || 25;
  if (starts_at !== undefined) patch.starts_at = starts_at.slice(0, 10);
  if (ends_at !== undefined) patch.ends_at = ends_at.slice(0, 10);
  if (status !== undefined) {
    if (!['active', 'completed', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    patch.status = status;
  }
  if (patch.ends_at && patch.starts_at && patch.ends_at < patch.starts_at) {
    return res.status(400).json({ error: 'End date must be after start date' });
  }

  const { data, error } = await db.from('challenges').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Challenge not found' });
  return res.json({ challenge: data });
});

module.exports = router;
