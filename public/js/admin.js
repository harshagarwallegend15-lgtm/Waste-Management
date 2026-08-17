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

  WWRealtime.subscribe({ event: 'INSERT', schema: 'public', table: 'points_transactions' }, () => loadLeaderboard());
  WWRealtime.subscribe({ event: 'UPDATE', schema: 'public', table: 'society_scores' }, () => { loadLeaderboard(); loadProblems(); });
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
  ['overview', 'verifications', 'reports', 'problems', 'challenges', 'leaderboard', 'users'].forEach((t) => $('tab-' + t).classList.toggle('hidden', t !== name));
  if (name === 'verifications') loadCollections();
  if (name === 'reports') loadReports();
  if (name === 'problems') loadProblems();
  if (name === 'challenges') loadChallenges();
}

// ---------- Overview ----------

async function loadDashboard() {
  try {
    const { kpis, hotspots, trends } = await WW.api('/api/admin/dashboard');
    $('kpi-residents').textContent = kpis.residents;
    $('kpi-collectors').textContent = kpis.collectors;
    $('kpi-requests').textContent = kpis.requests;
    $('kpi-verified').textContent = kpis.verified_requests;
    $('kpi-flagged').textContent = kpis.flagged_requests;
    $('kpi-reports').textContent = kpis.pending_reports;
    $('kpi-verified-reports').textContent = kpis.verified_reports;
    $('kpi-problems').textContent = kpis.open_problems;

    $('hotspots').innerHTML = hotspots.length
      ? hotspots.map((h) => `
        <div class="card hotspot" style="margin-bottom:10px;">
          <strong>${h.count} incident${h.count > 1 ? 's' : ''}</strong> ${h.area ? `· ${WW.escapeHtml(h.area)}` : ''}
          <div class="pin"><a href="https://www.google.com/maps?q=${h.lat},${h.lng}" target="_blank">View on map</a></div>
          <p class="hint">${h.sample.map((s) => WW.fmtDate(s.timestamp)).join(', ')}</p>
        </div>`).join('')
      : '<p class="muted">No verified dumping reports yet.</p>';

    $('trends').innerHTML = `
      <table>
        <thead><tr><th>Day</th><th>Requests</th><th>Verified</th><th>Reports</th><th>Verified</th></tr></thead>
        <tbody>${trends.map((t) => `
          <tr><td>${t.date}</td><td>${t.requests}</td><td>${t.verified}</td><td>${t.reports}</td><td>${t.verified_reports}</td></tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) { WW.toast(err.message, true); }
}

// ---------- Verifications ----------

async function loadCollections() {
  try {
    const { collections } = await WW.api('/api/admin/collections');
    const flagged = collections.filter((c) => c.status === 'flagged');
    const rest = collections.filter((c) => c.status !== 'flagged');
    const rows = (arr, label) => arr.length
      ? `<h4 style="margin:12px 0;">${label} (${arr.length})</h4>
         <table><thead><tr><th>Date</th><th>Resident</th><th>Collector</th><th>Photos</th><th>Score</th><th>Status</th><th>Action</th></tr></thead><tbody>
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
               <button style="font-size:0.8rem; padding:6px 10px; margin-bottom:4px;" onclick="overrideCollection('${c.id}','verified')">✓ Verify</button>
               <button class="danger" style="font-size:0.8rem; padding:6px 10px;" onclick="overrideCollection('${c.id}','rejected')">✗ Reject</button>` : '—'}</td>
           </tr>`).join('')}
         </tbody></table>`
      : '<p class="muted">' + label + '.</p>';
    $('collections-list').innerHTML = rows(flagged, '🔍 Flagged — needs your review') + rows(rest, 'Recent');
  } catch (err) { WW.toast(err.message, true); }
}

