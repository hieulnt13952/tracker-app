// ============================================================
//  components.jsx — shared UI primitives
// ============================================================
const { useState, useEffect, useRef, useMemo } = React;

// Color a number green/red/neutral based on sign
function PnL({ value, ccy = "USD", pct = false, decimals = 2, className = "", sign = true }) {
  const cls = value > 0 ? "pos" : value < 0 ? "neg" : "zero";
  const text = pct ? fmtPct(value, { sign }) : fmtMoney(value, ccy, { sign, decimals });
  return <span className={`mono num ${cls} ${className}`}>{text}</span>;
}

function Money({ value, ccy = "USD", decimals = 2, muted = false }) {
  return <span className={`mono num ${muted ? "muted" : ""}`}>{fmtMoney(value, ccy, { decimals })}</span>;
}

// Generic stat tile
function Stat({ label, children, sub, accent }) {
  return (
    <div className="stat" style={accent ? { borderTopColor: accent } : undefined}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{children}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

// Pill / tag
function Tag({ children, tone = "default" }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

// Asset class badge
function ClassBadge({ cls }) {
  const tone = cls === "FX" ? "fx" : cls === "ETF" ? "etf" : "default";
  return <span className={`cbadge cbadge-${tone}`}>{cls}</span>;
}

// Side badge (buy/sell, deposit/withdraw)
function SideBadge({ side }) {
  const map = {
    buy: { t: "BUY", c: "pos" }, sell: { t: "SELL", c: "neg" },
    deposit: { t: "DEPOSIT", c: "pos" }, withdraw: { t: "WITHDRAW", c: "neg" },
  };
  const m = map[side] || { t: side?.toUpperCase(), c: "default" };
  return <span className={`side side-${m.c}`}>{m.t}</span>;
}

// Modal shell
function Modal({ title, onClose, children, width = 460 }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// Labeled field
function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

// Segmented control
function Segmented({ value, onChange, options }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          className={`seg ${value === o.value ? "active" : ""} ${o.tone ? "seg-" + o.tone : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Empty state
function Empty({ title, sub }) {
  return (
    <div className="empty">
      <div className="empty-mark">∅</div>
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub">{sub}</div>}
    </div>
  );
}

// Simple horizontal allocation bar
function AllocBar({ segments }) {
  const total = segments.reduce((s, x) => s + Math.abs(x.value), 0) || 1;
  return (
    <div className="allocbar">
      {segments.map((s, i) => (
        <div
          key={i}
          className="allocseg"
          style={{ width: (Math.abs(s.value) / total) * 100 + "%", background: s.color }}
          title={`${s.label}: ${fmtMoney(s.value)}`}
        />
      ))}
    </div>
  );
}

const PALETTE = ["#2f6f6b", "#c2783f", "#3f6fb0", "#8a6fb0", "#b0823f", "#5a8f5a", "#a85a6f", "#6f8fa8"];

Object.assign(window, {
  PnL, Money, Stat, Tag, ClassBadge, SideBadge, Modal, Field, Segmented, Empty, AllocBar, PALETTE,
});
