// The 400px pictures of ONE top-5 student, only while the showcase is open.
const db = require("./_db");
const { fromRow, PLAYER_COLS, rank, hid } = require("./_rank");

module.exports = async (req, res) => {
  try {
    const st = await db.getState(true);
    if (!st.showcase.open) return res.status(403).json({ error: "closed" });
    const rows = await db.selectAll("players", "select=" + PLAYER_COLS + "&mask=gt.0&order=pid.asc");
    const top = rank(rows.map(fromRow)).slice(0, 5);
    const w = top.find((p) => hid(p.pid) === String(req.query.id || ""));
    if (!w) return res.status(403).json({ error: "not a winner" });
    const ph = await db.select("photos", "select=box,full_img&pid=eq." + w.pid);
    res.setHeader("Cache-Control", "public, s-maxage=20, stale-while-revalidate=20");
    res.status(200).json({ items: ph.map((x) => ({ i: x.box, src: x.full_img })) });
  } catch (e) {
    console.error("showphotos", e.status, e.body || e.message);
    res.setHeader("Cache-Control", "no-store");
    res.status(500).json({ error: "server" });
  }
};
