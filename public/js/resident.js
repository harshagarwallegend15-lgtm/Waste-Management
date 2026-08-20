const profile = WW.requireRole('resident');
const $ = (id) => document.getElementById(id);

let reqPhoto = null;
let repPhoto = null;

async function init() {
  if (!profile) return;
  $('nav-name').textContent = profile.name;
  $('nav-points').textContent = profile.points ?? 0;
  $('side-points').textContent = profile.points ?? 0;

  try {
    await WWCamera.start($('req-video'));
    $('req-status').textContent = t('res.cameraReady') + '. ' + t('res.createRequestDesc');
  } catch {
    $('req-status').textContent = t('res.cameraUnavailable');
  }

  loadHistory();
  loadMyReports();
  loadProblems();
  loadChallenges();
  loadPoints();
  loadLeaderboard();
  loadEducation();
  loadSocieties();

  // Live updates
  WWRealtime.subscribe({ event: 'INSERT', schema: 'public', table: 'points_transactions', filter: `user_id=eq.${profile.id}` }, () => { loadPoints(); loadLeaderboard(); });
  WWRealtime.subscribe({ event: 'INSERT', schema: 'public', table: 'collection_requests', filter: `resident_id=eq.${profile.id}` }, () => loadHistory());
  WWRealtime.subscribe({ event: 'UPDATE', schema: 'public', table: 'collection_requests', filter: `resident_id=eq.${profile.id}` }, () => loadHistory());
  WWRealtime.subscribe({ event: 'INSERT', schema: 'public', table: 'dumping_reports', filter: `resident_id=eq.${profile.id}` }, () => loadMyReports());
  WWRealtime.subscribe({ event: 'INSERT', schema: 'public', table: 'problem_comments' }, () => loadProblems());
  WWRealtime.subscribe({ event: '*', schema: 'public', table: 'challenge_completions' }, () => loadChallenges());
  WWRealtime.subscribe({ event: 'INSERT', schema: 'public', table: 'points_transactions' }, () => loadLeaderboard());
  WWRealtime.subscribe({ event: 'UPDATE', schema: 'public', table: 'collection_requests' }, () => loadLeaderboard());

  // Realtime society board: refresh whenever society data changes anywhere.
  WWRealtime.subscribe({ event: '*', schema: 'public', table: 'societies' }, () => loadSocieties()).then((s) => {
    if (!s) startSocietyPoll();
  });
  WWRealtime.subscribe({ event: '*', schema: 'public', table: 'society_scores' }, () => { loadSocieties(); loadLeaderboard(); }).then((s) => {
    if (!s) startSocietyPoll();
  });
  WWRealtime.subscribe({ event: 'INSERT', schema: 'public', table: 'society_problems', filter: `society_id=eq.${profile.society_id}` }, () => { loadProblems(); loadSocieties(); });
  WWRealtime.subscribe({ event: '*', schema: 'public', table: 'collection_requests' }, () => loadSocieties());
}

let societyPoll = null;
function startSocietyPoll() {
  if (societyPoll) return;
  societyPoll = setInterval(() => loadSocieties(), 30000);
}

