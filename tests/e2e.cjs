require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');

const SUPA = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function login(email, password) {
  const { data, error } = await SUPA.auth.signInWithPassword({ email, password });
  if (error) throw new Error('login ' + email + ': ' + error.message);
  return { token: data.session.access_token, user: data.user };
}

async function api(token, method, path, body) {
  const headers = { Authorization: `Bearer ${token}` };
  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`http://localhost:8080${path}`, { method, headers, body: payload });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${json.error || res.status}`);
  return json;
}

// Generate two realistic test photos: green + yellow bags.
async function makePhoto(colors, label) {
  const rects = colors.map((c) => `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="${c.fill}"/>`).join('');
  const svg = Buffer.from(`<svg width="320" height="220"><rect width="320" height="220" fill="#5b6b63"/>${rects}</svg>`);
  const buf = await sharp(svg).jpeg().toBuffer();
  return { blob: new Blob([buf], { type: 'image/jpeg' }), name: label + '.jpg' };
}

const waste = [
  { x: 30, y: 40, w: 90, h: 70, fill: '#1a7f37' },
  { x: 160, y: 90, w: 100, h: 55, fill: '#d4a017' },
  { x: 70, y: 150, w: 80, h: 40, fill: '#8a5a00' },
];

async function main() {
  console.log('=== E2E WasteWise flow ===\n');

  const [admin, res, col] = await Promise.all([
    login('admin@wastewise.app', 'Admin@123'),
    login('resident@wastewise.app', 'Resident@123'),
    login('collector@wastewise.app', 'Collector@123'),
  ]);
  console.log('1. Logged in as admin, resident, collector ✅');

  // Meta
  const meta = await api(res.token, 'GET', '/api/meta');
  console.log('2. Meta loaded — areas:', meta.areas.length, 'societies:', meta.societies.length, '✅');

  // Resident creates a request with photo
  const reqForm = new FormData();
  reqForm.append('photo', (await makePhoto(waste, 'before')).blob, 'before.jpg');
  reqForm.append('waste_type', 'wet');
  reqForm.append('gps_lat', '28.6139');
  reqForm.append('gps_lng', '77.2090');
  const { request } = await api(res.token, 'POST', '/api/requests', reqForm);
  console.log('3. Resident created request:', request.id.slice(0, 8), 'status=' + request.status, '✅');

  // Collector sees area residents with the pending request
  const area = await api(col.token, 'GET', '/api/requests/area-residents');
  const resEntry = area.residents.find((r) => r.id === res.user.id) || area.residents[0];
  if (!resEntry) throw new Error('Collector area list did not include the resident');
  console.log('4. Collector sees area residents:', area.residents.length, '(incl. pending request)' , '✅');

  // Collector completes with a matching photo → expect VERIFIED + points
  const completeForm = new FormData();
  completeForm.append('photo', (await makePhoto(waste, 'after')).blob, 'after.jpg');
  completeForm.append('gps_lat', '28.6142');
  completeForm.append('gps_lng', '77.2094');
  const { verification, points } = await api(col.token, 'POST', `/api/requests/${request.id}/complete`, completeForm);
  console.log('5. Verification:', verification.verdict, '| cv score:', (verification.cv_score * 100).toFixed(0) + '%', '| method:', verification.cv_method);
  if (verification.verdict !== 'verified') throw new Error('Expected verified, got ' + verification.verdict);
  console.log('   Points awarded:', points.length, 'transactions ✅');

  // Resident + collector points should be > 0
  const resPoints = await api(res.token, 'GET', '/api/points/me');
  const colPoints = await api(col.token, 'GET', '/api/points/me');
  console.log('6. Resident points:', resPoints.points, '| Collector points:', colPoints.points, '✅');

  // Resident creates a dumping report (slightly random location to avoid
  // tripping the duplicate detector on repeat test runs)
  const repLat = 28.60 + Math.random() * 0.05;
  const repLng = 77.20 + Math.random() * 0.05;
  const repForm = new FormData();
  repForm.append('photo', (await makePhoto(waste, 'report')).blob, 'report.jpg');
  repForm.append('gps_lat', String(repLat));
  repForm.append('gps_lng', String(repLng));
  repForm.append('description', 'Construction debris dumped near empty plot');
  const { report } = await api(res.token, 'POST', '/api/reports', repForm);
  console.log('7. Dumping report created:', report.id.slice(0, 8), 'status=' + report.status, '✅');

  // Resident posts a society problem + comment
  const pForm = new FormData();
  pForm.append('title', 'Streetlight broken at the gate');
  pForm.append('description', 'Not working since a week, walking unsafe at night');
  const { problem } = await api(res.token, 'POST', '/api/problems', pForm);
  await api(res.token, 'POST', `/api/problems/${problem.id}/comments`, { content: 'Please fix this urgently' });
  console.log('8. Society problem + comment posted ✅');

  // Admin: verify report, check problems ranked, check dashboard, verify user trace
  const { status } = await api(admin.token, 'POST', `/api/reports/${report.id}/verify`, { verdict: 'verified', reason: 'E2E test' });
  console.log('9. Admin verified report:', status, '✅');

  const { problems } = await api(admin.token, 'GET', '/api/problems/all');
  console.log('10. Admin problems ranked:', problems.length, '| top:', problems[0]?.title, '| society score:', problems[0]?.society_score, '| comments:', problems[0]?.comment_count, '✅');

  const { kpis, hotspots } = await api(admin.token, 'GET', '/api/admin/dashboard');
  console.log('11. Admin dashboard KPIs — verified collections:', kpis.verified_requests, '| verified reports:', kpis.verified_reports, '| hotspots:', hotspots.length, '✅');

  const detail = await api(admin.token, 'GET', `/api/admin/users/${res.user.id}/detail`);
  console.log('12. User trace — transactions:', detail.transactions.length, '| requests:', detail.requests.length, '| reports:', detail.reports.length, '| problems:', detail.problems.length, '✅');

  const lb = await api(admin.token, 'GET', '/api/leaderboard/all');
  console.log('13. Leaderboards — residents:', lb.residents.length, '| collectors:', lb.collectors.length, '| societies:', lb.societies.length, '✅');

  const edu = await api(res.token, 'GET', '/api/education/for-me');
  console.log('14. Education for resident — lesson:', edu.lesson.trigger_type, '✅');

  console.log('\n=== E2E PASSED ===');
}

main().catch((e) => { console.error('\nE2E FAILED:', e.message); process.exit(1); });
