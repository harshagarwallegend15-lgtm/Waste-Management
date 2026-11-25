#!/usr/bin/env node
/**
 * Backfill NULL area_id on profiles and collection_requests.
 * Uses Supabase REST (no direct DB access needed).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function backfill() {
  let fixed = 0;

  // 1. Fix profiles: set area_id from society's area_id.
  //    Only societies with a NON-NULL area_id can repair the profile.
  console.log('Step 1: Backfilling profiles.area_id from societies...');
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, society_id')
    .eq('role', 'resident')
    .is('area_id', null)
    .not('society_id', 'is', null);
  if (profilesError) throw profilesError;

  if (profiles?.length) {
    console.log(`  Found ${profiles.length} residents with null area_id`);
    for (const p of profiles) {
      const { data: society, error: societyError } = await supabase
        .from('societies')
        .select('area_id')
        .eq('id', p.society_id)
        .maybeSingle();
      if (societyError) throw societyError;
      if (society?.area_id) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ area_id: society.area_id })
          .eq('id', p.id);
        if (updateError) throw updateError;
        fixed++;
        console.log(`  Fixed profile ${p.id} → area ${society.area_id}`);
      } else {
        console.log(`  WARNING: Society ${p.society_id} has no area_id for profile ${p.id}`);
      }
    }
  } else {
    console.log('  No profiles to fix');
  }

  // 2. Fix collection_requests: set area_id from resident's profile,
  //    falling back to the society's area when the resident has none.
  console.log('Step 2: Backfilling collection_requests.area_id from profiles...');
  const { data: requests, error: requestsError } = await supabase
    .from('collection_requests')
    .select('id, resident_id, society_id')
    .is('area_id', null);
  if (requestsError) throw requestsError;

  if (requests?.length) {
    console.log(`  Found ${requests.length} requests with null area_id`);
    for (const r of requests) {
      let areaId = null;
      // Try resident's profile first (a missing/deleted profile is not fatal).
      if (r.resident_id) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('area_id')
          .eq('id', r.resident_id)
          .maybeSingle();
        if (profileError) throw profileError;
        if (profile?.area_id) areaId = profile.area_id;
      }
      // Fallback: society lookup — only when we still have no area.
      if (!areaId && r.society_id) {
        const { data: society, error: societyError } = await supabase
          .from('societies')
          .select('area_id')
          .eq('id', r.society_id)
          .maybeSingle();
        if (societyError) throw societyError;
        if (society?.area_id) areaId = society.area_id;
      }
      if (areaId) {
        const { error: updateError } = await supabase
          .from('collection_requests')
          .update({ area_id: areaId })
          .eq('id', r.id);
        if (updateError) throw updateError;
        fixed++;
        console.log(`  Fixed request ${r.id} → area ${areaId}`);
      } else {
        console.log(`  WARNING: Could not determine area for request ${r.id}`);
      }
    }
  } else {
    console.log('  No requests to fix');
  }

  // 3. Also fix collectors with null area_id — prefer their society's area
  //    and only fall back to the first area if no better value exists.
  console.log('Step 3: Backfilling collector profiles with null area_id...');
  const { data: collectors, error: collectorsError } = await supabase
    .from('profiles')
    .select('id, society_id')
    .eq('role', 'collector')
    .is('area_id', null);
  if (collectorsError) throw collectorsError;

  if (collectors?.length) {
    let fallbackAreaId = null;
    for (const c of collectors) {
      let areaId = null;
      if (c.society_id) {
        const { data: society, error: societyError } = await supabase
          .from('societies')
          .select('area_id')
          .eq('id', c.society_id)
          .maybeSingle();
        if (societyError) throw societyError;
        if (society?.area_id) areaId = society.area_id;
      }
      if (!areaId) {
        if (!fallbackAreaId) {
          const { data: firstArea, error: areaError } = await supabase
            .from('areas')
            .select('id')
            .limit(1)
            .maybeSingle();
          if (areaError) throw areaError;
          fallbackAreaId = firstArea?.id || null;
        }
        areaId = fallbackAreaId;
      }
      if (areaId) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ area_id: areaId })
          .eq('id', c.id);
        if (updateError) throw updateError;
        fixed++;
        console.log(`  Fixed collector ${c.id} → area ${areaId}`);
      } else {
        console.log(`  WARNING: Could not determine area for collector ${c.id}`);
      }
    }
  } else {
    console.log('  No collectors to fix');
  }

  // Verify
  const { count: pNull } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'resident')
    .is('area_id', null);
  const { count: cNull } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'collector')
    .is('area_id', null);
  const { count: rNull } = await supabase
    .from('collection_requests')
    .select('id', { count: 'exact', head: true })
    .is('area_id', null);

  console.log(`\nDone! Fixed ${fixed} records.`);
  console.log(`Remaining null area_id: ${pNull} residents, ${cNull} collectors, ${rNull} requests`);
}

backfill().catch((e) => { console.error(e); process.exit(1); });
