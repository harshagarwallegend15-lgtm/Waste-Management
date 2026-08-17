const express = require('express');
const path = require('path');
const fs = require('fs');

// Express app factory — shared by the standalone server (server/index.cjs) and the
// Vercel serverless function (api/index.js). Does NOT call app.listen(); platforms
// that need a long-running process do that in server/index.cjs.
const app = express();
const IS_PROD = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');

// Behind a reverse proxy (Render/Railway/Nginx/Vercel), trust the first hop so
// req.ip / secure redirects behave correctly.
app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Baseline security headers. NOTE: a strict CSP is intentionally omitted because
// the frontend uses inline event handlers; add one after refactoring those.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (IS_PROD) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  next();
});

// Static frontend (cache in production; dev stays fresh)
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: IS_PROD ? '1d' : 0 }));

// Serve the supabase-js browser build so the frontend works offline
const vendorDir = path.join(__dirname, '..', 'node_modules', '@supabase', 'supabase-js', 'dist');
if (fs.existsSync(vendorDir)) {
  app.use('/vendor/supabase.js', express.static(path.join(vendorDir, 'umd', 'supabase.js')));
}

// Health check for uptime monitors + container platforms
app.get(['/health', '/api/health'], (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', require('./routes/auth.cjs'));
app.use('/api/requests', require('./routes/requests.cjs'));
app.use('/api/reports', require('./routes/reports.cjs'));
app.use('/api/problems', require('./routes/problems.cjs'));
app.use('/api/points', require('./routes/points.cjs'));
app.use('/api/education', require('./routes/education.cjs'));
app.use('/api/leaderboard', require('./routes/leaderboard.cjs'));
app.use('/api/challenges', require('./routes/challenges.cjs'));
app.use('/api/societies', require('./routes/societies.cjs').router);
app.use('/api/admin', require('./routes/admin.cjs'));

// Lightweight garbage-photo check (client-side capture gate)
const multerGarbage = require('multer')({ storage: require('multer').memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const { assertGarbagePhoto, GateError } = require('./lib/garbage.cjs');
app.post('/api/garbage/check', multerGarbage.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'No photo provided' });
  try {
    const r = await assertGarbagePhoto(req.file.buffer, { label: req.body.label || 'photo' });
    return res.json({ ok: true, score: r.score, method: r.method });
  } catch (e) {
    const status = e instanceof GateError ? e.status || 400 : 400;
    return res.status(status).json({ ok: false, error: e.message });
  }
});

// Public config for the browser (anon key is public by design)
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  });
});

// Meta: areas + societies for signup dropdowns (public — used on the login/signup pages)
app.get('/api/meta', async (req, res) => {
  const { db } = require('./lib/supabase.cjs');
  const { getMetaSocieties } = require('./routes/societies.cjs');
  const [areas, societies] = await Promise.all([
    db.from('areas').select('id, name').order('name'),
    getMetaSocieties(),
  ]);
  res.json({ areas: areas.data || [], societies });
});

// Temporary debug endpoint to test Groq vision API format
app.get('/api/debug/groq', async (req, res) => {
  const Groq = require('groq-sdk');
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.json({ error: 'No GROQ_API_KEY' });

  const client = new Groq({ apiKey: key });
  // Test 1: public URL
  try {
    const r1 = await client.chat.completions.create({
      model: 'qwen/qwen3.6-27b',
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Say hello in 3 words.' },
      ]}],
      max_completion_tokens: 20,
    });
    res.json({ text_ok: true, text_result: r1.choices[0].message.content });
  } catch (e) {
    res.json({ text_ok: false, text_error: e.message });
  }
});

app.get('/api/debug/groq-image', async (req, res) => {
  const Groq = require('groq-sdk');
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.json({ error: 'No GROQ_API_KEY' });

  const client = new Groq({ apiKey: key });
  
  const supabaseUrl = 'https://dvmzqkfuvzhmobvwlwfx.supabase.co/storage/v1/object/public/waste-photos/requests/3b1205ac-3597-45bc-a951-34d465ac0398/1786733140792-before.jpg';
  
  // Test A: public URL
  try {
    const r = await client.chat.completions.create({
      model: 'qwen/qwen3.6-27b',
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Describe this image in 5 words.' },
        { type: 'image_url', image_url: { url: supabaseUrl } }
      ]}],
      max_completion_tokens: 30,
      temperature: 0.1,
    });
    res.json({ public_url_ok: true, result: r.choices[0].message.content });
  } catch (e) {
    res.json({ public_url_ok: false, error: e.message.slice(0, 500) });
  }
});

app.get('/api/debug/groq-base64', async (req, res) => {
  const Groq = require('groq-sdk');
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.json({ error: 'No GROQ_API_KEY' });
  const client = new Groq({ apiKey: key });

  // Tiny 1x1 red pixel JPEG
  const tinyJpeg = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMCwsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k=';
  const dataUrl = 'data:image/jpeg;base64,' + tinyJpeg;

  try {
    const r = await client.chat.completions.create({
      model: 'qwen/qwen3.6-27b',
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Describe this image.' },
        { type: 'image_url', image_url: { url: dataUrl } }
      ]}],
      max_completion_tokens: 30,
      temperature: 0.1,
    });
    res.json({ data_url_ok: true, result: r.choices[0].message.content });
  } catch (e) {
    res.json({ data_url_ok: false, error: e.message.slice(0, 500) });
  }
});

// Unknown API routes → JSON 404 (not the SPA)
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler — do not leak internal details in production
app.use((err, req, res, next) => {
  if (!IS_PROD) console.error(err);
  const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
  res.status(status).json({ error: IS_PROD ? 'Internal server error' : (err.message || 'Internal error') });
});

// Don't crash in serverless contexts (Vercel) if env vars are missing — warn instead.
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.warn('WARNING: SUPABASE_URL / SUPABASE_ANON_KEY are not set — auth and /api/config will fail.');
}

module.exports = app;
