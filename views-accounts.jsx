// ============================================================
//  views-accounts.jsx — account list, create, per-account detail
// ============================================================

function AccountForm({ actions, onClose }) {
  const [name, setName] = useState("");
  const [broker, setBroker] = useState("");
  const [funding, setFunding] = useState("");
  const valid = name.trim().length > 0;
  const submit = () => {
    if (!valid) return;
    actions.addAccount({ name: name.trim(), broker: broker.trim() || "—", funding: parseFloat(funding) || 0 });
    onClose();
  };
  return (
    <Modal title="New trading account" onClose={onClose}>
      <Field label="Account name"><input value={name} autoFocus placeholder="e.g. Global Macro" onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Broker / custodian"><input value={broker} placeholder="e.g. Interactive Brokers" onChange={(e) => setBroker(e.target.value)} /></Field>
      <Field label="Opening cash deposit (CAD)" hint="Optional — records an initial deposit">
        <input type="number" min="0" step="0.01" value={funding} placeholder="0.00" onChange={(e) => setFunding(e.target.value)} />
      </Field>
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className={`btn primary ${valid ? "" : "disabled"}`} disabled={!valid} onClick={submit}>Create account</button>
      </div>
    </Modal>
  );
}

function AccountsView({ state, actions, onOpenAccount }) {
  const [modal, setModal] = useState(false);
  const book = useMemo(() => computeBook(state), [state]);

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h1>Accounts</h1>
          <p className="view-sub">Each account holds its own cash and positions. Equity = cash + market value of holdings.</p>
        </div>
        <div className="head-actions">
          <button className="btn primary" onClick={() => setModal(true)}>＋ New account</button>
        </div>
      </header>

      <div className="acct-grid">
        {book.summaries.map((s) => {
          const invested = s.equity !== 0 ? (s.mtmValue / s.equity) * 100 : 0;
          return (
            <button key={s.account.id} className="acct-card" onClick={() => onOpenAccount(s.account.id)}>
              <div className="acct-top">
                <div>
                  <div className="acct-name">{s.account.name}</div>
                  <div className="acct-broker">{s.account.broker}</div>
                </div>
                <span className="acct-go">→</span>
              </div>
              <div className="acct-equity">
                <span className="lbl">Equity</span>
                <span className="val mono">{fmtMoney(s.equity)}</span>
              </div>
              <AllocBar segments={[
                { label: "Invested", value: s.mtmValue, color: "#2f6f6b" },
                { label: "Cash", value: Math.max(s.cash, 0), color: "#b0823f" },
              ]} />
              <div className="acct-stats">
                <div><span>Total PnL</span><PnL value={s.totalPnl} /></div>
                <div><span>Return</span><PnL value={s.returnPct} pct /></div>
                <div><span>Positions</span><b className="mono">{s.openCount}</b></div>
                <div><span>Cash</span><span className="mono">{fmtMoney(s.cash)}</span></div>
              </div>
            </button>
          );
        })}
        <button className="acct-card add" onClick={() => setModal(true)}>
          <span className="add-plus">＋</span>
          <span>Add trading account</span>
        </button>
      </div>

      {modal && <AccountForm actions={actions} onClose={() => setModal(false)} />}
    </div>
  );
}

// ---- transfer funds modal --------------------------------
function TransferForm({ state, actions, fromAccountId, onClose }) {
  const fromAccount = state.accounts.find((a) => a.id === fromAccountId);
  const otherAccounts = state.accounts.filter((a) => a.id !== fromAccountId);
  const [toId, setToId] = useState(otherAccounts[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const amt = parseFloat(amount) || 0;
  const available = computeCash(state, fromAccountId);
  const toAccount = state.accounts.find((a) => a.id === toId);
  const valid = toId && amt > 0;
  const overdraw = amt > available;

  if (otherAccounts.length === 0) {
    return (
      <Modal title="Transfer funds" onClose={onClose}>
        <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>You need at least two accounts to transfer funds.</p>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </Modal>
    );
  }

  const submit = () => {
    if (!valid) return;
    actions.transferFunds({
      fromId: fromAccountId, fromName: fromAccount.name,
      toId, toName: toAccount.name,
      amount: amt, date: new Date(date).toISOString(), note: note.trim(),
    });
    onClose();
  };

  return (
    <Modal title="Transfer funds" onClose={onClose}>
      <Field label="From">
        <input value={fromAccount.name} disabled />
      </Field>
      <Field label="To">
        <select value={toId} onChange={(e) => setToId(e.target.value)}>
          {otherAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Amount (CAD)" hint={`Available cash: ${fmtMoney(available)}`}>
        <input type="number" min="0" step="0.01" value={amount} placeholder="0.00"
          autoFocus onChange={(e) => setAmount(e.target.value)} />
      </Field>
      {overdraw && <div className="warn">Amount exceeds available cash — account will overdraw.</div>}
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Note (optional)">
        <input type="text" value={note} placeholder="e.g. Rebalancing" onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className={`btn primary ${valid ? "" : "disabled"}`} disabled={!valid} onClick={submit}>
          Transfer
        </button>
      </div>
    </Modal>
  );
}

// ---- per-account detail -----------------------------------
function AccountDetail({ state, actions, accountId, onBack }) {
  const account = state.accounts.find((a) => a.id === accountId);
  const s = useMemo(() => computeAccountSummary(state, account), [state, account]);
  const [transferModal, setTransferModal] = useState(false);
  if (!account) return null;

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <button className="back" onClick={onBack}>← Accounts</button>
          <h1>{account.name}</h1>
          <p className="view-sub">{account.broker} · {account.currency} book</p>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={() => setTransferModal(true)}>⇄ Transfer funds</button>
        </div>
      </header>

      <div className="stat-grid four">
        <Stat label="Equity" accent="#2f6f6b"><Money value={s.equity} /></Stat>
        <Stat label="Cash"><Money value={s.cash} /></Stat>
        <Stat label="Invested (MTM)"><Money value={s.mtmValue} /></Stat>
        <Stat label="Total PnL" sub={<PnL value={s.returnPct} pct />}><PnL value={s.totalPnl} /></Stat>
      </div>

      <section className="panel">
        <div className="panel-head"><h2>Open positions</h2><span className="panel-meta">{s.openPositions.length}</span></div>
        <div className="panel-body no-pad">
          <table className="data">
            <thead>
              <tr><th>Asset</th><th className="r">Position</th><th className="r">Avg Cost</th>
                <th className="r">Mark</th><th className="r">Mkt Value</th><th className="r">Unreal. PnL</th><th className="r">%</th></tr>
            </thead>
            <tbody>
              {s.openPositions.sort((a, b) => b.mtm - a.mtm).map((p) => (
                <tr key={p.symbol}>
                  <td><span className="sym">{p.symbol}</span> <span className="sub-inline">{p.name}</span></td>
                  <td className="r mono">{fmtNum(p.qty, 0)}</td>
                  <td className="r mono muted">{fmtNum(p.avgCost, p.decimals)}</td>
                  <td className="r mono">{fmtNum(p.mark, p.decimals)}</td>
                  <td className="r"><Money value={p.mtm} /></td>
                  <td className="r"><PnL value={p.unrealized} /></td>
                  <td className="r"><PnL value={p.unrealizedPct} pct /></td>
                </tr>
              ))}
              {s.openPositions.length === 0 && <tr><td colSpan={7}><Empty title="No open positions" /></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {transferModal && <TransferForm state={state} actions={actions} fromAccountId={accountId} onClose={() => setTransferModal(false)} />}
    </div>
  );
}

window.AccountsView = AccountsView;
window.AccountDetail = AccountDetail;
