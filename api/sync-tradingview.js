// api/sync-tradingview.js
// Vercel serverless function — scrapes TradingView watchlist, updates Supabase.
//
// POST /api/sync-tradingview
//
// Required env vars (set in Vercel dashboard):
//   SUPABASE_URL          — your Supabase project URL
//   SUPABASE_ANON_KEY     — your Supabase anon/public key (RLS is disabled so this is fine)
//   BROWSERLESS_TOKEN     — API token from https://browserless.io
//
// Timeout: up to 60 s (hobby plan). Set VERCEL_FUNCTION_MAX_DURATION=60 in
// vercel.json (already done) or upgrade to Pro for up to 300 s.

const puppeteer = require("puppeteer-core");
const { createClient } = require("@supabase/supabase-js");

const WATCHLIST_URL = "https://www.tradingview.com/watchlists/17680889/";

module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate env vars early so errors are clear
  const { SUPABASE_URL, SUPABASE_ANON_KEY, BROWSERLESS_TOKEN } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY env var" });
  }
  if (!BROWSERLESS_TOKEN) {
    return res.status(500).json({ error: "Missing BROWSERLESS_TOKEN env var" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let browser;
  try {
    // Connect to Browserless — no binary needed in the Vercel bundle
    browser = await puppeteer.connect({
      browserWSEndpoint: `wss://chrome.browserless.io?token=${BROWSERLESS_TOKEN}&timeout=45000`,
    });

    const page = await browser.newPage();

    // Realistic browser fingerprint to avoid bot detection
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1280, height: 900 });

    // Navigate and wait for the network to settle
    await page.goto(WATCHLIST_URL, { waitUntil: "networkidle2", timeout: 40000 });

    // Extra buffer for TradingView's JS to finish rendering the list
    await new Promise((r) => setTimeout(r, 4000));

    // ---- Extract instruments ------------------------------------------------
    // TradingView uses obfuscated class names that change often, so we try
    // data-name attributes first (more stable), then fall back to class patterns.
    const instruments = await page.evaluate(() => {
      const results = [];

      // Helper: clean a price string → float
      function parsePrice(raw) {
        if (!raw) return null;
        const cleaned = raw.replace(/[^0-9.]/g, "");
        const val = parseFloat(cleaned);
        return isNaN(val) ? null : val;
      }

      // Strategy 1 — data-name attributes (most stable across TV updates)
      const rows = Array.from(
        document.querySelectorAll('[data-name="watchlist-item-row"]')
      );

      for (const row of rows) {
        const symEl =
          row.querySelector('[data-name="watchlist-item-symbol-name"]') ||
          row.querySelector('[class*="symbolName"]') ||
          row.querySelector('[class*="symbol-"]');

        const descEl =
          row.querySelector('[data-name="watchlist-item-description"]') ||
          row.querySelector('[class*="description"]');

        // Avoid % change columns — price column is typically the first numeric cell
        const priceEl =
          row.querySelector('[data-name="last-price"]') ||
          row.querySelector('[class*="lastPrice"]') ||
          row.querySelector('[class*="last-price"]') ||
          row.querySelector('[class*="price"]:not([class*="change"]):not([class*="percent"])');

        const symbol = symEl?.textContent?.trim();
        if (!symbol) continue;

        results.push({
          symbol,
          name: descEl?.textContent?.trim() || symbol,
          price: parsePrice(priceEl?.textContent),
        });
      }

      // Strategy 2 — fallback: look for any table/list the page rendered
      if (results.length === 0) {
        const fallbackRows = Array.from(
          document.querySelectorAll("tr[class*='row'], li[class*='item']")
        );
        for (const row of fallbackRows) {
          const cells = Array.from(row.querySelectorAll("td, span"));
          // First cell with 1-6 uppercase chars is likely a ticker
          const symCell = cells.find((c) => /^[A-Z0-9.]{1,6}$/.test(c.textContent.trim()));
          if (!symCell) continue;
          // First cell that looks like a price (digits + optional decimals)
          const priceCell = cells.find((c) => /^\d[\d,]*\.?\d*$/.test(c.textContent.trim()));
          results.push({
            symbol: symCell.textContent.trim(),
            name: symCell.textContent.trim(),
            price: parsePrice(priceCell?.textContent),
          });
        }
      }

      return results;
    });
    // -------------------------------------------------------------------------

    if (instruments.length === 0) {
      const title = await page.title();
      return res.status(422).json({
        error:
          "No instruments found. The watchlist may be private, require login, or TradingView's DOM has changed.",
        pageTitle: title,
        hint: "Check that the watchlist URL is public and that the BROWSERLESS_TOKEN is valid.",
      });
    }

    // ---- Upsert instruments (symbol + name + last_price) --------------------
    const instrRows = instruments.map((i) => ({
      symbol: i.symbol,
      name: i.name,
      last_price: i.price,
      updated_at: new Date().toISOString(),
    }));

    const { error: instrErr } = await supabase
      .from("instruments")
      .upsert(instrRows, { onConflict: "symbol" });

    if (instrErr) throw new Error(`instruments upsert: ${instrErr.message}`);

    // ---- Also update marks so the app's mark-to-market logic picks up -------
    // (marks table: symbol, price, updated_at)
    const markRows = instruments
      .filter((i) => i.price != null && i.price > 0)
      .map((i) => ({
        symbol: i.symbol,
        price: i.price,
        updated_at: new Date().toISOString(),
      }));

    if (markRows.length > 0) {
      const { error: marksErr } = await supabase
        .from("marks")
        .upsert(markRows, { onConflict: "symbol" });

      if (marksErr) throw new Error(`marks upsert: ${marksErr.message}`);
    }

    return res.status(200).json({
      success: true,
      count: instruments.length,
      pricesUpdated: markRows.length,
      instruments,
    });
  } catch (err) {
    console.error("[sync-tradingview]", err);
    return res.status(500).json({ error: err.message });
  } finally {
    if (browser) {
      try {
        await browser.disconnect();
      } catch (_) {}
    }
  }
};
