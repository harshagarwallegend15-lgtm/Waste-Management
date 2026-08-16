// ========================================
// Hero Film — Cinematic Background Player
// Slow Ken Burns crossfade of themed photos
// (recycling / clean city / waste collection)
// with film grain, scan lines, vignette and a
// teal colour grade. Mirrors DrainFlow Pro's
// hero "video" effect.
// ========================================

(function () {
  'use strict';

  var FRAME_URLS = [
    'https://images.pexels.com/photos/37658603/pexels-photo-37658603.jpeg?auto=compress&cs=tinysrgb&w=1280',
    'https://images.pexels.com/photos/37172073/pexels-photo-37172073.jpeg?auto=compress&cs=tinysrgb&w=1280',
    'https://images.pexels.com/photos/11115607/pexels-photo-11115607.jpeg?auto=compress&cs=tinysrgb&w=1280',
    'https://images.pexels.com/photos/36713464/pexels-photo-36713464.jpeg?auto=compress&cs=tinysrgb&w=1280',
    'https://images.pexels.com/photos/28706040/pexels-photo-28706040.jpeg?auto=compress&cs=tinysrgb&w=1280',
    'https://images.pexels.com/photos/12492222/pexels-photo-12492222.jpeg?auto=compress&cs=tinysrgb&w=1280',
    'https://images.pexels.com/photos/36713456/pexels-photo-36713456.jpeg?auto=compress&cs=tinysrgb&w=1280'
  ];

  var HOLD_MS = 3800;
  var CROSSFADE_MS = 1400;

  var KB_PRESETS = [
    { startScale: 1.08, endScale: 1.18, startX: 0,    startY: 0,   endX: -0.02, endY: -0.01 },
    { startScale: 1.12, endScale: 1.04, startX: -0.02, startY: 0.01, endX: 0.01, endY: -0.01 },
    { startScale: 1.06, endScale: 1.15, startX: 0.01, startY: -0.01, endX: -0.01, endY: 0.02 },
    { startScale: 1.14, endScale: 1.06, startX: -0.01, startY: 0,   endX: 0.02, endY: 0.01 },
    { startScale: 1.08, endScale: 1.16, startX: 0,    startY: 0.01, endX: -0.02, endY: -0.01 },
    { startScale: 1.10, endScale: 1.04, startX: 0.02, startY: -0.01, endX: -0.01, endY: 0 },
    { startScale: 1.06, endScale: 1.14, startX: -0.01, startY: 0.01, endX: 0.01, endY: -0.02 }
  ];

  var canvas, ctx, w, h;
  var images = [];
  var currentIdx = 0;
  var phaseStart = 0;
  var phase = 'hold';
  var animating = false;
  var paused = false;
  var rafId = null;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var grainCanvas = null;
  var GRAIN_SIZE = 128;

  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeInOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }

  function createGrainTexture() {
    grainCanvas = document.createElement('canvas');
    grainCanvas.width = grainCanvas.height = GRAIN_SIZE;
    var gctx = grainCanvas.getContext('2d');
    var data = gctx.createImageData(GRAIN_SIZE, GRAIN_SIZE);
    var d = data.data;
    for (var i = 0; i < d.length; i += 4) {
      var v = Math.random() > 0.5 ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 12;
    }
    gctx.putImageData(data, 0, 0);
  }

  function init() {
    canvas = document.getElementById('heroFilmCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    createGrainTexture();
    preloadImages();

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        paused = true;
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      } else if (animating && !reduce) {
        paused = false;
        phaseStart = performance.now();
        rafId = requestAnimationFrame(render);
      }
    });
  }

  function resize() {
    if (!canvas) return;
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function preloadImages() {
    var loaded = 0;
    images = FRAME_URLS.map(function (url) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = img.onerror = function () {
        loaded++;
        if (loaded === FRAME_URLS.length && !animating) {
          animating = true;
          canvas.classList.add('active');
          if (reduce) {
            drawKenBurns(images[0], 0, 0.5, 1);
            drawOverlays(performance.now());
          } else {
            phaseStart = performance.now();
            rafId = requestAnimationFrame(render);
          }
        }
      };
      img.src = url;
      return img;
    });
  }

  function drawKenBurns(img, kbIdx, t, alpha) {
    if (!img || !img.complete || img.naturalWidth === 0) return;
    var kb = KB_PRESETS[kbIdx % KB_PRESETS.length];
    var te = easeInOutSine(Math.min(Math.max(t, 0), 1));
    var scale = kb.startScale + (kb.endScale - kb.startScale) * te;
    var offX = kb.startX + (kb.endX - kb.startX) * te;
    var offY = kb.startY + (kb.endY - kb.startY) * te;
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var base = Math.max(w / iw, h / ih);
    var sw = iw * base * scale;
    var sh = ih * base * scale;
    var sx = (w - sw) / 2 + offX * w;
    var sy = (h - sh) / 2 + offY * h;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, sx, sy, sw, sh);
    ctx.restore();
  }

  function drawOverlays(now) {
    // Dark navy grade — top heavy for the header, bottom heavy for the footer
    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0,    'rgba(10,14,26,0.82)');
    grad.addColorStop(0.28, 'rgba(10,14,26,0.42)');
    grad.addColorStop(0.5,  'rgba(10,14,26,0.30)');
    grad.addColorStop(0.75, 'rgba(10,14,26,0.50)');
    grad.addColorStop(1,    'rgba(10,14,26,0.90)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Centre-lift radial so hero text stays readable
    var lift = ctx.createRadialGradient(w * 0.5, h * 0.42, 60, w * 0.5, h * 0.42, h * 0.75);
    lift.addColorStop(0, 'rgba(123, 97, 255, 0.10)');
    lift.addColorStop(0.55, 'rgba(0, 245, 212, 0.05)');
    lift.addColorStop(1, 'rgba(10, 14, 26, 0)');
    ctx.fillStyle = lift;
    ctx.fillRect(0, 0, w, h);

    // Teal brand tint
    ctx.fillStyle = 'rgba(0,245,212,0.05)';
    ctx.fillRect(0, 0, w, h);

    // Edge vignette
    var vig = ctx.createRadialGradient(w * 0.5, h * 0.5, h * 0.2, w * 0.5, h * 0.5, h * 0.82);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.52)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    // Film grain — tiled pre-rendered texture
    if (grainCanvas) {
      ctx.save();
      ctx.globalAlpha = 0.03 + 0.01 * Math.sin(now * 0.001 * 7.3);
      ctx.fillStyle = ctx.createPattern(grainCanvas, 'repeat');
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // Scan lines
    ctx.save();
    ctx.globalAlpha = 0.035;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    for (var y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2);
    ctx.restore();
  }

  function render(now) {
    if (paused) return;
    rafId = requestAnimationFrame(render);
    if (images.length === 0) return;

    ctx.clearRect(0, 0, w, h);
    var elapsed = now - phaseStart;

    if (phase === 'hold') {
      drawKenBurns(images[currentIdx], currentIdx, elapsed / (HOLD_MS + CROSSFADE_MS), 1);
      if (elapsed >= HOLD_MS) { phase = 'fade'; phaseStart = now; }
    } else {
      var fadeT = Math.min(elapsed / CROSSFADE_MS, 1);
      var eased = easeInOutCubic(fadeT);
      var nextIdx = (currentIdx + 1) % images.length;
      drawKenBurns(images[currentIdx], currentIdx, 1, 1 - eased);
      drawKenBurns(images[nextIdx], nextIdx, (elapsed / (HOLD_MS + CROSSFADE_MS)) * 0.12, eased);
      if (fadeT >= 1) {
        currentIdx = nextIdx;
        phase = 'hold';
        phaseStart = now;
      }
    }
    drawOverlays(now);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
