// api/fetch-npr.js — proxy for text.npr.org (browser can't fetch it directly due to CORS)
module.exports = async (req, res) => {
  const { path } = req.query;

  if (!path) return res.status(400).json({ error: "Missing path param" });

  // Allow only digits (topic IDs) or NPR article slugs (nx-s1-..., alphanumeric + hyphens)
  if (!/^[\w-]{1,80}$/.test(path)) {
    return res.status(400).json({ error: "Invalid path" });
  }

  try {
    const url = `https://text.npr.org/${path}`;
    const upstream = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TrackerApp/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    const html = await upstream.text();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=300"); // cache 5 min on CDN
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
