const express = require('express');
const router = express.Router();
const { db } = require('../lib/supabase.cjs');
const { authRequired, roleGuard } = require('../middleware/auth.cjs');

const LESSONS = {
  mixed: {
    trigger_type: 'mixed',
    title: 'Let\'s sort our waste together',
    content:
      'We noticed a few of your collections were mixed wet and dry waste. When wet (kitchen) and dry (recyclable) ' +
      'waste go together, almost everything ends up in landfill and becomes much harder to reuse.\n\n' +
      'Quick tip: keep two bins — one for wet food waste, one for dry items like plastic, paper and metal. ' +
      'A clean, dry plastic bottle is worth more than a dirty one!\n\n' +
      'Segregate your next two collections and earn a recognition bonus.',
    reward: 5,
  },
  default: {
    trigger_type: 'default',
    title: 'Thank you for keeping your community clean',
    content: 'Every verified collection and report strengthens your society\'s Waste Score. Keep it up!',
    reward: 0,
  },
};

/**
 * Education is behaviour-based: if the resident has 2+ verified collections
 * flagged as "mixed" waste, they get a targeted segregation lesson.
 */
router.get('/for-me', authRequired, roleGuard('resident'), async (req, res) => {
  const { data: requests } = await db
    .from('collection_requests')
    .select('waste_type, status')
    .eq('resident_id', req.profile.id)
    .eq('status', 'verified');

  const mixedCount = (requests || []).filter((r) => r.waste_type === 'mixed').length;
  const verifiedCount = (requests || []).length;

  const lesson = mixedCount >= 2 ? LESSONS.mixed : LESSONS.default;

  // Acknowledge an improvement: no mixed waste in the last 5 verified
  const recent = (requests || []).slice(0, 5);
  const improved = verifiedCount >= 3 && mixedCount < verifiedCount && recent.every((r) => r.waste_type !== 'mixed');

  return res.json({
    lesson,
    stats: { verified_count: verifiedCount, mixed_count: mixedCount, improved },
  });
});

module.exports = router;
