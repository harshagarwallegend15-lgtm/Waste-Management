const profile = WW.requireRole('collector');
const $ = (id) => document.getElementById(id);

let selectedResident = null;
let selectedRequest = null;
let arrived = false;
let workPhoto = null;

async function init() {
  if (!profile) return;
  $('nav-name').textContent = profile.name;
  $('nav-points').textContent = profile.points ?? 0;
  await loadResidents();
  loadPoints();
  loadLeaderboard();

  const rt = WWRealtime.subscribe({ event: '*', schema: 'public', table: 'collection_requests' }, () => loadResidents());
  WWRealtime.subscribe({ event: 'INSERT', schema: 'public', table: 'points_transactions', filter: `user_id=eq.${profile.id}` }, () => { loadPoints(); loadLeaderboard(); });
  WWRealtime.subscribe({ event: 'UPDATE', schema: 'public', table: 'society_scores' }, () => loadLeaderboard());
  WWRealtime.subscribe({ event: 'INSERT', schema: 'public', table: 'points_transactions' }, () => loadLeaderboard());
  if (!rt) startPoll();
}

let _poll = null;
function startPoll() {
  if (_poll) return;
  _poll = setInterval(() => loadResidents(), 8000);
}

function stopCamera() {
  try { WWCamera.stop(); } catch {}
}

let _lastResidentsJson = '';

async function loadResidents() {
  try {
    const data = await WW.api('/api/requests/area-residents');
    const { residents, area_id } = data;
    const areaName = await getAreaName(area_id);
    $('nav-area').textContent = areaName;
    const snapshot = JSON.stringify(residents.map((r) => ({ id: r.id, pending: r.pending_requests.length, ids: r.pending_requests.map((q) => q.id) })));
    if (snapshot !== _lastResidentsJson) {
      _lastResidentsJson = snapshot;
      renderSidebar(residents);
    }
    if (selectedResident) {
      const updated = residents.find((r) => r.id === selectedResident.id);
      if (updated) {
        selectedResident = updated;
        if (updated.pending_requests.length) {
          renderRequestList(updated);
        } else {
          closeWork();
          WW.toast(t('col.allCompleted'));
        }
      }
    }
  } catch (err) {
    $('resident-list').innerHTML = `<p class="muted">${WW.escapeHtml(err.message)}</p>`;
  }
}

function renderSidebar(residents) {
  if (!residents.length) {
    $('resident-list').innerHTML = '<div class="card"><p class="muted">' + t('col.noResidents') + '</p></div>';
    return;
  }
  const sorted = [...residents].sort((a, b) => (b.pending_requests.length) - (a.pending_requests.length));
  $('resident-list').innerHTML = sorted.map((r) => `
    <div class="card" style="margin-bottom:10px; display:flex; align-items:center; gap:14px;">
      <div style="flex:1;">
        <strong>${WW.escapeHtml(r.name)}</strong>
        <div class="muted">${WW.escapeHtml(r.address_text || t('col.noAddress'))}</div>
        <div class="muted">${t('col.societyLabel')}: ${WW.escapeHtml(r.societies?.name || '—')}</div>
      </div>
      <div>
        ${r.pending_requests.length ? `<span class="badge amber">${r.pending_requests.length} ${t('col.pending')}</span>` : `<span class="badge gray">${t('col.noRequest')}</span>`}
      </div>
      <button class="${r.pending_requests.length ? '' : 'secondary'}" onclick="openResident('${r.id}')">${t('col.openBtn')} →</button>
    </div>`).join('');
}

async function getAreaName(areaId) {
  try {
    const data = await WW.api('/api/meta');
    const a = data.areas.find((x) => x.id === areaId);
    return a ? a.name : t('col.areaAssigned');
  } catch { return t('col.areaAssigned'); }
}

async function openResident(id) {
  $('work').classList.remove('hidden');
  $('work-name').textContent = t('col.loading');
  $('work-address').textContent = '';
  $('work-map').innerHTML = '';
  $('work-requests').innerHTML = '';
  $('work-result').innerHTML = '';
  $('work-status').textContent = t('col.fetchingData');
  $('work-arrived').classList.add('hidden');
  stopCamera();
  $('work').scrollIntoView({ behavior: 'smooth' });

  let residents;
  try {
    const data = await WW.api('/api/requests/area-residents');
    residents = data.residents;
  } catch { residents = null; }
  if (!residents) {
    $('work-status').textContent = t('col.couldNotLoad');
    return WW.toast(t('col.couldNotLoad'), true);
  }
  const resident = residents.find((r) => r.id === id);
  if (!resident) {
    $('work-status').textContent = t('col.residentNotFound');
    return WW.toast(t('col.residentNotFound'), true);
  }
  selectedResident = resident;
  arrived = false;
  workPhoto = null;
  window._arrivedGps = null;

  $('work-name').textContent = resident.name;
  $('work-address').textContent = resident.address_text || t('col.noAddressOnFile');
  $('work-map').innerHTML = resident.gps_lat
    ? `📍 <a href="${WWGps.mapsUrl(resident.gps_lat, resident.gps_lng)}" target="_blank">${t('col.viewOnMap')}</a>`
    : `<span class="muted">${t('col.noGpsSaved')}</span>`;

  if (resident.gps_lat) {
    $('work-status').textContent = t('col.gpsCheckPrompt');
    $('work-arrived').classList.remove('hidden');
  } else {
    $('work-arrived').classList.add('hidden');
    arrived = true;
    $('work-status').textContent = t('col.photoVerificationOnly');
  }

  renderRequestList(resident);

  $('work-retake').click();

  try {
    WWCamera.start($('work-video')).then(() => {
      if (!window._arrivedGps && !arrived) {
        $('work-status').textContent += ' ' + t('col.cameraReady');
      }
    }).catch(() => {
      if (!window._arrivedGps && !arrived) {
        $('work-status').textContent += ' ' + t('col.cameraUnavailable');
      }
    });
  } catch {
    if (!window._arrivedGps && !arrived) {
      $('work-status').textContent += ' ' + t('col.cameraUnavailable');
    }
  }
}

