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

    // ---- Intercept TradingView's internal API responses ---------------------
    // TradingView loads watchlist symbol + price data via XHR/fetch.
    // Capturing that JSON is far more reliable than scraping the DOM.
    const capturedPayloads = [];
    let apiTotalCount = null; // totalCount advertised by TradingView's API

    page.on("response", async (response) => {
      try {
        const url = response.url();
        const ct = response.headers()["content-type"] || "";
        if (!ct.includes("application/json")) return;

        // Only look at TradingView API domains
        if (
          !url.includes("tradingview.com") &&
          !url.includes("pine-facade") &&
          !url.includes("scanner.tradingview")
        ) return;

        const json = await response.json().catch(() => null);
        if (!json) return;
        capturedPayloads.push({ url, json });

        // Capture the expected total so we know if we got everything
        if (json.totalCount != null && apiTotalCount === null) {
          apiTotalCount = json.totalCount;
        }
      } catch (_) {}
    });

    // Navigate and wait for page + XHR to settle
    await page.goto(WATCHLIST_URL, { waitUntil: "networkidle2", timeout: 45000 });
    await new Promise((r) => setTimeout(r, 8000)); // 8 s — TV loads in batches

    // ---- Try to extract symbols from captured API payloads -----------------
    let instruments = extractFromPayloads(capturedPayloads);

    // If API told us the total and we're short, wait another 5 s and retry
    if (apiTotalCount != null && instruments.length < apiTotalCount) {
      await new Promise((r) => setTimeout(r, 5000));
      instruments = extractFromPayloads(capturedPayloads);
    }

    // ---- Fall back to DOM scraping if API interception got nothing ----------
    if (instruments.length === 0) {
      instruments = await page.evaluate(() => {
        const results = [];

        function parsePrice(raw) {
          if (!raw) return null;
          const cleaned = raw.replace(/[^0-9.]/g, "");
          const val = parseFloat(cleaned);
          return isNaN(val) ? null : val;
        }

        // Try every selector pattern we know about
        const rowSelectors = [
          '[data-name="watchlist-item-row"]',
          '[class*="watchlistRow"]',
          '[class*="watchlist-row"]',
          '[class*="symbolRow"]',
          "tr[class*='row']",
        ];

        for (const sel of rowSelectors) {
          const rows = Array.from(document.querySelectorAll(sel));
          if (rows.length === 0) continue;

          for (const row of rows) {
            // Symbol: short uppercase text
            const symEl =
              row.querySelector('[data-name="watchlist-item-symbol-name"]') ||
              row.querySelector('[class*="symbolName"]') ||
              row.querySelector('[class*="symbol"]') ||
              Array.from(row.querySelectorAll("span")).find((el) =>
                /^[A-Z0-9.:_-]{1,15}$/.test(el.textContent.trim())
              );

            const descEl =
              row.querySelector('[data-name="watchlist-item-description"]') ||
              row.querySelector('[class*="description"]');

            const priceEl =
              row.querySelector('[data-name="last-price"]') ||
              row.querySelector('[class*="lastPrice"]') ||
              row.querySelector('[class*="last-price"]');

            const symbol = symEl?.textContent?.trim();
            if (!symbol || !/^[A-Z0-9.:_-]{1,15}$/.test(symbol)) continue;

            results.push({
              symbol,
              name: descEl?.textContent?.trim() || symbol,
              price: parsePrice(priceEl?.textContent),
            });
          }

          if (results.length > 0) break;
        }

        return results;
      });
    }

    // ---- If still empty, return debug info so we can diagnose --------------
    if (instruments.length === 0) {
      const pageTitle = await page.title();
      const pageUrl = page.url();
      const bodySnippet = await page.evaluate(() =>
        document.body?.innerHTML?.slice(0, 3000) || ""
      );
      const apiUrls = capturedPayloads.map((p) => p.url);

      return res.status(422).json({
        error: "No instruments found.",
        pageTitle,
        pageUrl,
        apiUrlsCaptured: apiUrls,
        bodySnippet,
      });
    }

    // ---- Upsert instruments ------------------------------------------------
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
      totalExpected: apiTotalCount,   // null if TV didn't advertise a total
      missing: apiTotalCount != null ? apiTotalCount - instruments.length : null,
      instruments,
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

// ---------------------------------------------------------------------------
// Walk every captured API JSON payload and look for watchlist symbol data.
// TradingView's internal API shapes vary; this handles the known ones.
// ---------------------------------------------------------------------------
function extractFromPayloads(payloads) {
  const results = [];
  const seen = new Set();

  for (const { url, json } of payloads) {
    const candidates = [];

    // Shape 1: { symbols: ["AAPL", ...] }
    if (Array.isArray(json?.symbols)) {
      json.symbols.forEach((s) => {
        if (typeof s === "string") candidates.push({ symbol: s.replace(/^.*:/, ""), name: s, price: null });
        else if (s?.name) candidates.push({ symbol: s.name.replace(/^.*:/, ""), name: s.description || s.name, price: null });
      });
    }

    // Shape 2: { data: [{ s: "NASDAQ:AAPL", d: [price, ...] }, ...] }
    if (Array.isArray(json?.data)) {
      json.data.forEach((row) => {
        const sym = (row?.s || "").replace(/^.*:/, "");
        if (!sym) return;
        const price = Array.isArray(row?.d) ? (parseFloat(row.d[0]) || null) : null;
        candidates.push({ symbol: sym, name: sym, price });
      });
    }

    // Shape 3: array of objects with ticker/symbol field
    if (Array.isArray(json)) {
      json.forEach((item) => {
        const sym = (item?.symbol || item?.ticker || item?.name || "").replace(/^.*:/, "");
        if (sym && /^[A-Z0-9.]{1,10}$/.test(sym)) {
          candidates.push({ symbol: sym, name: item?.description || sym, price: parseFloat(item?.price || item?.close) || null });
        }
      });
    }

    for (const c of candidates) {
      if (c.symbol && !seen.has(c.symbol)) {
        seen.add(c.symbol);
        results.push(c);
      }
    }
  }

  return results;
}
