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
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function backfill() {
  let fixed = 0;

  // 1. Fix profiles: set area_id from society's area_id
  console.log('Step 1: Backfilling profiles.area_id from societies...');
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, society_id')
    .eq('role', 'resident')
    .is('area_id', null)
    .not('society_id', 'is', null);

  if (profiles?.length) {
    console.log(`  Found ${profiles.length} residents with null area_id`);
    for (const p of profiles) {
      const { data: society } = await supabase
        .from('societies')
        .select('area_id')
        .eq('id', p.society_id)
        .single();
      if (society?.area_id) {
        await supabase
          .from('profiles')
          .update({ area_id: society.area_id })
          .eq('id', p.id);
        fixed++;
        console.log(`  Fixed profile ${p.id} → area ${society.area_id}`);
      }
    }
  } else {
    console.log('  No profiles to fix');
  }

  // 2. Fix collection_requests: set area_id from resident's profile
  console.log('Step 2: Backfilling collection_requests.area_id from profiles...');
  const { data: requests } = await supabase
    .from('collection_requests')
    .select('id, resident_id, society_id')
    .is('area_id', null);

  if (requests?.length) {
    console.log(`  Found ${requests.length} requests with null area_id`);
    for (const r of requests) {
      let areaId = null;
      // Try resident's profile first
      if (r.resident_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('area_id')
          .eq('id', r.resident_id)
          .single();
        if (profile?.area_id) areaId = profile.area_id;
      }
      // Fallback: society lookup
      if (!areaId && r.society_id) {
        const { data: society } = await supabase
          .from('societies')
          .select('area_id')
          .eq('id', r.society_id)
          .single();
        if (society?.area_id) areaId = society.area_id;
      }
      if (areaId) {
        await supabase
          .from('collection_requests')
          .update({ area_id: areaId })
          .eq('id', r.id);
        fixed++;
        console.log(`  Fixed request ${r.id} → area ${areaId}`);
      } else {
        console.log(`  WARNING: Could not determine area for request ${r.id}`);
      }
    }
  } else {
    console.log('  No requests to fix');
  }

  // 3. Also fix collectors with null area_id
  console.log('Step 3: Backfilling collector profiles with null area_id...');
  const { data: collectors } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'collector')
    .is('area_id', null);

  if (collectors?.length) {
    const { data: firstArea } = await supabase
      .from('areas')
      .select('id')
      .limit(1)
      .single();
    if (firstArea?.id) {
      for (const c of collectors) {
        await supabase
          .from('profiles')
          .update({ area_id: firstArea.id })
          .eq('id', c.id);
        fixed++;
        console.log(`  Fixed collector ${c.id} → area ${firstArea.id}`);
      }
    }
  }

  // Verify
  const { count: pNull } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'resident')
    .is('area_id', null);
  const { count: rNull } = await supabase
    .from('collection_requests')
    .select('id', { count: 'exact', head: true })
    .is('area_id', null);

  console.log(`\nDone! Fixed ${fixed} records.`);
  console.log(`Remaining null area_id: ${pNull} profiles, ${rNull} requests`);
}

backfill().catch((e) => { console.error(e); process.exit(1); });
