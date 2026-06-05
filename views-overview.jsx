// ============================================================
//  views-overview.jsx — book-level dashboard
// ============================================================

function SyncTradingViewButton() {
  const [status, setStatus] = useState("idle"); // idle | loading | ok | error
  const [msg, setMsg] = useState("");

  async function handleSync() {
    setStatus("loading");
    setMsg("");
    try {
      const res = await fetch("/api/sync-tradingview", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setStatus("ok");
      setMsg(`Synced ${data.count} instruments`);
      // Auto-clear the success message after 5 s
      setTimeout(() => setStatus("idle"), 5000);
    } catch (err) {
      setStatus("error");
      setMsg(err.message);
    }
  }

  const label =
    status === "loading" ? "Syncing…" :
    status === "ok"      ? "Synced ✓" :
                           "Sync TradingView";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
      <button
        className={`btn${status === "loading" || status === "ok" ? " disabled" : ""}`}
        onClick={handleSync}
        disabled={status === "loading" || status === "ok"}
      >
        {label}
      </button>
      {msg && (
        <span style={{ fontSize: "12px", color: status === "error" ? "var(--neg)" : "var(--pos)" }}>
          {msg}
        </span>
      )}
    </div>
  );
}

function OverviewView({ state }) {
  const book = useMemo(() => computeBook(state), [state]);
  const { summaries, total } = book;

  // aggregate open positions across all accounts by symbol
  const bySymbol = useMemo(() => {
    const all = computePositions(state, "all").filter((p) => p.qty !== 0);
    const map = {};
    for (const p of all) {
      if (!map[p.symbol]) map[p.symbol] = { symbol: p.symbol, name: p.name, mtm: 0, unrealized: 0 };
      map[p.symbol].mtm += p.mtm;
      map[p.symbol].unrealized += p.unrealized;
    }
    return Object.values(map).sort((a, b) => b.mtm - a.mtm);
  }, [state]);

  const cashAlloc = [
    { label: "Cash", value: total.cash, color: "#b0823f" },
    { label: "Invested (MTM)", value: total.mtmValue, color: "#2f6f6b" },
  ];

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h1>Book Overview</h1>
          <p className="view-sub">Consolidated across {state.accounts.length} trading accounts · marked to current prices</p>
        </div>
        <SyncTradingViewButton />
      </header>

      {/* headline stats */}
      <div className="stat-grid">
        <Stat label="Total Equity" accent="#2f6f6b">
          <Money value={total.equity} />
        </Stat>
        <Stat label="Total PnL" accent={total.totalPnl >= 0 ? "#2f6f6b" : "#a8425a"} sub={<PnL value={total.returnPct} pct />}>
          <PnL value={total.totalPnl} />
        </Stat>
        <Stat label="Unrealized PnL">
          <PnL value={total.unrealized} />
        </Stat>
        <Stat label="Realized PnL">
          <PnL value={total.realized} />
        </Stat>
        <Stat label="Cash Available" sub={`${fmtPct((total.cash / (total.equity || 1)) * 100, { sign: false })} of equity`}>
          <Money value={total.cash} />
        </Stat>
      </div>

      <div className="cols-2">
        {/* allocation */}
        <section className="panel">
          <div className="panel-head"><h2>Allocation</h2></div>
          <div className="panel-body">
            <div className="alloc-block">
              <div className="alloc-cap">Cash vs. Invested</div>
              <AllocBar segments={cashAlloc} />
              <div className="legend">
                {cashAlloc.map((s) => (
                  <span key={s.label} className="legend-item">
                    <i style={{ background: s.color }} />{s.label} <b className="mono">{fmtMoney(s.value)}</b>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* top positions */}
        <section className="panel">
          <div className="panel-head"><h2>Top Positions</h2><span className="panel-meta">by market value</span></div>
          <div className="panel-body no-pad">
            <table className="data">
              <thead>
                <tr><th>Asset</th><th className="r">Mkt Value</th><th className="r">Unreal. PnL</th></tr>
              </thead>
              <tbody>
                {bySymbol.slice(0, 6).map((s) => (
                  <tr key={s.symbol}>
                    <td><span className="sym">{s.symbol}</span> <span className="sub-inline">{s.name}</span></td>
                    <td className="r"><Money value={s.mtm} /></td>
                    <td className="r"><PnL value={s.unrealized} /></td>
                  </tr>
                ))}
                {bySymbol.length === 0 && <tr><td colSpan={4}><Empty title="No open positions" /></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* account breakdown */}
      <section className="panel">
        <div className="panel-head"><h2>Accounts</h2><span className="panel-meta">{state.accounts.length} accounts</span></div>
        <div className="panel-body no-pad">
          <table className="data">
            <thead>
              <tr>
                <th>Account</th><th>Broker</th>
                <th className="r">Cash</th><th className="r">Invested</th>
                <th className="r">Equity</th><th className="r">Realized</th>
                <th className="r">Unrealized</th><th className="r">Total PnL</th><th className="r">Return</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <tr key={s.account.id}>
                  <td><span className="sym">{s.account.name}</span></td>
                  <td className="muted">{s.account.broker}</td>
                  <td className="r"><Money value={s.cash} /></td>
                  <td className="r"><Money value={s.mtmValue} /></td>
                  <td className="r"><Money value={s.equity} /></td>
                  <td className="r"><PnL value={s.realized} /></td>
                  <td className="r"><PnL value={s.unrealized} /></td>
                  <td className="r"><PnL value={s.totalPnl} /></td>
                  <td className="r"><PnL value={s.returnPct} pct /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}><b>Total</b></td>
                <td className="r"><Money value={total.cash} /></td>
                <td className="r"><Money value={total.mtmValue} /></td>
                <td className="r"><Money value={total.equity} /></td>
                <td className="r"><PnL value={total.realized} /></td>
                <td className="r"><PnL value={total.unrealized} /></td>
                <td className="r"><PnL value={total.totalPnl} /></td>
                <td className="r"><PnL value={total.returnPct} pct /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

window.OverviewView = OverviewView;
