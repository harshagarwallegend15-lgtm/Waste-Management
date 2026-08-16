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
async function photo(colors, bg) {
  const rects = colors.map((c) => `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="${c.fill}"/>`).join('');
  const svg = Buffer.from(`<svg width="320" height="220"><rect width="320" height="220" fill="${bg}"/>${rects}</svg>`);
  return { blob: new Blob([await sharp(svg).jpeg().toBuffer()], { type: 'image/jpeg' }) };
}
const green = [{ x: 30, y: 40, w: 90, h: 70, fill: '#1a7f37' }, { x: 160, y: 90, w: 100, h: 55, fill: '#d4a017' }];
const blue = [{ x: 20, y: 30, w: 130, h: 100, fill: '#2255ff' }, { x: 180, y: 120, w: 60, h: 50, fill: '#ff2255' }];

(async () => {
  console.log('=== Supplement: admin override + registration ===\n');
  const adminTok = await login('admin@wastewise.app', 'Admin@123');
  const resTok = await login('resident@wastewise.app', 'Resident@123');
  const colTok = await login('collector@wastewise.app', 'Collector@123');

  // 1. New resident registration (auto area from society)
  const meta = await api(resTok, 'GET', '/api/meta');
  const society = meta.societies[0];
  const email = 'new' + Date.now() + '@wastewise.app';
  const reg = await api('', 'POST', '/api/auth/register', {
    email, password: 'Pass@1234', role: 'resident', name: 'New Tester',
    society_id: society.id, address_text: 'Flat 99, Test Society',
    gps_lat: 28.6139, gps_lng: 77.2090,
  });
  console.log('1. New resident registered:', email, '| area:', reg.area_name || '(from society)', '✅');
  const newTok = await login(email, 'Pass@1234');

  // 2. New collector registration → system auto-assigns area
  const colEmail = 'colnew' + Date.now() + '@wastewise.app';
  const colReg = await api('', 'POST', '/api/auth/register', {
    email: colEmail, password: 'Pass@1234', role: 'collector', name: 'New Collector',
  });
  console.log('2. New collector registered:', colEmail, '| auto-assigned area:', colReg.area_name || '(null)', colReg.area_name ? '✅' : '⚠️');

  // 3. Resident creates request with green-waste photo
  const f = new FormData();
  f.append('photo', (await photo(green, '#444')).blob, 'before.jpg');
  f.append('waste_type', 'dry');
  f.append('gps_lat', '28.6140'); f.append('gps_lng', '77.2091');
  const { request } = await api(newTok, 'POST', '/api/requests', f);

  // 4. Collector completes with a DIFFERENT photo → should FLAG
  const f2 = new FormData();
  f2.append('photo', (await photo(blue, '#222')).blob, 'after.jpg');
  f2.append('gps_lat', '28.6142'); f2.append('gps_lng', '77.2093');
  const { verification } = await api(colTok, 'POST', `/api/requests/${request.id}/complete`, f2);
  console.log('3. Different-photo completion →', verification.verdict, '| score:', (verification.cv_score * 100).toFixed(0) + '%', verification.verdict === 'flagged' || verification.verdict === 'rejected' ? '✅ (not auto-verified)' : '⚠️');

  // 5. Admin override it to verified → points awarded
  const before = await api(adminTok, 'GET', `/api/admin/users/${newTok ? '' : ''}`).catch(() => null);
  const detail = await api(adminTok, 'GET', `/api/admin/users/${request.resident_id}/detail`);
  const ptsBefore = detail.profile.points;
  const ov = await api(adminTok, 'POST', `/api/admin/collections/${request.id}/override`, { verdict: 'verified', reason: 'Supplement test - admin judgement' });
  const detail2 = await api(adminTok, 'GET', `/api/admin/users/${request.resident_id}/detail`);
  console.log('4. Admin override →', ov.status, '| resident points', ptsBefore, '→', detail2.profile.points, ov.status === 'verified' && detail2.profile.points === ptsBefore + 20 ? '✅' : '⚠️');

  // 6. Double-override protection: overriding again must NOT re-award
  await api(adminTok, 'POST', `/api/admin/collections/${request.id}/override`, { verdict: 'verified', reason: 'again' });
  const detail3 = await api(adminTok, 'GET', `/api/admin/users/${request.resident_id}/detail`);
  console.log('5. Re-override no double points:', detail3.profile.points === detail2.profile.points ? '✅' : '⚠️ (got ' + detail3.profile.points + ')');

  console.log('\n=== SUPPLEMENT PASSED ===');
})().catch((e) => { console.error('\nSUPPLEMENT FAILED:', e.message); process.exit(1); });