async function overrideCollection(id, verdict) {
  const reason = prompt(`Reason for ${verdict}?`);
  try {
    const data = await WW.api(`/api/admin/collections/${id}/override`, { method: 'POST', body: { verdict, reason } });
    WW.toast(`Marked ${verdict}. Points: ${data.points ? data.points.length + ' awards' : 'none (already processed)'}`);
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
          <thead><tr><th>Date</th><th>Reporter</th><th>Photo</th><th>Description</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
          ${reports.map((r) => `
            <tr>
              <td>${WW.fmtDate(r.created_at)}</td>
              <td>${WW.escapeHtml(r.profiles?.name || '—')}</td>
              <td>${r.photo_url ? `<a href="${r.photo_url}" target="_blank"><img class="photo-thumb" src="${r.photo_url}" /></a>` : '—'}</td>
              <td>${WW.escapeHtml(r.description || '—')}</td>
              <td>${WW.badge(r.status)}</td>
              <td>${r.status === 'pending' ? `
                <button style="font-size:0.8rem; padding:6px 10px; margin-bottom:4px;" onclick="verifyReport('${r.id}','verified')">✓ Verify</button>
                <button class="danger" style="font-size:0.8rem; padding:6px 10px; margin-bottom:4px;" onclick="verifyReport('${r.id}','rejected')">✗ Reject</button>
                <button class="secondary" style="font-size:0.8rem; padding:6px 10px;" onclick="verifyReport('${r.id}','duplicate')">Duplicate</button>` : '—'}</td>
            </tr>`).join('')}
          </tbody></table>`
      : '<p class="muted">No reports yet.</p>';
  } catch (err) { WW.toast(err.message, true); }
}

async function verifyReport(id, verdict) {
  const reason = prompt(`Reason for ${verdict}?`);
  try {
    const data = await WW.api(`/api/reports/${id}/verify`, { method: 'POST', body: { verdict, reason } });
    WW.toast(`Report ${data.status}. Points awarded: ${data.points ? 'yes (+15)' : 'no'}`);
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
          <p class="muted">Society: <b>${WW.escapeHtml(p.societies?.name || '—')}</b>
            · Society score: <b style="color:var(--green-700);">${p.society_score.toFixed(0)}</b>
            · Comments: ${p.comment_count}
            · by ${WW.escapeHtml(p.profiles?.name || '—')} · ${WW.fmtDate(p.created_at)}</p>
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
      : '<p class="muted">No society problems yet.</p>';
  } catch (err) { WW.toast(err.message, true); }
}

async function setProblemStatus(id, status) {
  try {
    await WW.api(`/api/problems/${id}/status`, { method: 'POST', body: { status } });
    WW.toast('Problem status updated');
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
            <span class="hint">⏳ ${c.days_left} day${c.days_left === 1 ? '' : 's'} left · +${c.reward_points} pts · ends ${c.ends_at}</span>
            <button class="danger" style="font-size:0.8rem; padding:6px 10px;" onclick="closeChallenge('${c.id}')">Close</button>
          </div>
          ${c.description ? `<p class="muted">${WW.escapeHtml(c.description)}</p>` : ''}
          ${c.progress_rows.map((r) => {
            const pct = Math.min(100, Math.round((r.progress / c.target) * 100));
            return `
            <div style="margin:8px 0;">
              <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
                <span>${WW.escapeHtml(r.society_name)}</span>
                <span><b>${r.progress} / ${c.target}</b> (${pct}%) ${r.completed ? '· 🎉 completed' : ''}</span>
              </div>
              <div class="progress"><div class="bar" style="width:${pct}%"></div></div>
            </div>`;
          }).join('')}
        </div>`).join('')
      : '<p class="muted">No active challenges. Create one above.</p>';

    $('challenges-history').innerHTML = data.history.length
      ? data.history.map((c) => `
        <div class="rank-row">
          <div class="name" style="flex:1;">${WW.escapeHtml(c.title)} <span class="badge blue">${WW.escapeHtml(c.challenge_type)}</span></div>
          <div class="pts" style="font-size:0.8rem;">${c.status} · ended ${c.ends_at}</div>
        </div>`).join('')
      : '<p class="muted">No completed or cancelled challenges yet.</p>';
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
  if (!body.title) return WW.toast('Title is required', true);
  if (!body.starts_at || !body.ends_at) return WW.toast('Pick start and end dates', true);
  try {
    const { challenge } = await WW.api('/api/challenges', { method: 'POST', body });
    WW.toast(`Challenge "${challenge.title}" launched`);
    $('ch-title').value = ''; $('ch-desc').value = '';
    loadChallenges();
  } catch (err) { WW.toast(err.message, true); }
}

