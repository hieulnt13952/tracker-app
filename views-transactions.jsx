// ============================================================
//  views-transactions.jsx — cash + trade entry, activity log
// ============================================================

function CashForm({ state, actions, onClose }) {
  const [accountId, setAccountId] = useState(state.accounts[0]?.id);
  const [type, setType] = useState("deposit");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const amt = parseFloat(amount) || 0;
  const valid = accountId && amt > 0;
  const available = accountId ? computeCash(state, accountId) : 0;
  const overdraw = type === "withdraw" && amt > available;

  const submit = () => {
    if (!valid) return;
    actions.addCash({ accountId, type, amount: amt, date: new Date(date).toISOString(), note: note.trim() });
    onClose();
  };

  return (
    <Modal title="Cash transaction" onClose={onClose}>
      <Segmented
        value={type}
        onChange={setType}
        options={[{ value: "deposit", label: "Deposit", tone: "pos" }, { value: "withdraw", label: "Withdraw", tone: "neg" }]}
      />
      <Field label="Account">
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Amount (CAD)" hint={type === "withdraw" ? `Available cash: ${fmtMoney(available)}` : null}>
        <input type="number" min="0" step="0.01" value={amount} placeholder="0.00"
          onChange={(e) => setAmount(e.target.value)} autoFocus />
      </Field>
      {overdraw && <div className="warn">Withdrawal exceeds available cash — this will overdraw the account.</div>}
      <div className="form-row">
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field label="Note (optional)">
        <input type="text" value={note} placeholder="e.g. Initial funding" onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className={`btn primary ${valid ? "" : "disabled"}`} disabled={!valid} onClick={submit}>
          Record {type}
        </button>
      </div>
    </Modal>
  );
}

