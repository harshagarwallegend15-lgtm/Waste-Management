const profile = WW.requireRole('collector');
const $ = (id) => document.getElementById(id);

let selectedResident = null;
let selectedRequest = null;
let arrived = false;
let workPhoto = null;
let collectorGps = null;

async function init() {
  if (!profile) return;
  $('nav-name').textContent = profile.name;
  $('nav-points').textContent = profile.points ?? 0;

  // Track collector GPS on login
  try {
    const pos = await WWGps.get(true, 10000);
    collectorGps = { lat: pos.lat, lng: pos.lng };
    $('gps-status').textContent = '📍 Location tracked: ' + pos.lat.toFixed(4) + ', ' + pos.lng.toFixed(4);
    $('gps-status').style.color = 'var(--green-600, #16a34a)';
  } catch {
    collectorGps = null;
    $('gps-status').textContent = '📍 Enable location to see distances to residents';
    $('gps-status').style.color = '';
  }

  await loadAreaRequests();
  loadLeaderboard();

  WWRealtime.subscribe({ event: '*', schema: 'public', table: 'collection_requests' }, () => loadAreaRequests());
  WWRealtime.subscribe({ event: 'INSERT', schema: 'public', table: 'points_transactions', filter: `user_id=eq.${profile.id}` }, () => { loadPoints(); loadLeaderboard(); });
  WWRealtime.subscribe({ event: 'UPDATE', schema: 'public', table: 'society_scores' }, () => loadLeaderboard());
  WWRealtime.subscribe({ event: 'INSERT', schema: 'public', table: 'points_transactions' }, () => loadLeaderboard());

  startPoll();
}

let _poll = null;
function startPoll() {
  if (_poll) return;
  _poll = setInterval(() => loadAreaRequests(), 10000);
}

function stopCamera() {
  try { WWCamera.stop(); } catch {}
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDist(km) {
  if (km == null) return '';
  return km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1) + ' km';
}

let _lastAreaJson = '';

async function loadAreaRequests() {
  try {
    const data = await WW.api('/api/requests/area-residents');
    const { residents, area_id } = data;
    const areaName = await getAreaName(area_id);
    $('nav-area').textContent = areaName;

    const allRequests = [];
    residents.forEach((r) => {
      r.pending_requests.forEach((req) => {
        const dist = (collectorGps && r.gps_lat && r.gps_lng)
          ? haversine(collectorGps.lat, collectorGps.lng, r.gps_lat, r.gps_lng)
          : null;
        allRequests.push({
          ...req,
          resident_name: r.name,
          resident_id: r.id,
          resident_address: r.address_text,
          resident_society: r.societies?.name || '',
          resident_gps_lat: r.gps_lat,
          resident_gps_lng: r.gps_lng,
          distance: dist,
        });
      });
    });

    allRequests.sort((a, b) => {
      if (a.distance != null && b.distance != null) return a.distance - b.distance;
      if (a.distance != null) return -1;
      if (b.distance != null) return 1;
      return 0;
    });

    const snapshot = JSON.stringify(allRequests.map((r) => r.id));
    if (snapshot === _lastAreaJson) return;
    _lastAreaJson = snapshot;

    renderAreaRequests(allRequests, residents);

    if (selectedResident) {
      const updated = residents.find((r) => r.id === selectedResident.id);
      if (updated) {
        selectedResident = updated;
        if (updated.pending_requests.length) {
          renderRequestList(updated);
        } else {
          closeWork();
          WW.toast('All requests completed for this resident!');
        }
      }
    }
  } catch (err) {
    $('area-requests-list').innerHTML = `<p class="muted">${WW.escapeHtml(err.message)}</p>`;
  }
}

function renderAreaRequests(requests, residents) {
  if (!requests.length) {
    $('area-requests-list').innerHTML = '<div class="card"><p class="muted" style="text-align:center; padding:20px;">No pending requests in your area right now.</p></div>';
    $('area-stats').textContent = '0 pending requests';
    return;
  }

  $('area-stats').textContent = requests.length + ' pending request' + (requests.length !== 1 ? 's' : '') + ' from ' + residents.filter((r) => r.pending_requests.length > 0).length + ' resident' + (residents.filter((r) => r.pending_requests.length > 0).length !== 1 ? 's' : '');

  $('area-requests-list').innerHTML = requests.map((req) => `
    <div class="card" style="margin-bottom:10px; display:flex; align-items:center; gap:14px; ${req.distance != null && req.distance < 1 ? 'border-left:3px solid var(--green-500, #22c55e);' : ''}">
      <div style="flex:1; min-width:0;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <strong style="white-space:nowrap;">${WW.escapeHtml(req.resident_name)}</strong>
          ${req.distance != null ? `<span class="badge ${req.distance < 1 ? 'green' : req.distance < 3 ? 'amber' : 'gray'}" style="font-size:0.75rem;">📍 ${fmtDist(req.distance)}</span>` : ''}
          <span class="badge ${req.waste_type === 'wet' ? 'green' : req.waste_type === 'dry' ? 'blue' : req.waste_type === 'hazardous' ? 'red' : 'gray'}" style="font-size:0.75rem;">${WW.escapeHtml(req.waste_type)}</span>
        </div>
        <div class="muted" style="font-size:0.85rem; margin-top:2px;">${WW.escapeHtml(req.resident_address || 'No address')}</div>
        ${req.resident_society ? `<div class="muted" style="font-size:0.82rem;">🏘️ ${WW.escapeHtml(req.resident_society)}</div>` : ''}
      </div>
      ${req.before_photo_url ? `<img class="photo-thumb" src="${req.before_photo_url}" style="flex-shrink:0;" />` : ''}
      <button onclick="openResident('${req.resident_id}')" style="flex-shrink:0;">Open →</button>
    </div>`).join('');
}

