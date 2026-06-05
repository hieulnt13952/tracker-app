// ============================================================
//  views-tradingview.jsx — raw TradingView sync diagnostic
// ============================================================

function TradingViewSyncView() {
  const [status, setStatus] = useState("idle"); // idle | loading | ok | error
  const [result, setResult] = useState(null);   // raw API response
  const [error, setError]   = useState("");

  async function handleSync() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/sync-tradingview", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setResult(data);
      setStatus("ok");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  const instruments = result?.instruments || [];

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h1>TradingView Sync</h1>
          <p className="view-sub">Raw data returned by the sync API — use this to verify prices before they hit the instruments table.</p>
        </div>
        <div className="head-actions">
          <button
            className={`btn primary${status === "loading" ? " disabled" : ""}`}
            disabled={status === "loading"}
            onClick={handleSync}
          >
            {status === "loading" ? "Fetching…" : "Fetch Prices"}
          </button>
        </div>
      </header>

      {/* summary strip */}
      {result && (
        <div className="stat-grid four" style={{ marginBottom: "1.5rem" }}>
          <Stat label="Returned">{result.count ?? "—"}</Stat>
          <Stat label="Expected (TV total)">{result.totalExpected ?? "—"}</Stat>
          <Stat label="Missing" accent={result.missing > 0 ? "#a8425a" : undefined}>
            {result.missing ?? "—"}
          </Stat>
          <Stat label="Prices filled">{instruments.filter((i) => i.price != null).length}</Stat>
        </div>
      )}

      {status === "error" && (
        <div className="warn" style={{ marginBottom: "1rem" }}>{error}</div>
      )}

      {status === "idle" && !result && (
        <div style={{ color: "var(--fg-3)", padding: "3rem 0", textAlign: "center" }}>
          Click "Fetch Prices" to pull data from TradingView.
        </div>
      )}

      {instruments.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Raw instrument data</h2>
            <span className="panel-meta">{instruments.length} rows</span>
          </div>
          <div className="panel-body no-pad">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Symbol</th>
                  <th>Name</th>
                  <th className="r">Price (parsed)</th>
                  <th className="r">_priceRaw (DOM text)</th>
                  <th className="r">simplewraps found</th>
                </tr>
              </thead>
              <tbody>
                {instruments.map((inst, idx) => (
                  <tr key={inst.symbol + idx}>
                    <td className="muted mono" style={{ fontSize: 12 }}>{idx + 1}</td>
                    <td><span className="sym">{inst.symbol}</span></td>
                    <td className="muted">{inst.name || "—"}</td>
                    <td className="r mono">
                      {inst.price != null ? String(inst.price) : <span className="muted">null</span>}
                    </td>
                    <td className="r mono" style={{ fontSize: 12, color: "var(--fg-3)" }}>
                      {inst._priceRaw ?? <span className="muted">—</span>}
                    </td>
                    <td className="r mono" style={{ fontSize: 12, color: "var(--fg-3)" }}>
                      {inst._simplewrapCount ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* full raw JSON for deeper inspection */}
      {result && (
        <section className="panel" style={{ marginTop: "1.5rem" }}>
          <div className="panel-head"><h2>Full raw JSON response</h2></div>
          <div className="panel-body">
            <pre style={{
              fontSize: 12, lineHeight: 1.6, overflowX: "auto",
              color: "var(--fg-2)", margin: 0,
            }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </section>
      )}
    </div>
  );
}

window.TradingViewSyncView = TradingViewSyncView;
