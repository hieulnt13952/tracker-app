// ============================================================
//  views-tradingview.jsx — instruments table + price sync
// ============================================================

function TradingViewSyncView({ state, onRefresh }) {
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | loading | ok | error
  const [syncError, setSyncError]   = useState("");
  const [usage, setUsage]           = useState(null);   // { month, limit_count, refresh_count, remaining }

  // Load current month's usage on mount
  useEffect(() => {
    db.loadSyncUsage().then(setUsage).catch(() => {});
  }, []);

  async function handleSync() {
    setSyncStatus("loading");
    setSyncError("");
    try {
      const res  = await fetch("/api/sync-tradingview", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setSyncStatus("ok");
      if (data.usage) setUsage(data.usage);
      if (onRefresh) onRefresh(); // reload state.instruments from Supabase
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

  const remaining  = usage?.remaining  ?? null;
  const limitCount = usage?.limit_count ?? 1000;
  const usedCount  = usage?.refresh_count ?? 0;
  const usagePct   = limitCount > 0 ? (usedCount / limitCount) * 100 : 0;
  const usageColor = usagePct >= 90 ? "var(--neg)" : usagePct >= 70 ? "#b0823f" : "var(--pos)";

  return (
    <div className="view">
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
          <span style={{ fontSize: 13, color: "var(--fg-2)" }}>
            Browserless syncs this month:
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--mono)", color: usageColor }}>
            {usedCount} / {limitCount}
          </span>
          <span style={{ fontSize: 13, color: usageColor, fontWeight: remaining <= 100 ? 600 : 400 }}>
            — {remaining} remaining
          </span>
          <span style={{ fontSize: 12, color: "var(--fg-3)", marginLeft: "auto" }}>
            {usage.month}
          </span>
        </div>
      )}

      {syncError && <div className="warn" style={{ marginBottom: "1rem" }}>{syncError}</div>}

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
                <th className="r">Decimals</th>
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
                  <td className="r mono muted">{inst.decimals ?? 2}</td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {inst.updated_at ? fmtDateTimeEST(inst.updated_at) : "—"}
                  </td>
                </tr>
              ))}
              {instruments.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <Empty title="No instruments" sub="Instruments are added when you record a trade or sync from TradingView." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

window.TradingViewSyncView = TradingViewSyncView;
