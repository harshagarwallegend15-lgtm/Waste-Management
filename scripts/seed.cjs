try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') }); } catch (e) {}
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const KEY = SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const admin = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

const AREAS = ['Zone A (North)', 'Zone B (Central)', 'Zone C (East)'];

const SOCIETIES = [
  { name: 'Green Valley Residency', area: 0, address: '12 Sector Road, North', gps: [28.6139, 77.2090] },
  { name: 'Sunrise Apartments', area: 0, address: '45 Lake View, North', gps: [28.6188, 77.2140] },
  { name: 'Maple Heights', area: 1, address: '88 Park Avenue, Central', gps: [28.6290, 77.2215] },
  { name: 'Skyline Towers', area: 1, address: '200 MG Road, Central', gps: [28.6342, 77.2281] },
  { name: 'Riverdale Society', area: 2, address: '3 Riverside, East', gps: [28.6040, 77.2405] },
  { name: 'Orchard Homes', area: 2, address: '77 Orchard Lane, East', gps: [28.5985, 77.2462] },
];

const ADMIN = { email: 'admin@wastewise.app', password: 'Admin@123', name: 'Municipal Admin' };

const RESIDENTS = [
  { email: 'resident@wastewise.app', password: 'Resident@123', name: 'Aarav Sharma', area: 0, society: 0, phone: '9876500000' },
];

const COLLECTORS = [
  { email: 'collector@wastewise.app', password: 'Collector@123', name: 'Demo Collector', area: 0, phone: '9876500010' },
  { email: 'collector1@wastewise.app', password: 'Collector@123', name: 'Vikram Singh', area: 0, phone: '9876500011' },
  { email: 'collector2@wastewise.app', password: 'Collector@123', name: 'Ravi Kumar', area: 1, phone: '9876500012' },
  { email: 'collector3@wastewise.app', password: 'Collector@123', name: 'Suresh Patel', area: 2, phone: '9876500013' },
  { email: 'collector4@wastewise.app', password: 'Collector@123', name: 'Anil Yadav', area: 0, phone: '9876500014' },
  { email: 'collector5@wastewise.app', password: 'Collector@123', name: 'Deepak Sharma', area: 1, phone: '9876500015' },
];

// auth.admin.listUsers() needs the service role and returns one page at a time.
// Never call it with the anon key.
async function listAllUsers() {
  if (!SERVICE_KEY) return [];
  const users = [];
  const perPage = 100;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < perPage) break;
  }
  return users;
}

async function createAuthUser(email, password, meta, existingUsers = []) {
  const found = existingUsers.find((x) => x.email === email);
  if (found) return { user: found, existed: true };

  if (SERVICE_KEY) {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: meta,
    });
    if (error) {
      if (/already.*registered/i.test(error.message)) {
        // Another process may have created it between the list and create calls.
        const refreshed = await listAllUsers();
        const u = refreshed.find((x) => x.email === email);
        if (u) return { user: u, existed: true };
      }
      throw error;
    }
    return { user: data.user, existed: false };
  }
  const { data, error } = await admin.auth.signUp({ email, password, options: { data: meta } });
  if (error) {
    if (error.message && /already.*registered/i.test(error.message)) {
      // Without the service role we cannot look up the existing user id — skip it.
      return { user: null, existed: true };
    }
    throw error;
  }
  return { user: data.user, existed: false };
}

async function upsertProfile(id, profile) {
  const { data, error } = await admin.from('profiles').upsert({ id, ...profile }, { onConflict: 'id' }).select().single();
  if (error) throw error;
  return data;
}

// Production seeding must not overwrite anything that is already there.
async function insertProfileIfMissing(id, profile) {
  const { data: existing } = await admin.from('profiles').select('id').eq('id', id).maybeSingle();
  if (existing) return false;
  const { error } = await admin.from('profiles').insert({ id, ...profile });
  if (error) throw error;
  return true;
}

