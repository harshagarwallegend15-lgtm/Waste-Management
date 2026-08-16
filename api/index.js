// Vercel serverless entrypoint — the Express app (CommonJS) as a function.
// Everything (static frontend, /api routes, health) is served through this.
module.exports = require('../server/app.cjs');
