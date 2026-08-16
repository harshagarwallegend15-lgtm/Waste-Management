const sharp = require('sharp');

/** Simple integer hash of a buffer (for cache keys / dedupe). */
function hashBuffer(buf) {
  let h = 2166136261;
  for (let i = 0; i < buf.length; i++) {
    h ^= buf[i];
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/* ============================================================
 * Preprocessing helpers
 * ============================================================ */

/** Auto-contrast (histogram stretch) + EXIF-aware orientation + square resize.
 *  `normalize: false` (used by the garbage gate) skips the stretch so true hues
 *  survive on low-contrast photos. */
function prepRGB(buf, size = 512, opts = {}) {
  const { normalize = true } = opts;
  let pipeline = sharp(buf).rotate().resize(size, size, { fit: 'fill' }).removeAlpha();
  if (normalize) pipeline = pipeline.normalize();
  return pipeline.raw().toBuffer({ resolveWithObject: true });
}

function prepGray(buf, size = 64) {
  return sharp(buf)
    .rotate()
    .resize(size, size, { fit: 'fill' })
    .grayscale()
    .normalize()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

/* ============================================================
 * Perceptual hashes
 * ============================================================ */

/** Average-hash (aHash): pixel ≥ mean → 1. Brittle to exposure; kept as a low-weight signal. */
async function averageHash(buf, size = 16) {
  const { data } = await prepGray(buf, size);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const avg = sum / data.length;
  const bits = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) bits[i] = data[i] >= avg ? 1 : 0;
  return { bits, len: data.length };
}

/** Differential hash (dHash): gradient per row — far more robust to lighting than aHash. */
async function dHash(buf, size = 9) {
  const { data } = await prepGray(buf, size);
  const bits = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size - 1; x++) {
      bits.push(data[y * size + x] < data[y * size + x + 1] ? 1 : 0);
    }
  }
  return { bits, len: (size - 1) * size };
}

/** 2D DCT-II over an N×N matrix (naive — N is small). */
function dct2(m, n) {
  const out = new Float64Array(n * n);
  for (let v = 0; v < n; v++) {
    for (let u = 0; u < n; u++) {
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
      let sum = 0;
      for (let y = 0; y < n; y++) {
        const cy = Math.cos(((2 * y + 1) * v * Math.PI) / (2 * n));
        for (let x = 0; x < n; x++) {
          sum += m[y * n + x] * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * n)) * cy;
        }
      }
      out[v * n + u] = (2 / n) * 0.5 * cu * cv * sum;
    }
  }
  return out;
}

/** Perceptual hash (pHash): low-frequency DCT coefficients of a 32×32 grayscale image,
 *  thresholded on the median → 64 bits. Robust to small shifts, scaling and gamma. */
async function pHash(buf) {
  const N = 32;
  const { data } = await prepGray(buf, N);
  const m = new Float64Array(N * N);
  for (let i = 0; i < data.length; i++) m[i] = data[i];
  const dct = dct2(m, N);
  // Take the top-left 8×8 block of coefficients, skipping DC.
  const block = 8;
  const coeffs = [];
  for (let v = 0; v < block; v++) {
    for (let u = 0; u < block; u++) {
      if (u === 0 && v === 0) continue;
      coeffs.push(dct[v * N + u]);
    }
  }
  const sorted = [...coeffs].sort((a, b) => a - b);
  const med = sorted.length % 2 ? sorted[(sorted.length - 1) >> 1] : (sorted[sorted.length >> 1] + sorted[(sorted.length >> 1) - 1]) / 2;
  const bits = new Uint8Array(coeffs.length);
  for (let i = 0; i < coeffs.length; i++) bits[i] = coeffs[i] >= med ? 1 : 0;
  return { bits, len: coeffs.length };
}

/** Hamming distance between two bit arrays (0 = identical). */
function hamming(a, b) {
  if (a.length !== b.length) return 1;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return a.length ? d / a.length : 0;
}

/* ============================================================
 * Color descriptors
 * ============================================================ */

/**
 * Quantize an RGB pixel into a coarse color class (0..7):
 * 0 dark, 1 gray, 2 red, 3 green, 4 blue, 5 yellow/orange, 6 cyan, 7 magenta.
 */
function colorClass(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 64) return 0; // dark
  if (max - min < 30) return 1; // gray
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;
  if (h < 30 || h >= 330) return 2; // red
  if (h < 90) return 5; // yellow/orange
  if (h < 150) return 3; // green
  if (h < 210) return 6; // cyan
  if (h < 270) return 4; // blue
  return 7; // magenta
}

function hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const v = max;
  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = delta / max;
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;
  return { h, s, v };
}

/**
 * Spatial color histogram: 6×6 grid × 8 color classes = 288 dims (auto-contrast).
 * Fine enough to catch rearranged/bag-swap layouts; 6×6 tolerates camera shifts.
 */
async function spatialColorHistogram(buf) {
  const size = 144;
  const { data, info } = await prepRGB(buf, size);
  const G = 6;
  const bins = new Float64Array(G * G * 8);
  const cellW = Math.ceil(size / G);
  const cellH = Math.ceil(size / G);
  for (let y = 0; y < size; y++) {
    const gy = Math.min(G - 1, Math.floor(y / cellH));
    for (let x = 0; x < size; x++) {
      const gx = Math.min(G - 1, Math.floor(x / cellW));
      const i = (y * size + x) * info.channels;
      const cls = colorClass(data[i], data[i + 1], data[i + 2]);
      bins[(gy * G + gx) * 8 + cls]++;
    }
  }
  const total = size * size;
  for (let i = 0; i < bins.length; i++) bins[i] /= total;
  return bins;
}

/**
 * Global HSV histogram: H(8) × S(3) × V(3) = 72 dims plus 1 achromatic bucket.
 * Desaturated pixels (gray/white/black) land in the achromatic bucket instead of
 * fake hue buckets, so colored vs gray waste discriminates cleanly.
 */
async function hsvHistogram(buf) {
  const size = 128;
  const { data, info } = await prepRGB(buf, size);
  const bins = new Float64Array(8 * 3 * 3 + 1);
  for (let i = 0; i < data.length; i += info.channels) {
    const { h, s, v } = hsv(data[i], data[i + 1], data[i + 2]);
    if (s < 0.18 || (Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2])) < 46) {
      bins[8 * 3 * 3]++;
      continue;
    }
    const hb = Math.min(7, Math.floor(h / 45));
    const sb = s > 0.55 ? 2 : s > 0.2 ? 1 : 0;
    const vb = v > 0.55 ? 2 : v > 0.25 ? 1 : 0;
    bins[(hb * 3 + sb) * 3 + vb]++;
  }
  const total = (data.length / info.channels) | 0;
  for (let i = 0; i < bins.length; i++) bins[i] /= total;
  return bins;
}

/** Global 8-class color histogram — shift-invariant "dominant colors" signal. */
async function classHistogram(buf) {
  const size = 128;
  const { data, info } = await prepRGB(buf, size);
  const bins = new Float64Array(8);
  for (let i = 0; i < data.length; i += info.channels) {
    bins[colorClass(data[i], data[i + 1], data[i + 2])]++;
  }
  const total = (data.length / info.channels) | 0;
  for (let i = 0; i < bins.length; i++) bins[i] /= total;
  return bins;
}

/** Global 8-class color histogram WITHOUT auto-contrast — preserves the true hue
 *  distribution of low-contrast photos (used by the garbage-photo gate). */
async function classHistogramRaw(buf) {
  const size = 128;
  const { data, info } = await prepRGB(buf, size, { normalize: false });
  const bins = new Float64Array(8);
  for (let i = 0; i < data.length; i += info.channels) {
    bins[colorClass(data[i], data[i + 1], data[i + 2])]++;
  }
  const total = (data.length / info.channels) | 0;
  for (let i = 0; i < bins.length; i++) bins[i] /= total;
  return bins;
}

/**
 * Estimate the background color from the image border, then build a
 * foreground-only color histogram (8 classes). Focuses the comparison
 * on the waste itself rather than the shared doorstep/street background.
 */
async function foregroundClassHistogram(buf) {
  const size = 96;
  const { data, info } = await prepRGB(buf, size);

  let br = 0, bg = 0, bb = 0, bc = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const onBorder = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      if (!onBorder) continue;
      const i = (y * size + x) * info.channels;
      br += data[i]; bg += data[i + 1]; bb += data[i + 2]; bc++;
    }
  }
  br /= bc; bg /= bc; bb /= bc;

  const bins = new Float64Array(8);
  let total = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * info.channels;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const d = Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb);
      if (d < 90) continue; // looks like background — ignore
      bins[colorClass(r, g, b)]++;
      total++;
    }
  }
  if (total === 0) return bins; // uniform image — no foreground
  for (let i = 0; i < bins.length; i++) bins[i] /= total;
  return bins;
}

/* ============================================================
 * Texture / structure descriptors
 * ============================================================ */

