// Shared site chrome: ambient background, particles, fonts, header + footer.
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Google Fonts (Inter + Outfit) ---
  (function () {
    var pre1 = document.createElement('link');
    pre1.rel = 'preconnect'; pre1.href = 'https://fonts.googleapis.com';
    var pre2 = document.createElement('link');
    pre2.rel = 'preconnect'; pre2.href = 'https://fonts.gstatic.com'; pre2.crossOrigin = '';
    var fonts = document.createElement('link');
    fonts.rel = 'stylesheet';
    fonts.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@500;600;700;800;900&display=swap';
    var head = document.head;
    head.insertBefore(pre1, head.firstChild);
    head.insertBefore(pre2, pre1.nextSibling);
    head.insertBefore(fonts, pre2.nextSibling);
  })();

  // --- Ambient background layer (orbs + grid + scan + particles) ---
  var ambient = document.createElement('div');
  ambient.className = 'bg-ambient';
  ambient.setAttribute('aria-hidden', 'true');
  ambient.innerHTML =
    '<div class="bg-orb bg-orb-1"></div>' +
    '<div class="bg-orb bg-orb-2"></div>' +
    '<div class="bg-orb bg-orb-3"></div>' +
    '<div class="bg-orb bg-orb-4"></div>' +
    '<div class="bg-orb bg-orb-5"></div>' +
    '<canvas id="particleCanvas"></canvas>';
  document.body.insertBefore(ambient, document.body.firstChild);

  // --- Interactive particle field ---
  (function () {
    var canvas = document.getElementById('particleCanvas');
    if (!canvas || reduceMotion) return;
    var ctx = canvas.getContext('2d');
    var particles = [];
    var w, h;
    var COUNT = 70;
    var CONNECT = 150;
    var MOUSE_R = 220;
    var mx = -1000, my = -1000;
    var raf = null, paused = false;
    var COLORS = ['rgba(0,245,212,', 'rgba(123,97,255,', 'rgba(59,130,246,'];

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    function seed() {
      particles = [];
      for (var i = 0; i < COUNT; i++) {
        particles.push({
          x: Math.random() * w, y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.55, vy: (Math.random() - 0.5) * 0.55,
          r: Math.random() * 2.2 + 0.8,
          color: COLORS[i % COLORS.length],
          baseOpacity: Math.random() * 0.55 + 0.25,
          phase: Math.random() * Math.PI * 2
        });
      }
    }
    function step() {
      var t = performance.now() * 0.001;
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx; p.y += p.vy;
        var dx = p.x - mx, dy = p.y - my;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < MOUSE_R) { var f = ((MOUSE_R - d) / MOUSE_R) * 0.025; p.vx += dx * f; p.vy += dy * f; }
        p.vx *= 0.992; p.vy *= 0.992;
        if (p.x < 0) p.x = w; else if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; else if (p.y > h) p.y = 0;
        p.cur = p.baseOpacity * (0.7 + 0.3 * Math.sin(t * 1.5 + p.phase));
      }
    }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(0,245,212,0.14)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (var i = 0; i < particles.length; i++) {
        for (var j = i + 1; j < particles.length; j++) {
          var a = particles[i], b = particles[j];
          var ddx = a.x - b.x, ddy = a.y - b.y;
          if (Math.sqrt(ddx * ddx + ddy * ddy) < CONNECT) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
        }
      }
      ctx.stroke();
      for (var k = 0; k < particles.length; k++) {
        var p = particles[k];
        var op = p.cur || p.baseOpacity;
        var grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
        grad.addColorStop(0, p.color + (op * 0.5) + ')');
        grad.addColorStop(1, p.color + '0)');
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = p.color + op + ')'; ctx.fill();
      }
    }
    function loop() {
      if (paused) return;
      step(); draw();
      raf = requestAnimationFrame(loop);
    }
    document.addEventListener('visibilitychange', function () {
      paused = document.hidden;
      if (!paused && !raf) raf = requestAnimationFrame(loop);
    });
    window.addEventListener('resize', resize);
    document.addEventListener('mousemove', function (e) { mx = e.clientX; my = e.clientY; });
    resize(); seed(); raf = requestAnimationFrame(loop);
  })();

  var header = document.getElementById('site-header');
  var footer = document.getElementById('site-footer');
  if (!header && !footer) return;

  // --- Inline SVG icon helper (stroke icons for nav / contact) ---
  var ICONS = {
    home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
    how: 'M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    features: 'M12 2l1.7 4.6L18 8.3l-4.3 1.7L12 14.6 10.3 10 6 8.3l4.3-1.7zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8zM5 15l.6 1.6 1.6.6-1.6.6L5 19.4l-.6-1.6-1.6-.6 1.6-.6z',
    rewards: 'M12 2l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.5 6.2 20l1.1-6.5L2.6 8.8l6.5-.9z',
    back: 'M19 12H5m6-7-7 7 7 7',
    logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9',
    mail: 'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm16 2-8 6L4 6',
    phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2z',
    pin: 'M12 21s-7-5.3-7-11a7 7 0 0 1 14 0c0 5.7-7 11-7 11zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-16v6l4 2',
    globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-2a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-1-11h2m-4 0h6m-8 3h8m-9 3h6'
  };
  var ico = function (name, cls) {
    var c = cls ? ' class="' + cls + '"' : '';
    return '<svg' + c + ' viewBox="0 0 24 24" aria-hidden="true"><path d="' + (ICONS[name] || '') + '"/></svg>';
  };

  var mark = function (gid) {
    return '<svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#00f5d4"/><stop offset="1" stop-color="#7b61ff"/>' +
      '</linearGradient></defs>' +
      '<rect x="3" y="3" width="58" height="58" rx="15" fill="#0a0e1a"/>' +
      '<rect x="3" y="3" width="58" height="58" rx="15" fill="none" stroke="rgba(255,255,255,0.14)"/>' +
      '<path d="M13 19 L27 47 L38 27 L46 41 L53 19" fill="none" stroke="url(#' + gid + ')" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
  };

  var brand = '<a class="brand" href="/" aria-label="WasteWise home">' + mark('wwg') +
    '<span class="brand-text">Waste<span>Wise</span></span></a>';

  // Language dropdown (custom, not raw <select>)
  var curLang = (window.WWI18n && window.WWI18n.getLang()) || 'en';
  var langs = [
    { code: 'en', flag: '\uD83C\uDDEC\uD83C\uDDE7', name: 'EN' },
    { code: 'hi', flag: '\uD83C\uDDEE\uD83C\uDDF3', name: '\u0939\u093F' },
    { code: 'kn', flag: '\uD83C\uDDEE\uD83C\uDDF3', name: '\u0C95\u0CA8\u0CCD' },
    { code: 'ta', flag: '\uD83C\uDDEE\uD83C\uDDF3', name: '\u0BA4\u0BAE\u0BBF' },
    { code: 'bn', flag: '\uD83C\uDDEE\uD83C\uDDE7', name: '\u09AC\u09BE\u0982' }
  ];
  var curFlag = '';
  var curName = 'EN';
  for (var li = 0; li < langs.length; li++) {
    if (langs[li].code === curLang) { curFlag = langs[li].flag; curName = langs[li].name; break; }
  }
  var langItems = '';
  for (var lj = 0; lj < langs.length; lj++) {
    var l = langs[lj];
    langItems += '<button class="lang-opt' + (l.code === curLang ? ' active' : '') +
      '" data-lang="' + l.code + '" onclick="WWI18n.setLang(\'' + l.code + '\')">' +
      '<span class="lang-opt-flag">' + l.flag + '</span>' +
      '<span class="lang-opt-name">' + l.name + '</span></button>';
  }
  var langDropdown =
    '<div class="lang-switcher" id="lang-switcher">' +
      '<button class="lang-trigger" onclick="document.getElementById(\'lang-switcher\').classList.toggle(\'open\')" aria-label="Change language">' +
        ico('globe', 'lang-globe') +
        '<span class="lang-cur">' + curFlag + ' ' + curName + '</span>' +
        '<svg class="lang-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</button>' +
      '<div class="lang-dropdown">' + langItems + '</div>' +
    '</div>';

  var socials = function () {
    var icons = [
      { label: 'X', d: 'M18.9 2H22l-7.03 8.03L23.36 22h-6.48l-5.08-6.64L6.02 22H2.9l7.52-8.6L1.64 2h6.64l4.59 6.07L18.9 2zm-1.13 18h1.79L7.36 3.9H5.44L17.77 20z' },
      { label: 'Instagram', d: 'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zm0 3.68a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-10.4a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z' },
      { label: 'LinkedIn', d: 'M4.98 3.5A2.49 2.49 0 1 1 0 3.5a2.49 2.49 0 0 1 4.98 0zM.5 8h4.48V24H.5V8zm7.46 0h4.29v2.19h.06c.6-1.13 2.06-2.32 4.24-2.32 4.54 0 5.38 2.99 5.38 6.88V24h-4.47v-8.5c0-2.03-.04-4.64-2.83-4.64-2.83 0-3.26 2.21-3.26 4.5V24H7.96V8z' },
      { label: 'GitHub', d: 'M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.81 5.63-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .5z' }
    ];
    return icons.map(function (ic) {
      return '<a href="#" aria-label="' + ic.label + '" title="' + ic.label + '" class="social-link">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ic.d + '"/></svg></a>';
    }).join('');
  };

  // Close language dropdown on outside click
  document.addEventListener('click', function (e) {
    var sw = document.getElementById('lang-switcher');
    if (sw && !sw.contains(e.target)) sw.classList.remove('open');
  });

  // ---- HEADER ----
  if (header) {
    var page = header.dataset.page || 'landing';
    var links = '';
    var right = '';
    var burger = '<button class="menu-btn" type="button" aria-label="' + (window.t ? t('nav.toggleMenu') : 'Toggle menu') + '" aria-expanded="false" onclick="WW.toggleNav()"><span class="burger-line"></span><span class="burger-line"></span><span class="burger-line"></span></button>';

    if (page === 'dash') {
      var role = header.dataset.role || '';
      var roleIcon = role === 'admin' ? '\uD83C\uDFDB\uFE0F' : role === 'collector' ? '\uD83D\uDE9B' : '\uD83C\uDFE0';
      var roleLabel = role === 'admin' ? t('nav.roleAdmin') : role === 'collector' ? t('nav.roleCollector') : t('nav.roleResident');
      var chip = '<div class="user-chip">' +
        '<span class="avatar">' + roleIcon + '</span>' +
        '<span class="chip-info">' +
        '<span class="chip-name" id="nav-name">\u2026</span>' +
        '<span class="chip-meta"><span class="chip-role">' + roleLabel + '</span>';
      if (role === 'collector') chip += '<span class="chip-area">\uD83D\uDCCD <span id="nav-area">\u2014</span></span>';
      chip += '<span class="chip-pts">\u2B50 <span id="nav-points">0</span></span></span></span></div>';
      links = '<a class="nav-link" href="/">' + ico('home') + '<span>' + t('nav.home') + '</span></a>';
      right = chip + langDropdown +
        '<button class="nav-logout" onclick="WW.logout()">' + ico('logout') + '<span>' + t('nav.logout') + '</span></button>';
    } else if (page === 'auth') {
      links =
        '<a class="nav-link" href="/">' + ico('home') + '<span>' + t('nav.home') + '</span></a>' +
        '<a class="nav-link" href="/#how">' + ico('how') + '<span>' + t('nav.howItWorks') + '</span></a>' +
        '<a class="nav-link" href="/#features">' + ico('features') + '<span>' + t('nav.features') + '</span></a>';
      right = langDropdown +
        '<a class="btn-ghost btn-nav" href="/#roles">' + ico('back') + '<span>' + t('nav.backToRoles') + '</span></a>';
    } else {
      links =
        '<a class="nav-link" href="#how">' + ico('how') + '<span>' + t('nav.howItWorks') + '</span></a>' +
        '<a class="nav-link" href="#features">' + ico('features') + '<span>' + t('nav.features') + '</span></a>' +
        '<a class="nav-link" href="#stats">' + ico('rewards') + '<span>' + t('nav.rewards') + '</span></a>';
      right = langDropdown +
        '<a class="btn-cta btn-nav" href="/auth/resident.html">' + t('nav.signIn') + '</a>';
    }

    header.innerHTML =
      '<div class="nav-inner">' + brand +
      '<nav class="site-nav" id="site-nav">' + links + '</nav>' +
      '<div class="nav-right">' + right + burger + '</div>' +
      '</div>';
  }

  // ---- FOOTER ----
  if (footer) {
    var year = new Date().getFullYear();
    footer.innerHTML =
      '<div class="footer-glow"></div>' +
      '<div class="footer-inner">' +
        '<div class="footer-top">' +
          '<div class="footer-brand-col">' +
            '<a class="footer-brand-link" href="/" aria-label="WasteWise home">' + mark('wwf') +
              '<span class="brand-text">Waste<span>Wise</span></span></a>' +
            '<p class="footer-tagline">' + t('footer.tagline') + '</p>' +
            '<a class="btn-cta footer-cta" href="/auth/resident.html">' + t('footer.getStarted') + ' \u2192</a>' +
            '<div class="footer-socials">' + socials() + '</div>' +
          '</div>' +
          '<div class="footer-links-grid">' +
            '<div class="footer-col">' +
              '<h4>' + t('footer.explore') + '</h4>' +
              '<a href="/">' + ico('home') + '<span>' + t('footer.home') + '</span></a>' +
              '<a href="/auth/resident.html">\uD83C\uDFE0 <span>' + t('footer.residentPortal') + '</span></a>' +
              '<a href="/auth/collector.html">\uD83D\uDE9B <span>' + t('footer.collectorPortal') + '</span></a>' +
              '<a href="/auth/admin.html">\uD83C\uDFDB\uFE0F <span>' + t('footer.municipality') + '</span></a>' +
            '</div>' +
            '<div class="footer-col">' +
              '<h4>' + t('footer.platform') + '</h4>' +
              '<a href="/#how">' + ico('how') + '<span>' + t('footer.howItWorks') + '</span></a>' +
              '<a href="/#features">' + ico('features') + '<span>' + t('footer.features') + '</span></a>' +
              '<a href="/#stats">' + ico('rewards') + '<span>' + t('footer.rewardsAndPoints') + '</span></a>' +
              '<a href="/#roles">\u2B50 <span>' + t('footer.roles') + '</span></a>' +
            '</div>' +
            '<div class="footer-col footer-contact">' +
              '<h4>' + t('footer.contact') + '</h4>' +
              '<a class="contact-item" href="mailto:hello@wastewise.app">' + ico('mail') + '<span>hello@wastewise.app</span></a>' +
              '<span class="contact-item">' + ico('phone') + '<span>+91 98765 43210</span></span>' +
              '<span class="contact-item">' + ico('pin') + '<span>Ward 12, Green City</span></span>' +
              '<span class="contact-item">' + ico('clock') + '<span>Mon\u2013Sat \u00B7 7am\u20137pm</span></span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="footer-divider"></div>' +
        '<div class="footer-bottom">' +
          '<span class="footer-copy">&copy; ' + year + ' WasteWise. ' + t('footer.builtFor') + '</span>' +
          '<span class="footer-status"><span class="status-dot"></span> ' + t('footer.allSystemsOperational') + '</span>' +
          '<span class="footer-legal"><a href="/#roles">' + t('footer.demoAccess') + '</a><a href="mailto:hello@wastewise.app">' + t('footer.support') + '</a></span>' +
        '</div>' +
      '</div>';
  }

  window.WW = window.WW || {};
  window.WW.toggleNav = function () {
    var nav = document.getElementById('site-nav');
    if (!nav) return;
    var open = nav.classList.toggle('open');
    var btn = header && header.querySelector('.menu-btn');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  // Scroll-aware header
  if (header) {
    var onScroll = function () {
      header.classList.toggle('scrolled', window.scrollY > 20);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
