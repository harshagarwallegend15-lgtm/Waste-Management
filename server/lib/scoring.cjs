const { db } = require('./supabase.cjs');

/**
 * Compute a normalized 0–100 society score for a period so that larger
 * societies don't automatically win (per-capita normalization).
 */
async function computeSocietyScore(societyId, periodStart, periodEnd) {
  const society = await db.from('societies').select('id').eq('id', societyId).single();
  if (society.error) return null;

  // Exclusive upper bound: 'YYYY-MM-DD' alone truncates to midnight and
  // silently drops every event from periodEnd day itself.
  const endExclusive = new Date(new Date(periodEnd + 'T00:00:00Z').getTime() + 24 * 3600 * 1000).toISOString();

  // Residents in the society
  const { data: residents } = await db.from('profiles').select('id').eq('role', 'resident').eq('society_id', societyId);
  const residentCount = residents?.length || 0;

  // All collection requests in the period
  const { data: requests } = await db
    .from('collection_requests')
    .select('id, status, waste_type')
    .eq('society_id', societyId)
    .gte('created_at', periodStart)
    .lt('created_at', endExclusive);

  // Verified reports in the period
  const { data: reports } = await db
    .from('dumping_reports')
    .select('id, reporter_id')
    .eq('society_id', societyId)
    .eq('status', 'verified')
    .gte('created_at', periodStart)
    .lt('created_at', endExclusive);

  const totalRequests = requests?.length || 0;
  const verifiedRequests = (requests || []).filter((r) => r.status === 'verified').length;
  const segregatedRequests = (requests || []).filter(
    (r) => r.status === 'verified' && r.waste_type && r.waste_type !== 'mixed'
  ).length;

  // Participation: distinct residents who did a verified action
  const { data: participators } = await db
    .from('collection_requests')
    .select('resident_id')
    .eq('society_id', societyId)
    .eq('status', 'verified')
    .gte('created_at', periodStart)
    .lt('created_at', endExclusive);
  const participatorIds = new Set((participators || []).map((r) => r.resident_id));
  (reports || []).forEach((r) => participatorIds.add(r.reporter_id));

  const participationRate = residentCount ? participatorIds.size / residentCount : 0;
  const disposalRate = totalRequests ? verifiedRequests / totalRequests : 0;
  const segregationRate = verifiedRequests ? segregatedRequests / verifiedRequests : 0;
  const reportScore = Math.min(1, (reports?.length || 0) / (residentCount || 1) / 0.5);

  // Improvement vs the prior equal-length period
  const span = new Date(periodEnd) - new Date(periodStart);
  const priorStart = new Date(new Date(periodStart).getTime() - span).toISOString().slice(0, 10);
  const priorEnd = periodStart;
  const { data: prior } = await db
    .from('society_scores')
    .select('score')
    .eq('society_id', societyId)
    .eq('period_start', priorStart)
    .eq('period_end', priorEnd)
    .maybeSingle();
  const improvement = prior?.score != null && prior.score > 0 ? (scorePrelim() - prior.score) / prior.score : 0;

  function scorePrelim() {
    return (
      participationRate * 40 +
      disposalRate * 30 +
      segregationRate * 15 +
      reportScore * 10 +
      5
    );
  }

  const raw = scorePrelim();
  const score = Math.max(0, Math.min(100, raw + Math.max(-10, Math.min(10, improvement * 20))));

  const { data, error } = await db
    .from('society_scores')
    .upsert(
      {
        society_id: societyId,
        period_start: periodStart,
        period_end: periodEnd,
        score: Math.round(score * 100) / 100,
        metrics: {
          participation_rate: Math.round(participationRate * 100) / 100,
          disposal_rate: Math.round(disposalRate * 100) / 100,
          segregation_rate: Math.round(segregationRate * 100) / 100,
          verified_reports: reports?.length || 0,
          improvement: Math.round(improvement * 100) / 100,
          residents: residentCount,
        },
      },
      { onConflict: 'society_id,period_start,period_end' }
    )
    .select()
    .single();

  return error ? null : data;
}

/** Recompute scores for all societies in the current period (e.g. weekly). */
async function recomputeAllSocietyScores() {
  const { data: societies } = await db.from('societies').select('id');
  if (!societies) return [];
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const out = [];
  for (const s of societies) {
    const r = await computeSocietyScore(s.id, start, end);
    if (r) out.push(r);
  }
  return out;
}

/** Recompute the current-period score for a single society (called after each verified action). */
async function recomputeSocietyScore(societyId) {
  if (!societyId) return null;
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  return computeSocietyScore(societyId, start, end);
}

module.exports = { computeSocietyScore, recomputeAllSocietyScores, recomputeSocietyScore };
