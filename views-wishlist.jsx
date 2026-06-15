// ============================================================
//  views-wishlist.jsx — Wishlist tracker (name, link, description, ranked)
// ============================================================

function WishlistAddForm({ onClose, onAdd }) {
  const [name,        setName]        = useState("");
  const [url,         setUrl]         = useState("");
  const [description, setDescription] = useState("");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");

  const valid = name.trim() && url.trim();

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    setError("");
    try {
      await onAdd({ name: name.trim(), url: url.trim(), description: description.trim() || null });
    } catch (e) {
      setError(e.message || "Failed to add item");
      setSaving(false);
    }
  }

  return (
    <Modal title="Add wishlist item" onClose={onClose}>
      <Field label="Name *">
        <input
          type="text" value={name} autoFocus placeholder="e.g. Sony WH-1000XM5"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
      </Field>
      <Field label="Link *">
        <input type="url" value={url} placeholder="https://..."
          onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <Field label="Description (optional)">
        <textarea
          value={description} placeholder="Why do you want this?" rows={3}
          style={{
            resize: "vertical", fontFamily: "inherit", fontSize: 14,
            padding: "9px 11px", border: "1px solid var(--border-2)",
            borderRadius: 8, background: "var(--surface)", color: "var(--text)",
            width: "100%", boxSizing: "border-box",
          }}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      {error && <div className="warn">{error}</div>}
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button
          className={`btn primary${(valid && !saving) ? "" : " disabled"}`}
          disabled={!valid || saving}
          onClick={submit}
        >
          {saving ? "Saving…" : "Add to wishlist"}
        </button>
      </div>
    </Modal>
  );
}

// ---- Single draggable row --------------------------------------------------
function WishlistRow({ item, isDragOver, onDelete, onDragStart, onDragOver, onDrop, onDragEnd }) {
  const [confirmDel, setConfirmDel] = useState(false);

  function handleDelete() {
    if (confirmDel) { onDelete(item.id); }
    else { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 2500); }
  }

  function displayUrl(rawUrl) {
    try { return new URL(rawUrl).hostname.replace(/^www\./, ""); }
    catch { return rawUrl.slice(0, 40); }
  }

  return (
    <div
      className={`wishlist-row${isDragOver ? " drag-over" : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <span className="wishlist-drag-handle" title="Drag to reorder">⠿</span>
      <span className="wishlist-rank">{item.rank + 1}</span>
      <div className="wishlist-row-body">
        <div className="wishlist-row-name">{item.name}</div>
        {item.description && (
          <div className="wishlist-row-desc">{item.description}</div>
        )}
        <a className="wishlist-row-link" href={item.url} target="_blank" rel="noopener noreferrer">
          {displayUrl(item.url)} ↗
        </a>
      </div>
      <button
        className={`wishlist-del-btn${confirmDel ? " confirm" : ""}`}
        onClick={handleDelete}
        title={confirmDel ? "Click again to confirm delete" : "Delete"}
      >
        {confirmDel ? "Sure?" : "✕"}
      </button>
    </div>
  );
}

// ---- Main view -------------------------------------------------------------
function WishlistView() {
  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showAdd,    setShowAdd]    = useState(false);
  const [error,      setError]      = useState("");
  const dragId      = useRef(null);
  const [dragOverId, setDragOverId] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const data = await db.loadWishlistItems();
      setItems(data);
    } catch (e) {
      setError(e.message || "Failed to load wishlist");
    }
    setLoading(false);
  }

  function handleDragStart(id) { dragId.current = id; }

  function handleDragOver(e, id) {
    e.preventDefault();
    if (dragId.current !== id) setDragOverId(id);
  }

  function handleDrop(e, targetId) {
    e.preventDefault();
    const fromId = dragId.current;
    setDragOverId(null);
    dragId.current = null;
    if (!fromId || fromId === targetId) return;

    const fromIdx = items.findIndex((x) => x.id === fromId);
    const toIdx   = items.findIndex((x) => x.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const next = [...items];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    const ranked = next.map((item, i) => ({ ...item, rank: i }));
    setItems(ranked);
    db.reorderWishlistItems(ranked.map((x) => ({ id: x.id, rank: x.rank })));
  }

  function handleDragEnd() { dragId.current = null; setDragOverId(null); }

  async function handleAdd({ name, url, description }) {
    const id   = uid("wl");
    const rank = items.length;
    await db.addWishlistItem({ id, name, url, description, rank });
    await loadData();
    setShowAdd(false);
  }

  async function handleDelete(id) {
    await db.deleteWishlistItem(id);
    const next = items.filter((x) => x.id !== id).map((x, i) => ({ ...x, rank: i }));
    setItems(next);
    if (next.length > 0) {
      db.reorderWishlistItems(next.map((x) => ({ id: x.id, rank: x.rank })));
    }
  }

  if (loading) {
    return (
      <div className="view" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg-2)" }}>
        Loading…
      </div>
    );
  }

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h1>Wishlist</h1>
          <p className="view-sub">
            Things I want · {items.length} item{items.length !== 1 ? "s" : ""} · drag ⠿ to reorder
          </p>
        </div>
        <div className="head-actions">
          <button className="btn primary" onClick={() => setShowAdd(true)}>＋ Add Item</button>
        </div>
      </header>

      {error && <div className="warn" style={{ marginBottom: "1rem" }}>{error}</div>}

      {items.length === 0 ? (
        <Empty title="No items yet" sub="Click '＋ Add Item' to add your first wish." />
      ) : (
        <div className="panel">
          <div className="panel-body no-pad">
            <div className="wishlist-list">
              {items.map((item) => (
                <WishlistRow
                  key={item.id}
                  item={item}
                  isDragOver={dragOverId === item.id}
                  onDelete={handleDelete}
                  onDragStart={() => handleDragStart(item.id)}
                  onDragOver={(e) => handleDragOver(e, item.id)}
                  onDrop={(e) => handleDrop(e, item.id)}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <WishlistAddForm onClose={() => setShowAdd(false)} onAdd={handleAdd} />
      )}
    </div>
  );
}

window.WishlistView = WishlistView;
