const sharp = require('sharp');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 25000);

async function callGroq(messages, maxTokens) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages,
        temperature: 0.1,
        max_completion_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    const body = await res.json();
    if (body.error) throw new Error(JSON.stringify(body.error));
    const content = body.choices?.[0]?.message?.content || '';
    return content;
  } finally {
    clearTimeout(timer);
  }
}

function parseJSON(str) {
  const cleaned = str.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
}

function groqComparePhotos(dataUrlA, dataUrlB) {
  return (async () => {
    const content = await callGroq([
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
          { type: 'image_url', image_url: { url: dataUrlA } },
          { type: 'image_url', image_url: { url: dataUrlB } },
        ],
      },
    ], 90);

    try {
      const parsed = parseJSON(content);
      const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));
      return {
        verdict: parsed.match === true ? 'verified' : 'rejected',
        confidence,
        reason: String(parsed.reason || '').slice(0, 200),
      };
    } catch (e) {
      throw new Error('Could not parse AI verdict (compare): ' + content.slice(0, 300));
    }
  })();
}

function groqIsGarbage(dataUrl) {
  return (async () => {
    const content = await callGroq([
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
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ], 80);

    try {
      const parsed = parseJSON(content);
      const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));
      return {
        isGarbage: parsed.garbage === true,
        confidence,
        reason: String(parsed.reason || '').slice(0, 200),
      };
    } catch (e) {
      throw new Error('Could not parse AI verdict (garbage): ' + content.slice(0, 300));
    }
  })();
}

async function groqComparePhotosSafe(dataUrlA, dataUrlB) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await groqComparePhotos(dataUrlA, dataUrlB); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function groqIsGarbageSafe(dataUrl) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await groqIsGarbage(dataUrl); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

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
