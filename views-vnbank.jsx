// ============================================================
//  views-vnbank.jsx — Vietnam bank accounts tracker
// ============================================================

function fmtVNAmount(amount, ccy) {
  if (amount == null || isNaN(amount)) return "—";
  const n = Number(amount);
  const abs = Math.abs(n);
  const dp = ccy === "VND" ? 0 : 2;
  const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const sym = ccy === "VND" ? "₫" : ccy === "USD" ? "$" : ccy === "CAD" ? "C$" : (ccy || "") + " ";
  return (n < 0 ? "(" : "") + sym + formatted + (n < 0 ? ")" : "");
}

// ---- Inline editable amount cell (same pattern as MarkCell) ---------------
function VNAmountCell({ account, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(String(account.amount ?? 0));
  useEffect(() => { setDraft(String(account.amount ?? 0)); }, [account.amount]);

  if (editing) {
    return (
      <input
        className="mark-input mono"
        type="number" step="any"
        value={draft} autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const v = parseFloat(draft);
          if (!isNaN(v)) onSave(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter")  e.target.blur();
          if (e.key === "Escape") { setDraft(String(account.amount ?? 0)); setEditing(false); }
        }}
      />
    );
  }
  return (
    <button className="mark-cell mono" onClick={() => setEditing(true)} title="Click to edit amount">
      {fmtVNAmount(account.amount, account.currency)}<span className="mark-pen">✎</span>
    </button>
  );
}

// ---- Add / Edit account modal ----------------------------------------------
const ACCOUNT_TYPES = ["Savings", "Fixed Term Deposit", "Current / Chequing", "Investment", "Credit Card", "Mortgage", "Other"];
const VN_CURRENCIES = ["VND", "USD", "CAD", "EUR"];

