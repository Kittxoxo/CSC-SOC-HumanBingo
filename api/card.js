// A student's whole bingo card (one picture, selfies already on it) is saved here. One picture per student.
const db = require("./_db");

const GRACE = 5 * 60 * 1000; // lets slow phones finish uploading after time is up

const isImg = (s, max) =>
  typeof s === "string" && s.length <= max && s.startsWith("data:image/jpeg;base64,") &&
  /^[A-Za-z0-9+/=]+$/.test(s.slice(23));

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { pid, img, thumb } = b;
    if (typeof pid !== "string" || !/^[a-z0-9]{8,24}$/.test(pid)) return res.status(400).json({ error: "pid" });
    if (!isImg(img, 330000) || !isImg(thumb, 30000)) return res.status(400).json({ error: "image" });

    const state = await db.getState();
    const now = Date.now();
    if (state.status !== "running" || now < state.startedAt || now > state.startedAt + state.duration + GRACE)
      return res.status(403).json({ error: "round closed" });

    const [row] = await db.select("players", "select=pid&pid=eq." + pid);
    if (!row) return res.status(400).json({ error: "not checked in" });
    await db.patch("players", "pid=eq." + pid, { card_img: img, card_thumb: thumb, card_at: now });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("card", e.status, e.body || e.message);
    return res.status(500).json({ error: "server" });
  }
};
