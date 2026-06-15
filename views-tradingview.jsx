// ============================================================
//  views-tradingview.jsx — instruments table + price sync + chart
// ============================================================

// Ticker tape — loads the TradingView module script once, then renders the
// custom element via dangerouslySetInnerHTML so the browser upgrades it.
function TVTickerTape({ symbolsStr }) {
  useEffect(() => {
    if (!document.querySelector('script[src*="tv-ticker-tape"]')) {
      const s = document.createElement("script");
      s.type = "module";
      s.src = "https://widgets.tradingview-widget.com/w/en/tv-ticker-tape.js";
      document.head.appendChild(s);
    }
  }, []);

  if (!symbolsStr) return null;

  return (
    <div
      style={{ marginBottom: "1.25rem", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}
      dangerouslySetInnerHTML={{ __html: `<tv-ticker-tape symbols="${symbolsStr}"></tv-ticker-tape>` }}
    />
  );
}

// Adapted from the TradingView embed widget (no ES module imports needed —
// useEffect/useRef are already global from components.jsx).
function TVChart() {
  const container = useRef();

  useEffect(() => {
    const el = container.current;
    if (!el) return;

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      allow_symbol_change: true,
      calendar: false,
      details: false,
      hide_side_toolbar: true,
      hide_top_toolbar: false,
      hide_legend: false,
      hide_volume: false,
      hotlist: false,
      interval: "D",
      locale: "en",
      save_image: true,
      style: "1",
      symbol: "NASDAQ:AAPL",
      theme: "light",
      timezone: "Etc/UTC",
      backgroundColor: "#ffffff",
      gridColor: "rgba(46, 46, 46, 0.06)",
      watchlist: [],
      withdateranges: false,
      compareSymbols: [],
      studies: [],
      autosize: true,
    });
    el.appendChild(script);

    return () => {
      // clean up so re-mounting doesn't add a second chart
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, []);

  return (
    <div
      className="tradingview-widget-container"
      ref={container}
      style={{ height: "100%", width: "100%" }}
    >
      <div
        className="tradingview-widget-container__widget"
        style={{ height: "calc(100% - 28px)", width: "100%" }}
      />
      <div style={{ fontSize: 11, color: "var(--faint)", padding: "4px 0", textAlign: "right" }}>
        <a
          href="https://www.tradingview.com/"
          rel="noopener nofollow"
          target="_blank"
          style={{ color: "#2196f3", textDecoration: "none" }}
        >
          Chart
        </a>
        {" "}by TradingView
      </div>
    </div>
  );
}

function TradingViewSyncView({ state, onRefresh }) {
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | loading | ok | error
  const [syncError, setSyncError]   = useState("");
  const [usage, setUsage]           = useState(null);
  const [tickers, setTickers]       = useState([]);

  useEffect(() => {
    db.loadSyncUsage().then(setUsage).catch(() => {});
    db.loadTickerList().then(setTickers).catch(() => {});
  }, []);

  const symbolsStr = useMemo(
    () => tickers.map((t) => t.symbol).join(","),
    [tickers]
  );

  async function handleSync() {
    setSyncStatus("loading");
    setSyncError("");
    try {
      const res  = await fetch("/api/sync-tradingview", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setSyncStatus("ok");
      if (data.usage) setUsage(data.usage);
      if (onRefresh) onRefresh();
      setTimeout(() => setSyncStatus("idle"), 4000);
    } catch (err) {
      setSyncError(err.message);
      setSyncStatus("error");
    }
  }

  const instruments = useMemo(() => {
    return Object.entries(state.instruments || {})
      .map(([symbol, inst]) => ({ symbol, ...inst }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [state.instruments]);

  const remaining  = usage?.remaining   ?? null;
  const limitCount = usage?.limit_count ?? 1000;
  const usedCount  = usage?.refresh_count ?? 0;
  const usagePct   = limitCount > 0 ? (usedCount / limitCount) * 100 : 0;
  const usageColor = usagePct >= 90 ? "var(--neg)" : usagePct >= 70 ? "#b0823f" : "var(--pos)";

  return (
    <div className="view">
      <TVTickerTape symbolsStr={symbolsStr} />

      <header className="view-head">
        <div>
          <h1>TradingView</h1>
          <p className="view-sub">Instruments table · prices synced from the TradingView watchlist.</p>
        </div>
        <div className="head-actions">
          <button
            className={`btn primary${syncStatus === "loading" ? " disabled" : ""}`}
            disabled={syncStatus === "loading"}
            onClick={handleSync}
          >
            {syncStatus === "loading" ? "Syncing…" : syncStatus === "ok" ? "Synced ✓" : "Sync TradingView"}
          </button>
        </div>
      </header>

      {/* Usage banner */}
      {usage && (
        <div style={{
          display: "flex", alignItems: "center", gap: "1rem",
          padding: "0.6rem 1rem", marginBottom: "1.25rem",
          background: "var(--surface-2)", borderRadius: 8,
          border: "1px solid var(--border)",
        }}>
          <span style={{ fontSize: 13, color: "var(--fg-2)" }}>Browserless syncs this month:</span>
          <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--mono)", color: usageColor }}>
            {usedCount} / {limitCount}
          </span>
          <span style={{ fontSize: 13, color: usageColor, fontWeight: remaining <= 100 ? 600 : 400 }}>
            — {remaining} remaining
          </span>
          <span style={{ fontSize: 12, color: "var(--fg-3)", marginLeft: "auto" }}>{usage.month}</span>
        </div>
      )}

      {syncError && <div className="warn" style={{ marginBottom: "1rem" }}>{syncError}</div>}

      {/* Two-column: instruments table + live chart */}
      <div className="cols-2" style={{ alignItems: "start" }}>

        {/* Left — instruments table */}
        <section className="panel">
          <div className="panel-head">
            <h2>Instruments</h2>
            <span className="panel-meta">{instruments.length} rows</span>
          </div>
          <div className="panel-body no-pad">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Symbol</th>
                  <th>Name</th>
                  <th className="r">Last Price</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {instruments.map((inst, idx) => (
                  <tr key={inst.symbol}>
                    <td className="muted mono" style={{ fontSize: 12 }}>{idx + 1}</td>
                    <td><span className="sym">{inst.symbol}</span></td>
                    <td className="muted">{inst.name || "—"}</td>
                    <td className="r mono">
                      {inst.last_price != null
                        ? fmtNum(inst.last_price, inst.decimals ?? 2)
                        : <span className="muted">—</span>}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {inst.updated_at ? fmtDateTimeEST(inst.updated_at) : "—"}
                    </td>
                  </tr>
                ))}
                {instruments.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <Empty title="No instruments" sub="Instruments are added when you record a trade or sync from TradingView." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right — live TradingView chart */}
        <section className="panel" style={{ overflow: "hidden" }}>
          <div className="panel-head">
            <h2>Chart</h2>
            <span className="panel-meta">Advanced chart · change symbol in the widget</span>
          </div>
          <div style={{ height: 520, padding: 0 }}>
            <TVChart />
          </div>
        </section>

      </div>
    </div>
  );
}

window.TradingViewSyncView = TradingViewSyncView;
