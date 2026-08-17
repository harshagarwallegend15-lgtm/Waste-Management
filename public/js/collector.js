const profile = WW.requireRole('collector');
const $ = (id) => document.getElementById(id);

let selectedResident = null;
let selectedRequest = null;
let arrived = false;
let workPhoto = null;
let _cachedResidents = null;

async function init() {
  if (!profile) return;
  $('nav-name').textContent = profile.name;
  $('nav-points').textContent = profile.points ?? 0;
  await loadResidents();
  loadPoints();
  loadLeaderboard();

  WWRealtime.subscribe({ event: 'INSERT', schema: 'public', table: 'collection_requests', filter: `area_id=eq.${profile.area_id}` }, () => loadResidents());
  WWRealtime.subscribe({ event: 'UPDATE', schema: 'public', table: 'collection_requests', filter: `area_id=eq.${profile.area_id}` }, () => loadResidents());
  WWRealtime.subscribe({ event: 'INSERT', schema: 'public', table: 'points_transactions', filter: `user_id=eq.${profile.id}` }, () => { loadPoints(); loadLeaderboard(); });
  WWRealtime.subscribe({ event: 'UPDATE', schema: 'public', table: 'society_scores' }, () => loadLeaderboard());
}

async function loadResidents() {
  try {
    const data = await WW.api('/api/requests/area-residents');
    _cachedResidents = data;
    const { residents, area_id } = data;
    const areaName = await getAreaName(area_id);
    $('nav-area').textContent = areaName;
    if (!residents.length) {
      $('resident-list').innerHTML = '<div class="card"><p class="muted">No residents registered in your area yet.</p></div>';
      return;
    }
    const sorted = [...residents].sort((a, b) => (b.pending_requests.length) - (a.pending_requests.length));
    $('resident-list').innerHTML = sorted.map((r) => `
      <div class="card" style="margin-bottom:10px; display:flex; align-items:center; gap:14px;">
        <div style="flex:1;">
          <strong>${WW.escapeHtml(r.name)}</strong>
          <div class="muted">${WW.escapeHtml(r.address_text || 'No address')}</div>
          <div class="muted">Society: ${WW.escapeHtml(r.societies?.name || '—')}</div>
        </div>
        <div>
          ${r.pending_requests.length ? `<span class="badge amber">${r.pending_requests.length} pending</span>` : '<span class="badge gray">No request</span>'}
        </div>
        <button class="${r.pending_requests.length ? '' : 'secondary'}" onclick="openResident('${r.id}')">Open →</button>
      </div>`).join('');
  } catch (err) {
    $('resident-list').innerHTML = `<p class="muted">${WW.escapeHtml(err.message)}</p>`;
  }
}

async function getAreaName(areaId) {
  try {
    const data = await WW.api('/api/meta');
    const a = data.areas.find((x) => x.id === areaId);
    return a ? a.name : 'Area assigned';
  } catch { return 'Area assigned'; }
}

function openResident(id) {
  const residents = _cachedResidents?.residents;
  if (!residents) return WW.toast('Data not loaded yet — click Refresh', true);
  const resident = residents.find((r) => r.id === id);
  if (!resident) return WW.toast('Resident not found', true);
  selectedResident = resident;
  selectedRequest = resident.pending_requests[0] || null;
  arrived = false;
  workPhoto = null;
  window._arrivedGps = null;

  $('work').classList.remove('hidden');
  $('work-name').textContent = resident.name;
  $('work-address').textContent = resident.address_text || 'No address on file';
  $('work-map').innerHTML = resident.gps_lat
    ? `📍 <a href="${WWGps.mapsUrl(resident.gps_lat, resident.gps_lng)}" target="_blank">View on map</a>`
    : '<span class="muted">No GPS pin saved</span>';

  if (resident.gps_lat) {
    $('work-status').textContent = 'Click "I\'m at the location" to run the GPS check.';
    $('work-arrived').classList.remove('hidden');
  } else {
    $('work-arrived').classList.add('hidden');
    arrived = true;
    $('work-status').textContent = 'No GPS pin on file — photo verification only.';
  }

  $('work-requests').innerHTML = resident.pending_requests.length
    ? resident.pending_requests.map((req) => `
        <div style="display:flex; gap:10px; align-items:center; padding:6px 0; border-bottom:1px solid var(--border);">
          <span>${WW.fmtDate(req.before_timestamp)}</span>
          <span class="badge ${req.waste_type === 'mixed' ? 'gray' : 'green'}">${WW.escapeHtml(req.waste_type)}</span>
          ${req.before_photo_url ? `<img class="photo-thumb" src="${req.before_photo_url}" />` : ''}
        </div>`).join('')
    : '<p class="muted">No pending requests.</p>';

  $('work-result').innerHTML = '';
  $('work-retake').click();

  try {
    WWCamera.start($('work-video')).then(() => {
      $('work-status').textContent += ' Camera ready.';
    }).catch(() => {
      $('work-status').textContent += ' Camera unavailable.';
    });
  } catch {
    $('work-status').textContent += ' Camera unavailable.';
  }
}

