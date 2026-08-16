const sharp = require('sharp');
const { similarity } = require('../server/lib/cv.cjs');

async function mk(colors, opts = {}) {
  const shift = opts.shift || 0;
  const bg = opts.bg || '#333';
  const rects = colors
    .map((c) => `<rect x="${c.x + shift}" y="${c.y + (opts.vshift || 0)}" width="${c.w}" height="${c.h}" fill="${c.fill}"/>`)
    .join('');
  const svg = Buffer.from(
    `<svg width="300" height="200"><rect width="300" height="200" fill="${bg}"/>${rects}</svg>`
  );
  return sharp(svg).rotate(opts.rot || 0).jpeg().toBuffer();
}

(async () => {
  const wasteA = [
    { x: 20, y: 30, w: 80, h: 60, fill: '#1a7f37' },
    { x: 140, y: 80, w: 90, h: 50, fill: '#d4a017' },
    { x: 60, y: 130, w: 70, h: 40, fill: '#8a5a00' },
  ];
  const otherB = [
    { x: 10, y: 10, w: 150, h: 120, fill: '#2244ff' },
    { x: 40, y: 40, w: 200, h: 100, fill: '#ff2244' },
  ];
  const otherC = [
    { x: 120, y: 20, w: 60, h: 160, fill: '#ffffff' },
    { x: 20, y: 140, w: 90, h: 40, fill: '#222222' },
  ];

  const a = await mk(wasteA, {});
  const b = await mk(wasteA, { shift: 18, vshift: 10 }); // same waste, framing moved
  const lit = await mk(wasteA, { bg: '#0d0d0d' });      // same waste, much darker exposure
  const c = await mk(otherB, {});                        // different waste
  const d = await mk(otherC, {});                        // different waste 2
  const bagSwap = await mk([
    { x: 20, y: 30, w: 80, h: 60, fill: '#0a58ca' },
    { x: 140, y: 80, w: 90, h: 50, fill: '#c9184a' },
    { x: 60, y: 130, w: 70, h: 40, fill: '#2d6a4f' },
  ], {});                                                // different bags in same spot (swap)
  const partial = await mk([
    { x: 20, y: 30, w: 80, h: 60, fill: '#1a7f37' },
    { x: 140, y: 80, w: 90, h: 50, fill: '#d4a017' },
  ], {});                                                // same scene, one bag missing
  const empty = await mk([], {});                        // empty doorstep — nothing collected

  const same = await similarity(a, b);
  const light = await similarity(a, lit);
  const diff1 = await similarity(a, c);
  const diff2 = await similarity(a, d);
  const swap = await similarity(a, bagSwap);
  const partialSc = await similarity(a, partial);
  const emptySc = await similarity(a, empty);

  console.log('same (shifted camera): ', same.score.toFixed(3), same.score >= 0.8 ? 'PASS' : 'FAIL');
  console.log('same (dark exposure):   ', light.score.toFixed(3), light.score >= 0.8 ? 'PASS' : 'FAIL');
  console.log('different (blue/red):   ', diff1.score.toFixed(3), diff1.score < 0.6 ? 'PASS' : 'FAIL');
  console.log('different (white/black):', diff2.score.toFixed(3), diff2.score < 0.6 ? 'PASS' : 'FAIL');
  console.log('bag swap (same layout): ', swap.score.toFixed(3), swap.score < 0.7 ? 'PASS' : 'FAIL');
  console.log('partial (one bag gone): ', partialSc.score.toFixed(3), partialSc.score >= 0.8 ? 'PASS' : 'FAIL');
  console.log('empty vs waste:         ', emptySc.score.toFixed(3), emptySc.score < 0.7 ? 'PASS' : 'FAIL');

  const ok =
    same.score >= 0.8 &&
    light.score >= 0.8 &&
    diff1.score < 0.6 &&
    diff2.score < 0.6 &&
    swap.score < 0.7 &&
    partialSc.score >= 0.8 &&
    emptySc.score < 0.7;
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