function VNAddForm({ onClose, onAdd }) {
  const [bankName,     setBankName]     = useState("");
  const [accountName,  setAccountName]  = useState("");
  const [accountType,  setAccountType]  = useState("Savings");
  const [currency,     setCurrency]     = useState("VND");
  const [amount,       setAmount]       = useState("");
  const [note,         setNote]         = useState("");

  const valid = bankName.trim() && accountName.trim() && parseFloat(amount) >= 0;

  function submit() {
    if (!valid) return;
    onAdd({
      id: uid("vn"),
      bank_name:    bankName.trim(),
      account_name: accountName.trim(),
      account_type: accountType,
      currency,
      amount: parseFloat(amount) || 0,
      note:   note.trim() || null,
    });
  }

  return (
    <Modal title="Add VN bank account" onClose={onClose}>
      <div className="form-row">
        <Field label="Bank name">
          <input type="text" value={bankName} autoFocus placeholder="e.g. Vietcombank"
            onChange={(e) => setBankName(e.target.value)} />
        </Field>
        <Field label="Account name">
          <input type="text" value={accountName} placeholder="e.g. Joint savings"
            onChange={(e) => setAccountName(e.target.value)} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Account type">
          <select value={accountType} onChange={(e) => setAccountType(e.target.value)}>
            {ACCOUNT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Currency">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {VN_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Amount">
        <input type="number" min="0" step="any" value={amount} placeholder="0"
          onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Note (optional)">
        <input type="text" value={note} placeholder="e.g. Opening balance"
          onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className={`btn primary${valid ? "" : " disabled"}`} disabled={!valid} onClick={submit}>
          Add account
        </button>
      </div>
    </Modal>
  );
}

// ---- Main view -------------------------------------------------------------
function VNBankView() {
  const [accounts, setAccounts] = useState([]);
  const [history,  setHistory]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showAdd,  setShowAdd]  = useState(false);
  const [error,    setError]    = useState("");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [accts, hist] = await Promise.all([
        db.loadVNBankAccounts(),
        db.loadVNBankHistory(),
      ]);
      setAccounts(accts);
      setHistory(hist);
    } catch (e) {
      setError(e.message || "Failed to load");
    }
    setLoading(false);
  }

  async function handleAmountSave(account, newAmount) {
    if (newAmount === Number(account.amount)) return;
    const now = new Date().toISOString();
    await db.updateVNBankAmount(account.id, newAmount, Number(account.amount));
    setAccounts((prev) => prev.map((a) =>
      a.id === account.id ? { ...a, amount: newAmount, updated_at: now } : a
    ));
    db.loadVNBankHistory().then(setHistory);
  }

  async function handleDelete(id) {
    if (!confirm("Delete this account and all its history?")) return;
    await db.deleteVNBankAccount(id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    setHistory((prev)  => prev.filter((h) => h.account_id !== id));
  }

  async function handleAdd(account) {
    await db.addVNBankAccount(account);
    await loadData();
    setShowAdd(false);
  }

  // Totals by currency
  const totals = useMemo(() => {
    const map = {};
    accounts.forEach((a) => {
      map[a.currency] = (map[a.currency] || 0) + Number(a.amount || 0);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [accounts]);

  // Enrich history with account info
  const acctMap = useMemo(() => {
    const m = {};
    accounts.forEach((a) => { m[a.id] = a; });
    return m;
  }, [accounts]);

  if (loading) {
    return <div className="view" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg-2)" }}>Loading…</div>;
  }

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h1>VN Bank Accounts</h1>
          <p className="view-sub">Vietnam bank accounts · click any amount to update it · changes are logged below.</p>
        </div>
        <div className="head-actions">
          <button className="btn primary" onClick={() => setShowAdd(true)}>＋ Add Account</button>
        </div>
      </header>

      {error && <div className="warn" style={{ marginBottom: "1rem" }}>{error}</div>}

      {/* Totals strip */}
      {totals.length > 0 && (
        <div className="stat-grid four" style={{ marginBottom: "1.5rem" }}>
          {totals.map(([ccy, total]) => (
            <Stat key={ccy} label={`Total ${ccy}`} accent="#2f6f6b">
              <span className="mono">{fmtVNAmount(total, ccy)}</span>
            </Stat>
          ))}
          <Stat label="Accounts">{accounts.length}</Stat>
        </div>
      )}

      {/* Accounts table */}
      <section className="panel">
        <div className="panel-head">
          <h2>Accounts</h2>
          <span className="panel-meta">{accounts.length} accounts</span>
        </div>
        <div className="panel-body no-pad">
          <table className="data">
            <thead>
              <tr>
                <th>Bank</th>
                <th>Account name</th>
                <th>Type</th>
                <th>Ccy</th>
                <th className="r">Amount</th>
                <th>Note</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td><span className="sym">{a.bank_name}</span></td>
                  <td>{a.account_name}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{a.account_type}</td>
                  <td className="muted mono" style={{ fontSize: 12 }}>{a.currency}</td>
                  <td className="r">
                    <VNAmountCell account={a} onSave={(v) => handleAmountSave(a, v)} />
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{a.note || "—"}</td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {a.updated_at ? fmtDateTimeEST(a.updated_at) : "—"}
                  </td>
                  <td className="r">
                    <button className="row-del" title="Delete"
                      onClick={() => handleDelete(a.id)}>✕</button>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr><td colSpan={8}><Empty title="No accounts yet" sub="Click '＋ Add Account' to get started." /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* History */}
      {history.length > 0 && (
        <section className="panel" style={{ marginTop: "1.5rem" }}>
          <div className="panel-head">
            <h2>Change history</h2>
            <span className="panel-meta">{history.length} entries</span>
          </div>
          <div className="panel-body no-pad">
            <table className="data">
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>Bank</th>
                  <th>Account</th>
                  <th className="r">Old amount</th>
                  <th className="r">New amount</th>
                  <th className="r">Change</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const acct = acctMap[h.account_id];
                  const diff = Number(h.new_amount) - Number(h.old_amount);
                  return (
                    <tr key={h.id}>
                      <td className="muted nowrap" style={{ fontSize: 12 }}>
                        {fmtDateTimeEST(h.changed_at)}
                      </td>
                      <td>{acct?.bank_name || "—"}</td>
                      <td className="muted">{acct?.account_name || "—"}</td>
                      <td className="r mono muted">{fmtVNAmount(h.old_amount, acct?.currency)}</td>
                      <td className="r mono">{fmtVNAmount(h.new_amount, acct?.currency)}</td>
                      <td className="r"><PnL value={diff} /></td>
                      <td className="muted" style={{ fontSize: 12 }}>{h.note || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {showAdd && <VNAddForm onClose={() => setShowAdd(false)} onAdd={handleAdd} />}
    </div>
  );
}

window.VNBankView = VNBankView;