async function markArrived() {
  if (!selectedResident?.gps_lat) { arrived = true; $('work-status').textContent = 'Arrived (no GPS pin to verify against).'; return; }
  $('work-arrived').disabled = true;
  $('work-status').textContent = 'Checking GPS…';
  try {
    const pos = await WWGps.get();
    window._arrivedGps = { lat: pos.lat, lng: pos.lng };
    arrived = true;
    $('work-status').textContent = `Arrived ✅ GPS recorded (${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}). Now capture the collected waste.`;
  } catch (err) {
    arrived = true;
    $('work-status').textContent = 'GPS check failed — proceeding without it. ' + err.message;
  }
  $('work-arrived').disabled = false;
}

$('work-capture').onclick = async () => {
  const shot = await WWCamera.capture($('work-video'));
  $('work-status').textContent = 'Checking photo…';
  try {
    await WWGarbage.checkPhoto(shot.blob, 'after-photo');
  } catch (e) {
    WW.toast(e.message, true);
    $('work-status').textContent = e.message;
    return;
  }
  workPhoto = shot;
  $('work-preview').src = shot.dataUrl;
  $('work-preview').classList.remove('hidden');
  $('work-video').classList.add('hidden');
  $('work-capture').classList.add('hidden');
  $('work-retake').classList.remove('hidden');
  $('work-submit').classList.remove('hidden');
};

$('work-retake').onclick = () => {
  workPhoto = null;
  $('work-preview').classList.add('hidden');
  $('work-video').classList.remove('hidden');
  $('work-capture').classList.remove('hidden');
  $('work-retake').classList.add('hidden');
  $('work-submit').classList.add('hidden');
};

$('work-submit').onclick = async () => {
  if (!selectedRequest) return WW.toast('No pending request for this resident', true);
  if (!workPhoto) return WW.toast('Capture the collection photo first', true);
  if (!arrived) return WW.toast('Mark yourself as arrived first', true);
  $('work-submit').disabled = true;
  $('work-status').textContent = 'Verifying… comparing your photo against the resident\'s using computer vision + AI.';
  try {
    let gps = window._arrivedGps || { lat: profile.gps_lat, lng: profile.gps_lng };
    try { if (!window._arrivedGps) { const pos = await WWGps.get(); gps = { lat: pos.lat, lng: pos.lng }; } } catch {}
    const fd = new FormData();
    fd.append('photo', workPhoto.blob, 'after.jpg');
    fd.append('gps_lat', gps.lat);
    fd.append('gps_lng', gps.lng);
    const data = await WW.api(`/api/requests/${selectedRequest.id}/complete`, { method: 'POST', form: fd });
    renderResult(data.verification);
    if (data.points && data.points.length) {
      const collectorPts = data.points.find((p) => p.user_id === profile.id);
      if (collectorPts) {
        $('nav-points').textContent = collectorPts.newPoints;
        WW.toast(`Verified! +${collectorPts.txn.delta} points awarded.`);
      }
    }
    workPhoto = null;
    arrived = false;
    window._arrivedGps = null;
    selectedRequest = null;
    $('work-retake').click();
    await loadResidents();
    loadPoints();
    loadLeaderboard();
  } catch (err) {
    $('work-status').textContent = err.message;
    WW.toast(err.message, true);
  }
  $('work-submit').disabled = false;
};

function renderResult(v) {
  const score = v.cv_score != null ? (v.cv_score * 100).toFixed(0) : '—';
  let verdictHtml;
  if (v.verdict === 'verified') verdictHtml = '<span class="badge green">VERIFIED ✅</span>';
  else if (v.verdict === 'flagged') verdictHtml = '<span class="badge red">FLAGGED — admin will review</span>';
  else verdictHtml = '<span class="badge gray">REJECTED</span>';

  const reasons = (v.reasons || []).map((r) => `• ${WW.escapeHtml(r.reason)}`).join('<br/>');

  $('work-result').innerHTML = `
    <h3>Verification result ${verdictHtml}</h3>
    <p style="margin-top:8px;">Match score: <b>${score}%</b> (method: ${v.cv_method || 'local'})</p>
    ${v.ai_reason ? `<p class="muted">AI verdict: ${WW.escapeHtml(v.ai_reason)}</p>` : ''}
    <p class="muted" style="margin-top:6px;">${reasons}</p>
    ${v.verdict === 'verified' ? '<p class="hint" style="margin-top:8px;">Points awarded: you +10, resident +20. Leaderboard updated.</p>' : '<p class="hint" style="margin-top:8px;">The admin dashboard has been updated for review.</p>'}`;
  $('work-result').scrollIntoView({ behavior: 'smooth' });
}

async function loadPoints() {
  try {
    const { points } = await WW.api('/api/points/me');
    $('nav-points').textContent = points;
  } catch {}
}

async function loadLeaderboard() {
  try {
    const data = await WW.api('/api/leaderboard/all');
    const top = (data.collectors || []).slice(0, 10);
    const el = $('leaderboard');
    if (el) {
      el.innerHTML = top.length
        ? top.map((r, i) => `
          <div class="rank-row">
            <div class="pos ${i < 3 ? 'top' : ''}">${i + 1}</div>
            <div class="name">${WW.escapeHtml(r.name)}</div>
            <div class="pts">${r.points}</div>
          </div>`).join('')
        : '<p class="muted">No collectors yet.</p>';
    }
  } catch {}
}

init();
