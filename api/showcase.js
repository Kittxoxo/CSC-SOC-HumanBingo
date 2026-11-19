// Public, but only returns anything while the host has the winners showcase open.
const db = require("./_db");
const { fromRow, PLAYER_COLS, rank, hid } = require("./_rank");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "public, s-maxage=2, stale-while-revalidate=3");
  try {
    const st = await db.getState(true);
    if (!st.showcase.open) return res.status(200).json({ open: false, winners: [] });
    const rows = await db.selectAll("players", "select=" + PLAYER_COLS + "&mask=gt.0&order=pid.asc");
    const top = rank(rows.map(fromRow)).slice(0, 5);
    res.status(200).json({
      open: true, rank: st.showcase.rank,
      winners: top.map((p, i) => ({ id: hid(p.pid), name: p.name, count: p.count, mask: p.mask, rank: i + 1 })),
    });
  } catch (e) {
    console.error("showcase", e.status, e.body || e.message);
    res.setHeader("Cache-Control", "no-store");
    res.status(500).json({ error: "server" });
  }
};
