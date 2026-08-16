try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') }); } catch (e) {}
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const KEY = SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const admin = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

const AREAS = ['Zone A (North)', 'Zone B (Central)', 'Zone C (East)'];

// Coordinates cluster around the demo city (Delhi ~28.61, 77.21). Each society
// gets a slightly offset pin so distance-based "societies near you" works.
const SOCIETIES = [
  { name: 'Green Valley Residency', area: 0, address: '12 Sector Road, North', gps: [28.6139, 77.2090] },
  { name: 'Sunrise Apartments', area: 0, address: '45 Lake View, North', gps: [28.6188, 77.2140] },
  { name: 'Maple Heights', area: 1, address: '88 Park Avenue, Central', gps: [28.6290, 77.2215] },
  { name: 'Skyline Towers', area: 1, address: '200 MG Road, Central', gps: [28.6342, 77.2281] },
  { name: 'Riverdale Society', area: 2, address: '3 Riverside, East', gps: [28.6040, 77.2405] },
  { name: 'Orchard Homes', area: 2, address: '77 Orchard Lane, East', gps: [28.5985, 77.2462] },
];

const ADMIN = { email: 'admin@wastewise.app', password: 'Admin@123', name: 'Municipal Admin' };
const DEMO = {
  resident: { email: 'resident@wastewise.app', password: 'Resident@123', name: 'Asha Sharma' },
  collector: { email: 'collector@wastewise.app', password: 'Collector@123', name: 'Vikram Singh' },
};

