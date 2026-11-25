// Supabase Realtime subscriptions for live leaderboard / status updates.
window.WWRealtime = (() => {
  const subscriptions = [];
  let client = null;
  let realtimeAvailable = false;

  let configPromise = null;

  async function getConfig() {
    if (!configPromise) {
      configPromise = fetch('/api/config').then((r) => r.json()).catch(() => null);
    }
    return configPromise;
  }

  async function connect() {
    if (client) { realtimeAvailable = true; return client; }
    if (typeof supabase === 'undefined') { realtimeAvailable = false; return null; }
    const cfg = await getConfig();
    if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) { realtimeAvailable = false; return null; }
    try {
      client = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      realtimeAvailable = true;
    } catch (err) {
      console.warn('Realtime client could not be created:', err);
      realtimeAvailable = false;
      return null;
    }
    return client;
  }

  // True once a usable Supabase client has been created. Pages use this to
  // decide whether they need a polling fallback.
  function isAvailable() { return realtimeAvailable && !!client; }

  // Generic fallback used by dashboards when realtime subscriptions fail.
  function startPoll(fn, intervalMs) {
    return setInterval(function () {
      try { fn(); } catch (err) { console.warn('WWRealtime poll failed:', err); }
    }, intervalMs || 15000);
  }

  // config: { event, schema, table, filter }. callback(newRow, payload).
  async function subscribe(config, callback) {
    const c = await connect();
    if (!c) {
      // Fallback: polling handled by caller
      console.warn('Realtime unavailable; caller should poll.');
      return null;
    }
    const sub = c
      .channel('ww-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', config, (payload) => callback(payload.new || payload.old, payload))
      .subscribe();
    subscriptions.push(sub);
    return sub;
  }

  function remove(sub) {
    if (sub) { sub.unsubscribe(); }
  }

  function disconnectAll() {
    subscriptions.forEach((s) => { try { s.unsubscribe(); } catch {} });
    subscriptions.length = 0;
  }

  return { subscribe, remove, disconnectAll, connect, isAvailable, startPoll };
})();