async function getAreaName(areaId) {
  try {
    const data = await WW.api('/api/meta');
    const a = data.areas.find((x) => x.id === areaId);
    return a ? a.name : 'Your area';
  } catch { return 'Your area'; }
}

async function openResident(id) {
  $('work').classList.remove('hidden');
  $('work-name').textContent = 'Loading...';
  $('work-address').textContent = '';
  $('work-map').innerHTML = '';
  $('work-requests').innerHTML = '';
  $('work-result').innerHTML = '';
  $('work-status').textContent = 'Fetching data...';
  $('work-arrived').classList.add('hidden');
  stopCamera();
  $('work').scrollIntoView({ behavior: 'smooth' });

  let residents;
  try {
    const data = await WW.api('/api/requests/area-residents');
    residents = data.residents;
  } catch { residents = null; }
  if (!residents) {
    $('work-status').textContent = 'Could not load resident data';
    return WW.toast('Could not load resident data', true);
  }
  const resident = residents.find((r) => r.id === id);
  if (!resident) {
    $('work-status').textContent = 'Resident not found in your area';
    return WW.toast('Resident not found in your area', true);
  }
  selectedResident = resident;
  arrived = false;
  workPhoto = null;
  window._arrivedGps = null;

  $('work-name').textContent = resident.name;
  $('work-address').textContent = resident.address_text || 'No address on file';
  $('work-map').innerHTML = resident.gps_lat
    ? `📍 <a href="${WWGps.mapsUrl(resident.gps_lat, resident.gps_lng)}" target="_blank">View on map</a>`
    : `<span class="muted">No GPS saved</span>`;

  if (resident.gps_lat) {
    const dist = collectorGps ? haversine(collectorGps.lat, collectorGps.lng, resident.gps_lat, resident.gps_lng) : null;
    $('work-status').textContent = dist != null
      ? `Distance: ${fmtDist(dist)} — tap "I'm at the location" when you arrive`
      : 'Tap "I\'m at the location" when you arrive at the resident\'s location';
    $('work-arrived').classList.remove('hidden');
  } else {
    $('work-arrived').classList.add('hidden');
    arrived = true;
    $('work-status').textContent = 'Photo verification only (no GPS on file)';
  }

  renderRequestList(resident);
  $('work-retake').click();

  try {
    WWCamera.start($('work-video')).then(() => {
      if (!window._arrivedGps && !arrived) {
        $('work-status').textContent += ' — Camera ready';
      }
    }).catch(() => {
      if (!window._arrivedGps && !arrived) {
        $('work-status').textContent += ' — Camera unavailable';
      }
    });
  } catch {
    if (!window._arrivedGps && !arrived) {
      $('work-status').textContent += ' — Camera unavailable';
    }
  }
}

function renderRequestList(resident) {
  const pending = resident.pending_requests;
  if (!pending.length) {
    $('work-requests').innerHTML = '<p class="muted">No pending requests.</p>';
    selectedRequest = null;
    return;
  }
  if (!selectedRequest || !pending.find((r) => r.id === selectedRequest.id)) {
    selectedRequest = pending[0];
  }
  const selIdx = pending.findIndex((r) => r.id === selectedRequest.id);
  $('work-requests').innerHTML = pending.map((req, i) => `
    <div class="request-item ${i === selIdx ? 'selected' : ''}" onclick="selectRequest(${i})" style="display:flex; gap:10px; align-items:center; padding:8px 10px; border-bottom:1px solid var(--border); cursor:pointer; border-radius:6px; ${i === selIdx ? 'background:var(--bg-light,rgba(255,255,255,0.06));' : ''}">
      <span style="flex:1;">${WW.fmtDate(req.before_timestamp)}</span>
      <span class="badge ${req.waste_type === 'mixed' ? 'gray' : 'green'}">${WW.escapeHtml(req.waste_type)}</span>
      ${req.before_photo_url ? `<img class="photo-thumb" src="${req.before_photo_url}?t=${Date.now()}" />` : ''}
    </div>`).join('');
}

