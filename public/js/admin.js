const profile = WW.requireRole('admin');
const $ = (id) => document.getElementById(id);

async function init() {
  if (!profile) return;
  $('nav-name').textContent = profile.name;
  loadDashboard();
  loadCollections();
  loadReports();
  loadProblems();
  loadChallenges();
  loadLeaderboard();
  loadAllUsers();

  // Periodic dashboard refresh (every 30s) for live tracking
  setInterval(() => loadDashboard(), 30000);

  WWRealtime.subscribe({ event: 'INSERT', schema: 'public', table: 'points_transactions' }, () => { loadLeaderboard(); loadDashboard(); });
  WWRealtime.subscribe({ event: 'UPDATE', schema: 'public', table: 'society_scores' }, () => { loadLeaderboard(); loadProblems(); loadDashboard(); });
  WWRealtime.subscribe({ event: 'INSERT', schema: 'public', table: 'collection_requests' }, () => loadDashboard());
  WWRealtime.subscribe({ event: 'UPDATE', schema: 'public', table: 'collection_requests' }, () => { loadCollections(); loadDashboard(); });
  WWRealtime.subscribe({ event: 'INSERT', schema: 'public', table: 'society_problems' }, () => { loadProblems(); loadDashboard(); });
  WWRealtime.subscribe({ event: 'UPDATE', schema: 'public', table: 'society_problems' }, () => loadProblems());
  WWRealtime.subscribe({ event: 'INSERT', schema: 'public', table: 'problem_comments' }, () => loadProblems());
  WWRealtime.subscribe({ event: '*', schema: 'public', table: 'challenge_completions' }, () => loadChallenges());
  WWRealtime.subscribe({ event: 'INSERT', schema: 'public', table: 'dumping_reports' }, () => { loadReports(); loadDashboard(); });
}