async function createAuthUser(email, password, meta) {
  // Service role: create directly, auto-confirmed, no confirmation email (avoids rate limits).
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

  // Anon fallback path (no service key)
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
  console.log('Seeding WasteWise...');

  // Storage bucket (best-effort)
  const { error: bErr } = await admin.storage.createBucket('waste-photos', {
    public: false, file_size_limit: 8 * 1024 * 1024,
  });
  if (bErr) {
    if (!/already exists/i.test(bErr.message)) console.warn('Bucket note:', bErr.message);
  } else {
    console.log('Storage bucket waste-photos ready');
  }

  // Areas
  const { data: existingAreas } = await admin.from('areas').select('id, name');
  const areaIdMap = {};
  if (!existingAreas?.length) {
    for (const name of AREAS) {
      const { data, error } = await admin.from('areas').insert({ name }).select().single();
      if (error) throw error;
      areaIdMap[name] = data.id;
    }
    console.log('Created', AREAS.length, 'areas');
  } else {
    existingAreas.forEach((a) => { areaIdMap[a.name] = a.id; });
    console.log('Areas already exist');
  }

  // Societies
  const { data: existingSocieties } = await admin.from('societies').select('id, name');
  const societyIdMap = {};
  if (!existingSocieties?.length) {
    for (const s of SOCIETIES) {
      const { data, error } = await admin
        .from('societies')
        .insert({ name: s.name, area_id: areaIdMap[AREAS[s.area]], address: s.address, gps_lat: s.gps[0], gps_lng: s.gps[1] })
        .select()
        .single();
      if (error) throw error;
      societyIdMap[s.name] = data.id;
    }
    console.log('Created', SOCIETIES.length, 'societies');
  } else {
    existingSocieties.forEach((s) => { societyIdMap[s.name] = s.id; });
    // Backfill GPS coordinates for societies created before geolocation existed.
    // If the schema.sql migration (gps_lat/gps_lng columns) hasn't been applied
    // to this database yet, skip gracefully — distance ranking stays disabled.
    let backfilled = 0;
    try {
      const { data: withGps } = await admin.from('societies').select('id, name, gps_lat, gps_lng');
      const needCoords = withGps || [];
      for (const s of SOCIETIES) {
        const existing = needCoords.find((e) => e.name === s.name);
        if (existing && (existing.gps_lat == null || existing.gps_lng == null)) {
          const { error } = await admin
            .from('societies')
            .update({ gps_lat: s.gps[0], gps_lng: s.gps[1] })
            .eq('id', existing.id);
          if (error) throw error;
          backfilled++;
        }
      }
    } catch (e) {
      if (/gps_lat/i.test(e.message)) {
        console.warn('Skipping society GPS backfill — run the schema.sql migration (societies.gps_lat/gps_lng) first.');
      } else {
        throw e;
      }
    }
    if (backfilled) console.log('Backfilled GPS for', backfilled, 'existing societies');
    else console.log('Societies already exist');
  }

  // Admin
  const adminUser = await createAuthUser(ADMIN.email, ADMIN.password, { role: 'admin', name: ADMIN.name });
  const adminProfile = await upsertProfile(adminUser.user.id, {
    email: ADMIN.email, role: 'admin', name: ADMIN.name, active: true,
  });
  console.log('Admin ready:', adminProfile.email);

  // Demo resident
  const res = await createAuthUser(DEMO.resident.email, DEMO.resident.password, { role: 'resident', name: DEMO.resident.name });
  const firstSociety = SOCIETIES[0];
  const resident = await upsertProfile(res.user.id, {
    email: DEMO.resident.email, role: 'resident', name: DEMO.resident.name,
    phone: '9876500001', address_text: 'Flat 101, Green Valley Residency',
    gps_lat: 28.6139, gps_lng: 77.2090,
    society_id: societyIdMap[firstSociety.name], area_id: areaIdMap[AREAS[firstSociety.area]],
    active: true,
  });
  console.log('Demo resident ready:', resident.email);

  // Demo collector
  const col = await createAuthUser(DEMO.collector.email, DEMO.collector.password, { role: 'collector', name: DEMO.collector.name });
  const collector = await upsertProfile(col.user.id, {
    email: DEMO.collector.email, role: 'collector', name: DEMO.collector.name,
    phone: '9876500002', area_id: areaIdMap[AREAS[0]], active: true,
  });
  console.log('Demo collector ready:', collector.email);

  // A few sample pending requests for the collector area
  const { count } = await admin.from('collection_requests').select('id', { count: 'exact', head: true });
  if (!count) {
    const demoResidents = [
      { name: 'Rahul Verma', email: 'rahul@wastewise.app', gps: [28.6152, 77.2111] },
      { name: 'Meena Iyer', email: 'meena@wastewise.app', gps: [28.6168, 77.2134] },
    ];
    for (const d of demoResidents) {
      const u = await createAuthUser(d.email, 'Demo@1234', { role: 'resident', name: d.name });
      const p = await upsertProfile(u.user.id, {
        email: d.email, role: 'resident', name: d.name,
        address_text: `Near ${societyIdMap[firstSociety.name] ? firstSociety.name : ''}, Zone A`,
        gps_lat: d.gps[0], gps_lng: d.gps[1],
        society_id: societyIdMap[firstSociety.name], area_id: areaIdMap[AREAS[0]],
        active: true,
      });
      const { error } = await admin.from('collection_requests').insert({
        resident_id: p.id, society_id: p.society_id, area_id: p.area_id,
        waste_type: Math.random() > 0.5 ? 'wet' : 'dry',
        status: 'pending', before_gps_lat: p.gps_lat, before_gps_lng: p.gps_lng,
        before_timestamp: new Date().toISOString(),
        before_photo_url: null,
      });
      if (error) throw error;
    }
    console.log('Created sample pending requests');
  } else {
    console.log('Sample requests already exist');
  }

  console.log('\nSeed complete.');
  console.log('Login credentials:');
  console.log('  Admin     ', ADMIN.email, '/', ADMIN.password);
  console.log('  Resident  ', DEMO.resident.email, '/', DEMO.resident.password);
  console.log('  Collector ', DEMO.collector.email, '/', DEMO.collector.password);
}

main().catch((e) => {
  console.error('Seed failed:', e.message);
  process.exit(1);
});
