// ============================================================
//  views-tradingview.jsx — instruments table (read-only view)
// ============================================================

function TradingViewSyncView({ state }) {
  const instruments = useMemo(() => {
    return Object.entries(state.instruments || {})
      .map(([symbol, inst]) => ({ symbol, ...inst }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [state.instruments]);

  const withPrice = instruments.filter((i) => i.last_price != null).length;

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h1>TradingView</h1>
          <p className="view-sub">Instruments table · {instruments.length} symbols · {withPrice} with price</p>
        </div>
      </header>

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
                    {inst.updated_at ? fmtDate(inst.updated_at) : "—"}
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
