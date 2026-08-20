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
      const err = new Error(data.error || t('common.requestFailed'));
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
    pending: () => '<span class="badge amber">' + t('common.pending') + '</span>',
    collected: () => '<span class="badge blue">' + t('common.collected') + '</span>',
    verified: () => '<span class="badge green">' + t('common.verified') + '</span>',
    flagged: () => '<span class="badge red">' + t('common.flagged') + '</span>',
    rejected: () => '<span class="badge gray">' + t('common.rejected') + '</span>',
    open: () => '<span class="badge amber">' + t('common.open') + '</span>',
    in_progress: () => '<span class="badge blue">' + t('common.inProgress') + '</span>',
    resolved: () => '<span class="badge green">' + t('common.resolved') + '</span>',
    duplicate: () => '<span class="badge gray">' + t('common.duplicate') + '</span>',
  };
  function badge(status) { const fn = STATUS_BADGE[status]; return fn ? fn() : `<span class="badge gray">${escapeHtml(status)}</span>`; }

  return { getToken, getProfile, setSession, clearSession, api, requireRole, logout, escapeHtml, toast, fmtDate, badge };
})();

// Client-side garbage-photo gate: validates captured images before allowing submit.
window.WWGarbage = (() => {
  /**
   * Check a photo blob against the server's garbage gate.
   * Returns { ok, score, method } on success.
   * Throws an error with a user-facing message on rejection.
   */
  async function checkPhoto(blob, label) {
    const fd = new FormData();
    fd.append('photo', blob, label || 'photo.jpg');
    if (label) fd.append('label', label);
    const res = await fetch('/api/garbage/check', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      const err = new Error(data.error || t('common.photoNotGarbage'));
      err.status = res.status;
      throw err;
    }
    return data;
  }
  return { checkPhoto };
})();
