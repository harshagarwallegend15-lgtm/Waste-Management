const sharp = require('sharp');
const { classifyGarbage } = require('./cv.cjs');
const { groqIsGarbage } = require('./ai.cjs');
const { uploadPhoto } = require('./supabase.cjs');

const PHOTO_BUCKET = 'waste-photos';
const ENABLED = process.env.GARBAGE_PHOTO_CHECK !== 'false';
const LOCAL_MIN = Number(process.env.GARBAGE_LOCAL_MIN || 0.62);
const AI_MIN = Number(process.env.GARBAGE_AI_MIN || 0.30);

class GateError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Validate that a captured photo shows garbage/waste. Throws GateError(400)
 * with a user-facing message when it does not. Returns { score, method, signals }
 * on success.
 */
async function assertGarbagePhoto(buf, { label = 'photo' } = {}) {
  if (!ENABLED) return { score: null, method: 'disabled', signals: {} };

  let result;
  try {
    result = await classifyGarbage(buf);
  } catch (e) {
    throw new GateError('Please upload a valid photo (JPEG/PNG/WebP) of the waste.');
  }

  const { score, reason, signals } = result;

  if (score >= LOCAL_MIN) return { score, method: 'local', signals };
  if (score < AI_MIN) {
    const msg = reason
      ? `That ${label} does not look like garbage — ${reason}.`
      : `That ${label} does not look like garbage — please capture the actual waste.`;
    throw new GateError(msg);
  }

  if (!process.env.GROQ_API_KEY) return { score, method: 'local', signals };
  let ai;
  try {
    const canon = await sharp(buf)
      .rotate()
      .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const tempUrl = await uploadPhoto(PHOTO_BUCKET, 'temp/gate', 'gate-check.jpg', canon, 'image/jpeg');
    ai = await groqIsGarbage(tempUrl);
  } catch (e) {
    console.warn('[garbage-gate] AI unavailable, accepting on local score', e.message);
    return { score, method: 'local', signals };
  }
  if (ai.isGarbage && ai.confidence >= 0.5) return { score, method: 'ai', ai, signals };
  throw new GateError(
    `That ${label} does not look like garbage — please capture the actual waste.${ai.reason ? ' (' + ai.reason + ')' : ''}`
  );
}

module.exports = { assertGarbagePhoto, GateError };
