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
        if (state.status === "running" && state.startedAt && now < state.startedAt + state.duration) return res.status(409).json({ error: "already started" });
        // ON never wipes anything: it resumes (or begins) the game. Only Reset clears students, cards and attendance.
        await db.setState({ status: "running", started_ms: now, duration_ms: 12 * 60 * 60 * 1000, /* no countdown: the game stays ON until the host ends it */ showcase_open: false, showcase_rank: 1 });
        return res.status(200).json({ ok: true });
      }
      case "event": { // "now showing" label students see instead of a timer
        const name = String(body.name == null ? "" : body.name).replace(/\s+/g, " ").trim().slice(0, 80);
        try { await db.setState({ event_name: name || null }); }
        catch (e) { if (e.status === 400) return res.status(500).json({ error: "server", hint: "Database is out of date: run the latest supabase/schema.sql in the Supabase SQL Editor." }); throw e; }
        return res.status(200).json({ ok: true, event: name });
      }
      case "endnow":
        if (state.status !== "running") return res.status(409).json({ error: "not running" });
        await db.setState({ duration_ms: Math.max(1000, now - state.startedAt) });
        return res.status(200).json({ ok: true });
      case "reset": // wipes everything; phones clear their cards when they see the new reset_at
        await db.del("players", ALL);
        await db.setState({ status: "waiting", started_ms: null, reset_at: now, showcase_open: false, showcase_rank: 1, event_name: null });
        return res.status(200).json({ ok: true });
      case "prompts": {
        const p = body.prompts;
        if (!Array.isArray(p) || p.length !== 24 || !p.every((x) => typeof x === "string" && x.length <= 40))
          return res.status(400).json({ error: "bad prompts" });
        await db.setState({ prompts: p });
        return res.status(200).json({ ok: true });
      }
      case "cards": { // the saved card pictures, a few at a time, for the zip download
        const cursor = Math.max(0, parseInt(body.cursor, 10) || 0);
        const limit = Math.min(8, Math.max(1, parseInt(body.limit, 10) || 8));
        const rows = await db.select("players", "select=pid,name,sec,mask,card_img&card_at=gt.0&order=checkin_ms.asc,pid.asc&limit=" + limit + "&offset=" + cursor);
        return res.status(200).json({
          items: rows.map((r) => ({ id: r.pid, name: r.name, sec: r.sec, mask: r.mask, src: r.card_img })),
          next: rows.length === limit ? cursor + limit : null,
        });
      }
      case "board": { // live board: check-ins, progress, bingo + claim status
        const [rows, photos] = await Promise.all([
          db.selectAll("players", "select=" + PLAYER_COLS + "&order=pid.asc")
            .catch((e) => { if (e.status !== 400) throw e; return db.selectAll("players", "select=" + PLAYER_COLS.replace(",card_at", "") + "&order=pid.asc"); }),
          db.count("players", "card_at=gt.0").catch(() => 0),
        ]);
        const players = rows.map(fromRow).map((p) => ({ pid: p.pid, name: p.name, sec: p.sec, mask: p.mask, t: p.t, c: p.c, bt: p.bt, claimed: p.claimed, ca: p.ca }));
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
      case "cardof": { // one student's saved card picture
        const pid = String(body.pid || "");
        if (!PID.test(pid)) return res.status(400).json({ error: "pid" });
        const [r] = await db.select("players", "select=name,card_img,card_at&pid=eq." + pid);
        return res.status(200).json({ src: r && r.card_img ? r.card_img : null, at: r ? r.card_at : 0, name: r ? r.name : "" });
      }
      case "claim": { // the BINGO incentive was handed out (or undo)
        const pid = String(body.pid || "");
        if (!PID.test(pid)) return res.status(400).json({ error: "pid" });
        await db.patch("players", "pid=eq." + pid, { claimed_ms: body.value === false ? 0 : now });
        return res.status(200).json({ ok: true });
      }
      case "clearphotos":
        await db.patch("players", ALL, { card_img: null, card_thumb: null, card_at: 0 });
        return res.status(200).json({ ok: true });
      default:
        return res.status(400).json({ error: "bad action" });
    }
  } catch (e) {
    console.error("admin", body.action, e.status, e.body || e.message);
    const raw = JSON.stringify(e.body || e.message || "");
    const hint = /column|42703|PGRST204|PGRST200|does not exist/i.test(raw)
      ? "Database is out of date: run the latest supabase/schema.sql in the Supabase SQL Editor, then try again."
      : "Server error. Check Vercel > Logs.";
    return res.status(500).json({ error: "server", hint });
  }
};
