// Students check in (name + course/year/section) and the page reports which boxes they filled.
const db = require("./_db");
const { bits, hasBingo } = require("./_rank");

const DURATION = 10 * 60 * 1000;
const GRACE = 60 * 1000;
const MAX_PLAYERS = 1500;

const clean = (v, n) => String(v || "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, n);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { pid, mask } = b;
    const name = clean(b.name, 28), sec = clean(b.sec, 24);
    if (name.length < 2) return res.status(400).json({ error: "name" });
    if (sec.length < 2) return res.status(400).json({ error: "section" });
    if (typeof pid !== "string" || !/^[a-z0-9]{8,24}$/.test(pid)) return res.status(400).json({ error: "pid" });
    if (!Number.isInteger(mask) || mask < 0 || mask >= 1 << 25) return res.status(400).json({ error: "mask" });

    const state = await db.getState();
    const now = Date.now();
    const waiting = state.status === "waiting";
    const live = state.status === "running" && now >= state.startedAt && now <= state.startedAt + state.duration + GRACE;
    if (!waiting && !live) return res.status(403).json({ error: "round closed" });
    if (waiting && mask !== 0) return res.status(403).json({ error: "game not started" });

    const [prev] = await db.select("players", "select=mask,t_ms,checkin_ms,bingo_ms&pid=eq." + pid);
    if (!prev && (await db.count("players")) >= MAX_PLAYERS) return res.status(429).json({ error: "full" });
    const o = prev || {};
    // t = when they reached their current number of boxes (ties: earlier wins); c = check-in time; bt = first BINGO time
    const t = o.t_ms && bits(o.mask || 0) >= bits((o.mask || 0) | mask) ? o.t_ms : now;
    const m = waiting ? o.mask || 0 : (o.mask || 0) | mask; // boxes only ever get added, so a late/out-of-order request can never remove one
    await db.upsert("players", [{
      pid, name, sec, mask: m, t_ms: t, checkin_ms: o.checkin_ms || now, bingo_ms: o.bingo_ms || (hasBingo(m) ? now : 0),
    }], "pid");
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("progress", e.status, e.body || e.message);
    return res.status(500).json({ error: "server" });
  }
};
