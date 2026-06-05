// ============================================================
//  app.jsx — shell, state management, navigation
// ============================================================

function App() {
  const [currentUser, setCurrentUser] = useState(() => getSession());

  // Show login screen if not authenticated
  if (!currentUser) {
    return <LoginView onLogin={setCurrentUser} />;
  }

  return <AppShell currentUser={currentUser} onLogout={() => { clearSession(); setCurrentUser(null); }} />;
}

function AppShell({ currentUser, onLogout }) {
  // null = loading; populated once db.loadAll() resolves
  const [state, setState] = useState(DEV_MODE ? seedState() : null);
  const [dbError, setDbError] = useState(null);
  const [route, setRoute] = useState("overview");
  const [openAccount, setOpenAccount] = useState(null);
  const [accountFilter, setAccountFilter] = useState("all");

  // Initial load from Supabase (skipped in DEV_MODE — seedState() pre-fills above)
  useEffect(() => {
    if (DEV_MODE) return;
    db.loadAll()
      .then(setState)
      .catch((e) => setDbError(e.message || String(e)));
  }, []);

  const update = (mutator) => setState((prev) => {
    const next = JSON.parse(JSON.stringify(prev));
    mutator(next);
    return next;
  });

  const actions = useMemo(() => ({
    addCash: (c) => {
      const entry = { id: uid("c"), createdBy: currentUser.username, ...c };
      update((s) => s.cash.push(entry));
      db.insertCash(entry);
    },
    addTrade: (t) => {
      const trade = { id: uid("t"), createdBy: currentUser.username, ...t };
      update((s) => s.trades.push(trade));
      db.insertTrade(trade);
    },
    deleteCash: (id) => {
      update((s) => { s.cash = s.cash.filter((x) => x.id !== id); });
      db.softDeleteCash(id);
    },
    deleteTrade: (id) => {
      update((s) => { s.trades = s.trades.filter((x) => x.id !== id); });
      db.softDeleteTrade(id);
    },
    setMark: (sym, price) => {
      update((s) => {
        if (!s.instruments[sym]) s.instruments[sym] = { name: sym, decimals: 2, last_price: price };
        else s.instruments[sym].last_price = price;
      });
      db.upsertMark(sym, price);
    },
    addInstrument: (inst) => {
      update((s) => { s.instruments[inst.symbol] = { name: inst.name, decimals: inst.decimals || 2, last_price: null }; });
      db.insertInstrument(inst);
    },
    transferFunds: ({ fromId, fromName, toId, toName, amount, date, note }) => {
      const withdraw = { id: uid("c"), createdBy: currentUser.username, accountId: fromId, type: "withdraw", amount, date, note: `Transfer to ${toName}${note ? " — " + note : ""}` };
      const deposit  = { id: uid("c"), createdBy: currentUser.username, accountId: toId,   type: "deposit",  amount, date, note: `Transfer from ${fromName}${note ? " — " + note : ""}` };
      update((s) => { s.cash.push(withdraw); s.cash.push(deposit); });
      db.insertCash(withdraw);
      db.insertCash(deposit);
    },
    addAccount: ({ name, broker, funding }) => {
      const id = uid("acc");
      const account = { id, name, broker, currency: "CAD" };
      db.insertAccount(account);
      update((s) => {
        s.accounts.push(account);
        if (funding > 0) {
          const cash = { id: uid("c"), createdBy: currentUser.username, accountId: id, type: "deposit", amount: funding, date: new Date().toISOString(), note: "Opening deposit" };
          s.cash.push(cash);
          db.insertCash(cash);
        }
      });
    },
    reset: () => {
      if (DEV_MODE) {
        setState(seedState());
      } else {
        db.loadAll().then(setState).catch((e) => setDbError(e.message || String(e)));
      }
      setRoute("overview");
      setOpenAccount(null);
    },
  }), []);

  const nav = [
    { id: "overview",     label: "Overview",       short: "Overview", icon: "◈" },
    { id: "accounts",     label: "Accounts",        short: "Accounts", icon: "▦" },
    { id: "transactions", label: "Transactions",    short: "Trades",   icon: "⇄" },
    { id: "positions",    label: "Positions & PnL", short: "PnL",      icon: "▤" },
    { id: "tradingview",  label: "TradingView",     short: "TV Sync",  icon: "⟳" },
    { id: "roadmap",      label: "Hieu's Roadmap",  short: "Roadmap",  icon: "◎" },
  ];

  const go = (r) => { setRoute(r); setOpenAccount(null); };

  // ---- loading / error screens ----
  if (dbError) {
    return (
      <div className="app" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 440, padding: "2rem" }}>
          <h2 style={{ marginBottom: "0.75rem" }}>Database connection failed</h2>
          <p style={{ marginBottom: "0.5rem", color: "var(--fg-2)" }}>{dbError}</p>
          <p style={{ fontSize: "0.85rem", color: "var(--fg-3)" }}>
            Check <code>config.js</code> — make sure <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> are set correctly.
          </p>
          <button className="btn primary" style={{ marginTop: "1.25rem" }}
            onClick={() => { setDbError(null); db.loadAll().then(setState).catch((e) => setDbError(e.message || String(e))); }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="app" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "var(--fg-2)" }}>Loading…</div>
      </div>
    );
  }

  const book = computeBook(state);
  const showFilter = route === "transactions" || route === "positions";

  return (
    <div className="app">
      {/* sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">Hieu</div>
          <div className="brand-text">
            <div className="brand-name">Trading Book</div>
            <div className="brand-sub">Keep track of our investments</div>
          </div>
        </div>
        <nav className="nav">
          {nav.map((n) => (
            <button key={n.id} className={`nav-item ${route === n.id ? "active" : ""}`} onClick={() => go(n.id)}>
              <span className="nav-icon">{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="equity-mini">
            <span className="lbl">Total equity</span>
            <span className="val mono">{fmtMoney(book.total.equity)}</span>
            <PnL value={book.total.totalPnl} />
          </div>
          {DEV_MODE && (
            <button className="reset-btn" onClick={() => { if (confirm("Reset to dev fixtures? This replaces your current view.")) actions.reset(); }}>
              Reset sample data
            </button>
          )}
          <div className="sidebar-user">
            <span className="sidebar-username">{currentUser.username}</span>
            <button className="logout-btn" onClick={onLogout} title="Sign out">Sign out</button>
          </div>
        </div>
      </aside>

      {/* mobile top header */}
      <header className="mobile-header">
        <div className="mobile-brand">
          <div className="brand-mark" style={{ width: 30, height: 30, fontSize: 11, borderRadius: 6 }}>H</div>
          <span className="brand-name" style={{ fontSize: 14 }}>Personal Tracker</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="mobile-equity-val mono">{fmtMoney(book.total.equity)}</div>
          <PnL value={book.total.totalPnl} />
        </div>
      </header>

      {/* main */}
      <main className="main">
        {showFilter && (
          <div className="acct-filter-bar">
            <span className="filter-lbl">Account</span>
            <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
              <option value="all">All accounts</option>
              {state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
        <div className="main-scroll">
          {route === "overview" && <OverviewView state={state} />}
          {route === "accounts" && !openAccount && <AccountsView state={state} actions={actions} onOpenAccount={setOpenAccount} />}
          {route === "accounts" && openAccount && <AccountDetail state={state} actions={actions} accountId={openAccount} onBack={() => setOpenAccount(null)} />}
          {route === "transactions" && <TransactionsView state={state} actions={actions} accountFilter={accountFilter} />}
          {route === "positions" && <PositionsView state={state} actions={actions} accountFilter={accountFilter} />}
          {route === "tradingview" && <TradingViewSyncView />}
          {route === "roadmap" && <iframe src="analytics-engineer-roadmap.html" className="roadmap-frame" title="Analytics Engineer Roadmap" />}
        </div>
      </main>

      {/* mobile bottom nav */}
      <nav className="mobile-bottom-nav">
        {nav.map((n) => (
          <button key={n.id} className={`mobile-nav-item ${route === n.id ? "active" : ""}`} onClick={() => go(n.id)}>
            <span className="mobile-nav-icon">{n.icon}</span>
            <span>{n.short}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
