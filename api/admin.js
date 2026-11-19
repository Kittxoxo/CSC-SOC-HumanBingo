// Host-only actions. Every call needs the ADMIN_PASSWORD.
const crypto = require("crypto");
const db = require("./_db");
const { fromRow, PLAYER_COLS } = require("./_rank");

const DURATION = 10 * 60 * 1000;
const ALL = "pid=not.is.null"; // PostgREST refuses unfiltered deletes/updates, so "everything" is written as a filter
const PID = /^[a-z0-9]{8,24}$/;

function okPassword(given) {
  const real = process.env.ADMIN_PASSWORD || "";
  if (!real || typeof given !== "string") return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}; }
  catch (e) { return res.status(400).json({ error: "json" }); }
  if (!okPassword(body.password)) return res.status(401).json({ error: "unauthorized" });

  try {
    if (body.action === "check") return res.status(200).json({ ok: true });
    const state = await db.getState(true);
    const now = Date.now();

    switch (body.action) {
      case "start": {
        if (state.status === "running") return res.status(409).json({ error: "already started" });
        const mins = body.minutes == null ? 10 : Math.round(Number(body.minutes));
        if (!(mins >= 1 && mins <= 120)) return res.status(400).json({ error: "minutes 1-120" });
        // new round: photos, boxes and claims are cleared, but students stay checked in
        await db.del("photos", ALL);
        await db.patch("players", ALL, { mask: 0, t_ms: now, bingo_ms: 0, claimed_ms: 0 });
        await db.setState({ status: "running", started_ms: now, duration_ms: mins * 60000, showcase_open: false, showcase_rank: 1 });
        return res.status(200).json({ ok: true });
      }
      case "adjust": { // add or remove time
        if (state.status !== "running") return res.status(409).json({ error: "not running" });
        const d = Number(body.delta);
        if (!Number.isFinite(d) || Math.abs(d) > 60 * 60 * 1000) return res.status(400).json({ error: "delta" });
        const duration = Math.min(4 * 60 * 60 * 1000, Math.max(10000, (state.duration || DURATION) + d));
        await db.setState({ duration_ms: duration, showcase_open: false, showcase_rank: 1 });
        return res.status(200).json({ ok: true, duration });
      }
      case "endnow":
        if (state.status !== "running") return res.status(409).json({ error: "not running" });
        await db.setState({ duration_ms: Math.max(1000, now - state.startedAt) });
        return res.status(200).json({ ok: true });
      case "reset": // wipes everything (photos go with the students); phones clear their cards when they see the new reset_at
        await db.del("players", ALL);
        await db.setState({ status: "waiting", started_ms: null, reset_at: now, showcase_open: false, showcase_rank: 1 });
        return res.status(200).json({ ok: true });
      case "prompts": {
        const p = body.prompts;
        if (!Array.isArray(p) || p.length !== 24 || !p.every((x) => typeof x === "string" && x.length <= 40))
          return res.status(400).json({ error: "bad prompts" });
        await db.setState({ prompts: p });
        return res.status(200).json({ ok: true });
      }
      case "photos": { // bigger pictures, 20 at a time, for the zip download
        const cursor = Math.max(0, parseInt(body.cursor, 10) || 0);
        const limit = Math.min(20, Math.max(1, parseInt(body.limit, 10) || 20));
        const rows = await db.select("photos", "select=pid,box,full_img&order=pid.asc,box.asc&limit=" + limit + "&offset=" + cursor);
        return res.status(200).json({
          items: rows.map((r) => ({ id: r.pid + ":" + r.box, src: r.full_img })),
          next: rows.length === limit ? cursor + limit : null,
        });
      }
      case "board": { // live board: check-ins, progress, bingo + claim status
        const [rows, photos] = await Promise.all([
          db.selectAll("players", "select=" + PLAYER_COLS + "&order=pid.asc"),
          db.count("photos"),
        ]);
        const players = rows.map(fromRow).map((p) => ({ pid: p.pid, name: p.name, sec: p.sec, mask: p.mask, t: p.t, c: p.c, bt: p.bt, claimed: p.claimed }));
        return res.status(200).json({ status: state.status, startedAt: state.startedAt, duration: state.duration, players, photos });
      }
      case "showcase": {
        const r = Number(body.rank);
        if (!Number.isInteger(r) || r < 1 || r > 5) return res.status(400).json({ error: "rank 1-5" });
        const finished = state.status === "running" && now >= state.startedAt + state.duration;
        if (!finished) return res.status(409).json({ error: "round not finished" });
        await db.setState({ showcase_open: body.open !== false, showcase_rank: r });
        return res.status(200).json({ ok: true });
      }
      case "thumbs": { // small pictures for the live board
        const ids = Array.isArray(body.ids) ? body.ids.slice(0, 60) : [];
        if (!ids.every((id) => typeof id === "string" && /^[a-z0-9]{8,24}:\d{1,2}$/.test(id))) return res.status(400).json({ error: "ids" });
        if (!ids.length) return res.status(200).json({ items: [] });
        const pids = [...new Set(ids.map((id) => id.split(":")[0]))];
        const rows = await db.select("photos", "select=pid,box,thumb&pid=in.(" + pids.join(",") + ")");
        const want = new Set(ids);
        return res.status(200).json({ items: rows.filter((r) => want.has(r.pid + ":" + r.box)).map((r) => ({ id: r.pid + ":" + r.box, src: r.thumb })) });
      }
      case "playerphotos": { // full-size pictures of one student, for downloading their card
        const pid = String(body.pid || "");
        if (!PID.test(pid)) return res.status(400).json({ error: "pid" });
        const rows = await db.select("photos", "select=box,full_img&pid=eq." + pid + "&order=box.asc");
        return res.status(200).json({ items: rows.map((r) => ({ i: r.box, src: r.full_img })) });
      }
      case "claim": { // the BINGO incentive was handed out (or undo)
        const pid = String(body.pid || "");
        if (!PID.test(pid)) return res.status(400).json({ error: "pid" });
        await db.patch("players", "pid=eq." + pid, { claimed_ms: body.value === false ? 0 : now });
        return res.status(200).json({ ok: true });
      }
      case "clearphotos":
        await db.del("photos", ALL);
        return res.status(200).json({ ok: true });
      default:
        return res.status(400).json({ error: "bad action" });
    }
  } catch (e) {
    console.error("admin", body.action, e.status, e.body || e.message);
    return res.status(500).json({ error: "server" });
  }
};
