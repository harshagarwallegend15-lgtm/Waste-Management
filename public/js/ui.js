// UI enhancements: count-up for .num (KPI/stat values), role-card tilt.
(function () {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Count-up animation for elements with class .num ---
  function animateNum(el) {
    const target = parseFloat(String(el.textContent).replace(/[^0-9.-]/g, ''));
    if (isNaN(target) || reduce) return;
    const isInt = Number.isInteger(target);
    const dur = 650;
    const start = performance.now();
    (function frame(now) {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = isInt ? Math.round(target * eased) : (target * eased).toFixed(1);
      if (t < 1) requestAnimationFrame(frame);
    })(performance.now());
  }

  const animated = new WeakSet();

  const watcher = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        const el = n.nodeType === 3 ? n.parentElement : n;
        if (el && el.classList && el.classList.contains('num') && !animated.has(el)) {
          animated.add(el);
          animateNum(el);
        }
      }
    }
  });
  document.querySelectorAll('.num').forEach((el) => watcher.observe(el, { childList: true }));

  // --- Count-up for static numbers (author sets data-count) ---
  document.querySelectorAll('.num[data-count]').forEach((el) => {
    el.textContent = el.dataset.count;
  });

  // --- Reveal-on-scroll for .reveal sections ---
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      }
    }, { threshold: 0.12 });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('in'));
  }

  // --- Subtle 3D tilt on landing role cards ---
  if (!reduce) {
    document.querySelectorAll('.role-card').forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform =
          'perspective(800px) rotateX(' + (-y * 5).toFixed(2) + 'deg) rotateY(' + (x * 5).toFixed(2) + 'deg) translateY(-4px)';
      });
      card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    });
  }
})();
