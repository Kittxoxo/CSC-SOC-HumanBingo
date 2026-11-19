// Open  https://YOUR-SITE/api/health  after deploying: it tells you if the database is connected.
const db = require("./_db");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const missing = [];
  if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SECRET_KEY");
  if (!process.env.ADMIN_PASSWORD) missing.push("ADMIN_PASSWORD");
  if (missing.length) return res.status(500).json({ ok: false, problem: "Missing environment variable(s) in Vercel: " + missing.join(", ") });
  try {
    const st = await db.getState(true);
    const players = await db.count("players");
    res.status(200).json({ ok: true, database: "connected", status: st.status, checkedIn: players });
  } catch (e) {
    let problem = "Could not reach the database.";
    if (e.status === 401 || e.status === 403) problem = "Supabase rejected the key. Re-copy the secret key (Project Settings > API Keys) into SUPABASE_SECRET_KEY.";
    else if (e.status === 404) problem = "Tables not found. Run supabase/schema.sql in the Supabase SQL Editor.";
    else if (e.status === 0) problem = "Missing environment variables.";
    res.status(500).json({ ok: false, problem, code: e.status || 0 });
  }
};
