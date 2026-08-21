// Shared auth logic for the three role auth pages.
const ROLE = document.body.dataset.role;

function _t(key) { return window.t ? window.t(key) : key; }

const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const errorBox = document.getElementById('error');

function showError(msg) {
  errorBox.textContent = msg || '';
  errorBox.classList.toggle('hidden', !msg);
}

function showTab(which) {
  tabLogin.classList.toggle('active', which === 'login');
  tabSignup?.classList.toggle('active', which === 'signup');
  loginForm.classList.toggle('hidden', which !== 'login');
  signupForm?.classList.toggle('hidden', which !== 'signup');
  showError('');
}

function togglePw(id, btn) {
  const input = document.getElementById(id);
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  if (btn) btn.textContent = show ? '🙈' : '👁';
}

async function doLogin(e) {
  e.preventDefault();
  showError('');
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    const data = await WW.api('/api/auth/login', { method: 'POST', body: { email, password } });
    if (data.profile.role !== ROLE) {
      showError(_t('auth.roleMismatch') + ' ' + data.profile.role);
      return;
    }
    WW.setSession(data.session.access_token, data.profile);
    if (ROLE === 'resident' && (!data.profile.society_id || data.profile.gps_lat == null)) {
      location.href = '/auth/location.html';
    } else {
      location.href = `/${ROLE}.html`;
    }
  } catch (err) {
    showError(err.message);
  }
  return false;
}

const _societies = { list: [], radius: null };

function renderSocietyOptions(lat, lng, list, region) {
  const sel = document.getElementById('su-society');
  if (!sel) return;
  const label = (s) => s.distance_km != null
    ? `${s.name} — ${s.distance_km < 1 ? (s.distance_km * 1000).toFixed(0) + ' m' : s.distance_km.toFixed(1) + ' km'}`
    : s.name;

  sel.innerHTML = '';

  if (!list || !list.length) {
    const hint = document.createElement('option');
    hint.disabled = true;
    hint.selected = true;
    if (lat != null && lng != null && region) {
      hint.disabled = false;
      hint.value = 'area:' + region.area_id;
      hint.textContent = `📍 ${region.name} — ${_t('auth.noSocietyJoinArea')}`;
    } else if (lat != null && lng != null) {
      hint.value = '';
      hint.textContent = _t('auth.noSocietiesInCity');
    } else {
      hint.value = '';
      hint.textContent = _t('auth.allowLocationToSeeSocieties');
    }
    sel.appendChild(hint);
    _societyHint(lat, lng, list, region);
    return;
  }

  const hint = document.createElement('option');
  hint.value = '';
  hint.textContent = _t('auth.selectSociety');
  hint.disabled = true;
  hint.selected = true;
  sel.appendChild(hint);

  const near = document.createElement('optgroup');
  near.label = '📍 ' + _t('auth.societiesInCity');
  for (const s of list) {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = label(s);
    near.appendChild(o);
  }
  sel.appendChild(near);
  _societyHint(lat, lng, list, region);
}

function _societyHint(lat, lng, list, region) {
  const hint = document.getElementById('su-society-hint');
  if (!hint) return;
  if (lat == null || lng == null) {
    hint.textContent = _t('auth.allowLocationOrTapGps');
    return;
  }
  if (list && list.length) {
    hint.textContent = `📍 ${_t('auth.locationTraced')} ${list.length} ${_t('auth.societiesWithin')} ${_societies.radius ?? _t('auth.your')} ${_t('auth.city')}, ${_t('auth.nearestFirst')}`;
    return;
  }
  hint.textContent = region
    ? `${_t('auth.noSocietyRegisteredIn')} ${region.name} ${_t('auth.joinAreaPickLater')}`
    : _t('auth.noSocietiesNearLocation');
}

async function fetchOptions(lat, lng) {
  const data = await WW.api(`/api/societies/options?lat=${lat}&lng=${lng}`);
  _societies.list = data.societies || [];
  _societies.radius = data.city_radius_km;
  return data;
}

