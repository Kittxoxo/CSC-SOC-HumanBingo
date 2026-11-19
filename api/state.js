const db = require("./_db");

module.exports = async (req, res) => {
  // Cached at Vercel's edge for 3 s: 500 phones asking = about 1 database read every 3 s.
  res.setHeader("Cache-Control", "public, s-maxage=3, stale-while-revalidate=5");
  try {
    const [st, photos, checkedIn] = await Promise.all([db.getState(true), db.count("players", "card_at=gt.0"), db.count("players", "pid=not.is.null")]);
    res.status(200).json({
      status: st.status, startedAt: st.startedAt, duration: st.duration, resetAt: st.resetAt,
      showcase: st.showcase, prompts: st.prompts, event: st.event, photos, checkedIn,
    });
  } catch (e) {
    console.error("state", e.status, e.body || e.message);
    res.setHeader("Cache-Control", "no-store");
    res.status(500).json({ error: "server" });
  }
};
