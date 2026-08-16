const sharp = require('sharp');
const { classifyGarbage } = require('./cv.cjs');
const { groqIsGarbage, toDataUrl } = require('./ai.cjs');

// Garbage-photo gate: only photos that plausibly show garbage/waste are accepted
// at capture time, for both residents and collectors.
//   GARBAGE_PHOTO_CHECK=false            → disable the gate entirely
//   GARBAGE_LOCAL_MIN (default 0.55)     → local score ≥ this accepts without AI
//   GARBAGE_AI_MIN   (default 0.32)      → scores in [AI_MIN, LOCAL_MIN) ask AI vision
// Scores below AI_MIN are rejected outright by the local heuristic.
const ENABLED = process.env.GARBAGE_PHOTO_CHECK !== 'false';
const LOCAL_MIN = Number(process.env.GARBAGE_LOCAL_MIN || 0.62);
const AI_MIN = Number(process.env.GARBAGE_AI_MIN || 0.30);

/** Error carrying an HTTP status so routes can map it cleanly. */
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
 *
 * Policy:
 *   score <  AI_MIN            → local signals are unambiguous (empty/plain) → reject.
 *   score >= LOCAL_MIN         → clearly a complex, heterogeneous waste scene → accept.
 *   in between                 → ask AI vision when configured; if AI is missing or
 *                                errors out, accept on the local score (fail-open so a
 *                                vision outage never blocks legitimate collections).
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

  // Ambiguous band → confirm with AI vision before rejecting.
  if (!process.env.GROQ_API_KEY) return { score, method: 'local', signals };
  let ai;
  try {
    const canon = await sharp(buf)
      .rotate()
      .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    ai = await groqIsGarbage(toDataUrl(canon, 'image/jpeg'));
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