function showTab(name) {
  document.querySelectorAll('.page-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  ['request', 'society', 'history', 'report', 'problems', 'challenges', 'learn', 'points'].forEach((t) => $('tab-' + t).classList.toggle('hidden', t !== name));
  if (name === 'society') loadSocieties();
  if (name === 'learn') initQuiz();
}

// ---------- Request collection ----------

$('req-capture').onclick = async () => {
  const shot = await WWCamera.capture($('req-video'));
  $('req-status').textContent = t('res.checkingPhoto');
  try {
    await WWGarbage.checkPhoto(shot.blob, 'before-photo');
  } catch (e) {
    WW.toast(e.message, true);
    $('req-status').textContent = e.message;
    return;
  }
  reqPhoto = shot;
  $('req-preview').src = shot.dataUrl;
  $('req-preview').classList.remove('hidden');
  $('req-video').classList.add('hidden');
  $('req-capture').classList.add('hidden');
  $('req-retake').classList.remove('hidden');
  $('req-submit').classList.remove('hidden');
  $('req-status').textContent = t('res.photoCaptured');
};

$('req-retake').onclick = () => {
  reqPhoto = null;
  $('req-preview').classList.add('hidden');
  $('req-video').classList.remove('hidden');
  $('req-capture').classList.remove('hidden');
  $('req-retake').classList.add('hidden');
  $('req-submit').classList.add('hidden');
};

$('req-submit').onclick = async () => {
  if (!reqPhoto) return WW.toast(t('res.capturePhotoFirst'), true);
  $('req-submit').disabled = true;
  try {
    let gps = { lat: profile.gps_lat, lng: profile.gps_lng };
    try {
      const pos = await WWGps.get();
      gps = { lat: pos.lat, lng: pos.lng };
    } catch {
      WW.toast(t('res.usingSavedLocation'));
    }
    const fd = new FormData();
    fd.append('photo', reqPhoto.blob, 'before.jpg');
    fd.append('waste_type', $('req-type').value);
    fd.append('gps_lat', gps.lat);
    fd.append('gps_lng', gps.lng);
    const data = await WW.api('/api/requests', { method: 'POST', form: fd });
    WW.toast(t('res.requestSubmitted'));
    $('req-retake').click();
    loadHistory();
  } catch (err) {
    WW.toast(err.message, true);
  }
  $('req-submit').disabled = false;
};

async function loadHistory() {
  try {
    const { requests } = await WW.api('/api/requests/mine');
    if (!requests.length) {
      $('history-list').innerHTML = '<p class="muted">' + t('res.noRequests') + '</p>';
      return;
    }
    $('history-list').innerHTML = `
      <table>
        <thead><tr><th>${t('res.date')}</th><th>${t('res.type')}</th><th>${t('res.photos')}</th><th>${t('res.status')}</th><th>${t('res.match')}</th></tr></thead>
        <tbody>
        ${requests.map((r) => `
          <tr>
            <td>${WW.fmtDate(r.before_timestamp)}</td>
            <td>${WW.escapeHtml(r.waste_type)}</td>
            <td class="photo-pair">
              ${r.before_photo_url ? `<img class="photo-thumb" src="${r.before_photo_url}" />` : '<span class="muted">—</span>'}
              ${r.after_photo_url ? `<img class="photo-thumb" src="${r.after_photo_url}" />` : ''}
            </td>
            <td>${WW.badge(r.status)}</td>
            <td>${r.match_score != null ? (r.match_score * 100).toFixed(0) + '%' : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) { WW.toast(err.message, true); }
}

// ---------- Report dumping ----------

$('rep-capture').onclick = async () => {
  const shot = await WWCamera.capture($('rep-video'));
  $('rep-status').textContent = t('res.checkingPhoto');
  try {
    await WWGarbage.checkPhoto(shot.blob, 'dumping-photo');
  } catch (e) {
    WW.toast(e.message, true);
    $('rep-status').textContent = e.message;
    return;
  }
  repPhoto = shot;
  $('rep-preview').src = shot.dataUrl;
  $('rep-preview').classList.remove('hidden');
  $('rep-video').classList.add('hidden');
  $('rep-capture').classList.add('hidden');
  $('rep-retake').classList.remove('hidden');
  $('rep-submit').classList.remove('hidden');
};

$('rep-retake').onclick = () => {
  repPhoto = null;
  $('rep-preview').classList.add('hidden');
  $('rep-video').classList.remove('hidden');
  $('rep-capture').classList.remove('hidden');
  $('rep-retake').classList.add('hidden');
  $('rep-submit').classList.add('hidden');
};

$('rep-submit').onclick = async () => {
  if (!repPhoto) return WW.toast(t('res.capturePhotoFirst'), true);
  $('rep-submit').disabled = true;
  try {
    const pos = await WWGps.get();
    const fd = new FormData();
    fd.append('photo', repPhoto.blob, 'report.jpg');
    fd.append('gps_lat', pos.lat);
    fd.append('gps_lng', pos.lng);
    fd.append('description', $('rep-desc').value);
    await WW.api('/api/reports', { method: 'POST', form: fd });
    WW.toast(t('res.reportSubmitted'));
    $('rep-retake').click();
    $('rep-desc').value = '';
    loadMyReports();
  } catch (err) {
    WW.toast(err.message, true);
  }
  $('rep-submit').disabled = false;
};

async function loadMyReports() {
  try {
    const { reports } = await WW.api('/api/reports/mine');
    if (!reports.length) { $('my-reports').innerHTML = '<p class="muted">' + t('res.noReports') + '</p>'; return; }
    $('my-reports').innerHTML = `
      <table>
        <thead><tr><th>${t('res.date')}</th><th>${t('res.status')}</th><th>${t('res.reward')}</th></tr></thead>
        <tbody>${reports.map((r) => `
          <tr>
            <td>${WW.fmtDate(r.created_at)}</td>
            <td>${WW.badge(r.status)}</td>
            <td>${r.reward || 0}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) { WW.toast(err.message, true); }
}

// ---------- Problems ----------

async function postProblem() {
  const title = $('pb-title').value.trim();
  if (!title) return WW.toast(t('res.titleRequired'), true);
  const file = $('pb-photo').files[0];
  const fd = new FormData();
  fd.append('title', title);
  fd.append('description', $('pb-desc').value);
  if (file) fd.append('photo', file);
  try {
    await WW.api('/api/problems', { method: 'POST', form: fd });
    WW.toast(t('res.problemPosted'));
    $('pb-title').value = ''; $('pb-desc').value = ''; $('pb-photo').value = '';
    loadProblems();
  } catch (err) { WW.toast(err.message, true); }
}

async function commentOn(problemId, inputEl) {
  const content = inputEl.value.trim();
  if (!content) return;
  try {
    await WW.api(`/api/problems/${problemId}/comments`, { method: 'POST', body: { content } });
    inputEl.value = '';
    loadProblems();
  } catch (err) { WW.toast(err.message, true); }
}

async function loadProblems() {
  try {
    const { problems } = await WW.api('/api/problems/society');
    if (!problems.length) { $('problems-list').innerHTML = '<p class="muted">' + t('res.noProblems') + '</p>'; return; }
    $('problems-list').innerHTML = problems.map((p) => `
      <div class="card" style="margin-bottom: 12px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <h4 style="flex:1;">${WW.escapeHtml(p.title)}</h4> ${WW.badge(p.status)}
        </div>
        ${p.photo_url ? `<img class="photo-thumb" src="${p.photo_url}" style="margin:8px 0;" />` : ''}
        ${p.description ? `<p class="muted">${WW.escapeHtml(p.description)}</p>` : ''}
        <p class="hint" style="margin:6px 0;">${t('res.postedBy')} ${WW.escapeHtml(p.profiles?.name || t('res.resident'))} · ${WW.fmtDate(p.created_at)}</p>
        <div style="margin-top:8px;">
          ${(p.comments || []).map((c) => `
            <div style="background:var(--bg); border-radius:8px; padding:8px 12px; margin-bottom:6px;">
              <span style="font-size:0.8rem; font-weight:700;">${WW.escapeHtml(c.profiles?.name || 'resident')}</span>
              <span class="hint"> · ${WW.fmtDate(c.created_at)}</span>
              <div style="font-size:0.9rem;">${WW.escapeHtml(c.content)}</div>
            </div>`).join('')}
          <div style="display:flex; gap:8px; margin-top:8px;">
            <input id="cmt-${p.id}" placeholder="${t('res.addComment')}" onkeydown="if(event.key==='Enter')commentOn('${p.id}', this)" />
            <button class="secondary" onclick="commentOn('${p.id}', document.getElementById('cmt-${p.id}'))">${t('res.commentBtn')}</button>
          </div>
        </div>
      </div>`).join('');
  } catch (err) { WW.toast(err.message, true); }
}

// ---------- Challenges ----------

async function loadChallenges() {
  try {
    const data = await WW.api('/api/challenges');
    if (!data.active.length) {
      $('challenges-active').innerHTML = '<p class="muted">' + t('res.noActiveChallenges') + '</p>';
    } else {
      $('challenges-active').innerHTML = data.active.map((c) => {
        const row = c.progress_rows[0];
        const pct = row ? Math.min(100, Math.round((row.progress / c.target) * 100)) : 0;
        const done = row?.completed;
        return `
        <div class="card" style="margin-bottom:12px; border-left:4px solid ${done ? 'var(--green-500)' : 'var(--amber-500)'};">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <h4 style="flex:1;">${WW.escapeHtml(c.title)} ${done ? WW.badge('completed') : ''}</h4>
            <span class="badge ${c.challenge_type === 'collections' ? 'blue' : c.challenge_type === 'reports' ? 'red' : c.challenge_type === 'score' ? 'green' : 'amber'}">${WW.escapeHtml(c.challenge_type)}</span>
            <span class="hint">⏳ ${c.days_left} ${t('res.left')} · +${c.reward_points} ${t('res.ptsBonus')}</span>
          </div>
          ${c.description ? `<p class="muted">${WW.escapeHtml(c.description)}</p>` : ''}
          <div class="progress"><div class="bar" style="width:${pct}%"></div></div>
          <p class="hint" style="margin-top:6px;">${WW.escapeHtml(row?.society_name || t('res.yourSociety'))}: <b>${row ? row.progress : 0} / ${c.target}</b> (${pct}%) ${done ? '· 🎉 ' + t('res.bonusPaid') : '· ' + t('res.keepParticipating')}</p>
        </div>`;
      }).join('');
    }

    $('challenges-history').innerHTML = data.history.length
      ? `<table><thead><tr><th>${t('res.challenge')}</th><th>${t('res.type')}</th><th>${t('res.outcome')}</th></tr></thead><tbody>
          ${data.history.map((c) => {
            const row = c.progress_rows[0];
            return `<tr>
              <td>${WW.escapeHtml(c.title)}</td>
              <td><span class="badge blue">${WW.escapeHtml(c.challenge_type)}</span></td>
              <td>${row?.completed
                ? WW.badge('completed') + ' +' + c.reward_points + ' ' + t('res.ptsBonus')
                : '<span class="muted">' + t('res.notReached') + ' (' + (row ? row.progress : 0) + ' / ' + c.target + ')</span>'}</td>
            </tr>`;
          }).join('')}
        </tbody></table>`
      : '<p class="muted">' + t('res.noCompletedChallenges') + '</p>';
  } catch (err) { WW.toast(err.message, true); }
}

// ---------- Points + leaderboard ----------

async function loadPoints() {
  try {
    const { points, transactions } = await WW.api('/api/points/me');
    $('nav-points').textContent = points;
    $('side-points').textContent = points;
    $('points-list').innerHTML = transactions.length
      ? `<table><thead><tr><th>${t('res.date')}</th><th>${t('res.reason')}</th><th style="text-align:right;">Δ</th></tr></thead><tbody>
          ${transactions.map((t) => `
            <tr><td>${WW.fmtDate(t.created_at)}</td><td>${WW.escapeHtml(t.reason)}</td>
            <td style="text-align:right; font-weight:700; color:${t.delta >= 0 ? 'var(--green-600)' : 'var(--red-500)'};">${t.delta >= 0 ? '+' : ''}${t.delta}</td></tr>`).join('')}
        </tbody></table>`
      : '<p class="muted">' + t('res.noPointsYet') + '</p>';
  } catch (err) { WW.toast(err.message, true); }
}

async function loadLeaderboard() {
  try {
    const data = await WW.api('/api/leaderboard/all');
    const top = data.residents.slice(0, 15);
    $('leaderboard').innerHTML = top.length
      ? top.map((r, i) => `
        <div class="rank-row">
          <div class="pos ${i < 3 ? 'top' : ''}">${i + 1}</div>
          <div class="name">${WW.escapeHtml(r.name)}</div>
          <div class="pts">${r.points}</div>
        </div>`).join('')
      : '<p class="muted">' + t('res.noResidentsYet') + '</p>';
  } catch (err) { WW.toast(err.message, true); }
}

// ---------- Education (behaviour-based) ----------

async function loadEducation() {
  try {
    const { lesson, stats } = await WW.api('/api/education/for-me');
    const banner = $('education-banner');
    if (stats.improved) {
      banner.innerHTML = `<strong>🎉 ${t('res.recognition')}:</strong> ${t('res.recognitionDesc')}`;
      banner.classList.remove('hidden');
      return;
    }
    if (lesson.trigger_type !== 'default') {
      banner.innerHTML = `<strong>🧠 ${WW.escapeHtml(lesson.title)}</strong>
        <div class="muted" style="white-space:pre-line; margin-top:6px;">${WW.escapeHtml(lesson.content)}</div>
        <button class="secondary" style="margin-top:10px; font-size:0.85rem; padding:6px 12px;" onclick="dismissEducation()">${t('res.gotIt')}</button>`;
      banner.classList.remove('hidden');
    }
  } catch {}
}

function dismissEducation() {
  $('education-banner').classList.add('hidden');
}

// ---------- Societies near me (location-based, realtime) ----------

let _societyOrigin = null;

function fmtKm(d) {
  if (d == null) return '—';
  return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
}

async function loadSocieties() {
  try {
    const status = $('society-loc-status');
    if (status) status.textContent = t('res.locatingSocieties');

    let origin = null;
    try {
      const pos = await WWGps.get(true, 6000);
      origin = { lat: pos.lat, lng: pos.lng };
    } catch {
      origin = (profile.gps_lat != null && profile.gps_lng != null) ? { lat: profile.gps_lat, lng: profile.gps_lng } : null;
    }
    _societyOrigin = origin;

    const qs = origin ? `?lat=${origin.lat}&lng=${origin.lng}` : '';
    const { societies, city_radius_km, region } = await WW.api('/api/societies/nearby' + qs);
    if (status) status.textContent = origin
      ? '📍 ' + t('res.locatingSocieties') + ` — ${societies.length}`
      : t('res.noSocietiesInCity');

    renderMySociety(societies, region);
    renderSocietyList(societies, region);
  } catch (err) {
    $('my-society').innerHTML = '<p class="muted">' + WW.escapeHtml(err.message) + '</p>';
    $('societies-list').innerHTML = '';
  }
}

function scoreBadge(score) {
  if (score == null) return '<span class="badge gray">' + t('res.noScoreYet') + '</span>';
  const cls = score >= 70 ? 'green' : score >= 45 ? 'amber' : 'red';
    return `<span class="badge ${cls}">${t('res.score')} ${Math.round(score)}/100</span>`;
}

function societyStats(s) {
  return `
    <div class="soc-meta">
      <span title="Residents">👥 <b>${s.members}</b></span>
      <span title="${t('res.open')}">🚧 <b>${s.open_problems}</b> ${t('res.open')}</span>
      <span title="${t('res.pending')}">📦 <b>${s.pending_requests}</b> ${t('res.pending')}</span>
      <span title="${t('res.collectedToday')}">✅ <b>${s.verified_today}</b> ${t('res.collectedToday')}</span>
    </div>`;
}

function renderMySociety(list, region) {
  const el = $('my-society');
  const mine = list.find((s) => s.id === profile.society_id);
  if (!mine) {
    el.innerHTML = region
      ? `<div class="society-card mine">
          <div class="soc-head">
            <div>
              <h4 style="margin:0;">📍 ${WW.escapeHtml(region.name)} <span class="badge green">${t('res.yourArea')}</span></h4>
              <p class="hint" style="margin:4px 0 0;">${t('res.joinAreaHint')}</p>
            </div>
          </div>
        </div>`
      : `<p class="muted">${t('res.notInSociety')}</p>`;
    return;
  }
  el.innerHTML = `
    <div class="society-card mine">
      <div class="soc-head">
        <div>
          <h4 style="margin:0;">${WW.escapeHtml(mine.name)} <span class="badge green">${t('res.yourSocietyBadge')}</span></h4>
          <p class="hint" style="margin:4px 0 0;">
            ${WW.escapeHtml(mine.area || '')}${mine.address ? ' · ' + WW.escapeHtml(mine.address) : ''}
            ${mine.distance_km != null ? ' · 📍 ' + fmtKm(mine.distance_km) + ' away' : ''}
          </p>
        </div>
        <div class="soc-head-right">${scoreBadge(mine.score)}</div>
      </div>
      ${societyStats(mine)}
      <p class="hint" style="margin-top:10px;">${t('res.problemsHint')}</p>
    </div>`;
}

function renderSocietyList(list, region) {
  const el = $('societies-list');
  if (!list.length) {
    el.innerHTML = region
      ? `<p class="muted">${t('res.noSocietyInRegion')} <b>${WW.escapeHtml(region.name)}</b></p>`
      : '<p class="muted">' + t('res.noSocietiesInCity') + '</p>';
    return;
  }
  el.innerHTML = list.map((s) => {
    const isMine = s.id === profile.society_id;
    return `
    <div class="society-card">
      <div class="soc-head">
        <div>
          <h4 style="margin:0;">${WW.escapeHtml(s.name)} ${isMine ? '<span class="badge green">You</span>' : ''}</h4>
          <p class="hint" style="margin:4px 0 0;">
            ${WW.escapeHtml(s.area || '')}${s.address ? ' · ' + WW.escapeHtml(s.address) : ''}
            ${s.distance_km != null ? ' · 📍 ' + fmtKm(s.distance_km) : ''}
          </p>
        </div>
        <div class="soc-head-right">
          ${scoreBadge(s.score)}
          ${isMine
            ? ''
            : `<button class="secondary switch-btn" onclick="switchSociety('${s.id}')">${t('res.joined')}</button>`}
        </div>
      </div>
      ${societyStats(s)}
    </div>`;
  }).join('');
}

async function switchSociety(societyId) {
  if (societyId === profile.society_id) return;
  try {
    const { profile: updated, society_name } = await WW.api('/api/societies/me', {
      method: 'PATCH',
      body: { society_id: societyId, gps_lat: _societyOrigin?.lat ?? null, gps_lng: _societyOrigin?.lng ?? null },
    });
    WW.toast(t('res.joined') + ' ' + society_name + '!');
    WW.setSession(WW.getToken(), updated);
    setTimeout(() => location.reload(), 900);
  } catch (err) {
    WW.toast(err.message, true);
  }
}

// ---------- Learn & Earn Quiz ----------

let quizQuestions = [];
let quizAnswers = [];
let quizCurrent = 0;
let quizStarted = false;

async function initQuiz() {
  if (quizStarted) return;
  try {
    const data = await WW.api('/api/learn-earn/quiz');
    if (!data.canPlay) {
      $('quiz-area').innerHTML = '<div style="text-align:center;padding:30px 0;"><p style="font-size:1.2rem;">🕐</p><p style="font-weight:700;margin:10px 0;">' + data.message + '</p><p class="hint">Complete quizzes daily to earn up to 50 points per day.</p></div>';
      loadQuizHistory();
      return;
    }
    quizQuestions = data.questions;
    quizAnswers = new Array(quizQuestions.length).fill(-1);
    quizCurrent = 0;
    quizStarted = true;
    renderQuizQuestion();
  } catch (err) {
    $('quiz-area').innerHTML = '<p class="muted">' + WW.escapeHtml(err.message) + '</p>';
  }
  loadQuizHistory();
}

function renderQuizQuestion() {
  const q = quizQuestions[quizCurrent];
  const total = quizQuestions.length;
  const answered = quizAnswers[quizCurrent] >= 0;
  const progress = Math.round(((quizCurrent + 1) / total) * 100);

  $('quiz-area').innerHTML = `
    <div style="margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;">
        <span>Question ${quizCurrent + 1} of ${total}</span>
        <span>${progress}%</span>
      </div>
      <div class="progress"><div class="bar" style="width:${progress}%"></div></div>
    </div>
    <h4 style="margin-bottom:14px;">${WW.escapeHtml(q.question)}</h4>
    ${q.options.map((opt, i) => `
      <label class="quiz-option" style="display:block; padding:12px 14px; margin-bottom:8px; border:2px solid var(--border); border-radius:10px; cursor:pointer; transition:all 0.2s; ${quizAnswers[quizCurrent] === i ? 'border-color:var(--c-accent); background:var(--accent-light);' : ''}" onclick="selectQuizOption(${i})">
        <input type="radio" name="q${quizCurrent}" value="${i}" ${quizAnswers[quizCurrent] === i ? 'checked' : ''} style="margin-right:10px;" />
        ${WW.escapeHtml(opt)}
      </label>
    `).join('')}
    <div style="display:flex; gap:10px; margin-top:16px;">
      ${quizCurrent > 0 ? '<button class="secondary" onclick="prevQuestion()">← Back</button>' : ''}
      <div style="flex:1;"></div>
      ${quizCurrent < total - 1
        ? '<button onclick="nextQuestion()">Next →</button>'
        : '<button onclick="submitQuiz()" style="background:var(--green-600); color:#fff;">Submit Quiz ✓</button>'
      }
    </div>`;
}

function selectQuizOption(idx) {
  quizAnswers[quizCurrent] = idx;
  renderQuizQuestion();
}

function nextQuestion() {
  if (quizCurrent < quizQuestions.length - 1) { quizCurrent++; renderQuizQuestion(); }
}

function prevQuestion() {
  if (quizCurrent > 0) { quizCurrent--; renderQuizQuestion(); }
}

async function submitQuiz() {
  const unanswered = quizAnswers.filter((a) => a < 0).length;
  if (unanswered > 0) {
    if (!confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) return;
  }

  const answers = quizAnswers.map((selected, id) => ({ id, selected: selected >= 0 ? selected : -1 }));
  try {
    const data = await WW.api('/api/learn-earn/submit', { method: 'POST', body: { answers } });
    showQuizResults(data);
  } catch (err) {
    WW.toast(err.message, true);
  }
}

function showQuizResults(data) {
  const pct = Math.round((data.score / data.total) * 100);
  const emoji = pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '💪';
  const msg = pct >= 80 ? 'Excellent!' : pct >= 50 ? 'Good job!' : 'Keep learning!';

  $('quiz-area').innerHTML = `
    <div style="text-align:center; padding:20px 0;">
      <div style="font-size:3rem;">${emoji}</div>
      <h2 style="margin:10px 0 4px;">${msg}</h2>
      <p style="font-size:1.1rem; font-weight:700;">${data.score} / ${data.total} correct</p>
      <p style="font-size:1.5rem; font-weight:800; color:var(--green-600); margin:10px 0;">+${data.pointsEarned} points</p>
      <p class="hint" style="margin-top:4px;">Max possible: ${data.total * 5} points (${data.total} questions × 5 pts)</p>
      <button style="margin-top:16px;" onclick="quizStarted=false;initQuiz();">Play Again Tomorrow</button>
    </div>
    <div style="margin-top:16px;">
      <h4>Review your answers</h4>
      ${data.results.map((r, i) => {
        const q = quizQuestions[r.id];
        if (!q) return '';
        return `<div style="padding:10px; margin-bottom:8px; border-left:4px solid ${r.correct ? 'var(--green-500)' : 'var(--red-500)'}; background:var(--bg); border-radius:0 8px 8px 0;">
          <p style="font-weight:700; margin:0 0 4px;">Q${i + 1}: ${WW.escapeHtml(q.question)}</p>
          <p style="margin:0; font-size:0.9rem; color:${r.correct ? 'var(--green-600)' : 'var(--red-500)'};">
            ${r.correct ? '✓ Correct!' : '✗ Wrong — Answer: ' + WW.escapeHtml(q.options[r.correctAnswer])}
          </p>
        </div>`;
      }).join('')}
    </div>`;

  loadQuizHistory();
  loadPoints();
}

async function loadQuizHistory() {
  try {
    const { sessions } = await WW.api('/api/learn-earn/history');
    $('quiz-history').innerHTML = sessions.length
      ? `<table><thead><tr><th>Date</th><th>Score</th><th>Points</th></tr></thead><tbody>
          ${sessions.map((s) => `
            <tr>
              <td>${WW.fmtDate(s.created_at)}</td>
              <td>${s.score}/${s.total}</td>
              <td style="font-weight:700; color:var(--green-600);">+${s.points_earned}</td>
            </tr>`).join('')}
        </tbody></table>`
      : '<p class="muted">No quizzes taken yet. Start your first quiz!</p>';
  } catch (err) { WW.toast(err.message, true); }
}

init();