function TradeForm({ state, actions, onClose }) {
  const [accountId, setAccountId] = useState(state.accounts[0]?.id);
  const [symbol, setSymbol] = useState("SPY");
  const [side, setSide] = useState("buy");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("1.00");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const inst = INSTRUMENTS[symbol] || {};
  const q = parseFloat(qty) || 0;
  const p = parseFloat(price) || 0;
  const f = parseFloat(fee) || 0;
  const gross = q * p;
  const net = side === "buy" ? gross + f : gross - f;
  const valid = accountId && symbol && q > 0 && p > 0;

  // pre-fill price with current mark on symbol change
  useEffect(() => {
    if (state.marks[symbol] != null) setPrice(String(state.marks[symbol]));
  }, [symbol]);

  // current holding of this symbol in this account
  const holding = useMemo(() => {
    const rows = computePositions(state, accountId);
    const r = rows.find((x) => x.symbol === symbol);
    return r ? r.qty : 0;
  }, [state, accountId, symbol]);
  const cash = accountId ? computeCash(state, accountId) : 0;
  const oversell = side === "sell" && q > holding;
  const overspend = side === "buy" && net > cash;

  const submit = () => {
    if (!valid) return;
    actions.addTrade({ accountId, symbol, side, qty: q, price: p, fee: f, date: new Date(date).toISOString() });
    onClose();
  };

  const symbolsByClass = useMemo(() => {
    const g = {};
    for (const [sym, m] of Object.entries(INSTRUMENTS)) {
      (g[m.class] = g[m.class] || []).push(sym);
    }
    return g;
  }, []);

  return (
    <Modal title="New trade" onClose={onClose} width={500}>
      <Segmented
        value={side}
        onChange={setSide}
        options={[{ value: "buy", label: "Buy", tone: "pos" }, { value: "sell", label: "Sell", tone: "neg" }]}
      />
      <div className="form-row">
        <Field label="Account">
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Instrument">
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {Object.entries(symbolsByClass).map(([cls, syms]) => (
              <optgroup key={cls} label={cls}>
                {syms.map((s) => <option key={s} value={s}>{s} — {INSTRUMENTS[s].name}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
      </div>
      <div className="form-row">
        <Field label={inst.class === "FX" ? "Units" : "Quantity"}
          hint={side === "sell" ? `Holding: ${fmtNum(holding, inst.class === "FX" ? 0 : 0)}` : null}>
          <input type="number" min="0" step="any" value={qty} placeholder="0"
            onChange={(e) => setQty(e.target.value)} autoFocus />
        </Field>
        <Field label="Price (CAD)">
          <input type="number" min="0" step="any" value={price} placeholder="0.00"
            onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="Fee">
          <input type="number" min="0" step="0.01" value={fee}
            onChange={(e) => setFee(e.target.value)} />
        </Field>
      </div>
      <div className="trade-preview">
        <div><span>Gross</span><b className="mono">{fmtMoney(gross)}</b></div>
        <div><span>Fee</span><b className="mono">{fmtMoney(f)}</b></div>
        <div className="big"><span>Net cash {side === "buy" ? "out" : "in"}</span>
          <b className="mono">{fmtMoney(net)}</b></div>
      </div>
      {oversell && <div className="warn">Selling more than the current holding ({fmtNum(holding, 0)}) — position will go short.</div>}
      {overspend && <div className="warn">Cost exceeds available cash ({fmtMoney(cash)}) — account will overdraw.</div>}
      <div className="form-row">
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className={`btn primary ${valid ? "" : "disabled"}`} disabled={!valid} onClick={submit}>
          {side === "buy" ? "Buy" : "Sell"} {symbol}
        </button>
      </div>
    </Modal>
  );
}

function TransactionsView({ state, actions, accountFilter }) {
  const [modal, setModal] = useState(null); // 'cash' | 'trade'
  const [tab, setTab] = useState("all"); // all | trades | cash

  // build unified activity feed
  const feed = useMemo(() => {
    const acctName = (id) => state.accounts.find((a) => a.id === id)?.name || "—";
    const cashRows = state.cash.map((c) => ({
      kind: "cash", id: c.id, date: c.date, accountId: c.accountId, account: acctName(c.accountId),
      side: c.type, label: c.type === "deposit" ? "Cash deposit" : "Cash withdrawal",
      detail: c.note || "—", amount: c.type === "deposit" ? c.amount : -c.amount,
    }));
    const tradeRows = state.trades.map((t) => {
      const gross = t.qty * t.price;
      const cashFlow = t.side === "buy" ? -(gross + (t.fee || 0)) : gross - (t.fee || 0);
      return {
        kind: "trade", id: t.id, date: t.date, accountId: t.accountId, account: acctName(t.accountId),
        side: t.side, symbol: t.symbol, qty: t.qty, price: t.price, fee: t.fee,
        label: `${t.side === "buy" ? "Buy" : "Sell"} ${t.symbol}`,
        detail: `${fmtNum(t.qty, 0)} @ ${fmtMoney(t.price, "CAD", { decimals: INSTRUMENTS[t.symbol]?.decimals || 2 })}`,
        amount: cashFlow,
      };
    });
    let all = [...cashRows, ...tradeRows];
    if (accountFilter !== "all") all = all.filter((r) => r.accountId === accountFilter);
    if (tab === "trades") all = all.filter((r) => r.kind === "trade");
    if (tab === "cash") all = all.filter((r) => r.kind === "cash");
    return all.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [state, accountFilter, tab]);

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h1>Transactions</h1>
          <p className="view-sub">Record cash movements and trades. Every entry recomputes positions and PnL instantly.</p>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={() => setModal("cash")}>＋ Cash</button>
          <button className="btn primary" onClick={() => setModal("trade")}>＋ Trade</button>
        </div>
      </header>

      <div className="toolbar">
        <Segmented value={tab} onChange={setTab} options={[
          { value: "all", label: "All" }, { value: "trades", label: "Trades" }, { value: "cash", label: "Cash" },
        ]} />
        <span className="toolbar-meta">{feed.length} entries</span>
      </div>

      <section className="panel">
        <div className="panel-body no-pad">
          <table className="data">
            <thead>
              <tr>
                <th>Date</th><th>Type</th><th>Account</th><th>Detail</th>
                <th className="r">Cash impact</th><th></th>
              </tr>
            </thead>
            <tbody>
              {feed.map((r) => (
                <tr key={r.id}>
                  <td className="muted nowrap">{fmtDate(r.date)}</td>
                  <td><SideBadge side={r.side} /> {r.kind === "trade" && <span className="sym sm">{r.symbol}</span>}</td>
                  <td>{r.account}</td>
                  <td className="muted">{r.detail}</td>
                  <td className="r"><PnL value={r.amount} /></td>
                  <td className="r">
                    <button className="row-del" title="Delete"
                      onClick={() => { if (confirm("Delete this entry?")) r.kind === "cash" ? actions.deleteCash(r.id) : actions.deleteTrade(r.id); }}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {feed.length === 0 && <tr><td colSpan={6}><Empty title="No transactions yet" sub="Record a cash deposit or a trade to get started." /></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {modal === "cash" && <CashForm state={state} actions={actions} onClose={() => setModal(null)} />}
      {modal === "trade" && <TradeForm state={state} actions={actions} onClose={() => setModal(null)} />}
    </div>
  );
}

window.TransactionsView = TransactionsView;
