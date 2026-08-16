const express = require('express');
const router = express.Router();
const multer = require('multer');
const { db, uploadPhoto } = require('../lib/supabase.cjs');
const { authRequired, roleGuard } = require('../middleware/auth.cjs');
const { recomputeAllSocietyScores } = require('../lib/scoring.cjs');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const PHOTO_BUCKET = 'waste-photos';

// ---- Create a society problem (resident) ----
router.post('/', authRequired, roleGuard('resident'), upload.single('photo'), async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    let photo_url = null;
    if (req.file) {
      photo_url = await uploadPhoto(PHOTO_BUCKET, `problems/${req.profile.id}`, req.file.originalname || 'problem.jpg', req.file.buffer, req.file.mimetype);
    }
    const { data, error } = await db
      .from('society_problems')
      .insert({
        society_id: req.profile.society_id,
        resident_id: req.profile.id,
        title,
        description: description || null,
        photo_url,
        status: 'open',
      })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ problem: data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ---- Comment on a problem (resident) ----
router.post('/:id/comments', authRequired, roleGuard('resident'), async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Comment is required' });
    const { data, error } = await db
      .from('problem_comments')
      .insert({ problem_id: req.params.id, user_id: req.profile.id, content: content.trim() })
      .select('*')
      .single();
    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ comment: data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ---- List problems for my society (resident) with comments ----
router.get('/society', authRequired, roleGuard('resident'), async (req, res) => {
  const { data: problems, error } = await db
    .from('society_problems')
    .select('*, profiles(name), societies(name)')
    .eq('society_id', req.profile.society_id)
    .order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });

  for (const p of problems) {
    const { data: comments } = await db
      .from('problem_comments')
      .select('*, profiles(name)')
      .eq('problem_id', p.id)
      .order('created_at', { ascending: true });
    p.comments = comments || [];
    p.comment_count = (comments || []).length;
  }
  return res.json({ problems });
});

// ---- All problems ranked by society score (admin), with comments ----
router.get('/all', authRequired, roleGuard('admin'), async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const { data: problems } = await db
    .from('society_problems')
    .select('*, profiles(name), societies(name)')
    .order('created_at', { ascending: false });

  const { data: scores } = await db
    .from('society_scores')
    .select('society_id, score, metrics, period_end')
    .eq('period_end', today);

  if (!(scores || []).length) {
    await recomputeAllSocietyScores().catch(() => {});
  }

  const { data: scores2 } = await db
    .from('society_scores')
    .select('society_id, score, metrics, period_end')
    .eq('period_end', today);
  let latestScores = {};
  (scores2 || []).forEach((s) => { latestScores[s.society_id] = s; });
  if (Object.keys(latestScores).length === 0) {
    const { data: prev } = await db
      .from('society_scores')
      .select('society_id, score, metrics, period_end')
      .eq('period_end', weekAgo);
    (prev || []).forEach((s) => { latestScores[s.society_id] = s; });
  }

  const out = [];
  for (const p of problems || []) {
    const { data: comments } = await db
      .from('problem_comments')
      .select('*, profiles(name)')
      .eq('problem_id', p.id)
      .order('created_at', { ascending: true });
    out.push({
      ...p,
      comments: comments || [],
      comment_count: (comments || []).length,
      society_score: latestScores[p.society_id]?.score ?? 0,
      society_score_metrics: latestScores[p.society_id]?.metrics ?? {},
    });
  }

  // Rank: highest-scoring society's problems first, then newest
  out.sort((a, b) => b.society_score - a.society_score || new Date(b.created_at) - new Date(a.created_at));
  return res.json({ problems: out });
});

// ---- Update problem status (admin) ----
router.post('/:id/status', authRequired, roleGuard('admin'), async (req, res) => {
  const { status } = req.body;
  if (!['open', 'in_progress', 'resolved'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const { data, error } = await db
    .from('society_problems')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  return res.json({ problem: data });
});

module.exports = router;
