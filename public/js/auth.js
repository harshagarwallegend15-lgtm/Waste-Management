// Shared auth logic for the three role auth pages.
const ROLE = document.body.dataset.role;

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
      showError(`This account is a ${data.profile.role}. Please use the correct login.`);
      return;
    }
    WW.setSession(data.session.access_token, data.profile);
    location.href = `/${ROLE}.html`;
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
      // No society registered near the traced location — let the resident sign
      // up under the region/area name instead.
      hint.disabled = false;
      hint.value = 'area:' + region.area_id;
      hint.textContent = `📍 ${region.name} — no society registered, join area`;
    } else if (lat != null && lng != null) {
      hint.value = '';
      hint.textContent = 'No societies registered in your city yet';
    } else {
      hint.value = '';
      hint.textContent = 'Allow location to see societies in your city';
    }
    sel.appendChild(hint);
    _societyHint(lat, lng, list, region);
    return;
  }

  const hint = document.createElement('option');
  hint.value = '';
  hint.textContent = 'Select your society… (nearest first)';
  hint.disabled = true;
  hint.selected = true;
  sel.appendChild(hint);

  const near = document.createElement('optgroup');
  near.label = '📍 Societies in your city';
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
    hint.textContent = 'Allow location to see the societies in your city, or tap “📡 Use my location”.';
    return;
  }
  if (list && list.length) {
    hint.textContent = `📍 Location traced — ${list.length} societies within ${_societies.radius ?? 'your'} city, nearest first.`;
    return;
  }
  hint.textContent = region
    ? `No society is registered in ${region.name} yet — you can join under this area and pick a society later.`
    : 'No societies are registered near this location yet.';
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
    showError('Could not load societies: ' + err.message);
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
    showError(err.message + ' — you can continue without a pin, or enter coordinates.');
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
    WW.toast('Account created! Please log in.');
    showTab('login');
    document.getElementById('login-email').value = body.email;
    document.getElementById('login-password').value = '';
  } catch (err) {
    showError(err.message);
  }
  return false;
}

if (ROLE === 'admin') {
  tabSignup?.remove();
  signupForm?.remove();
}

loadSocieties();
