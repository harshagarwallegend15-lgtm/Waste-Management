require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');

const SUPA = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function login(email, password) {
  const { data, error } = await SUPA.auth.signInWithPassword({ email, password });
  if (error) throw new Error('login: ' + error.message);
  return data.session.access_token;
}
async function api(token, method, path, body) {
  const headers = { Authorization: `Bearer ${token}` };
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`http://localhost:8080${path}`, { method, headers, body: payload });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${json.error || res.status}`);
  return json;
}
async function photo(bags, bg) {
  const rects = bags.map((c) => `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="${c.fill}"/>`).join('');
  const svg = Buffer.from(`<svg width="320" height="220"><rect width="320" height="220" fill="${bg}"/>${rects}</svg>`);
  return { blob: new Blob([await sharp(svg).jpeg().toBuffer()], { type: 'image/jpeg' }) };
}
const WASTE = [
  { x: 30, y: 40, w: 90, h: 70, fill: '#1a7f37' },
  { x: 160, y: 90, w: 100, h: 55, fill: '#d4a017' },
  { x: 70, y: 150, w: 80, h: 40, fill: '#8a5a00' },
];

async function poll(apiCall, predicate, label, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await apiCall();
    if (predicate(r)) return r;
    await new Promise((res) => setTimeout(res, 300));
  }
  throw new Error('timeout waiting for ' + label);
}

(async () => {
  console.log('=== Challenges E2E ===\n');
  const adminTok = await login('admin@wastewise.app', 'Admin@123');
  const resTok = await login('resident@wastewise.app', 'Resident@123');
  const colTok = await login('collector@wastewise.app', 'Collector@123');

  // 0. Capture the resident's balance before
  const before = await api(resTok, 'GET', '/api/points/me');
  const startPoints = before.points;

  // 1. Admin launches a challenge: 1 verified collection → instant completion for the demo society
  const today = new Date();
  const end = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { challenge } = await api(adminTok, 'POST', '/api/challenges', {
    title: 'E2E: 1 verified collection', description: 'Test challenge',
    challenge_type: 'collections', target: 1, reward_points: 30,
    starts_at: today.toISOString().slice(0, 10), ends_at: end,
  });
  console.log('1. Challenge launched:', challenge.id.slice(0, 8), '| type:', challenge.challenge_type, '| reward:', challenge.reward_points, '✅');

  // 2. Full verified collection loop
  const f = new FormData();
  f.append('photo', (await photo(WASTE, '#444')).blob, 'before.jpg');
  f.append('waste_type', 'dry');
  f.append('gps_lat', '28.6150'); f.append('gps_lng', '77.2100');
  const { request } = await api(resTok, 'POST', '/api/requests', f);
  const societyId = request.society_id;

  const f2 = new FormData();
  f2.append('photo', (await photo(WASTE, '#444')).blob, 'after.jpg');
  f2.append('gps_lat', '28.6152'); f2.append('gps_lng', '77.2102');
  const { verification } = await api(colTok, 'POST', `/api/requests/${request.id}/complete`, f2);
  console.log('2. Verification:', verification.verdict, `(${(verification.cv_score * 100).toFixed(0)}%)`, verification.verdict === 'verified' ? '✅' : '⚠️');

  // 3. Bonus is paid asynchronously — poll until it lands
  const after = await poll(
    () => api(resTok, 'GET', '/api/points/me'),
    (r) => r.points >= startPoints + 20 + 30,
    'challenge bonus'
  );
  console.log('3. Resident points:', startPoints, '→', after.points, '(+20 collection, +30 bonus):', after.points >= startPoints + 50 ? '✅' : '⚠️');

  // 4. Resident view: challenge must show completed with progress 1/1
  const list = await api(resTok, 'GET', '/api/challenges');
  const mine = list.active.find((c) => c.id === challenge.id) || list.history.find((c) => c.id === challenge.id);
  const row = mine?.progress_rows?.find((r) => r.society_id === societyId);
  console.log('4. Challenge completed for society:', row?.completed, '| progress:', row?.progress + '/' + row?.target, row?.completed && row?.progress >= 1 ? '✅' : '⚠️');

  // 5. Second verified collection must NOT double-pay the bonus
  const p1 = after.points;
  const f3 = new FormData();
  f3.append('photo', (await photo(WASTE, '#333')).blob, 'before2.jpg');
  f3.append('waste_type', 'dry');
  f3.append('gps_lat', '28.6160'); f3.append('gps_lng', '77.2110');
  const { request: r2 } = await api(resTok, 'POST', '/api/requests', f3);
  const f4 = new FormData();
  f4.append('photo', (await photo(WASTE, '#333')).blob, 'after2.jpg');
  f4.append('gps_lat', '28.6162'); f4.append('gps_lng', '77.2112');
  await api(colTok, 'POST', `/api/requests/${r2.id}/complete`, f4);
  const after2 = await poll(
    () => api(resTok, 'GET', '/api/points/me'),
    (r) => r.points >= p1 + 20,
    'second collection points'
  );
  await new Promise((res) => setTimeout(res, 1200));
  const final = await api(resTok, 'GET', '/api/points/me');
  const noDouble = final.points === p1 + 20;
  console.log('5. No double bonus:', p1, '→', final.points, '(expected +20 only)', noDouble ? '✅' : '⚠️');

  // 6. Admin closes the challenge → moves to history
  await api(adminTok, 'PATCH', `/api/challenges/${challenge.id}`, { status: 'cancelled' });
  const list2 = await api(resTok, 'GET', '/api/challenges');
  const inHistory = list2.history.some((c) => c.id === challenge.id);
  console.log('6. Closed challenge in history:', inHistory ? '✅' : '⚠️');

  console.log('\n=== CHALLENGES PASSED ===');
})().catch((e) => { console.error('\nCHALLENGES FAILED:', e.message); process.exit(1); });
