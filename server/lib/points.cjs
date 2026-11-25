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
  // Atomic path: the Postgres function writes the ledger row and updates the
  // profile balance in one transaction, so points can never be granted without
  // a matching immutable ledger entry.
  try {
    const { data: balance, error: rpcErr } = await db.rpc('award_points', {
      p_user: userId,
      p_delta: delta,
      p_reason: reason,
      p_source_type: sourceType,
      p_source_id: sourceId,
    });
    if (rpcErr) throw rpcErr;
    const newPoints = Number(balance);
    if (!Number.isFinite(newPoints)) return null;
    return { txn: null, newPoints };
  } catch (e) {
    const msg = e.message || String(e);
    if (!/award_points|function/i.test(msg)) {
      console.error('Award points RPC failed:', msg);
      return null;
    }
    console.warn('award_points RPC unavailable, falling back to read-modify-write:', msg);
  }

  // Fallback for databases without the RPC: insert the ledger row FIRST, then
  // update the balance only if that insert succeeded.
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
