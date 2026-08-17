const sharp = require('sharp');
const Groq = require('groq-sdk');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 25000);

let _client;
function getClient() {
  if (!_client) _client = new Groq({ apiKey: GROQ_API_KEY });
  return _client;
}

function parseJSON(str) {
  const cleaned = str.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
}

async function groqComparePhotos(photoUrlA, photoUrlB) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured');

  const completion = await getClient().chat.completions.create({
    model: VISION_MODEL,
    temperature: 0.1,
    max_completion_tokens: 90,
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
          { type: 'image_url', image_url: { url: photoUrlA } },
          { type: 'image_url', image_url: { url: photoUrlB } },
        ],
      },
    ],
  }, { timeout: AI_TIMEOUT_MS });

  const content = completion.choices?.[0]?.message?.content || '';
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
}

async function groqIsGarbage(photoUrl) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured');

  const completion = await getClient().chat.completions.create({
    model: VISION_MODEL,
    temperature: 0.1,
    max_completion_tokens: 80,
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
          { type: 'image_url', image_url: { url: photoUrl } },
        ],
      },
    ],
  }, { timeout: AI_TIMEOUT_MS });

  const content = completion.choices?.[0]?.message?.content || '';
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
}

async function groqComparePhotosSafe(photoUrlA, photoUrlB) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await groqComparePhotos(photoUrlA, photoUrlB); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function groqIsGarbageSafe(photoUrl) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await groqIsGarbage(photoUrl); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

module.exports = { groqComparePhotos: groqComparePhotosSafe, groqIsGarbage: groqIsGarbageSafe };
