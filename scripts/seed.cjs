try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') }); } catch (e) {}
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const KEY = SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const admin = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

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

const COLLECTORS = [
  { email: 'collector1@wastewise.app', password: 'Collector@123', name: 'Vikram Singh', area: 0, phone: '9876500011' },
  { email: 'collector2@wastewise.app', password: 'Collector@123', name: 'Ravi Kumar', area: 1, phone: '9876500012' },
  { email: 'collector3@wastewise.app', password: 'Collector@123', name: 'Suresh Patel', area: 2, phone: '9876500013' },
  { email: 'collector4@wastewise.app', password: 'Collector@123', name: 'Anil Yadav', area: 0, phone: '9876500014' },
  { email: 'collector5@wastewise.app', password: 'Collector@123', name: 'Deepak Sharma', area: 1, phone: '9876500015' },
];

async function createAuthUser(email, password, meta) {
  if (SERVICE_KEY) {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: meta,
    });
    if (error) {
      if (/already.*registered/i.test(error.message)) {
        const { data: found } = await admin.auth.admin.listUsers();
        const u = (found?.users || []).find((x) => x.email === email);
        if (u) return { user: u, existed: true };
      }
      throw error;
    }
    return { user: data.user, existed: false };
  }
  const { data, error } = await admin.auth.signUp({ email, password, options: { data: meta } });
  if (error) {
    if (error.message && /already.*registered/i.test(error.message)) {
      const { data: found } = await admin.auth.admin.listUsers();
      const u = (found?.users || []).find((x) => x.email === email);
      if (u) return { user: u, existed: true };
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

async function main() {
  console.log('=== WasteWise: Cleanup + Create 5 Collectors ===\n');

  // 1. Cleanup: delete all dummy data (keep areas, societies, admin)
  console.log('Cleaning up dummy data...');
  const tables = [
    'problem_comments', 'society_problems', 'challenge_completions', 'challenges',
    'education_content', 'society_scores', 'points_transactions', 'verification_events',
    'collection_requests', 'dumping_reports', 'learn_earn_sessions',
  ];
  for (const t of tables) {
    const { error } = await admin.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error && !/does not exist/i.test(error.message)) console.warn(`  ${t}: ${error.message}`);
    else console.log(`  ✓ ${t} cleared`);
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

  // 2. Ensure areas exist
  const { data: existingAreas } = await admin.from('areas').select('id, name');
  const areaIdMap = {};
  if (!existingAreas?.length) {
    for (const name of AREAS) {
      const { data, error } = await admin.from('areas').insert({ name }).select().single();
      if (error) throw error;
      areaIdMap[name] = data.id;
    }
    console.log('\nCreated', AREAS.length, 'areas');
  } else {
    existingAreas.forEach((a) => { areaIdMap[a.name] = a.id; });
    console.log('\nAreas already exist');
  }

  // 3. Ensure societies exist
  const { data: existingSocieties } = await admin.from('societies').select('id, name, gps_lat, gps_lng');
  const societyIdMap = {};
  if (!existingSocieties?.length) {
    for (const s of SOCIETIES) {
      const { data, error } = await admin
        .from('societies')
        .insert({ name: s.name, area_id: areaIdMap[AREAS[s.area]], address: s.address, gps_lat: s.gps[0], gps_lng: s.gps[1] })
        .select().single();
      if (error) throw error;
      societyIdMap[s.name] = data.id;
    }
    console.log('Created', SOCIETIES.length, 'societies');
  } else {
    existingSocieties.forEach((s) => { societyIdMap[s.name] = s.id; });
    console.log('Societies already exist');
  }

  // 4. Ensure admin exists
  const adminUser = await createAuthUser(ADMIN.email, ADMIN.password, { role: 'admin', name: ADMIN.name });
  await upsertProfile(adminUser.user.id, {
    email: ADMIN.email, role: 'admin', name: ADMIN.name, active: true,
  });
  console.log('\nAdmin ready:', ADMIN.email, '/', ADMIN.password);

  // 5. Create 5 collectors
  console.log('\nCreating 5 collectors...');
  for (const c of COLLECTORS) {
    const u = await createAuthUser(c.email, c.password, { role: 'collector', name: c.name });
    const profile = await upsertProfile(u.user.id, {
      email: c.email, role: 'collector', name: c.name,
      phone: c.phone, area_id: areaIdMap[AREAS[c.area]], active: true,
    });
    console.log(`  ✓ ${profile.name} (${profile.email}) → ${AREAS[c.area]}`);
  }

  console.log('\n=== Seed complete ===');
  console.log('\nCollector credentials (all use password: Collector@123):');
  COLLECTORS.forEach((c) => console.log(`  ${c.name.padEnd(18)} ${c.email.padEnd(28)} → ${AREAS[c.area]}`));
  console.log(`\n  Admin: ${ADMIN.email} / ${ADMIN.password}`);

  // Auto-confirm all unconfirmed auth users (dev convenience)
  if (SERVICE_KEY) {
    console.log('\nConfirming all unconfirmed auth users...');
    const { data: allUsers } = await admin.auth.admin.listUsers();
    let confirmed = 0;
    for (const u of (allUsers?.users || [])) {
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
