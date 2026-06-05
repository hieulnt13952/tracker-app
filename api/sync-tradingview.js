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

    // Track totalCount from API responses (used only for the missing/expected fields)
    let apiTotalCount = null;
    page.on("response", async (response) => {
      try {
        const ct = response.headers()["content-type"] || "";
        if (!ct.includes("application/json")) return;
        const json = await response.json().catch(() => null);
        if (json?.totalCount != null && apiTotalCount === null) {
          apiTotalCount = json.totalCount;
        }
      } catch (_) {}
    });

    // Navigate and wait for the quotesTable to render
    await page.goto(WATCHLIST_URL, { waitUntil: "networkidle2", timeout: 45000 });

    // Wait for the quotesTable to appear in the DOM
    await page.waitForFunction(
      () => !!document.querySelector('[class*="quotesTable"]'),
      { timeout: 20000 }
    ).catch(() => null); // don't throw if it never appears — we'll handle below

    // Extra buffer for all rows to render
    await new Promise((r) => setTimeout(r, 4000));

    // ---- Scrape quotesTable using simplewrap for last price ------------------
    let instruments = await page.evaluate(() => {
      function parsePrice(raw) {
        if (!raw) return null;
        // Strip everything except digits, dots, minus — handle "1,234.56"
        const cleaned = raw.trim().replace(/,/g, "").replace(/[^\d.\-]/g, "");
        const val = parseFloat(cleaned);
        return isNaN(val) ? null : val;
      }

      const results = [];

      // The quotes table container
      const table = document.querySelector('[class*="quotesTable"]');
      if (!table) return { rows: results, debug: "quotesTable not found" };

      // Each row in the table (skip pure header rows)
      const rows = Array.from(table.querySelectorAll('[class*="listRow"], [class*="row"]'))
        .filter((r) => !r.className.includes("header") && !r.className.includes("Head"));

      for (const row of rows) {
        // ---- Last price: first simplewrap in the row (first data column) ----
        const simplewraps = Array.from(row.querySelectorAll('[class*="simplewrap"]'));
        const priceEl = simplewraps[0] || null;

        // ---- Symbol / ticker ------------------------------------------------
        const symEl =
          row.querySelector('[class*="tickerName"]') ||
          row.querySelector('[class*="symbolName"]') ||
          row.querySelector('[class*="ticker-"]') ||
          row.querySelector('[class*="symbol-"]');

        // ---- Description / company name -------------------------------------
        const descEl =
          row.querySelector('[class*="description"]') ||
          row.querySelector('[class*="title"]');

        const symbol = symEl?.textContent?.trim();
        if (!symbol) continue;

        results.push({
          symbol,
          name: descEl?.textContent?.trim() || symbol,
          price: parsePrice(priceEl?.textContent),
          // debug fields — visible in the raw JSON on the TradingView page
          _priceRaw: priceEl?.textContent?.trim() || null,
          _simplewrapCount: simplewraps.length,
        });
      }

      return { rows: results, debug: `found ${results.length} rows in quotesTable` };
    });

    // page.evaluate returns { rows, debug }
    const debugInfo = instruments.debug || "";
    instruments = instruments.rows || [];

    // ---- If nothing found, return full diagnostics --------------------------
    if (instruments.length === 0) {
      const pageTitle = await page.title();
      const pageUrl   = page.url();
      const tableHTML = await page.evaluate(() => {
        const t = document.querySelector('[class*="quotesTable"]');
        return t ? t.outerHTML.slice(0, 5000) : "quotesTable element not found in DOM";
      });

      return res.status(422).json({
        error: "No instruments found in quotesTable.",
        pageTitle,
        pageUrl,
        debugInfo,
        tableHTML,
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
      totalExpected: apiTotalCount,
      missing: apiTotalCount != null ? apiTotalCount - instruments.length : null,
      instruments,   // includes _priceRaw and _simplewrapCount for debugging
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
