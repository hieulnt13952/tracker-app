// api/sync-tradingview.js
// Vercel serverless function — scrapes TradingView watchlist, updates Supabase.
//
// POST /api/sync-tradingview
//
// Required env vars (set in Vercel dashboard):
//   SUPABASE_URL          — your Supabase project URL
//   SUPABASE_ANON_KEY     — your Supabase anon/public key (RLS is disabled so this is fine)
//   BROWSERLESS_TOKEN     — API token from https://browserless.io

const puppeteer = require("puppeteer-core");
const { createClient } = require("@supabase/supabase-js");

const WATCHLIST_URL = "https://www.tradingview.com/watchlists/17680889/";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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
    browser = await puppeteer.connect({
      browserWSEndpoint: `wss://chrome.browserless.io?token=${BROWSERLESS_TOKEN}&timeout=50000`,
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1280, height: 900 });

    await page.goto(WATCHLIST_URL, { waitUntil: "networkidle2", timeout: 45000 });

    // Wait until at least one listItem row exists in the DOM
    await page.waitForFunction(
      () => document.querySelectorAll('[data-qa-id="column-symbol"]').length > 0,
      { timeout: 20000 }
    ).catch(() => null);

    // Small buffer for all rows to paint
    await new Promise((r) => setTimeout(r, 3000));

    // ---- Scrape using the stable data-qa-id attributes ----------------------
    const instruments = await page.evaluate(() => {
      function parsePrice(raw) {
        if (!raw) return null;
        // Remove thousands separators and any non-numeric chars except dot and minus
        const cleaned = raw.trim().replace(/,/g, "").replace(/[^\d.\-]/g, "");
        const val = parseFloat(cleaned);
        return isNaN(val) ? null : val;
      }

      // Each watchlist row is a div[class*="listItem-"]
      const rows = Array.from(document.querySelectorAll('[class*="listItem-"]'));
      const results = [];

      for (const row of rows) {
        // ---- Symbol cell (data-qa-id is added by TV for automation) ---------
        const symbolCell = row.querySelector('[data-qa-id="column-symbol"]');
        if (!symbolCell) continue;

        // Ticker text lives inside <a><span class="symbol-...">BTCUSD</span></a>
        const symbolEl = symbolCell.querySelector('a span[class*="symbol-"]');
        // Description sits beside the link
        const descEl = symbolCell.querySelector('span[class*="description-"]');

        // ---- Last price cell ------------------------------------------------
        const priceCell = row.querySelector('[data-qa-id="column-last_price"]');
        // First value span is the price number; second is the currency label
        const priceEl = priceCell ? priceCell.querySelector('span[class*="value-"]') : null;

        const symbol = symbolEl?.textContent?.trim();
        if (!symbol) continue;

        results.push({
          symbol,
          name: descEl?.textContent?.trim() || symbol,
          price: parsePrice(priceEl?.textContent),
          _priceRaw: priceEl?.textContent?.trim() ?? null,
        });
      }

      return results;
    });

    // ---- If nothing found return diagnostics --------------------------------
    if (instruments.length === 0) {
      const pageTitle = await page.title();
      const pageUrl   = page.url();
      // Return a small slice of the body so we can see what rendered
      const bodySnippet = await page.evaluate(() =>
        document.body?.innerHTML?.slice(0, 4000) || ""
      );
      return res.status(422).json({
        error: "No rows found. The page may not have rendered or the URL requires login.",
        pageTitle,
        pageUrl,
        bodySnippet,
      });
    }

    // ---- Upsert instruments -------------------------------------------------
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

    return res.status(200).json({
      success: true,
      count: instruments.length,
      instruments, // includes _priceRaw for verification in the TradingView page
    });
  } catch (err) {
    console.error("[sync-tradingview]", err);
    return res.status(500).json({ error: err.message });
  } finally {
    if (browser) {
      try { await browser.disconnect(); } catch (_) {}
    }
  }
};
