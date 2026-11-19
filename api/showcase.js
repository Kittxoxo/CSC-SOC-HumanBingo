// The winners showcase was removed (BINGO is a blackout and every blackout can qualify). Kept as a harmless stub.
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "public, s-maxage=30");
  res.status(200).json({ open: false, winners: [] });
};