async function loadSocieties() {
  const sel = document.getElementById('su-society');
  if (!sel) return;
  try {
    let pos = null;
    try {
      pos = await WWGps.get(true, 7000);
    } catch {
      // No GPS — do NOT dump every society; ask for location instead.
    }
    if (!pos) {
      renderSocietyOptions(null, null, [], null);
      return;
    }
    window._suGps = { lat: pos.lat, lng: pos.lng };
    const input = document.getElementById('su-gps');
    if (input && !input.value) input.value = `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;
    const data = await fetchOptions(pos.lat, pos.lng);
    renderSocietyOptions(pos.lat, pos.lng, data.societies, data.region);
  } catch (err) {
    showError(_t('auth.couldNotLoadSocieties') + ' ' + err.message);
  }
}

async function captureGps() {
  const input = document.getElementById('su-gps');
  try {
    const pos = await WWGps.get();
    window._suGps = { lat: pos.lat, lng: pos.lng };
    input.value = `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;
    const data = await fetchOptions(pos.lat, pos.lng);
    renderSocietyOptions(pos.lat, pos.lng, data.societies, data.region);
    showError('');
  } catch (err) {
    showError(err.message + ' — ' + _t('auth.continueWithoutPin'));
  }
}

async function doSignup(e) {
  e.preventDefault();
  showError('');
  const gps = window._suGps || null;
  const societySel = document.getElementById('su-society');
  const societyValue = societySel?.value || '';
  let society_id;
  let area_id;
  if (societyValue.startsWith('area:')) {
    area_id = societyValue.slice(5);
  } else if (societyValue) {
    society_id = societyValue;
  }
  const body = {
    email: document.getElementById('su-email').value.trim(),
    password: document.getElementById('su-password').value,
    role: ROLE,
    name: document.getElementById('su-name').value.trim(),
    phone: document.getElementById('su-phone')?.value.trim() || null,
    society_id: society_id || undefined,
    area_id: area_id || undefined,
    address_text: document.getElementById('su-address')?.value.trim() || null,
    gps_lat: gps ? gps.lat : null,
    gps_lng: gps ? gps.lng : null,
  };
  try {
    const data = await WW.api('/api/auth/register', { method: 'POST', body });
    // Show email verification message
    showError('');
    const signupFormEl = document.getElementById('signup-form');
    if (signupFormEl) {
      signupFormEl.classList.add('hidden');
    }
    // Show verification prompt
    const panel = document.querySelector('.auth-panel');
    if (panel) {
      const verifyDiv = document.createElement('div');
      verifyDiv.className = 'verify-email-msg';
      verifyDiv.innerHTML =
        '<div style="text-align:center;padding:20px 0;">' +
          '<div style="font-size:2.5rem;margin-bottom:12px;">✉️</div>' +
          '<h3 style="margin:0 0 8px;font-size:1.1rem;">Check your email</h3>' +
          '<p style="color:var(--c-muted);font-size:0.9rem;margin:0 0 6px;line-height:1.5;">We sent a verification link to<br><strong>' + body.email + '</strong></p>' +
          '<p style="color:var(--c-muted);font-size:0.82rem;margin:0;line-height:1.5;">Click the link in the email to verify your account, then come back and log in.</p>' +
          '<a href="/auth/' + ROLE + '.html" style="display:inline-block;margin-top:16px;padding:10px 24px;background:var(--c-accent);color:#000;border:none;border-radius:10px;font-weight:700;font-size:0.88rem;cursor:pointer;text-decoration:none;">Back to Login</a>' +
        '</div>';
      // Insert after error box
      const errorBox = document.getElementById('error');
      if (errorBox && errorBox.nextSibling) {
        errorBox.parentNode.insertBefore(verifyDiv, errorBox.nextSibling);
      } else {
        panel.appendChild(verifyDiv);
      }
    }
  } catch (err) {
    showError(err.message);
  }
  return false;
}

if (ROLE === 'admin') {
  tabSignup?.remove();
  signupForm?.remove();
}

// ---- Google Sign-In ----
async function doGoogleLogin() {
  showError('');
  try {
    const res = await fetch('/api/auth/google?role=' + encodeURIComponent(ROLE));
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      showError(data.error || 'Google sign-in unavailable');
    }
  } catch (e) {
    showError('Google sign-in failed. Please try again.');
  }
}

loadSocieties();
