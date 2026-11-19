// Tiny card pictures for the time's-up collage. Public, but only once the timer has run out.
const db = require("./_db");

module.exports = async (req, res) => {
  try {
    const st = await db.getState();
    if (st.status !== "running" || Date.now() < st.startedAt + st.duration) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ items: [], next: null });
    }
    // the 120 most recently saved cards are plenty for a collage
    const cursor = Math.max(0, parseInt(req.query.cursor, 10) || 0);
    const limit = Math.min(60, Math.max(1, parseInt(req.query.limit, 10) || 60));
    if (cursor >= 120) return res.status(200).json({ items: [], next: null });
    const rows = await db.select("players", "select=card_thumb&card_at=gt.0&order=card_at.desc&limit=" + limit + "&offset=" + cursor);
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    res.status(200).json({ items: rows.map((r) => ({ src: r.card_thumb })), next: rows.length === limit && cursor + limit < 120 ? cursor + limit : null });
  } catch (e) {
    console.error("photos", e.status, e.body || e.message);
    res.setHeader("Cache-Control", "no-store");
    res.status(500).json({ error: "server" });
  }
};
