const app = require('./app.cjs');
const { ensureBucket } = require('./lib/supabase.cjs');

const PORT = process.env.PORT || 8080;
const IS_PROD = process.env.NODE_ENV === 'production';

// Startup config sanity check — fail fast so a broken container/process restarts
// visibly instead of serving a dead app. (Serverless platforms skip this file and
// call server/app.cjs directly, where missing keys only warn.)
(function checkConfig() {
  const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`FATAL: missing required env var(s): ${missing.join(', ')}. Copy .env.example to .env and fill in.`);
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('WARNING: SUPABASE_SERVICE_ROLE_KEY is not set — the server will fall back to the ANON key. This is NOT safe for production; always set the service role key.');
  }
})();

const server = app.listen(PORT, () => {
  console.log(`WasteWise server running on http://localhost:${PORT}${IS_PROD ? ' (production)' : ''}`);
  ensureBucket('waste-photos');
});

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`Received ${sig}, shutting down…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
