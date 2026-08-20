try { require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') }); } catch (e) { /* Vercel uses process.env directly */ }
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase not configured — add SUPABASE_URL and SUPABASE_ANON_KEY to .env');
}

let _admin, _db, _anon;

function getAdmin() {
  if (!_admin) _admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  return _admin;
}

function getDb() {
  if (!_db) _db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  return _db;
}

function getAnon() {
  if (!_anon) _anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  return _anon;
}

// Proxy objects that delegate to lazy getters — existing code that reads
// `admin`, `db`, or `anon` properties will still work without changes.
const admin = new Proxy({}, { get: (_, key) => Reflect.get(getAdmin(), key) });
const db    = new Proxy({}, { get: (_, key) => Reflect.get(getDb(), key) });
const anon  = new Proxy({}, { get: (_, key) => Reflect.get(getAnon(), key) });

function clientWithToken(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });
}

/** Authenticate a request and return { user, token }. Throws if invalid. */
async function requireAuth(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    const err = new Error('Not authenticated');
    err.status = 401;
    throw err;
  }
  const token = auth.slice(7);
  const { data, error } = await getAdmin().auth.getUser(token);
  if (error || !data?.user) {
    const err = new Error('Invalid or expired session');
    err.status = 401;
    throw err;
  }
  return { user: data.user, token };
}

/** Fetch a profile row (cached per request). */
async function getProfile(userId) {
  const { data, error } = await getDb().from('profiles').select('*').eq('id', userId).single();
  if (error) return null;
  return data;
}

/** Upload bytes to Supabase Storage under a folder. Returns public URL or null. */
async function uploadPhoto(bucket, folder, filename, buffer, contentType) {
  const path = `${folder}/${Date.now()}-${filename}`;
  const { data, error } = await getDb().storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (error) return null;
  const { data: pub } = getDb().storage.from(bucket).getPublicUrl(data.path);
  return pub?.publicUrl || null;
}

/**
 * Ensure the waste-photos storage bucket exists (best-effort; requires admin rights).
 * Public: photo URLs are stored directly on rows and rendered in <img> tags by the
 * frontend, so the bucket must be world-readable. Content is waste/garbage photos.
 */
async function ensureBucket(name) {
  const { data } = await getDb().storage.getBucket(name);
  if (data) {
    if (data.public !== true) {
      await getDb().storage.updateBucket(name, { public: true });
      console.log(`Storage bucket "${name}" set to public.`);
    }
    return true;
  }
  const { error } = await getDb().storage.createBucket(name, { public: true, file_size_limit: 8 * 1024 * 1024 });
  if (error) {
    console.warn(`Could not auto-create storage bucket "${name}": ${error.message}. Create it manually in Supabase (public bucket).`);
    return false;
  }
  console.log(`Storage bucket "${name}" ready.`);
  return true;
}

module.exports = { admin, db, anon, clientWithToken, requireAuth, getProfile, uploadPhoto, ensureBucket };