/** Edge-density: fraction of strong gradient pixels in each of 4 quadrants. */
async function edgeDensity(buf) {
  const size = 32;
  const { data, info } = await prepGray(buf, size);
  const w = info.width, h = info.height;
  const q = new Float64Array(4);
  const qc = new Float64Array(4);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = data[i + 1] - data[i - 1];
      const gy = data[(y + 1) * w + x] - data[(y - 1) * w + x];
      const mag = Math.abs(gx) + Math.abs(gy);
      const qidx = (y < h / 2 ? 0 : 2) + (x < w / 2 ? 0 : 1);
      qc[qidx]++;
      if (mag > 30) q[qidx]++;
    }
  }
  for (let i = 0; i < 4; i++) q[i] = qc[i] ? q[i] / qc[i] : 0;
  return q;
}

/** Local-variance texture descriptor: 4×4 grid of per-cell brightness variance (16 dims).
 *  Strong when real objects are present; near-zero for a flat/empty scene. */
async function texture(buf) {
  const size = 64;
  const { data, info } = await prepGray(buf, size);
  const G = 4;
  const cell = size / G;
  const dims = new Float64Array(G * G);
  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      let mean = 0;
      const n = cell * cell;
      for (let y = gy * cell; y < (gy + 1) * cell; y++) {
        for (let x = gx * cell; x < (gx + 1) * cell; x++) {
          mean += data[y * size + x];
        }
      }
      mean /= n;
      let v = 0;
      for (let y = gy * cell; y < (gy + 1) * cell; y++) {
        for (let x = gx * cell; x < (gx + 1) * cell; x++) {
          const d = data[y * size + x] - mean;
          v += d * d;
        }
      }
      dims[gy * G + gx] = Math.log1p(v / n);
    }
  }
  return dims;
}

/**
 * Foreground statistics: estimate the background color from the image border,
 * then measure how much of the frame differs from it and how varied that
 * foreground is. Used by the garbage-photo gate.
 * Returns { fraction, distinct, topShare }:
 *   fraction  — share of pixels that differ from the border background (0..1)
 *   distinct  — number of distinct color classes present in the foreground (0..8)
 *   topShare  — share of foreground pixels in the single most common class (0..1)
 */
async function foregroundStats(buf) {
  const size = 96;
  const { data, info } = await prepRGB(buf, size);

  let br = 0, bg = 0, bb = 0, bc = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const onBorder = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      if (!onBorder) continue;
      const i = (y * size + x) * info.channels;
      br += data[i]; bg += data[i + 1]; bb += data[i + 2]; bc++;
    }
  }
  br /= bc; bg /= bc; bb /= bc;

  const clsCount = new Float64Array(8);
  let total = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * info.channels;
      const d = Math.abs(data[i] - br) + Math.abs(data[i + 1] - bg) + Math.abs(data[i + 2] - bb);
      if (d < 90) continue; // looks like background
      clsCount[colorClass(data[i], data[i + 1], data[i + 2])]++;
      total++;
    }
  }
  if (total === 0) return { fraction: 0, distinct: 0, topShare: 0 };
  let distinct = 0, top = 0;
  for (let c = 0; c < 8; c++) {
    if (clsCount[c] > 0) distinct++;
    if (clsCount[c] > top) top = clsCount[c];
  }
  return { fraction: total / (size * size), distinct, topShare: top / total };
}

/**
 * Classify whether a photo plausibly shows garbage/waste rather than a blank,
 * plain, or unrelated scene. Returns a 0..1 "garbage-likeness" score plus the
 * underlying signals so callers can explain rejections.
 *
 * Waste photos tend to be heterogeneous: visible foreground objects, real
 * texture, several distinct colors and some edge content. Blank walls, empty
 * floors and plain documents score low on all of those; near-empty scenes are
 * rejected outright. This is a heuristic gate — the AI vision band in
 * lib/garbage.cjs catches the cases local signals cannot (selfies, landscapes).
 */