async function closeChallenge(id) {
  if (!confirm('Close this challenge? Active progress is frozen and no further bonuses are paid.')) return;
  try {
    await WW.api('/api/challenges/' + id, { method: 'PATCH', body: { status: 'cancelled' } });
    WW.toast('Challenge closed');
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
      </div>`).join('') || '<p class="muted">Empty</p>';
    $('lb-residents').innerHTML = board(data.residents, 'points');
    $('lb-collectors').innerHTML = board(data.collectors, 'points');
    $('lb-societies').innerHTML = data.societies.map((s, i) => `
      <div class="rank-row">
        <div class="pos ${i < 3 ? 'top' : ''}">${i + 1}</div>
        <div class="name">${WW.escapeHtml(s.societies?.name || 'Society')}</div>
        <div class="pts">${s.score?.toFixed(0)}</div>
      </div>`).join('') || '<p class="muted">No society scores yet</p>';
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
  if (!matches.length) { $('user-results').innerHTML = '<p class="muted">No users matched.</p>'; return; }
  $('user-results').innerHTML = matches.map((u) => `
    <div class="rank-row">
      <div class="name">${WW.escapeHtml(u.name)} (${u.points} pts)</div>
      <button class="secondary" style="font-size:0.8rem; padding:6px 10px;" onclick="viewUser('${u.id}')">Full trace →</button>
    </div>`).join('');
}

async function viewUser(id) {
  try {
    const d = await WW.api('/api/admin/users/' + id + '/detail');
    const p = d.profile;
    $('user-results').innerHTML = `
      <div class="card" style="margin-top:12px;">
        <h3>${WW.escapeHtml(p.name)} <span class="badge ${p.role === 'admin' ? 'blue' : p.role === 'collector' ? 'amber' : 'green'}">${p.role}</span></h3>
        <p class="muted">${WW.escapeHtml(p.email)} · ${WW.escapeHtml(p.phone || 'no phone')} · Society: ${WW.escapeHtml(p.societies?.name || '—')} · Area: ${WW.escapeHtml(p.areas?.name || '—')}</p>
        <p class="muted">Address: ${WW.escapeHtml(p.address_text || '—')} · GPS: ${p.gps_lat != null ? p.gps_lat.toFixed(5) + ', ' + p.gps_lng.toFixed(5) : '—'} · Points: <b>${p.points}</b> · Active: ${p.active}</p>

        <h4 style="margin-top:14px;">Points ledger</h4>
        ${ledger(p, d.transactions)}
        <h4 style="margin-top:14px;">Collection requests (${d.requests.length})</h4>
        ${d.requests.length ? `<table><thead><tr><th>Date</th><th>Status</th><th>Photos</th><th>Score</th></tr></thead><tbody>
          ${d.requests.map((r) => `<tr>
            <td>${WW.fmtDate(r.before_timestamp)}</td>
            <td>${WW.badge(r.status)}</td>
            <td class="photo-pair">${r.before_photo_url ? `<img class="photo-thumb" src="${r.before_photo_url}"/>` : ''}${r.after_photo_url ? `<img class="photo-thumb" src="${r.after_photo_url}"/>` : ''}</td>
            <td>${r.match_score != null ? (r.match_score * 100).toFixed(0) + '%' : '—'}</td></tr>`).join('')}
        </tbody></table>` : '<p class="muted">None.</p>'}
        <h4 style="margin-top:14px;">Dumping reports (${d.reports.length})</h4>
        ${d.reports.length ? `<table><thead><tr><th>Date</th><th>Status</th><th>Photo</th></tr></thead><tbody>
          ${d.reports.map((r) => `<tr><td>${WW.fmtDate(r.created_at)}</td><td>${WW.badge(r.status)}</td><td>${r.photo_url ? `<a href="${r.photo_url}" target="_blank"><img class="photo-thumb" src="${r.photo_url}"/></a>` : '—'}</td></tr>`).join('')}
        </tbody></table>` : '<p class="muted">None.</p>'}
        <h4 style="margin-top:14px;">Society problems posted (${d.problems.length})</h4>
        ${d.problems.length ? d.problems.map((x) => `<p>• ${WW.escapeHtml(x.title)} — ${WW.badge(x.status)}</p>`).join('') : '<p class="muted">None.</p>'}
      </div>`;
    $('user-results').scrollIntoView({ behavior: 'smooth' });
  } catch (err) { WW.toast(err.message, true); }
}

function ledger(p, txns) {
  if (!txns.length) return '<p class="muted">No transactions.</p>';
  return `<table><thead><tr><th>Date</th><th>Reason</th><th style="text-align:right;">Δ</th><th>Balance context</th></tr></thead><tbody>
    ${txns.map((t) => `<tr><td>${WW.fmtDate(t.created_at)}</td><td>${WW.escapeHtml(t.reason)}</td>
      <td style="text-align:right; font-weight:700; color:${t.delta >= 0 ? 'var(--green-600)' : 'var(--red-500)'};">${t.delta >= 0 ? '+' : ''}${t.delta}</td>
      <td class="muted">${t.source_type} #${t.source_id?.slice(0, 8) || ''}</td></tr>`).join('')}
  </tbody></table>`;
}

init();