async function main() {
  console.log('=== WasteWise: Seed demo data ===\n');

  // 1. Cleanup: delete all dummy data (keep areas, societies, admin).
  // Wiping data is local-only — production only ever inserts what is missing.
  if (IS_PRODUCTION) {
    console.log('Production mode: skipping destructive cleanup; only inserting missing rows.');
  } else {
    console.log('Cleaning up dummy data...');
    // Tables without an `id` column must be cleared by their real key columns,
    // otherwise the DELETE silently matches nothing (challenge_completions).
    const cleanup = [
      { table: 'problem_comments', key: ['id'] },
      { table: 'society_problems', key: ['id'] },
      { table: 'challenge_completions', key: ['challenge_id', 'society_id'] },
      { table: 'challenges', key: ['id'] },
      { table: 'education_content', key: ['id'] },
      { table: 'society_scores', key: ['id'] },
      { table: 'points_transactions', key: ['id'] },
      { table: 'verification_events', key: ['id'] },
      { table: 'collection_requests', key: ['id'] },
      { table: 'dumping_reports', key: ['id'] },
      { table: 'learn_earn_sessions', key: ['id'] },
    ];
    for (const { table, key } of cleanup) {
      let query = admin.from(table).delete();
      for (const col of key) query = query.neq(col, ZERO_UUID);
      const { error } = await query;
      if (error && !/does not exist/i.test(error.message)) console.warn(`  ${table}: ${error.message}`);
      else console.log(`  ✓ ${table} cleared`);
    }

    // Delete all non-admin profiles
    const { data: nonAdmins } = await admin.from('profiles').select('id, role, email').neq('role', 'admin');
    if (nonAdmins?.length) {
      for (const p of nonAdmins) {
        await admin.from('profiles').delete().eq('id', p.id);
        // Also delete auth user (best-effort)
        try { await admin.auth.admin.deleteUser(p.id); } catch {}
      }
      console.log(`  ✓ Removed ${nonAdmins.length} non-admin profiles + auth users`);
    } else {
      console.log('  ✓ No non-admin profiles to remove');
    }

    // Reset admin points
    await admin.from('profiles').update({ points: 0 }).eq('role', 'admin');
  }

  // 2. Ensure areas exist
  const { data: existingAreas } = await admin.from('areas').select('id, name');
  const areaIdMap = {};
  (existingAreas || []).forEach((a) => { areaIdMap[a.name] = a.id; });
  for (const name of AREAS) {
    if (areaIdMap[name]) continue;
    const { data, error } = await admin.from('areas').insert({ name }).select().single();
    if (error) throw error;
    areaIdMap[name] = data.id;
  }
  console.log(`\nAreas ready (${AREAS.length})`);

  // 3. Ensure societies exist, and repair missing GPS on existing ones
  const { data: existingSocieties } = await admin.from('societies').select('id, name, gps_lat, gps_lng');
  const societyIdMap = {};
  (existingSocieties || []).forEach((s) => { societyIdMap[s.name] = s; });
  for (const s of SOCIETIES) {
    const existing = societyIdMap[s.name];
    if (!existing) {
      const { data, error } = await admin
        .from('societies')
        .insert({ name: s.name, area_id: areaIdMap[AREAS[s.area]], address: s.address, gps_lat: s.gps[0], gps_lng: s.gps[1] })
        .select().single();
      if (error) throw error;
      societyIdMap[s.name] = data;
      console.log(`  ✓ Created society ${s.name}`);
    } else if (existing.gps_lat == null || existing.gps_lng == null) {
      const { data, error } = await admin
        .from('societies')
        .update({ gps_lat: s.gps[0], gps_lng: s.gps[1] })
        .eq('id', existing.id)
        .select().single();
      if (error) throw error;
      societyIdMap[s.name] = data;
      console.log(`  ✓ Backfilled GPS for ${s.name}`);
    }
  }
  console.log(`Societies ready (${SOCIETIES.length})`);

  // Existing auth users are loaded once so seeding can skip them idempotently.
  const allUsers = await listAllUsers();

  // 4. Ensure admin exists
  const adminUser = await createAuthUser(ADMIN.email, ADMIN.password, { role: 'admin', name: ADMIN.name }, allUsers);
  if (adminUser.user) {
    const profileData = { email: ADMIN.email, role: 'admin', name: ADMIN.name, active: true };
    if (adminUser.existed && IS_PRODUCTION) {
      const added = await insertProfileIfMissing(adminUser.user.id, profileData);
      console.log(`\nAdmin already exists: ${ADMIN.email}${added ? ' (profile inserted)' : ''}`);
    } else {
      await upsertProfile(adminUser.user.id, profileData);
    }
  }
  console.log('Admin ready:', ADMIN.email, '/', ADMIN.password);

  // 5. Ensure demo resident exists (README / chatbot / e2e tests use this account)
  console.log('\nEnsuring demo resident...');
  for (const r of RESIDENTS) {
    const u = await createAuthUser(r.email, r.password, { role: 'resident', name: r.name }, allUsers);
    if (!u.user) { console.log(`  ! ${r.email} already exists (no service key; cannot update profile)`); continue; }
    const profileData = {
      email: r.email, role: 'resident', name: r.name, phone: r.phone,
      society_id: societyIdMap[SOCIETIES[r.society].name]?.id || null,
      area_id: areaIdMap[AREAS[r.area]], active: true,
    };
    if (u.existed && IS_PRODUCTION) {
      const added = await insertProfileIfMissing(u.user.id, profileData);
      console.log(`  ✓ ${r.email} already exists${added ? ' (profile inserted)' : ''}`);
      continue;
    }
    const profile = await upsertProfile(u.user.id, profileData);
    console.log(`  ✓ ${profile.name} (${profile.email}) → ${AREAS[r.area]}`);
  }

  // 6. Ensure collectors exist (demo account + collector1..5)
  console.log('\nEnsuring collectors...');
  for (const c of COLLECTORS) {
    const u = await createAuthUser(c.email, c.password, { role: 'collector', name: c.name }, allUsers);
    if (!u.user) { console.log(`  ! ${c.email} already exists (no service key; cannot update profile)`); continue; }
    const profileData = {
      email: c.email, role: 'collector', name: c.name,
      phone: c.phone, area_id: areaIdMap[AREAS[c.area]], active: true,
    };
    if (u.existed && IS_PRODUCTION) {
      const added = await insertProfileIfMissing(u.user.id, profileData);
      console.log(`  ✓ ${c.email} already exists${added ? ' (profile inserted)' : ''}`);
      continue;
    }
    const profile = await upsertProfile(u.user.id, profileData);
    console.log(`  ✓ ${profile.name} (${profile.email}) → ${AREAS[c.area]}`);
  }

  console.log('\n=== Seed complete ===');
  console.log('\nDemo credentials:');
  RESIDENTS.forEach((r) => console.log(`  ${r.name.padEnd(18)} ${r.email.padEnd(28)} ${r.password}`));
  console.log('\nCollector credentials (all use password: Collector@123):');
  COLLECTORS.forEach((c) => console.log(`  ${c.name.padEnd(18)} ${c.email.padEnd(28)} → ${AREAS[c.area]}`));
  console.log(`\n  Admin: ${ADMIN.email} / ${ADMIN.password}`);

  // Auto-confirm all unconfirmed auth users (dev convenience, service role only)
  if (SERVICE_KEY) {
    console.log('\nConfirming all unconfirmed auth users...');
    const users = await listAllUsers();
    let confirmed = 0;
    for (const u of users) {
      if (!u.email_confirmed_at) {
        try {
          await admin.auth.admin.updateUserById(u.id, { email_confirm: true });
          confirmed++;
          console.log(`  ✓ Confirmed: ${u.email}`);
        } catch {}
      }
    }
    console.log(`  ✓ Total confirmed: ${confirmed}`);
  }
}

main().catch((e) => {
  console.error('Seed failed:', e.message);
  process.exit(1);
});
