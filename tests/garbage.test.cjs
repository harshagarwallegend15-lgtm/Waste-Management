const sharp = require('sharp');
const { assertGarbagePhoto } = require('../server/lib/garbage.cjs');

async function mk(colors, bg, label) {
  const rects = colors.map((c) => `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="${c.fill}"/>`).join('');
  const svg = Buffer.from(`<svg width="320" height="220"><rect width="320" height="220" fill="${bg}"/>${rects}</svg>`);
  return { buf: await sharp(svg).jpeg().toBuffer(), name: label };
}

(async () => {
  const bags = await mk([
    { x: 30, y: 40, w: 90, h: 70, fill: '#1a7f37' },
    { x: 160, y: 90, w: 100, h: 55, fill: '#d4a017' },
    { x: 70, y: 150, w: 80, h: 40, fill: '#8a5a00' },
  ], '#5b6b63', 'waste bags');

  const solid = await mk([], '#c8c8c8', 'solid grey');
  const emptyDoor = await mk([
    { x: 150, y: 100, w: 20, h: 12, fill: '#777777' },
  ], '#6b6b6b', 'near-empty doorstep');
  const plainWall = await mk([], '#e8e0d0', 'plain wall');

  const failures = [];

  for (const good of [bags]) {
    try {
      const r = await assertGarbagePhoto(good.buf, { label: 'photo' });
      console.log(`accept ${good.name.padEnd(18)} score=${r.score.toFixed(3)} method=${r.method} PASS`);
    } catch (e) {
      console.log(`accept ${good.name.padEnd(18)} FAIL — ${e.message}`);
      failures.push(good.name);
    }
  }

  for (const bad of [solid, emptyDoor, plainWall]) {
    try {
      await assertGarbagePhoto(bad.buf, { label: 'photo' });
      console.log(`reject ${bad.name.padEnd(18)} FAIL — was accepted`);
      failures.push(bad.name);
    } catch (e) {
      if (e.status === 400 && /does not look like garbage/.test(e.message)) {
        console.log(`reject ${bad.name.padEnd(18)} PASS — ${e.message.slice(0, 72)}`);
      } else {
        console.log(`reject ${bad.name.padEnd(18)} FAIL — unexpected error: ${e.message}`);
        failures.push(bad.name);
      }
    }
  }

  try {
    await assertGarbagePhoto(Buffer.from('not an image'), { label: 'photo' });
    console.log('reject non-image FAIL — was accepted');
    failures.push('non-image');
  } catch (e) {
    if (e.status === 400) console.log('reject non-image PASS — valid-photo error');
    else { console.log('reject non-image FAIL — ' + e.message); failures.push('non-image'); }
  }

  if (failures.length) {
    console.log('\nFAILED:', failures.join(', '));
    process.exit(1);
  }
  console.log('\n=== GARBAGE GATE PASSED ===');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
