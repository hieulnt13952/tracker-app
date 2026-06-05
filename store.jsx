// ============================================================
//  store.jsx — data model, Supabase persistence, computation engine
// ============================================================
// State shape: { accounts, cash, trades, instruments, ui }
// Mark prices live in instruments[symbol].last_price.
// The engine derives positions, cash balances, mark-to-market
// and PnL from the raw event lists (cash transactions + trades).
// ============================================================

// ---- formatting helpers -----------------------------------
const CCY_SYMBOL = { CAD: "$", USD: "$", EUR: "€", GBP: "£", JPY: "¥", CHF: "CHF " };

function fmtMoney(n, ccy = "CAD", opts = {}) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const { sign = false, decimals = 2 } = opts;
  const neg = n < 0;
  const abs = Math.abs(n);
  const body = abs.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const sym = CCY_SYMBOL[ccy] || ccy + " ";
  let s = `${sym}${body}`;
  if (neg) s = `(${s})`;
  else if (sign) s = `+${s}`;
  return s;
}

function fmtNum(n, decimals = 2) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtPct(n, opts = {}) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const { sign = true } = opts;
  const s = (sign && n > 0 ? "+" : "") + n.toFixed(2) + "%";
  return s;
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit", timeZone: "UTC" });
}

function uid(prefix = "id") {
  return prefix + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

// Instruments are stored in Supabase and loaded into state.instruments.
// seedInstruments() provides dev-mode defaults only.

// ---- dev fixtures (seed data) --------------------------------
// Only used when Supabase is not configured (DEV_MODE = true).
function seedInstruments() {
  return {
    SPY:  { name: "SPDR S&P 500 ETF",        decimals: 2, last_price: 552.4  },
    QQQ:  { name: "Invesco QQQ Trust",         decimals: 2, last_price: 462.1  },
    VTI:  { name: "Vanguard Total Market",     decimals: 2, last_price: 255.8  },
    IEFA: { name: "iShares Core MSCI EAFE",    decimals: 2, last_price: 76.2   },
    GLD:  { name: "SPDR Gold Shares",          decimals: 2, last_price: 224.6  },
    TLT:  { name: "iShares 20+ Yr Treasury",   decimals: 2, last_price: 90.4   },
    EUR:  { name: "Euro",                       decimals: 4, last_price: 1.0905 },
    GBP:  { name: "British Pound",              decimals: 4, last_price: 1.2820 },
    JPY:  { name: "Japanese Yen",               decimals: 6, last_price: 0.006610 },
    CHF:  { name: "Swiss Franc",                decimals: 4, last_price: 1.1240 },
  };
}

function seedState() {
  const today = new Date();
  const daysAgo = (d) => {
    const x = new Date(today);
    x.setDate(x.getDate() - d);
    return x.toISOString();
  };

  const accounts = [
    { id: "acc_alpha", name: "Alpha Macro", currency: "CAD", broker: "Interactive Brokers" },
    { id: "acc_beta", name: "Beta Equity", currency: "CAD", broker: "Fidelity Prime" },
    { id: "acc_fx", name: "FX Carry Desk", currency: "CAD", broker: "Citi FX" },
  ];

  const cash = [
    { id: uid("c"), accountId: "acc_alpha", type: "deposit", amount: 500000, date: daysAgo(120), note: "Initial funding" },
    { id: uid("c"), accountId: "acc_alpha", type: "withdraw", amount: 50000, date: daysAgo(20), note: "Profit distribution" },
    { id: uid("c"), accountId: "acc_beta", type: "deposit", amount: 300000, date: daysAgo(110), note: "Initial funding" },
    { id: uid("c"), accountId: "acc_beta", type: "deposit", amount: 100000, date: daysAgo(40), note: "Top-up" },
    { id: uid("c"), accountId: "acc_fx", type: "deposit", amount: 250000, date: daysAgo(95), note: "Initial funding" },
  ];

  const trades = [
    { id: uid("t"), accountId: "acc_alpha", symbol: "SPY", side: "buy", qty: 400, price: 480.2, date: daysAgo(100) },
    { id: uid("t"), accountId: "acc_alpha", symbol: "SPY", side: "buy", qty: 200, price: 510.5, date: daysAgo(55) },
    { id: uid("t"), accountId: "acc_alpha", symbol: "SPY", side: "sell", qty: 150, price: 545.0, date: daysAgo(15) },
    { id: uid("t"), accountId: "acc_alpha", symbol: "GLD", side: "buy", qty: 300, price: 210.4, date: daysAgo(70) },
    { id: uid("t"), accountId: "acc_alpha", symbol: "TLT", side: "buy", qty: 250, price: 92.1, date: daysAgo(60) },
    { id: uid("t"), accountId: "acc_beta", symbol: "QQQ", side: "buy", qty: 350, price: 410.0, date: daysAgo(90) },
    { id: uid("t"), accountId: "acc_beta", symbol: "QQQ", side: "sell", qty: 100, price: 455.0, date: daysAgo(25) },
    { id: uid("t"), accountId: "acc_beta", symbol: "VTI", side: "buy", qty: 500, price: 240.3, date: daysAgo(80) },
    { id: uid("t"), accountId: "acc_beta", symbol: "IEFA", side: "buy", qty: 600, price: 72.8, date: daysAgo(48) },
    { id: uid("t"), accountId: "acc_fx", symbol: "EUR", side: "buy", qty: 100000, price: 1.0820, date: daysAgo(85) },
    { id: uid("t"), accountId: "acc_fx", symbol: "GBP", side: "buy", qty: 60000, price: 1.2650, date: daysAgo(70) },
    { id: uid("t"), accountId: "acc_fx", symbol: "EUR", side: "sell", qty: 40000, price: 1.0950, date: daysAgo(10) },
    { id: uid("t"), accountId: "acc_fx", symbol: "JPY", side: "buy", qty: 5000000, price: 0.006750, date: daysAgo(35) },
  ];

  return { accounts, cash, trades, instruments: seedInstruments(), ui: { activeAccount: "all" } };
}

// ---- Supabase client ----------------------------------------
const DEV_MODE = !window.SUPABASE_URL || window.SUPABASE_URL === "YOUR_SUPABASE_URL";

const _supa = (!DEV_MODE && window.supabase)
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

// ---- database layer -----------------------------------------
// All methods are async. In DEV_MODE reads return seedState() and
// writes are no-ops so the app still works without a database.
const db = {
  async loadAll() {
    if (DEV_MODE) return seedState();

    const [acctRes, cashRes, tradeRes, instRes] = await Promise.all([
      _supa.from("accounts").select("*").order("created_at"),
      _supa.from("cash_transactions").select("*").eq("deleted", false).order("date"),
      _supa.from("trades").select("*").eq("deleted", false).order("date"),
      _supa.from("instruments").select("*").order("symbol"),
    ]);

    if (acctRes.error) throw acctRes.error;
    if (cashRes.error) throw cashRes.error;
    if (tradeRes.error) throw tradeRes.error;
    if (instRes.error) throw instRes.error;

    const cash = (cashRes.data || []).map((r) => ({
      id: r.id, accountId: r.account_id, type: r.type,
      amount: +r.amount, date: r.date, note: r.note, createdBy: r.created_by,
    }));
    const trades = (tradeRes.data || []).map((r) => ({
      id: r.id, accountId: r.account_id, symbol: r.symbol, side: r.side,
      qty: +r.qty, price: +r.price, date: r.date, createdBy: r.created_by,
    }));
    const instruments = {};
    for (const r of instRes.data || []) {
      instruments[r.symbol] = { name: r.name, decimals: r.decimals, last_price: r.last_price ? +r.last_price : null };
    }

    return { accounts: acctRes.data || [], cash, trades, instruments, ui: { activeAccount: "all" } };
  },

  async insertInstrument(inst) {
    if (DEV_MODE) return;
    const { error } = await _supa.from("instruments").insert({
      symbol: inst.symbol, name: inst.name, decimals: inst.decimals || 2,
    });
    if (error) console.error("db.insertInstrument:", error.message);
  },

  async insertAccount(account) {
    if (DEV_MODE) return;
    const { error } = await _supa.from("accounts").insert({
      id: account.id, name: account.name, currency: account.currency, broker: account.broker,
    });
    if (error) console.error("db.insertAccount:", error.message);
  },

  async insertCash(c) {
    if (DEV_MODE) return;
    const { error } = await _supa.from("cash_transactions").insert({
      id: c.id, account_id: c.accountId, type: c.type,
      amount: c.amount, date: c.date, note: c.note, created_by: c.createdBy,
    });
    if (error) console.error("db.insertCash:", error.message);
  },

  async softDeleteCash(id) {
    if (DEV_MODE) return;
    const { error } = await _supa.from("cash_transactions").update({ deleted: true }).eq("id", id);
    if (error) console.error("db.softDeleteCash:", error.message);
  },

  async insertTrade(t) {
    if (DEV_MODE) return;
    const { error } = await _supa.from("trades").insert({
      id: t.id, account_id: t.accountId, symbol: t.symbol, side: t.side,
      qty: t.qty, price: t.price, date: t.date, created_by: t.createdBy,
    });
    if (error) console.error("db.insertTrade:", error.message);
  },

  async softDeleteTrade(id) {
    if (DEV_MODE) return;
    const { error } = await _supa.from("trades").update({ deleted: true }).eq("id", id);
    if (error) console.error("db.softDeleteTrade:", error.message);
  },

  async upsertMark(symbol, price) {
    if (DEV_MODE) return;
    const { error } = await _supa.from("instruments")
      .update({ last_price: price, updated_at: new Date().toISOString() })
      .eq("symbol", symbol);
    if (error) console.error("db.upsertMark:", error.message);
  },

  // Writes all seed fixtures into the live database (idempotent).
  async seedDatabase() {
    if (DEV_MODE) return;
    const s = seedState();
    await _supa.from("accounts").upsert(s.accounts, { onConflict: "id" });
    await _supa.from("cash_transactions").upsert(
      s.cash.map((c) => ({ id: c.id, account_id: c.accountId, type: c.type, amount: c.amount, date: c.date, note: c.note })),
      { onConflict: "id" }
    );
    await _supa.from("trades").upsert(
      s.trades.map((t) => ({ id: t.id, account_id: t.accountId, symbol: t.symbol, side: t.side, qty: t.qty, price: t.price, date: t.date })),
      { onConflict: "id" }
    );
  },

  // Verifies credentials via the login() Postgres RPC.
  // Returns { username, display_name } on success, null on failure.
  async login(username, password) {
    if (DEV_MODE) {
      // single dev account so the app is usable without a database
      return (username === "dev" && password === "dev") ? { username: "dev", display_name: "Dev" } : null;
    }
    const { data, error } = await _supa.rpc("login", {
      p_username: username.toLowerCase().trim(),
      p_password: password,
    });
    if (error) { console.error("db.login:", error.message); return null; }
    return (data && data.length > 0) ? data[0] : null;
  },
};

// ============================================================
//  COMPUTATION ENGINE
// ============================================================
// Average-cost method. Processes a chronological event stream of
// trades to derive position, average cost, realized PnL and the
// net trade cash flow per (account, symbol).
// ============================================================

function computePositions(state, accountFilter = "all") {
  const trades = [...state.trades]
    .filter((t) => accountFilter === "all" || t.accountId === accountFilter)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // key: accountId|symbol
  const lots = {};
  for (const t of trades) {
    const key = t.accountId + "|" + t.symbol;
    if (!lots[key]) {
      lots[key] = {
        accountId: t.accountId, symbol: t.symbol,
        qty: 0, avgCost: 0, realized: 0,
        bought: 0, sold: 0, tradeCash: 0,
      };
    }
    const L = lots[key];
    const gross = t.qty * t.price;
    if (t.side === "buy") {
      const newQty = L.qty + t.qty;
      L.avgCost = newQty !== 0 ? (L.avgCost * L.qty + gross) / newQty : 0;
      L.qty = newQty;
      L.bought += t.qty;
      L.tradeCash -= gross;
    } else {
      // sell — realize against avg cost
      L.realized += (t.price - L.avgCost) * t.qty;
      L.qty -= t.qty;
      L.sold += t.qty;
      L.tradeCash += gross;
      if (L.qty <= 0.0000001) { L.qty = 0; L.avgCost = 0; }
    }
  }

  // enrich with last_price from instruments + unrealized
  const rows = Object.values(lots).map((L) => {
    const inst = (state.instruments || {})[L.symbol] || { name: L.symbol, decimals: 2, last_price: null };
    const mark = inst.last_price ?? null;
    const mtm = mark !== null ? L.qty * mark : 0;
    const costValue = L.qty * L.avgCost;
    const unrealized = mark !== null ? (mark - L.avgCost) * L.qty : 0;
    return {
      ...L, mark, mtm, costValue, unrealized,
      totalPnl: L.realized + unrealized,
      name: inst.name, decimals: inst.decimals,
      unrealizedPct: costValue !== 0 ? (unrealized / Math.abs(costValue)) * 100 : 0,
    };
  });
  return rows;
}

function computeCash(state, accountId) {
  let bal = 0;
  for (const c of state.cash) {
    if (c.accountId !== accountId) continue;
    bal += c.type === "deposit" ? c.amount : -c.amount;
  }
  // add net trade cash flow
  const trades = state.trades.filter((t) => t.accountId === accountId);
  for (const t of trades) {
    const gross = t.qty * t.price;
    if (t.side === "buy") bal -= gross;
    else bal += gross;
  }
  return bal;
}

function computeAccountSummary(state, account) {
  const positions = computePositions(state, account.id).filter((p) => p.qty !== 0 || p.realized !== 0);
  const openPositions = positions.filter((p) => p.qty !== 0);
  const cash = computeCash(state, account.id);
  const mtmValue = openPositions.reduce((s, p) => s + p.mtm, 0);
  const realized = positions.reduce((s, p) => s + p.realized, 0);
  const unrealized = openPositions.reduce((s, p) => s + p.unrealized, 0);
  const equity = cash + mtmValue;

  // net contributions (deposits - withdrawals)
  let contributed = 0;
  for (const c of state.cash) {
    if (c.accountId !== account.id) continue;
    contributed += c.type === "deposit" ? c.amount : -c.amount;
  }
  const totalPnl = realized + unrealized;
  const returnPct = contributed !== 0 ? (totalPnl / contributed) * 100 : 0;

  return {
    account, cash, mtmValue, equity, realized, unrealized, totalPnl,
    contributed, returnPct,
    openCount: openPositions.length,
    positions, openPositions,
  };
}

function computeBook(state) {
  const summaries = state.accounts.map((a) => computeAccountSummary(state, a));
  const total = summaries.reduce(
    (acc, s) => ({
      cash: acc.cash + s.cash,
      mtmValue: acc.mtmValue + s.mtmValue,
      equity: acc.equity + s.equity,
      realized: acc.realized + s.realized,
      unrealized: acc.unrealized + s.unrealized,
      totalPnl: acc.totalPnl + s.totalPnl,
      contributed: acc.contributed + s.contributed,
    }),
    { cash: 0, mtmValue: 0, equity: 0, realized: 0, unrealized: 0, totalPnl: 0, contributed: 0 }
  );
  total.returnPct = total.contributed !== 0 ? (total.totalPnl / total.contributed) * 100 : 0;
  return { summaries, total };
}

// expose globally for the babel-scoped component files
Object.assign(window, {
  CCY_SYMBOL, DEV_MODE,
  fmtMoney, fmtNum, fmtPct, fmtDate, uid,
  seedState, db,
  computePositions, computeCash, computeAccountSummary, computeBook,
});
