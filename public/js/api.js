// Shared API + auth helpers for the WasteWise frontend.
window.WW = (() => {
  const TOKEN_KEY = 'ww_token';
  const PROFILE_KEY = 'ww_profile';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getProfile() {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY)); } catch { return null; }
  }
  function setSession(accessToken, profile) {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
  }

  async function api(path, { method = 'GET', body, form } = {}) {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload;
    if (form) {
      payload = form; // FormData
    } else if (body) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(path, { method, headers, body: payload });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Request failed');
      err.status = res.status;
      if (res.status === 401) {
        clearSession();
        location.href = '/';
      }
      throw err;
    }
    return data;
  }

  function requireRole(...roles) {
    const p = getProfile();
    if (!p) { location.href = '/'; return null; }
    if (!roles.includes(p.role)) { location.href = '/'; return null; }
    return p;
  }

  function logout() {
    clearSession();
    location.href = '/';
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function toast(msg, isError = false) {
    let t = document.querySelector('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.toggle('error', isError);
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 3200);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  const STATUS_BADGE = {
    pending: '<span class="badge amber">Pending</span>',
    collected: '<span class="badge blue">Collected</span>',
    verified: '<span class="badge green">Verified</span>',
    flagged: '<span class="badge red">Flagged</span>',
    rejected: '<span class="badge gray">Rejected</span>',
    open: '<span class="badge amber">Open</span>',
    in_progress: '<span class="badge blue">In progress</span>',
    resolved: '<span class="badge green">Resolved</span>',
    duplicate: '<span class="badge gray">Duplicate</span>',
  };
  function badge(status) { return STATUS_BADGE[status] || `<span class="badge gray">${escapeHtml(status)}</span>`; }

  return { getToken, getProfile, setSession, clearSession, api, requireRole, logout, escapeHtml, toast, fmtDate, badge };
})();
