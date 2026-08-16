const { db } = require('./supabase.cjs');
const { addPoints } = require('./points.cjs');

const TYPES = {
  collections: 'Number of verified collections in the period',
  reports: 'Number of verified dumping reports in the period',
  participation: 'Distinct residents with at least one verified action',
  score: 'Society score (0–100) at end of period',
};

/**
 * Compute current progress for one society against one challenge,
 * using only real verified data in the challenge's date range.
 */
async function computeProgress(challenge, societyId) {
  const start = challenge.starts_at.slice(0, 10);
  const end = challenge.ends_at.slice(0, 10);
  // Exclusive upper bound: 'YYYY-MM-DD' truncates to midnight and would drop
  // every verified event from the challenge's last day.
  const endExclusive = new Date(new Date(end + 'T00:00:00Z').getTime() + 24 * 3600 * 1000).toISOString();

  if (challenge.challenge_type === 'score') {
    const today = new Date().toISOString().slice(0, 10);
    const periodEnd = today < end ? today : end;
    const { data: score } = await db
      .from('society_scores')
      .select('score')
      .eq('society_id', societyId)
      .eq('period_end', periodEnd)
      .maybeSingle();
    return Math.round((score?.score || 0) * 100) / 100;
  }

  if (challenge.challenge_type === 'reports') {
    const { count } = await db
      .from('dumping_reports')
      .select('id', { count: 'exact', head: true })
      .eq('society_id', societyId)
      .eq('status', 'verified')
      .gte('verified_at', start)
      .lt('verified_at', endExclusive);
    return count || 0;
  }

  const { count } = await db
    .from('collection_requests')
    .select('id', { count: 'exact', head: true })
    .eq('society_id', societyId)
    .eq('status', 'verified')
    .gte('verified_at', start)
    .lt('verified_at', endExclusive);
  if (challenge.challenge_type === 'collections') return count || 0;

  // participation: distinct residents with a verified action
  const { data: colResidents } = await db
    .from('collection_requests')
    .select('resident_id')
    .eq('society_id', societyId)
    .eq('status', 'verified')
    .gte('verified_at', start)
    .lt('verified_at', endExclusive);
  const { data: repResidents } = await db
    .from('dumping_reports')
    .select('reporter_id')
    .eq('society_id', societyId)
    .eq('status', 'verified')
    .gte('verified_at', start)
    .lt('verified_at', endExclusive);
  const ids = new Set((colResidents || []).map((r) => r.resident_id));
  (repResidents || []).forEach((r) => ids.add(r.reporter_id));
  return ids.size;
}

/**
 * For every active challenge, check each society's progress. When a society
 * crosses its target, record the completion once and pay bonus points to all
 * residents of that society. Returns the newly completed rows.
 */
async function checkChallengeCompletions(societyId) {
  const now = new Date().toISOString().slice(0, 10);
  const { data: challenges } = await db
    .from('challenges')
    .select('*')
    .eq('status', 'active')
    .lte('starts_at', now)
    .gte('ends_at', now);

  const newlyCompleted = [];
  for (const challenge of challenges || []) {
    const progress = await computeProgress(challenge, societyId);
    if (progress < challenge.target) continue;

    const { data: existing } = await db
      .from('challenge_completions')
      .select('reward_awarded')
      .eq('challenge_id', challenge.id)
      .eq('society_id', societyId)
      .maybeSingle();
    if (existing) continue;

    await db.from('challenge_completions').insert({
      challenge_id: challenge.id,
      society_id: societyId,
      reward_awarded: false,
    });

    // Pay out the bonus exactly once: +reward to each resident of the society
    const { data: residents } = await db
      .from('profiles')
      .select('id')
      .eq('role', 'resident')
      .eq('society_id', societyId);
    let awarded = 0;
    for (const resident of residents || []) {
      const r = await addPoints(
        resident.id,
        challenge.reward_points,
        `Bonus: completed "${challenge.title}"`,
        'bonus',
        challenge.id
      );
      if (r) awarded++;
    }
    if (awarded > 0) {
      await db
        .from('challenge_completions')
        .update({ reward_awarded: true })
        .eq('challenge_id', challenge.id)
        .eq('society_id', societyId);
    }
    newlyCompleted.push({ challenge_id: challenge.id, society_id: societyId, progress, reward_points: challenge.reward_points, awarded });
  }

  // If every society completed the challenge, mark it completed
  const { data: allSocieties } = await db.from('societies').select('id');
  const { data: challenges2 } = await db.from('challenges').select('*').eq('status', 'active');
  for (const challenge of challenges2 || []) {
    if ((allSocieties || []).length === 0) continue;
    const { count } = await db
      .from('challenge_completions')
      .select('id', { count: 'exact', head: true })
      .eq('challenge_id', challenge.id);
    if (count === allSocieties.length) {
      await db.from('challenges').update({ status: 'completed' }).eq('id', challenge.id);
    }
  }

  return newlyCompleted;
}

module.exports = { TYPES, computeProgress, checkChallengeCompletions };