function selectRequest(index) {
  if (!selectedResident) return;
  const pending = selectedResident.pending_requests;
  if (index < 0 || index >= pending.length) return;
  selectedRequest = pending[index];
  arrived = false;
  workPhoto = null;
  window._arrivedGps = null;

  document.querySelectorAll('#work-requests .request-item').forEach((el, i) => {
    el.style.background = i === index ? 'var(--bg-light,rgba(255,255,255,0.06))' : '';
    el.classList.toggle('selected', i === index);
  });

  $('work-result').innerHTML = '';
  $('work-retake').click();

  if (selectedResident.gps_lat) {
    $('work-status').textContent = 'Tap "I\'m at the location" when you arrive';
    $('work-arrived').classList.remove('hidden');
  } else {
    $('work-arrived').classList.add('hidden');
    arrived = true;
    $('work-status').textContent = 'Photo verification only (no GPS on file)';
  }

  try {
    WWCamera.start($('work-video')).then(() => {
      $('work-status').textContent += ' — Camera ready';
    }).catch(() => {
      $('work-status').textContent += ' — Camera unavailable';
    });
  } catch {
    $('work-status').textContent += ' — Camera unavailable';
  }
}

function closeWork() {
  stopCamera();
  $('work').classList.add('hidden');
  selectedResident = null;
  selectedRequest = null;
  arrived = false;
  workPhoto = null;
  window._arrivedGps = null;
}

async function markArrived() {
  if (!selectedResident?.gps_lat) { arrived = true; $('work-status').textContent = 'Arrived (no GPS)'; return; }
  $('work-arrived').disabled = true;
  $('work-status').textContent = 'Checking GPS...';
  try {
    const pos = await WWGps.get();
    window._arrivedGps = { lat: pos.lat, lng: pos.lng };
    arrived = true;
    const dist = haversine(pos.lat, pos.lng, selectedResident.gps_lat, selectedResident.gps_lng);
    $('work-status').textContent = `Arrived! (${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}) — ${fmtDist(dist)} from resident`;
  } catch (err) {
    arrived = true;
    $('work-status').textContent = 'GPS check failed: ' + err.message;
  }
  $('work-arrived').disabled = false;
}

$('work-capture').onclick = async () => {
  if (!selectedRequest) return WW.toast('Select a request first', true);
  try {
    const shot = await WWCamera.capture($('work-video'));
    $('work-status').textContent = 'Checking photo...';
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
    $('work-status').textContent = 'Photo captured — ready to submit';
  } catch (e) {
    $('work-status').textContent = 'Capture failed: ' + e.message;
  }
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
  if (!selectedRequest) return WW.toast('Select a request first', true);
  if (!workPhoto) return WW.toast('Capture a photo first', true);
  if (!arrived) return WW.toast('Mark arrival first', true);
  $('work-submit').disabled = true;
  $('work-status').textContent = 'Verifying...';
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
        WW.toast(`+${collectorPts.txn.delta} points awarded!`);
      }
    }
    workPhoto = null;
    arrived = false;
    window._arrivedGps = null;
    _lastAreaJson = '';
    await loadAreaRequests();
    loadPoints();
    loadLeaderboard();
    if (selectedResident) {
      const refreshed = (await WW.api('/api/requests/area-residents')).residents;
      const updated = refreshed.find((r) => r.id === selectedResident.id);
      if (updated && updated.pending_requests.length) {
        selectedResident = updated;
        renderRequestList(updated);
        selectRequest(0);
      } else {
        closeWork();
        WW.toast('All requests completed for this resident!');
      }
    }
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
  else if (v.verdict === 'flagged') verdictHtml = '<span class="badge red">FLAGGED</span>';
  else verdictHtml = '<span class="badge gray">REJECTED</span>';

  const reasons = (v.reasons || []).map((r) => `• ${WW.escapeHtml(r.reason)}`).join('<br/>');

  $('work-result').innerHTML = `
    <h3>Verification Result ${verdictHtml}</h3>
    <p style="margin-top:8px;">Match Score: <b>${score}%</b> (method: ${v.cv_method || 'local'})</p>
    ${v.ai_reason ? `<p class="muted">AI verdict: ${WW.escapeHtml(v.ai_reason)}</p>` : ''}
    <p class="muted" style="margin-top:6px;">${reasons}</p>
    ${v.verdict === 'verified' ? `<p class="hint" style="margin-top:8px;">Points awarded to both you and the resident.</p>` : `<p class="hint" style="margin-top:8px;">Flagged for admin review.</p>`}`;
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
        : '<p class="muted">No collectors yet</p>';
    }
  } catch {}
}

init();
