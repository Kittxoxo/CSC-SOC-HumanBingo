// Tiny Supabase (PostgREST) client. No dependencies, no open database connections:
// every call is a short HTTPS request, which is what makes it safe for hundreds of phones at once.
const BASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const PAGE = 1000; // Supabase returns at most 1000 rows per request by default

class DbError extends Error {
  constructor(status, body, where) { super("db " + status + " " + where); this.status = status; this.body = body; }
}

function headers(extra) {
  // New sb_secret_ keys go ONLY in the apikey header. Legacy service_role keys (eyJ...) also go in Authorization.
  const h = { apikey: KEY, "Content-Type": "application/json", ...(extra || {}) };
  if (KEY.startsWith("eyJ")) h.Authorization = "Bearer " + KEY;
  return h;
}

async function call(path, { method = "GET", body, prefer } = {}) {
  if (!BASE || !KEY) throw new DbError(0, "missing env", "config");
  const h = headers(prefer ? { Prefer: prefer } : null);
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(BASE + "/rest/v1/" + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
      if (r.status >= 500 && attempt === 0) { last = new DbError(r.status, "", path); await new Promise((x) => setTimeout(x, 150)); continue; }
      return r;
    } catch (e) { last = e; await new Promise((x) => setTimeout(x, 150)); }
  }
  throw last;
}

async function json(r, where) {
  const text = await r.text();
  if (!r.ok) throw new DbError(r.status, text.slice(0, 300), where);
  return text ? JSON.parse(text) : null;
}

const select = async (table, query) => json(await call(table + "?" + query), table);

// every row, 1000 at a time (needed once there are more than 1000 students)
async function selectAll(table, query) {
  const out = [];
  for (let off = 0; ; off += PAGE) {
    const rows = await select(table, query + "&limit=" + PAGE + "&offset=" + off);
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

async function count(table, filter) {
  const r = await call(table + "?select=pid&limit=1" + (filter ? "&" + filter : ""), { prefer: "count=exact" });
  if (!r.ok) throw new DbError(r.status, (await r.text()).slice(0, 300), table);
  const m = /\/(\d+)$/.exec(r.headers.get("content-range") || "");
  return m ? parseInt(m[1], 10) : 0;
}

async function upsert(table, rows, onConflict, ignore) {
  const r = await call(table + "?on_conflict=" + onConflict, { method: "POST", body: rows, prefer: "resolution=" + (ignore ? "ignore" : "merge") + "-duplicates,return=minimal" });
  if (!r.ok) throw new DbError(r.status, (await r.text()).slice(0, 300), table);
}
async function patch(table, filter, body) {
  const r = await call(table + "?" + filter, { method: "PATCH", body, prefer: "return=minimal" });
  if (!r.ok) throw new DbError(r.status, (await r.text()).slice(0, 300), table);
}
async function del(table, filter) {
  const r = await call(table + "?" + filter, { method: "DELETE", prefer: "return=minimal" });
  if (!r.ok) throw new DbError(r.status, (await r.text()).slice(0, 300), table);
}

// ---- game state (one row), with a 1.5 s memory cache so a burst of check-ins doesn't hit the database every time ----
let cache = null, cacheAt = 0;
const STATE_COLS = "status,started_ms,duration_ms,reset_at,showcase_open,showcase_rank,prompts";
async function getState(fresh) {
  if (!fresh && cache && Date.now() - cacheAt < 1500) return cache;
  const [r] = await select("game_state", "select=" + STATE_COLS + "&id=eq.1");
  if (!r) throw new DbError(404, "game_state row missing - run supabase/schema.sql", "game_state");
  cache = {
    status: r.status, startedAt: r.started_ms || null, duration: r.duration_ms || 600000, resetAt: r.reset_at || 0,
    showcase: { open: !!r.showcase_open, rank: r.showcase_rank || 1 }, prompts: Array.isArray(r.prompts) ? r.prompts : null,
  };
  cacheAt = Date.now();
  return cache;
}
async function setState(p) { await patch("game_state", "id=eq.1", { ...p, updated_at: new Date().toISOString() }); cache = null; }

module.exports = { DbError, select, selectAll, count, upsert, patch, del, getState, setState };
