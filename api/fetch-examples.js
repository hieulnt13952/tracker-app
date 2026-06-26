// api/fetch-examples.js — proxy for onelook.com examples API (CORS bypass)
module.exports = async (req, res) => {
  const { word } = req.query;
  if (!word) return res.status(400).json({ error: "Missing word param" });
  if (!/^[\w'\- ]{1,60}$/.test(word)) return res.status(400).json({ error: "Invalid word" });

  try {
    const url =
      "https://www.onelook.com/api/words?max=501&nonorm=1&k=rz_wke&rel_wke=" +
      encodeURIComponent(word);
    const upstream = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TrackerApp/1.0)" },
    });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: "Upstream error " + upstream.status });
    }
    const data = await upstream.json();
    res.setHeader("Cache-Control", "s-maxage=300");
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
