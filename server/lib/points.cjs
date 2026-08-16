const { db } = require('./supabase.cjs');

const RULES = {
  collection_resident: 20,
  collection_collector: 10,
  report: 15,
  education: 5,
};

/**
 * Award points: writes an immutable ledger row and updates the profile balance.
 * Returns the new balance, or null on failure.
 */
async function addPoints(userId, delta, reason, sourceType, sourceId) {
  const { data: txn, error: tErr } = await db
    .from('points_transactions')
    .insert({ user_id: userId, delta, reason, source_type: sourceType, source_id: sourceId })
    .select()
    .single();
  if (tErr) return null;

  const { data: profile, error: pErr } = await db
    .from('profiles')
    .select('points')
    .eq('id', userId)
    .single();
  if (pErr) return null;

  const newPoints = (profile.points || 0) + delta;
  const { error: uErr } = await db.from('profiles').update({ points: newPoints }).eq('id', userId);
  if (uErr) return null;

  return { txn, newPoints };
}

/** Award points for a verified collection. */
async function awardCollectionPoints(reqRow) {
  const results = [];
  const r = await addPoints(reqRow.resident_id, RULES.collection_resident, 'Verified waste collection', 'collection', reqRow.id);
  if (r) results.push({ user_id: reqRow.resident_id, ...r });
  if (reqRow.collector_id) {
    const c = await addPoints(reqRow.collector_id, RULES.collection_collector, 'Verified collection completed', 'collection', reqRow.id);
    if (c) results.push({ user_id: reqRow.collector_id, ...c });
  }
  return results;
}

/** Award points for a verified dumping report. */
async function awardReportPoints(reportRow) {
  return addPoints(reportRow.reporter_id, RULES.report, 'Verified irresponsible-dumping report', 'report', reportRow.id);
}

module.exports = { RULES, addPoints, awardCollectionPoints, awardReportPoints };