function renderRequestList(resident) {
  const pending = resident.pending_requests;
  if (!pending.length) {
    $('work-requests').innerHTML = '<p class="muted">' + t('col.requestListEmpty') + '</p>';
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
    $('work-status').textContent = t('col.gpsCheckPrompt');
    $('work-arrived').classList.remove('hidden');
  } else {
    $('work-arrived').classList.add('hidden');
    arrived = true;
    $('work-status').textContent = t('col.photoVerificationOnly');
  }

  try {
    WWCamera.start($('work-video')).then(() => {
      $('work-status').textContent += ' ' + t('col.cameraReady');
    }).catch(() => {
      $('work-status').textContent += ' ' + t('col.cameraUnavailable');
    });
  } catch {
    $('work-status').textContent += ' ' + t('col.cameraUnavailable');
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
  if (!selectedResident?.gps_lat) { arrived = true; $('work-status').textContent = t('col.arrivedNoGps'); return; }
  $('work-arrived').disabled = true;
  $('work-status').textContent = t('col.checkingGps');
  try {
    const pos = await WWGps.get();
    window._arrivedGps = { lat: pos.lat, lng: pos.lng };
    arrived = true;
    $('work-status').textContent = t('col.arrivedGps') + ` (${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)})`;
  } catch (err) {
    arrived = true;
    $('work-status').textContent = t('col.gpsCheckFailed') + ' ' + err.message;
  }
  $('work-arrived').disabled = false;
}

$('work-capture').onclick = async () => {
  if (!selectedRequest) return WW.toast(t('col.selectRequestFirst'), true);
  try {
    const shot = await WWCamera.capture($('work-video'));
    $('work-status').textContent = t('col.checkingPhoto');
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
  } catch (e) {
    $('work-status').textContent = t('col.captureFailed') + ': ' + e.message;
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
  if (!selectedRequest) return WW.toast(t('col.noRequestSelected'), true);
  if (!workPhoto) return WW.toast(t('col.markArrivedFirst'), true);
  if (!arrived) return WW.toast(t('col.markArrivedFirst'), true);
  $('work-submit').disabled = true;
  $('work-status').textContent = t('col.verifying');
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
        WW.toast(t('col.verifiedPoints', { delta: collectorPts.txn.delta }));
      }
    }
    workPhoto = null;
    arrived = false;
    window._arrivedGps = null;
    await loadResidents();
    loadPoints();
    loadLeaderboard();
    if (selectedResident) {
      const refreshed = (await (await fetch('/api/requests/area-residents', { headers: { Authorization: 'Bearer ' + WW.getToken() } })).json()).residents;
      const updated = refreshed.find((r) => r.id === selectedResident.id);
      if (updated && updated.pending_requests.length) {
        selectedResident = updated;
        renderRequestList(updated);
        selectRequest(0);
      } else {
        closeWork();
        WW.toast(t('col.allCompleted'));
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
  if (v.verdict === 'verified') verdictHtml = '<span class="badge green">' + t('col.VERIFIED') + ' ✅</span>';
  else if (v.verdict === 'flagged') verdictHtml = '<span class="badge red">' + t('col.FLAGGED') + '</span>';
  else verdictHtml = '<span class="badge gray">' + t('col.REJECTED') + '</span>';

  const reasons = (v.reasons || []).map((r) => `• ${WW.escapeHtml(r.reason)}`).join('<br/>');

  $('work-result').innerHTML = `
    <h3>${t('col.verificationResult')} ${verdictHtml}</h3>
    <p style="margin-top:8px;">${t('col.matchScore')}: <b>${score}%</b> (${t('col.method')}: ${v.cv_method || 'local'})</p>
    ${v.ai_reason ? `<p class="muted">${t('col.aiVerdict')}: ${WW.escapeHtml(v.ai_reason)}</p>` : ''}
    <p class="muted" style="margin-top:6px;">${reasons}</p>
    ${v.verdict === 'verified' ? `<p class="hint" style="margin-top:8px;">${t('col.pointsHint')}</p>` : `<p class="hint" style="margin-top:8px;">${t('col.adminReviewHint')}</p>`}`;
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
        : '<p class="muted">' + t('col.noCollectors') + '</p>';
    }
  } catch {}
}

init();
