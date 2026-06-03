// ============================================================
//  views-positions.jsx — positions + PnL, editable mark prices
// ============================================================

function MarkCell({ symbol, value, decimals, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  useEffect(() => { setDraft(String(value ?? "")); }, [value]);
  if (editing) {
    return (
      <input
        className="mark-input mono"
        type="number"
        step="any"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); const v = parseFloat(draft); if (!isNaN(v)) onCommit(v); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") { setDraft(String(value)); setEditing(false); } }}
      />
    );
  }
  return (
    <button className="mark-cell mono" onClick={() => setEditing(true)} title="Click to edit mark price">
      {fmtNum(value, decimals)}<span className="mark-pen">✎</span>
    </button>
  );
}

function PositionsView({ state, actions, accountFilter }) {
  const [classFilter, setClassFilter] = useState("all");

  const rows = useMemo(() => {
    let r = computePositions(state, accountFilter).filter((p) => p.qty !== 0);
    if (classFilter !== "all") r = r.filter((p) => p.class === classFilter);
    return r.sort((a, b) => b.mtm - a.mtm);
  }, [state, accountFilter, classFilter]);

  const acctName = (id) => state.accounts.find((a) => a.id === id)?.name || "—";

  const totals = rows.reduce((s, r) => ({
    cost: s.cost + r.costValue, mtm: s.mtm + r.mtm,
    unreal: s.unreal + r.unrealized, real: s.real + r.realized,
  }), { cost: 0, mtm: 0, unreal: 0, real: 0 });

  // realized PnL also from fully-closed positions
  const realizedAll = useMemo(() => {
    let r = computePositions(state, accountFilter);
    if (classFilter !== "all") r = r.filter((p) => p.class === classFilter);
    return r.reduce((s, p) => s + p.realized, 0);
  }, [state, accountFilter, classFilter]);

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h1>Positions &amp; PnL</h1>
          <p className="view-sub">Open positions marked to market. Click any mark price to update it and watch PnL recompute.</p>
        </div>
      </header>

      <div className="stat-grid four">
        <Stat label="Market Value"><Money value={totals.mtm} /></Stat>
        <Stat label="Cost Basis"><Money value={totals.cost} muted /></Stat>
        <Stat label="Unrealized PnL" accent={totals.unreal >= 0 ? "#2f6f6b" : "#a8425a"}><PnL value={totals.unreal} /></Stat>
        <Stat label="Realized PnL"><PnL value={realizedAll} /></Stat>
      </div>

      <div className="toolbar">
        <Segmented value={classFilter} onChange={setClassFilter} options={[
          { value: "all", label: "All" }, { value: "ETF", label: "ETFs" }, { value: "FX", label: "FX" },
        ]} />
        <span className="toolbar-meta">{rows.length} open positions</span>
      </div>

      <section className="panel">
        <div className="panel-body no-pad">
          <table className="data positions">
            <thead>
              <tr>
                <th>Asset</th>{accountFilter === "all" && <th>Account</th>}
                <th className="r">Position</th><th className="r">Avg Cost</th>
                <th className="r">Mark</th><th className="r">Mkt Value</th>
                <th className="r">Unreal. PnL</th><th className="r">%</th><th className="r">Realized</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.accountId + p.symbol}>
                  <td>
                    <div className="asset-cell">
                      <span className="sym">{p.symbol}</span>
                      <ClassBadge cls={p.class} />
                      <span className="sub-inline">{p.name}</span>
                    </div>
                  </td>
                  {accountFilter === "all" && <td className="muted">{acctName(p.accountId)}</td>}
                  <td className="r mono">{fmtNum(p.qty, 0)}</td>
                  <td className="r mono muted">{fmtNum(p.avgCost, p.decimals)}</td>
                  <td className="r">
                    <MarkCell symbol={p.symbol} value={p.mark} decimals={p.decimals}
                      onCommit={(v) => actions.setMark(p.symbol, v)} />
                  </td>
                  <td className="r"><Money value={p.mtm} /></td>
                  <td className="r"><PnL value={p.unrealized} /></td>
                  <td className="r"><PnL value={p.unrealizedPct} pct /></td>
                  <td className="r"><PnL value={p.realized} sign={false} /></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={accountFilter === "all" ? 9 : 8}><Empty title="No open positions" sub="Buy an instrument from the Transactions tab." /></td></tr>}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={accountFilter === "all" ? 5 : 4}><b>Total</b></td>
                  <td className="r"><Money value={totals.mtm} /></td>
                  <td className="r"><PnL value={totals.unreal} /></td>
                  <td className="r"></td>
                  <td className="r"><PnL value={realizedAll} sign={false} /></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}

window.PositionsView = PositionsView;
