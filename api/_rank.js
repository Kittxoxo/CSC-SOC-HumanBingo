const crypto = require("crypto");

const bits = (m) => { let c = 0; while (m) { c += m & 1; m >>>= 1; } return c; };
const hid = (pid) => crypto.createHash("sha1").update(pid).digest("hex").slice(0, 10);

// Blackout rules: a BINGO means every box on the card is filled (all 24 squares; the centre is FREE).
const FULL = (1 << 25) - 1;
const hasBingo = (m) => ((m | (1 << 12)) & FULL) === FULL;

// a database row -> the player object the rest of the code uses
const fromRow = (r) => ({
  pid: r.pid, name: r.name || "Player", sec: r.sec || "", mask: r.mask || 0, t: r.t_ms || 0,
  c: r.checkin_ms || 0, bt: r.bingo_ms || 0, claimed: r.claimed_ms || 0, count: bits(r.mask || 0),
});
const PLAYER_COLS = "pid,name,sec,mask,t_ms,checkin_ms,bingo_ms,claimed_ms";

// most boxes first; if tied, whoever got there first
const rank = (players) =>
  players.slice().sort((a, b) => b.count - a.count || a.t - b.t || a.name.localeCompare(b.name));

module.exports = { bits, hid, hasBingo, fromRow, PLAYER_COLS, rank };