async function classifyGarbage(buf) {
  const [edge, tex, fg, cls] = await Promise.all([
    edgeDensity(buf),
    texture(buf),
    foregroundStats(buf),
    classHistogramRaw(buf),
  ]);

  let edgeMean = 0;
  for (let i = 0; i < edge.length; i++) edgeMean += edge[i];
  edgeMean /= edge.length;

  let texMean = 0;
  for (let i = 0; i < tex.length; i++) texMean += tex[i];
  texMean /= tex.length;

  // A single dominant achromatic class (e.g. one big gray/white wall) is a strong
  // "plain scene" tell; several colored classes is a strong "waste" tell.
  const grayShare = cls[1];
  const coloredShare = 1 - cls[0] - cls[1];
  let coloredClasses = 0;
  for (let c = 2; c < 8; c++) if (cls[c] >= 0.015) coloredClasses++;

  const textureScore = Math.min(1, texMean / 3.5);
  const edgeScore = Math.min(1, edgeMean * 5);
  const colorScore = Math.min(1, coloredClasses / 3);
  const nonEmpty = Math.min(1, fg.fraction / 0.18);
  const variety = Math.min(1, coloredShare * 4);

  let score =
    0.28 * textureScore +
    0.22 * edgeScore +
    0.30 * colorScore +
    0.10 * nonEmpty +
    0.10 * variety;
  score = Math.max(0, Math.min(1, score));

  // Hard negatives — these are unambiguous even though the weighted sum may sit
  // in the ambiguous band for some near-plain images.
  let reason = '';
  if (fg.fraction < 0.015) {
    reason = 'Photo appears empty — no waste visible';
    score = Math.min(score, 0.12);
  } else if (edgeMean < 0.02 && texMean < 0.5) {
    reason = 'Photo looks like a plain or blank surface, not waste';
    score = Math.min(score, 0.2);
  } else if (fg.distinct < 2 && texMean < 0.8) {
    reason = 'Photo is too uniform to show garbage';
    score = Math.min(score, 0.28);
  }

  return {
    score,
    reason,
    signals: {
      edge_mean: Number(edgeMean.toFixed(3)),
      texture_mean: Number(texMean.toFixed(3)),
      fg_fraction: Number(fg.fraction.toFixed(3)),
      fg_distinct_colors: fg.distinct,
      fg_top_share: Number(fg.topShare.toFixed(3)),
      gray_share: Number(grayShare.toFixed(3)),
      colored_share: Number(coloredShare.toFixed(3)),
      colored_classes: coloredClasses,
    },
  };
}

/** Cosine similarity between two vectors (0..1). */
function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Histogram intersection: sum of per-bin min (0..1 when both histograms sum to 1). */
function intersection(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += Math.min(a[i], b[i]);
  return s;
}

/**
 * Local heuristic similarity between two image buffers.
 * Returns score 0..1 where 1 = very similar, plus a per-signal breakdown.
 * Combines perceptual hashes (pHash/dHash/aHash), HSV + spatial + foreground
 * color histograms, edge density and texture — all computed on auto-contrast,
 * orientation-normalized inputs for exposure/rotation robustness.
 */
async function similarity(bufA, bufB) {
  const [[hashA, dA, pA], [hashB, dB, pB]] = await Promise.all([
    Promise.all([averageHash(bufA), dHash(bufA), pHash(bufA)]),
    Promise.all([averageHash(bufB), dHash(bufB), pHash(bufB)]),
  ]);
  const [[spatialA, hsvA, fgA, clsA, edgeA, texA], [spatialB, hsvB, fgB, clsB, edgeB, texB]] = await Promise.all([
    Promise.all([
      spatialColorHistogram(bufA),
      hsvHistogram(bufA),
      foregroundClassHistogram(bufA),
      classHistogram(bufA),
      edgeDensity(bufA),
      texture(bufA),
    ]),
    Promise.all([
      spatialColorHistogram(bufB),
      hsvHistogram(bufB),
      foregroundClassHistogram(bufB),
      classHistogram(bufB),
      edgeDensity(bufB),
      texture(bufB),
    ]),
  ]);

  const parts = {
    phash: 1 - hamming(pA.bits, pB.bits),
    dhash: 1 - hamming(dA.bits, dB.bits),
    ahash: 1 - hamming(hashA.bits, hashB.bits),
    spatial: intersection(spatialA, spatialB),
    hsv: intersection(hsvA, hsvB),
    fg: intersection(fgA, fgB),
    cls: intersection(clsA, clsB),
    edge: cosineSim(edgeA, edgeB),
    texture: cosineSim(texA, texB),
  };

  const WEIGHTS = {
    phash: 0.07,
    dhash: 0.04,
    ahash: 0.02,
    spatial: 0.24,
    hsv: 0.12,
    fg: 0.26,
    cls: 0.06,
    edge: 0.04,
    texture: 0.15,
  };

  let score = 0;
  for (const k of Object.keys(WEIGHTS)) score += parts[k] * WEIGHTS[k];
  score = Math.max(0, Math.min(1, score));
  return { score, parts };
}

module.exports = {
  similarity,
  averageHash,
  dHash,
  pHash,
  spatialColorHistogram,
  hsvHistogram,
  colorClass,
  classHistogram,
  classHistogramRaw,
  foregroundClassHistogram,
  edgeDensity,
  texture,
  foregroundStats,
  classifyGarbage,
  hashBuffer,
};