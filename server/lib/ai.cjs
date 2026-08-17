const https = require('https');
const sharp = require('sharp');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 25000);

/**
 * Ask Groq's vision model whether the two photos plausibly show the SAME
 * waste items (not just any waste). Returns { verdict, confidence, reason }.
 */
function groqComparePhotos(dataUrlA, dataUrlB) {
  return new Promise((resolve, reject) => {
    if (!GROQ_API_KEY) return reject(new Error('GROQ_API_KEY not configured'));
    const payload = JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Photo 1: resident\'s doorstep BEFORE waste collection. ' +
                'Photo 2: the collector\'s photo AFTER collecting, showing the same waste they took. ' +
                'Decide whether the two photos show the SAME physical waste items (same bags/containers/' +
                'objects with matching colors, sizes and rough shapes). ' +
                'Reject if: (a) the visible waste looks different, (b) photo 2 is just an empty doorstep ' +
                'with nothing collected, (c) photo 2 shows a different scene or different items, or ' +
                '(d) you cannot confidently tell either way. ' +
                'Respond with ONLY valid JSON (no markdown, no commentary): ' +
                '{"match": true|false, "confidence": 0.0-1.0, "reason": "max 20 words"}.',
            },
            { type: 'document', document: { data: dataUrlA } },
            { type: 'document', document: { data: dataUrlB } },
          ],
        },
      ],
      temperature: 0.1,
      max_completion_tokens: 90,
    });

    const req = https.request(
      {
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            const content = json.choices?.[0]?.message?.content || '';
            const parsed = JSON.parse(
              content
                .replace(/```json/g, '')
                .replace(/```/g, '')
                .trim()
            );
            const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));
            resolve({
              verdict: parsed.match === true ? 'verified' : 'rejected',
              confidence,
              reason: String(parsed.reason || '').slice(0, 200),
            });
          } catch (e) {
            reject(new Error('Could not parse AI verdict (compare): ' + body.slice(0, 500)));
          }
        });
      }
    );
    req.setTimeout(AI_TIMEOUT_MS, () => req.destroy(new Error('AI request timed out')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Retry-tolerant wrapper: strips a leading "think/reason" prefix the model
 * sometimes adds before the JSON, and retries once on parse/timeout failure.
 */
async function groqComparePhotosSafe(dataUrlA, dataUrlB) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await groqComparePhotos(dataUrlA, dataUrlB);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/**
 * Ask Groq's vision model whether a single photo shows garbage/waste.
 * Returns { isGarbage, confidence, reason }.
 */
function groqIsGarbage(dataUrl) {
  return new Promise((resolve, reject) => {
    if (!GROQ_API_KEY) return reject(new Error('GROQ_API_KEY not configured'));
    const payload = JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'You are a gatekeeper in a waste-collection app. Determine whether this photo ' +
                'shows garbage/waste (waste bags, loose trash, dumped rubbish, bins of waste). ' +
                'Reject if it shows anything else: people, faces, landscapes, documents, empty ' +
                'rooms/floors, walls, vehicles, animals, food at a restaurant table, or you cannot ' +
                'confidently tell. ' +
                'Respond with ONLY valid JSON (no markdown, no commentary): ' +
                '{"garbage": true|false, "confidence": 0.0-1.0, "reason": "max 15 words"}.',
            },
            { type: 'document', document: { data: dataUrl } },
          ],
        },
      ],
      temperature: 0.1,
      max_completion_tokens: 80,
    });

    const req = https.request(
      {
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            const content = json.choices?.[0]?.message?.content || '';
            const parsed = JSON.parse(
              content
                .replace(/```json/g, '')
                .replace(/```/g, '')
                .trim()
            );
            const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));
            resolve({
              isGarbage: parsed.garbage === true,
              confidence,
              reason: String(parsed.reason || '').slice(0, 200),
            });
          } catch (e) {
            reject(new Error('Could not parse AI verdict (garbage): ' + body.slice(0, 500)));
          }
        });
      }
    );
    req.setTimeout(AI_TIMEOUT_MS, () => req.destroy(new Error('AI request timed out')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Retry-tolerant wrapper for the single-photo garbage check.
 */
async function groqIsGarbageSafe(dataUrl) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await groqIsGarbage(dataUrl);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/** Convert an image buffer to a compact base64 data URL (≤384px JPEG, quality 70). */
async function toDataUrl(buffer, contentType) {
  const type = contentType || 'image/jpeg';
  if (buffer && buffer.length > 0 && contentType === 'image/jpeg') {
    const small = await sharp(buffer)
      .rotate()
      .resize({ width: 384, height: 384, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer()
      .catch(() => buffer);
    return `data:${type};base64,${small.toString('base64')}`;
  }
  return `data:${type};base64,${Buffer.from(buffer).toString('base64')}`;
}

module.exports = { groqComparePhotos: groqComparePhotosSafe, groqIsGarbage: groqIsGarbageSafe, toDataUrl };