function showTab(name) {
  document.querySelectorAll('.page-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  ['overview', 'verifications', 'reports', 'problems', 'challenges', 'leaderboard', 'quizzes', 'users'].forEach((t) => $('tab-' + t).classList.toggle('hidden', t !== name));
  if (name === 'verifications') loadCollections();
  if (name === 'reports') loadReports();
  if (name === 'problems') loadProblems();
  if (name === 'challenges') loadChallenges();
  if (name === 'quizzes') loadQuizResults();
}

// ---------- Overview ----------

async function loadDashboard() {
  try {
    const { kpis, hotspots, trends, areaBreakdown, collectorActivity, feed } = await WW.api('/api/admin/dashboard');

    // KPIs
    $('kpi-residents').textContent = kpis.residents;
    $('kpi-collectors').textContent = kpis.collectors;
    $('kpi-requests').textContent = kpis.requests;
    $('kpi-reports').textContent = kpis.pending_reports;
    $('kpi-problems').textContent = kpis.open_problems;

    // Pipeline
    $('pipe-pending').textContent = kpis.pending_requests;
    $('pipe-collected').textContent = kpis.collected_requests;
    $('pipe-verified').textContent = kpis.verified_requests;
    $('pipe-flagged').textContent = kpis.flagged_requests;
    $('pipe-rejected').textContent = kpis.rejected_requests;
    renderPipelineBar(kpis);

    // Area breakdown
    renderAreaBreakdown(areaBreakdown);

    // Collector activity
    renderCollectorActivity(collectorActivity);

    // Trends chart
    renderTrendsChart(trends);

    // Hotspots
    renderHotspots(hotspots);

    // Activity feed
    renderActivityFeed(feed);
  } catch (err) { WW.toast(err.message, true); }
}

function renderPipelineBar(kpis) {
  const total = kpis.requests || 1;
  const segments = [
    { label: 'Pending', count: kpis.pending_requests, color: '#f59e0b' },
    { label: 'Collected', count: kpis.collected_requests, color: '#3b82f6' },
    { label: 'Verified', count: kpis.verified_requests, color: '#22c55e' },
    { label: 'Flagged', count: kpis.flagged_requests, color: '#f97316' },
    { label: 'Rejected', count: kpis.rejected_requests, color: '#ef4444' },
  ];
  $('pipeline-bar-wrap').innerHTML =
    '<div class="pipeline-bar">' +
    segments.map((s) => {
      const pct = Math.round((s.count / total) * 100);
      return pct > 0 ? `<div class="pipeline-seg" style="width:${pct}%; background:${s.color};" title="${s.label}: ${s.count} (${pct}%)"></div>` : '';
    }).join('') +
    '</div>' +
    '<div class="pipeline-legend">' +
    segments.map((s) => `<span class="pipeline-legend-item"><span class="pipeline-legend-dot" style="background:${s.color};"></span>${s.label}: ${s.count}</span>`).join('') +
    '</div>';
}

function renderAreaBreakdown(areas) {
  const el = $('area-breakdown');
  if (!areas || !areas.length) { el.innerHTML = '<p class="muted">No area data yet.</p>'; return; }
  el.innerHTML = areas.map((a) => {
    const rate = a.verifyRate;
    const rateColor = rate >= 60 ? 'var(--green-500)' : rate >= 30 ? 'var(--amber-500)' : 'var(--red-500)';
    return `
    <div class="area-card">
      <div class="area-header">
        <span class="area-name">${WW.escapeHtml(a.name)}</span>
        <span class="area-rate" style="color:${rateColor};">${rate}% verified</span>
      </div>
      <div class="area-stats">
        <span>📦 ${a.requests} req</span>
        <span>✅ ${a.verified} verified</span>
        <span>🔍 ${a.flagged} flagged</span>
        <span>⏳ ${a.pending} pending</span>
        <span>🚨 ${a.reports} reports</span>
      </div>
      <div class="area-bar-wrap">
        <div class="area-bar">
          <div class="area-bar-seg" style="width:${a.requests ? (a.verified / a.requests) * 100 : 0}%; background:var(--green-500);"></div>
          <div class="area-bar-seg" style="width:${a.requests ? (a.flagged / a.requests) * 100 : 0}%; background:var(--amber-500);"></div>
        </div>
      </div>
      ${a.societies.length ? `<div class="area-societies">${a.societies.map((s) => `<span class="area-soc-tag">${WW.escapeHtml(s)}</span>`).join('')}</div>` : ''}
    </div>`;
  }).join('');
}

function renderCollectorActivity(collectors) {
  const el = $('collector-activity');
  if (!collectors || !collectors.length) { el.innerHTML = '<p class="muted">No collectors yet.</p>'; return; }
  el.innerHTML = collectors.map((c) => {
    const lastTime = c.lastRequest?.after_timestamp || c.lastRequest?.before_timestamp;
    const isActive = lastTime && (Date.now() - new Date(lastTime).getTime() < 3600000);
    const statusClass = isActive ? 'online' : 'offline';
    return `
    <div class="collector-card">
      <div class="collector-header">
        <span class="collector-name">${WW.escapeHtml(c.name)}</span>
        <span class="collector-status ${statusClass}">${isActive ? '● Active' : '○ Inactive'}</span>
      </div>
      <div class="collector-stats">
        <span>📍 ${WW.escapeHtml(c.area)}</span>
        <span>✅ ${c.totalCompleted} completed</span>
        <span>📦 ${c.pendingAssigned} in progress</span>
      </div>
      ${lastTime ? `<div class="collector-last">Last activity: ${WW.fmtDate(lastTime)}</div>` : '<div class="collector-last">No activity yet</div>'}
    </div>`;
  }).join('');
}

function renderTrendsChart(trends) {
  const el = $('trends-chart');
  if (!trends || !trends.length) { el.innerHTML = '<p class="muted">No trend data.</p>'; return; }
  const maxVal = Math.max(1, ...trends.map((t) => Math.max(t.requests, t.verified, t.reports)));
  el.innerHTML =
    '<div class="trends-chart-wrap">' +
    trends.map((t) => {
      const reqH = Math.round((t.requests / maxVal) * 100);
      const verH = Math.round((t.verified / maxVal) * 100);
      const repH = Math.round((t.reports / maxVal) * 100);
      const day = t.date.slice(5);
      return `
      <div class="trend-col" title="${t.date}\nRequests: ${t.requests}\nVerified: ${t.verified}\nReports: ${t.reports}">
        <div class="trend-bars">
          <div class="trend-bar blue" style="height:${reqH}%;"></div>
          <div class="trend-bar green" style="height:${verH}%;"></div>
          <div class="trend-bar red" style="height:${repH}%;"></div>
        </div>
        <div class="trend-label">${day}</div>
      </div>`;
    }).join('') +
    '</div>' +
    '<div class="trends-legend">' +
    '<span class="trends-legend-item"><span class="trends-legend-dot" style="background:#3b82f6;"></span>Requests</span>' +
    '<span class="trends-legend-item"><span class="trends-legend-dot" style="background:#22c55e;"></span>Verified</span>' +
    '<span class="trends-legend-item"><span class="trends-legend-dot" style="background:#ef4444;"></span>Reports</span>' +
    '</div>';
}

function renderHotspots(hotspots) {
  const el = $('hotspots');
  if (!hotspots || !hotspots.length) { el.innerHTML = '<p class="muted">No verified dumping hotspots yet.</p>'; return; }
  el.innerHTML = hotspots.map((h) => `
    <div class="hotspot-card">
      <div class="hotspot-header">
        <span class="hotspot-count">${h.count} incident${h.count > 1 ? 's' : ''}</span>
        ${h.area ? `<span class="hotspot-area">${WW.escapeHtml(h.area)}</span>` : ''}
      </div>
      <div class="hotspot-meta">${h.sample.map((s) => WW.fmtDate(s.timestamp)).join(' · ')}</div>
      <a class="hotspot-map" href="https://www.google.com/maps?q=${h.lat},${h.lng}" target="_blank">📍 View on map</a>
    </div>`).join('');
}

function renderActivityFeed(feed) {
  const el = $('activity-feed');
  if (!feed || !feed.length) { el.innerHTML = '<p class="muted">No activity yet.</p>'; return; }
  el.innerHTML = feed.map((e) => {
    const icon = e.type === 'request' ? '📦' : e.type === 'report' ? '🚨' : e.type === 'problem' ? '🔧' : '💰';
    const statusClass = e.status === 'verified' ? 'green' : e.status === 'rejected' || e.status === 'flagged' ? 'red' : e.status === 'pending' ? 'amber' : 'blue';
    return `
    <div class="feed-item">
      <span class="feed-icon">${icon}</span>
      <span class="feed-detail">${WW.escapeHtml(e.detail)}</span>
      <span class="feed-time">${WW.fmtDate(e.timestamp)}</span>
    </div>`;
  }).join('');
}

// ---------- Verifications ----------

async function loadCollections() {
  try {
    const { collections } = await WW.api('/api/admin/collections');
    const flagged = collections.filter((c) => c.status === 'flagged');
    const rest = collections.filter((c) => c.status !== 'flagged');
    const rows = (arr, label) => arr.length
      ? `<h4 style="margin:12px 0;">${label} (${arr.length})</h4>
         <table><thead><tr><th>${t('admin.date')}</th><th>${t('admin.resident')}</th><th>${t('admin.collector')}</th><th>${t('admin.photos')}</th><th>${t('admin.score')}</th><th>${t('admin.status')}</th><th>${t('admin.action')}</th></tr></thead><tbody>
         ${arr.map((c) => `
           <tr>
             <td>${WW.fmtDate(c.before_timestamp)}</td>
             <td>${WW.escapeHtml(c.residents?.name || '—')}</td>
             <td>${WW.escapeHtml(c.collectors?.name || '—')}</td>
             <td class="photo-pair">
               ${c.before_photo_url ? `<img class="photo-thumb" src="${c.before_photo_url}" />` : '<span class="muted">—</span>'}
               ${c.after_photo_url ? `<img class="photo-thumb" src="${c.after_photo_url}" />` : ''}
             </td>
             <td>${c.match_score != null ? (c.match_score * 100).toFixed(0) + '%' : '—'}</td>
             <td>${WW.badge(c.status)}</td>
            <td>${c.status === 'flagged' ? `
                <button style="font-size:0.8rem; padding:6px 10px; margin-bottom:4px;" onclick="overrideCollection('${c.id}','verified')">✓ ${t('admin.verifyBtn')}</button>
                <button class="danger" style="font-size:0.8rem; padding:6px 10px;" onclick="overrideCollection('${c.id}','rejected')">✗ ${t('admin.rejectBtn')}</button>` : '—'}</td>
           </tr>`).join('')}
         </tbody></table>`
      : '<p class="muted">' + label + '.</p>';
    $('collections-list').innerHTML = rows(flagged, '🔍 ' + t('admin.flaggedPending')) + rows(rest, t('admin.recent'));
  } catch (err) { WW.toast(err.message, true); }
}

async function overrideCollection(id, verdict) {
  const reason = prompt(t('admin.reasonFor') + ' ' + verdict + '?');
  try {
    const data = await WW.api(`/api/admin/collections/${id}/override`, { method: 'POST', body: { verdict, reason } });
    WW.toast(t('admin.markedResult') + ': ' + verdict + '. Points: ' + (data.points ? data.points.length : '0'));
    loadCollections();
    loadDashboard();
    loadLeaderboard();
  } catch (err) { WW.toast(err.message, true); }
}

// ---------- Reports ----------

async function loadReports() {
  try {
    const { reports } = await WW.api('/api/reports/all');
    $('reports-list').innerHTML = reports.length
      ? `<table>
          <thead><tr><th>${t('admin.date')}</th><th>${t('admin.reporter')}</th><th>${t('admin.photos')}</th><th>${t('admin.description2')}</th><th>${t('admin.status')}</th><th>${t('admin.action')}</th></tr></thead>
          <tbody>
          ${reports.map((r) => `
            <tr>
              <td>${WW.fmtDate(r.created_at)}</td>
              <td>${WW.escapeHtml(r.profiles?.name || '—')}</td>
              <td>${r.photo_url ? `<a href="${r.photo_url}" target="_blank"><img class="photo-thumb" src="${r.photo_url}" /></a>` : '—'}</td>
              <td>${WW.escapeHtml(r.description || '—')}</td>
              <td>${WW.badge(r.status)}</td>
              <td>${r.status === 'pending' ? `
                <button style="font-size:0.8rem; padding:6px 10px; margin-bottom:4px;" onclick="verifyReport('${r.id}','verified')">✓ ${t('admin.verifyBtn')}</button>
                <button class="danger" style="font-size:0.8rem; padding:6px 10px; margin-bottom:4px;" onclick="verifyReport('${r.id}','rejected')">✗ ${t('admin.rejectBtn')}</button>
                <button class="secondary" style="font-size:0.8rem; padding:6px 10px;" onclick="verifyReport('${r.id}','duplicate')">${t('admin.duplicateBtn')}</button>` : '—'}</td>
            </tr>`).join('')}
          </tbody></table>`
      : '<p class="muted">' + t('admin.noSocietyProblems') + '</p>';
  } catch (err) { WW.toast(err.message, true); }
}

async function verifyReport(id, verdict) {
  const reason = prompt(t('admin.reasonFor') + ' ' + verdict + '?');
  try {
    const data = await WW.api(`/api/reports/${id}/verify`, { method: 'POST', body: { verdict, reason } });
    WW.toast(t('admin.reportResult') + ': ' + data.status + '. Points: ' + (data.points ? '+15' : '0'));
    loadReports();
    loadDashboard();
    loadLeaderboard();
  } catch (err) { WW.toast(err.message, true); }
}

// ---------- Problems ----------

async function loadProblems() {
  try {
    const { problems } = await WW.api('/api/problems/all');
    $('problems-list').innerHTML = problems.length
      ? problems.map((p) => `
        <div class="card" style="margin-bottom:14px; border-left:4px solid ${p.society_score >= 70 ? 'var(--green-500)' : p.society_score >= 40 ? 'var(--amber-500)' : 'var(--red-500)'};">
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <h4 style="flex:1;">${WW.escapeHtml(p.title)}</h4>
            ${WW.badge(p.status)}
          </div>
          <p class="muted">${t('admin.societyLabel')}: <b>${WW.escapeHtml(p.societies?.name || '—')}</b>
            · ${t('admin.societyScore')}: <b style="color:var(--green-700);">${p.society_score.toFixed(0)}</b>
            · ${t('admin.comments')}: ${p.comment_count}
            · ${t('admin.by')} ${WW.escapeHtml(p.profiles?.name || '—')} · ${WW.fmtDate(p.created_at)}</p>
          ${p.description ? `<p>${WW.escapeHtml(p.description)}</p>` : ''}
          ${p.photo_url ? `<img class="photo-thumb" src="${p.photo_url}" style="margin-top:6px;" />` : ''}
          <div style="margin-top:10px;">
            ${(p.comments || []).map((c) => `
              <div style="background:var(--bg); border-radius:8px; padding:8px 12px; margin-bottom:6px;">
                <span style="font-size:0.8rem; font-weight:700;">${WW.escapeHtml(c.profiles?.name || 'user')}</span>
                <span class="hint"> · ${WW.fmtDate(c.created_at)}</span>
                <div>${WW.escapeHtml(c.content)}</div>
              </div>`).join('')}
          </div>
          <div style="margin-top:10px; display:flex; gap:8px;">
            <select id="st-${p.id}" class="hidden"> </select>
            ${['open', 'in_progress', 'resolved'].map((s) => `
              <button class="${s === 'open' ? '' : 'secondary'}" style="font-size:0.8rem; padding:6px 10px;" onclick="setProblemStatus('${p.id}','${s}')">${s.replace('_', ' ')}</button>`).join('')}
          </div>
        </div>`).join('')
      : '<p class="muted">' + t('admin.noSocietyProblems') + '</p>';
  } catch (err) { WW.toast(err.message, true); }
}

async function setProblemStatus(id, status) {
  try {
    await WW.api(`/api/problems/${id}/status`, { method: 'POST', body: { status } });
    WW.toast(t('admin.problemStatusUpdated'));
    loadProblems();
  } catch (err) { WW.toast(err.message, true); }
}

// ---------- Challenges ----------

async function loadChallenges() {
  try {
    const data = await WW.api('/api/challenges');
    $('challenges-active').innerHTML = data.active.length
      ? data.active.map((c) => `
        <div class="card" style="margin-bottom:12px; border-left:4px solid var(--amber-500);">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <h4 style="flex:1;">${WW.escapeHtml(c.title)}</h4>
            <span class="badge ${c.challenge_type === 'collections' ? 'blue' : c.challenge_type === 'reports' ? 'red' : c.challenge_type === 'score' ? 'green' : 'amber'}">${WW.escapeHtml(c.challenge_type)}</span>
            <span class="hint">⏳ ${c.days_left} ${t('admin.daysLeft')} · +${c.reward_points} ${t('admin.pts')} · ${t('admin.ends')} ${c.ends_at}</span>
            <button class="danger" style="font-size:0.8rem; padding:6px 10px;" onclick="closeChallenge('${c.id}')">${t('admin.closeBtn')}</button>
          </div>
          ${c.description ? `<p class="muted">${WW.escapeHtml(c.description)}</p>` : ''}
          ${c.progress_rows.map((r) => {
            const pct = Math.min(100, Math.round((r.progress / c.target) * 100));
            return `
            <div style="margin:8px 0;">
              <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
                <span>${WW.escapeHtml(r.society_name)}</span>
                <span><b>${r.progress} / ${c.target}</b> (${pct}%) ${r.completed ? '· 🎉 ' + t('admin.completed') : ''}</span>
              </div>
              <div class="progress"><div class="bar" style="width:${pct}%"></div></div>
            </div>`;
          }).join('')}
        </div>`).join('')
      : '<p class="muted">' + t('admin.noActiveChallenges') + '</p>';

    $('challenges-history').innerHTML = data.history.length
      ? data.history.map((c) => `
        <div class="rank-row">
          <div class="name" style="flex:1;">${WW.escapeHtml(c.title)} <span class="badge blue">${WW.escapeHtml(c.challenge_type)}</span></div>
          <div class="pts" style="font-size:0.8rem;">${c.status} · ended ${c.ends_at}</div>
        </div>`).join('')
      : '<p class="muted">' + t('admin.noChallengesYet') + '</p>';
  } catch (err) { WW.toast(err.message, true); }
}

async function createChallenge() {
  const body = {
    title: $('ch-title').value.trim(),
    challenge_type: $('ch-type').value,
    target: $('ch-target').value,
    reward_points: $('ch-reward').value,
    starts_at: $('ch-start').value,
    ends_at: $('ch-end').value,
    description: $('ch-desc').value.trim(),
  };
  if (!body.title) return WW.toast(t('admin.titleRequired'), true);
  if (!body.starts_at || !body.ends_at) return WW.toast(t('admin.pickDates'), true);
  try {
    const { challenge } = await WW.api('/api/challenges', { method: 'POST', body });
    WW.toast(t('admin.challengeLaunched'));
    $('ch-title').value = ''; $('ch-desc').value = '';
    loadChallenges();
  } catch (err) { WW.toast(err.message, true); }
}

async function closeChallenge(id) {
  if (!confirm(t('admin.closeChallengeConfirm'))) return;
  try {
    await WW.api('/api/challenges/' + id, { method: 'PATCH', body: { status: 'cancelled' } });
    WW.toast(t('admin.challengeClosed'));
    loadChallenges();
  } catch (err) { WW.toast(err.message, true); }
}

// ---------- Leaderboard ----------

async function loadLeaderboard() {
  try {
    const data = await WW.api('/api/leaderboard/all');
    const board = (arr, extra) => arr.slice(0, 20).map((r, i) => `
      <div class="rank-row">
        <div class="pos ${i < 3 ? 'top' : ''}">${i + 1}</div>
        <div class="name">${WW.escapeHtml(r.name)}</div>
        <div class="pts">${extra === 'score' ? r.score?.toFixed(0) : r.points}</div>
      </div>`).join('') || '<p class="muted">' + t('admin.empty') + '</p>';
    $('lb-residents').innerHTML = board(data.residents, 'points');
    $('lb-collectors').innerHTML = board(data.collectors, 'points');
    $('lb-societies').innerHTML = data.societies.map((s, i) => `
      <div class="rank-row">
        <div class="pos ${i < 3 ? 'top' : ''}">${i + 1}</div>
        <div class="name">${WW.escapeHtml(s.societies?.name || t('admin.society'))}</div>
        <div class="pts">${s.score?.toFixed(0)}</div>
      </div>`).join('') || '<p class="muted">' + t('admin.noSocietyScores') + '</p>';
  } catch (err) { WW.toast(err.message, true); }
}

// ---------- Users / trace ----------

async function loadAllUsers() {
  try {
    const data = await WW.api('/api/leaderboard/all');
    window._allUsers = [...data.residents, ...data.collectors].map((u) => ({ id: u.id, name: u.name, points: u.points }));
  } catch {}
}

async function searchUser() {
  const q = $('user-search').value.trim().toLowerCase();
  if (!q) return;
  const matches = (window._allUsers || []).filter((u) => u.name.toLowerCase().includes(q) || u.id.includes(q));
  if (!matches.length) { $('user-results').innerHTML = '<p class="muted">' + t('admin.noUsersMatched') + '</p>'; return; }
  $('user-results').innerHTML = matches.map((u) => `
    <div class="rank-row">
      <div class="name">${WW.escapeHtml(u.name)} (${u.points} pts)</div>
      <button class="secondary" style="font-size:0.8rem; padding:6px 10px;" onclick="viewUser('${u.id}')">${t('admin.fullTrace')} →</button>
    </div>`).join('');
}

async function viewUser(id) {
  try {
    const d = await WW.api('/api/admin/users/' + id + '/detail');
    const p = d.profile;
    $('user-results').innerHTML = `
      <div class="card" style="margin-top:12px;">
        <h3>${WW.escapeHtml(p.name)} <span class="badge ${p.role === 'admin' ? 'blue' : p.role === 'collector' ? 'amber' : 'green'}">${p.role}</span></h3>
        <p class="muted">${WW.escapeHtml(p.email)} · ${WW.escapeHtml(p.phone || t('admin.noPhone'))} · ${t('admin.societyLabel')}: ${WW.escapeHtml(p.societies?.name || '—')} · Area: ${WW.escapeHtml(p.areas?.name || '—')}</p>
        <p class="muted">${t('admin.address')}: ${WW.escapeHtml(p.address_text || '—')} · ${t('admin.gps')}: ${p.gps_lat != null ? p.gps_lat.toFixed(5) + ', ' + p.gps_lng.toFixed(5) : '—'} · ${t('admin.points')}: <b>${p.points}</b> · ${t('admin.active')}: ${p.active}</p>

        <h4 style="margin-top:14px;">${t('admin.pointsLedger')}</h4>
        ${ledger(p, d.transactions)}
        <h4 style="margin-top:14px;">${t('admin.collectionRequests2')} (${d.requests.length})</h4>
        ${d.requests.length ? `<table><thead><tr><th>${t('admin.date')}</th><th>${t('admin.status')}</th><th>${t('admin.photos')}</th><th>${t('admin.score')}</th></tr></thead><tbody>
          ${d.requests.map((r) => `<tr>
            <td>${WW.fmtDate(r.before_timestamp)}</td>
            <td>${WW.badge(r.status)}</td>
            <td class="photo-pair">${r.before_photo_url ? `<img class="photo-thumb" src="${r.before_photo_url}"/>` : ''}${r.after_photo_url ? `<img class="photo-thumb" src="${r.after_photo_url}"/>` : ''}</td>
            <td>${r.match_score != null ? (r.match_score * 100).toFixed(0) + '%' : '—'}</td></tr>`).join('')}
        </tbody></table>` : '<p class="muted">' + t('admin.none') + '</p>'}
        <h4 style="margin-top:14px;">${t('admin.dumpingReports2')} (${d.reports.length})</h4>
        ${d.reports.length ? `<table><thead><tr><th>${t('admin.date')}</th><th>${t('admin.status')}</th><th>${t('admin.photos')}</th></tr></thead><tbody>
          ${d.reports.map((r) => `<tr><td>${WW.fmtDate(r.created_at)}</td><td>${WW.badge(r.status)}</td><td>${r.photo_url ? `<a href="${r.photo_url}" target="_blank"><img class="photo-thumb" src="${r.photo_url}"/></a>` : '—'}</td></tr>`).join('')}
        </tbody></table>` : '<p class="muted">' + t('admin.none') + '</p>'}
        <h4 style="margin-top:14px;">${t('admin.societyProblemsPosted')} (${d.problems.length})</h4>
        ${d.problems.length ? d.problems.map((x) => `<p>• ${WW.escapeHtml(x.title)} — ${WW.badge(x.status)}</p>`).join('') : '<p class="muted">' + t('admin.none') + '</p>'}
      </div>`;
    $('user-results').scrollIntoView({ behavior: 'smooth' });
  } catch (err) { WW.toast(err.message, true); }
}

function ledger(p, txns) {
  if (!txns.length) return '<p class="muted">' + t('admin.noTransactions') + '</p>';
  return `<table><thead><tr><th>${t('admin.date')}</th><th>${t('admin.reason2')}</th><th style="text-align:right;">Δ</th><th>${t('admin.balanceContext')}</th></tr></thead><tbody>
    ${txns.map((t) => `<tr><td>${WW.fmtDate(t.created_at)}</td><td>${WW.escapeHtml(t.reason)}</td>
      <td style="text-align:right; font-weight:700; color:${t.delta >= 0 ? 'var(--green-600)' : 'var(--red-500)'};">${t.delta >= 0 ? '+' : ''}${t.delta}</td>
      <td class="muted">${t.source_type} #${t.source_id?.slice(0, 8) || ''}</td></tr>`).join('')}
  </tbody></table>`;
}

// ---------- Quiz results ----------

async function loadQuizResults() {
  try {
    const [sessionsData, statsData] = await Promise.all([
      WW.api('/api/learn-earn/all'),
      WW.api('/api/learn-earn/stats'),
    ]);

    $('kpi-quiz-sessions').textContent = statsData.totalSessions;
    $('kpi-quiz-avg').textContent = statsData.avgScore + '/10';
    $('kpi-quiz-points').textContent = statsData.totalPointsAwarded;

    $('quiz-results-list').innerHTML = sessionsData.sessions.length
      ? `<table><thead><tr><th>Date</th><th>Resident</th><th>Score</th><th>Points</th></tr></thead><tbody>
          ${sessionsData.sessions.map((s) => `
            <tr>
              <td>${WW.fmtDate(s.created_at)}</td>
              <td>${WW.escapeHtml(s.profiles?.name || '—')}</td>
              <td>${s.score}/${s.total}</td>
              <td style="font-weight:700; color:var(--green-600);">+${s.points_earned}</td>
            </tr>`).join('')}
        </tbody></table>`
      : '<p class="muted">No quizzes taken yet.</p>';
  } catch (err) { WW.toast(err.message, true); }
}

init();
