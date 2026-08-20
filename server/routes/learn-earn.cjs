const express = require('express');
const router = express.Router();
const { db } = require('../lib/supabase.cjs');
const { authRequired, roleGuard } = require('../middleware/auth.cjs');
const { addPoints } = require('../lib/points.cjs');

const POINTS_PER_CORRECT = 5;
const QUESTIONS_PER_QUIZ = 10;

const QUESTIONS = [
  // --- Garbage rules (educational) ---
  { q: 'Which type of waste should NEVER go into the dry recyclable bin?', options: ['Paper', 'Plastic bottles', 'Used tissues and napkins', 'Cardboard boxes'], correct: 2 },
  { q: 'How long does a plastic bottle take to decompose in a landfill?', options: ['10 years', '50 years', '450+ years', '1000+ years'], correct: 2 },
  { q: 'What is the correct order of the waste hierarchy?', options: ['Recycle → Reduce → Reuse → Landfill', 'Reduce → Reuse → Recycle → Recover → Dispose', 'Dispose → Recycle → Reduce → Reuse', 'Reuse → Dispose → Recycle → Reduce'], correct: 1 },
  { q: 'E-waste (old phones, batteries) should be:', options: ['Thrown in regular trash', 'Dumped on empty plots', 'Taken to designated e-waste collection centers', 'Buried in the garden'], correct: 2 },
  { q: 'Composting is best suited for which waste type?', options: ['Plastic and metal', 'Wet/organic kitchen waste', 'Glass bottles', 'Electronic waste'], correct: 1 },
  { q: 'What does the Green Dot symbol on packaging mean?', options: ['Product is organic', 'Manufacturer contributes to packaging recovery', 'Product is made of recycled material', 'Product is safe for children'], correct: 1 },
  { q: 'Which gas is primarily released from landfills?', options: ['Oxygen', 'Carbon dioxide only', 'Methane', 'Nitrogen'], correct: 2 },
  { q: 'Medical waste (syringes, expired medicines) should be:', options: ['Put in regular bins', 'Thrown in rivers', 'Disposed at authorized biomedical waste facilities', 'Buried at home'], correct: 2 },
  { q: 'Segregation of waste at source means:', options: ['Government separating waste after collection', 'Sorting waste into categories at home before disposal', 'Mixing all waste and letting machines sort it', 'Burning waste in your backyard'], correct: 1 },
  { q: 'Why should we avoid single-use plastics?', options: ['They are expensive', 'They pollute oceans, harm wildlife, and take centuries to decompose', 'They look ugly', 'They are banned everywhere'], correct: 1 },
  { q: 'Construction and demolition waste should be disposed at:', options: ['Regular municipal bins', 'Designated C&D waste processing facilities', 'Open fields nearby', 'River banks'], correct: 1 },
  { q: 'What percentage of global waste is estimated to be mismanaged?', options: ['About 10%', 'About 25%', 'About 33%', 'About 50%'], correct: 2 },
  { q: 'Which of these is biodegradable?', options: ['Glass bottle', 'Aluminum can', 'Banana peel', 'Plastic bag'], correct: 2 },
  { q: 'What is "leachate" in a landfill?', options: ['A type of recyclable', 'A toxic liquid formed when waste decomposes', 'A composting accelerator', 'A type of plastic'], correct: 1 },
  { q: 'Sanitary landfills are designed to:', options: ['Recycle all waste automatically', 'Isolate waste from the environment to minimize pollution', 'Compost organic waste', 'Generate electricity only'], correct: 1 },

  // --- Funny / quirky questions ---
  { q: 'If a banana peel could talk, what would it most likely complain about?', options: ['Being eaten', 'Being thrown on the street instead of the compost bin', 'Being too yellow', 'Being too small'], correct: 1 },
  { q: 'Which superhero would be the best at waste management?', options: ['Batman — he has a utility belt for sorting', 'Captain Recycle — he turns trash into treasure', 'Spider-Man — webs catch litter mid-air', 'Superman — he can see all the trash from space'], correct: 1 },
  { q: 'What would a plastic bag\'s dating profile say?', options: ['"Looking for someone to carry me through life"', '"I\'m versatile, single-use, and ghost you after one date"', '"I\'m polyethylene and ready to mingle"', '"Swipe right if you love the ocean (I\'m visiting soon)"'], correct: 1 },
  { q: 'If garbage trucks had a motto, what would it be?', options: ['"We pick up after you — literally"', '"Honk if you love trash"', '"Eat, toss, repeat"', '"We bin-lieve in you"'], correct: 0 },
  { q: 'Why did the compost bin break up with the landfill?', options: ['Because the landfill was too toxic', 'Because the compost found someone greener', 'Because they had too much chemistry', 'Because the landfill never accepted its feelings'], correct: 1 },
  { q: 'What\'s the most passive-aggressive thing a trash can can say?', options: ['"I\'m fine, overflow is just my aesthetic"', '"Oh, you put plastic in the wet bin? Cool."', '"I\'m not full, YOU\'RE full"', '"Another day, another landfill. I love my job."'], correct: 0 },
  { q: 'If rats could run a waste management company, what would it be called?', options: ['RatCycle Inc.', 'Dumpster Diners Co.', 'Cheese & Sort LLC', 'Wheelie Good Waste Ltd'], correct: 1 },
  { q: 'What\'s a garbage collector\'s favorite dance move?', options: ['The Bin Dip', 'The Trash Tango', 'The Litter Bug Shuffle', 'The Waste Waltz'], correct: 0 },
  { q: 'If earthworms formed a union, what would their first demand be?', options: ['Free compost buffets', 'Mandatory 8-hour decomposing shifts', 'Government-funded coffee grounds', 'Better working conditions underground'], correct: 0 },
  { q: 'Which animal would be the worst at recycling?', options: ['Panda — eats and wastes bamboo all day', 'Sloth — takes forever to sort the bins', 'Koala — only knows eucalyptus', 'Cat — knocks everything into the wrong bin on purpose'], correct: 3 },
  { q: 'What do you call a group of aluminum cans singing together?', options: ['A crush chorus', 'A symphony of recycling', 'Tin-tennials', 'Can-tata'], correct: 2 },
  { q: 'If the ocean could write a Yelp review about humans, what would the headline be?', options: ['"5 stars — love the free plastic decorations!"', '"1 star — stop sending me your trash"', '"2 stars — the fish are nice but the ambiance is terrible"', '"3 stars — decent, but needs less microplastics"'], correct: 1 },
  { q: 'What would a trash talk show host be called?', options: ['Jimmy Fall-on-the-ground', 'Trash Kimmel', 'The Late Late Show with James Garbage', 'Conan O\'Bin-it'], correct: 3 },
  { q: 'Why did the垃圾分类 worker win an award?', options: ['For being the most rubbish person', 'For sorting 10,000 items without a mix-up', 'For recycling his boss\'s patience', 'For making garbage puns that were actually funny'], correct: 1 },
  { q: 'What did one recycling bin say to the other at the party?', options: ['"I think this party is garbage"', '"You\'re my better half"', '"Don\'t worry, we\'ll sort this out"', '"I feel so empty inside"'], correct: 2 },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * GET /api/learn-earn/quiz
 * Returns 10 random questions (shuffled) + whether user can play today.
 */
router.get('/quiz', authRequired, roleGuard('resident'), async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count } = await db
      .from('learn_earn_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', today.toISOString());

    if (count > 0) {
      return res.json({ canPlay: false, message: 'You have already played today. Come back tomorrow!' });
    }

    const picked = shuffle(QUESTIONS).slice(0, QUESTIONS_PER_QUIZ);
    const questions = picked.map((q, i) => ({
      id: i,
      question: q.q,
      options: q.options,
    }));

    return res.json({ canPlay: true, questions, pointsPerCorrect: POINTS_PER_CORRECT });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/learn-earn/submit
 * Body: { answers: [{ id: number, selected: number }] }
 * Validates answers server-side, calculates score, awards points, stores session.
 */
router.post('/submit', authRequired, roleGuard('resident'), async (req, res) => {
  try {
    const userId = req.user.id;
    const { answers } = req.body;
    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'No answers provided' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count } = await db
      .from('learn_earn_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', today.toISOString());

    if (count > 0) {
      return res.status(400).json({ error: 'You have already played today' });
    }

    let score = 0;
    const results = answers.map((a) => {
      const q = QUESTIONS[a.id];
      if (!q) return { id: a.id, correct: false };
      const isCorrect = a.selected === q.correct;
      if (isCorrect) score++;
      return { id: a.id, correct: isCorrect, correctAnswer: q.correct };
    });

    const pointsEarned = score * POINTS_PER_CORRECT;

    const { error: insErr } = await db
      .from('learn_earn_sessions')
      .insert({ user_id: userId, score, total: QUESTIONS_PER_QUIZ, points_earned: pointsEarned });

    if (insErr) throw insErr;

    if (pointsEarned > 0) {
      await addPoints(userId, pointsEarned, `Quiz: ${score}/${QUESTIONS_PER_QUIZ} correct`, 'learn_earn', null);
    }

    return res.json({ score, total: QUESTIONS_PER_QUIZ, pointsEarned, results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/learn-earn/history
 * Returns user's quiz history.
 */
router.get('/history', authRequired, roleGuard('resident'), async (req, res) => {
  try {
    const { data, error } = await db
      .from('learn_earn_sessions')
      .select('id, score, total, points_earned, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw error;
    return res.json({ sessions: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/learn-earn/all
 * Admin-only: all quiz sessions with user names.
 */
router.get('/all', authRequired, roleGuard('admin'), async (req, res) => {
  try {
    const { data, error } = await db
      .from('learn_earn_sessions')
      .select('id, score, total, points_earned, created_at, profiles:user_id(name, email)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return res.json({ sessions: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/learn-earn/stats
 * Admin-only: aggregate quiz stats.
 */
router.get('/stats', authRequired, roleGuard('admin'), async (req, res) => {
  try {
    const { data: all, error } = await db
      .from('learn_earn_sessions')
      .select('score, total, points_earned');

    if (error) throw error;
    const sessions = all || [];
    const totalSessions = sessions.length;
    const totalPlayers = new Set(sessions.map((s) => s.points_earned > 0)).size;
    const avgScore = sessions.length ? (sessions.reduce((a, s) => a + s.score, 0) / sessions.length).toFixed(1) : 0;
    const totalPointsAwarded = sessions.reduce((a, s) => a + s.points_earned, 0);

    return res.json({ totalSessions, avgScore, totalPointsAwarded });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
