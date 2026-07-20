// ============================================================
//  views-travel.jsx — Travel Logs (History · Itinerary · Things to buy)
// ============================================================

function tripDays(start, end) {
  if (!start || !end) return 0;
  const diff = Math.ceil((new Date(end) - new Date(start)) / 86400000);
  return diff < 0 ? 0 : diff + 1;
}

const TRAVEL_MODES = [
  { value: "flight", label: "Flight" },
  { value: "train",  label: "Train"  },
  { value: "bus",    label: "Bus"    },
  { value: "cruise", label: "Cruise" },
  { value: "car",    label: "Car"    },
  { value: "other",  label: "Other"  },
];

const FOOD_CATEGORIES = [
  { value: "restaurant", label: "Restaurant" },
  { value: "dish",       label: "Dish"       },
  { value: "cuisine",    label: "Cuisine"    },
];

const SHOP_STATUSES = [
  { value: "new",       label: "New"        },
  { value: "will_buy",  label: "Will buy"   },
  { value: "done",      label: "Done"       },
  { value: "cancelled", label: "Cancelled"  },
];

// ============================================================
//  Add / Edit trip modal
// ============================================================
function TripModal({ trip, users, currentUser, onSave, onClose }) {
  const isEdit = !!trip;
  const [form, setForm] = useState({
    origin:      trip?.origin      || "",
    destination: trip?.destination || "",
    start_date:  trip?.start_date  || "",
    end_date:    trip?.end_date    || "",
    username:    trip?.username    || currentUser?.username || "",
    purpose:     trip?.purpose     || "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  const days = form.start_date && form.end_date && new Date(form.end_date) >= new Date(form.start_date)
    ? tripDays(form.start_date, form.end_date) : null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.origin.trim() || !form.destination.trim() || !form.start_date || !form.end_date) {
      setError("Please fill in all required fields."); return;
    }
    if (new Date(form.end_date) < new Date(form.start_date)) {
      setError("End date must be on or after start date."); return;
    }
    setSaving(true); setError("");
    try {
      const payload = {
        origin:      form.origin.trim(),
        destination: form.destination.trim(),
        start_date:  form.start_date,
        end_date:    form.end_date,
        username:    form.username || currentUser?.username || "",
        purpose:     form.purpose.trim(),
      };
      if (isEdit) {
        await db.updateTravelTrip(trip.id, payload);
      } else {
        await db.addTravelTrip({
          ...payload,
          id:         uid("trip"),
          created_by: currentUser?.username || "",
        });
      }
      onSave();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  return (
    <Modal title={isEdit ? "Edit trip" : "Add trip"} onClose={onClose} width={560}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid-2">
          <div className="form-field">
            <label>From (origin) *</label>
            <input type="text" value={form.origin} placeholder="e.g. Toronto, Canada"
              onChange={(e) => set("origin", e.target.value)} />
          </div>
          <div className="form-field">
            <label>To (destination) *</label>
            <input type="text" value={form.destination} placeholder="e.g. Hanoi, Vietnam"
              onChange={(e) => set("destination", e.target.value)} />
          </div>
          <div className="form-field">
            <label>Start date *</label>
            <input type="date" value={form.start_date}
              onChange={(e) => set("start_date", e.target.value)} />
          </div>
          <div className="form-field">
            <label>End date *</label>
            <input type="date" value={form.end_date}
              onChange={(e) => set("end_date", e.target.value)} />
          </div>
          <div className="form-field">
            <label>Traveler</label>
            <select value={form.username} onChange={(e) => set("username", e.target.value)}>
              {users.map((u) => (
                <option key={u.username} value={u.username}>
                  {u.display_name ? u.display_name + " (" + u.username + ")" : u.username}
                </option>
              ))}
            </select>
          </div>
          {days !== null && (
            <div className="form-field" style={{ justifyContent: "flex-end" }}>
              <div className="trip-duration-preview">
                <span className="trip-duration-num">{days}</span>
                <span className="trip-duration-lbl">days</span>
              </div>
            </div>
          )}
        </div>

        <div className="form-field" style={{ marginTop: 14 }}>
          <label>Purpose / Note</label>
          <textarea rows={3} value={form.purpose}
            placeholder="e.g. Family visit, work trip, vacation…"
            onChange={(e) => set("purpose", e.target.value)}
            style={{ resize: "vertical" }} />
        </div>

        {error && <div className="warn" style={{ marginTop: 10 }}>{error}</div>}

        <div className="modal-actions" style={{ marginTop: 18 }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit"
            className={"btn primary" + (saving ? " disabled" : "")}
            disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add trip"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
//  SUB-TAB 1 — Travel History
// ============================================================
function TravelHistoryTab({ currentUser, users }) {
  const [trips,      setTrips]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [userFilter, setUserFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [showAdd,    setShowAdd]    = useState(false);
  const [editTrip,   setEditTrip]   = useState(null);
  const [deleteId,   setDeleteId]   = useState(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const tripData = await db.loadTravelTrips();
      setTrips(tripData || []);
    } catch (e) {
      console.error("TravelHistoryTab.loadAll:", e.message);
    }
    setLoading(false);
  }

  async function handleDelete(id) {
    if (deleteId !== id) { setDeleteId(id); return; }
    try {
      await db.deleteTravelTrip(id);
      setTrips((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      console.error("deleteTravelTrip:", e.message);
    }
    setDeleteId(null);
  }

  const years = useMemo(() => {
    const ys = [...new Set(trips.map((t) => t.start_date && t.start_date.slice(0, 4)).filter(Boolean))].sort((a, b) => b - a);
    return ys;
  }, [trips]);

  const usernames = useMemo(() =>
    [...new Set(trips.map((t) => t.username).filter(Boolean))],
    [trips]
  );

  const filtered = useMemo(() => {
    return trips.filter((t) => {
      if (userFilter !== "all" && t.username !== userFilter) return false;
      if (yearFilter !== "all" && (!t.start_date || t.start_date.slice(0, 4) !== yearFilter)) return false;
      return true;
    });
  }, [trips, userFilter, yearFilter]);

  const totalDays = useMemo(() =>
    filtered.reduce((sum, t) => sum + tripDays(t.start_date, t.end_date), 0),
    [filtered]
  );

  const uniqueDestinations = useMemo(() =>
    new Set(filtered.map((t) => t.destination)).size,
    [filtered]
  );

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: "1rem" }}>
        <span className="toolbar-meta">
          {trips.length} trip{trips.length !== 1 ? "s" : ""} logged
        </span>
        <button className="btn primary" style={{ marginLeft: "auto" }} onClick={() => setShowAdd(true)}>+ Add trip</button>
      </div>

      {/* Stats */}
      <div className="stat-grid four" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="stat-label">Trips shown</div>
          <div className="stat-value"><span className="num">{filtered.length}</span></div>
        </div>
        <div className="stat">
          <div className="stat-label">Total days</div>
          <div className="stat-value"><span className="num">{totalDays}</span></div>
        </div>
        <div className="stat">
          <div className="stat-label">Unique destinations</div>
          <div className="stat-value"><span className="num">{uniqueDestinations}</span></div>
        </div>
        <div className="stat">
          <div className="stat-label">Avg. trip length</div>
          <div className="stat-value">
            <span className="num">{filtered.length ? Math.round(totalDays / filtered.length) : 0}</span>
            <span style={{ fontSize: 13, color: "var(--muted)", marginLeft: 4 }}>days</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="toolbar" style={{ marginBottom: "1rem" }}>
        <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} style={{ width: "auto" }}>
          <option value="all">All travelers</option>
          {usernames.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} style={{ width: "auto" }}>
          <option value="all">All years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {(userFilter !== "all" || yearFilter !== "all") && (
          <button className="btn ghost" onClick={() => { setUserFilter("all"); setYearFilter("all"); }}>
            Clear filters
          </button>
        )}
        <span className="toolbar-meta" style={{ marginLeft: "auto" }}>
          {filtered.length} trip{filtered.length !== 1 ? "s" : ""} · {totalDays} days total
        </span>
      </div>

      {/* Table */}
      <section className="panel">
        <div className="panel-body no-pad">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th style={{ width: 100 }}>Traveler</th>
                <th>From</th>
                <th>To</th>
                <th style={{ width: 100 }}>Start</th>
                <th style={{ width: 100 }}>End</th>
                <th style={{ width: 72 }}>Days</th>
                <th>Purpose</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: 36, color: "var(--muted)" }}>
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <Empty
                      title={trips.length ? "No trips match your filters" : "No trips yet"}
                      sub={trips.length ? "Try adjusting the filters above." : "Click + Add trip to log your first trip."}
                    />
                  </td>
                </tr>
              ) : filtered.map((t, i) => {
                const days = tripDays(t.start_date, t.end_date);
                return (
                  <tr key={t.id}>
                    <td className="muted mono" style={{ fontSize: 12 }}>{i + 1}</td>
                    <td>
                      <span className="tag" style={{ textTransform: "capitalize" }}>
                        {t.username || "—"}
                      </span>
                    </td>
                    <td style={{ fontSize: 13 }}>{t.origin}</td>
                    <td style={{ fontSize: 13, fontWeight: 500 }}>{t.destination}</td>
                    <td className="mono muted" style={{ fontSize: 12 }}>{fmtDate(t.start_date)}</td>
                    <td className="mono muted" style={{ fontSize: 12 }}>{fmtDate(t.end_date)}</td>
                    <td>
                      <span className="trip-days-badge">{days}</span>
                    </td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{t.purpose || "—"}</td>
                    <td className="r" style={{ whiteSpace: "nowrap" }}>
                      <button className="icon-btn" title="Edit" onClick={() => setEditTrip(t)}>✎</button>
                      <button
                        className={"row-del" + (deleteId === t.id ? " confirm" : "")}
                        title={deleteId === t.id ? "Click again to confirm" : "Delete"}
                        onClick={() => handleDelete(t.id)}
                        onBlur={() => setDeleteId(null)}
                      >
                        {deleteId === t.id ? "Confirm" : "✕"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {showAdd && (
        <TripModal
          users={users}
          currentUser={currentUser}
          onSave={() => { setShowAdd(false); loadAll(); }}
          onClose={() => setShowAdd(false)}
        />
      )}
      {editTrip && (
        <TripModal
          trip={editTrip}
          users={users}
          currentUser={currentUser}
          onSave={() => { setEditTrip(null); loadAll(); }}
          onClose={() => setEditTrip(null)}
        />
      )}
    </div>
  );
}

// ============================================================
//  SUB-TAB 2 — Itinerary
// ============================================================
function PlaceModal({ place, users, currentUser, onSave, onClose }) {
  const isEdit = !!place;
  const [form, setForm] = useState({
    origin:      place?.origin      || "",
    destination: place?.destination || "",
    start_date:  place?.start_date  || "",
    end_date:    place?.end_date    || "",
    travel_mode: place?.travel_mode || "flight",
    username:    place?.username    || currentUser?.username || "",
    note:        place?.note        || "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.destination.trim()) {
      setError("Please fill in the destination."); return;
    }
    if (form.start_date && form.end_date && new Date(form.end_date) < new Date(form.start_date)) {
      setError("End date must be on or after start date."); return;
    }
    setSaving(true); setError("");
    try {
      const payload = {
        origin:      form.origin.trim(),
        destination: form.destination.trim(),
        start_date:  form.start_date || null,
        end_date:    form.end_date   || null,
        travel_mode: form.travel_mode,
        username:    form.username || currentUser?.username || "",
        note:        form.note.trim(),
      };
      if (isEdit) {
        await db.updateItineraryPlace(place.id, payload);
      } else {
        await db.addItineraryPlace({
          ...payload,
          id:         uid("place"),
          created_by: currentUser?.username || "",
        });
      }
      onSave();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  return (
    <Modal title={isEdit ? "Edit place" : "Add place"} onClose={onClose} width={560}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid-2">
          <div className="form-field">
            <label>From</label>
            <input type="text" value={form.origin} placeholder="e.g. Toronto, Canada"
              onChange={(e) => set("origin", e.target.value)} />
          </div>
          <div className="form-field">
            <label>To *</label>
            <input type="text" value={form.destination} placeholder="e.g. Kyoto, Japan"
              onChange={(e) => set("destination", e.target.value)} />
          </div>
          <div className="form-field">
            <label>Start date</label>
            <input type="date" value={form.start_date}
              onChange={(e) => set("start_date", e.target.value)} />
          </div>
          <div className="form-field">
            <label>End date</label>
            <input type="date" value={form.end_date}
              onChange={(e) => set("end_date", e.target.value)} />
          </div>
          <div className="form-field">
            <label>Travel by</label>
            <select value={form.travel_mode} onChange={(e) => set("travel_mode", e.target.value)}>
              {TRAVEL_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label>Traveler</label>
            <select value={form.username} onChange={(e) => set("username", e.target.value)}>
              {users.map((u) => (
                <option key={u.username} value={u.username}>
                  {u.display_name ? u.display_name + " (" + u.username + ")" : u.username}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-field" style={{ marginTop: 14 }}>
          <label>Note</label>
          <textarea rows={3} value={form.note}
            placeholder="e.g. Book ryokan early, check festival dates…"
            onChange={(e) => set("note", e.target.value)}
            style={{ resize: "vertical" }} />
        </div>

        {error && <div className="warn" style={{ marginTop: 10 }}>{error}</div>}

        <div className="modal-actions" style={{ marginTop: 18 }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit"
            className={"btn primary" + (saving ? " disabled" : "")}
            disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add place"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FoodToTryPanel({ items, onAdd, onDelete, onUpdateLink }) {
  const [name,          setName]          = useState("");
  const [category,      setCategory]      = useState("restaurant");
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState("");
  const [editingLinkId, setEditingLinkId] = useState(null);
  const [linkDraft,     setLinkDraft]     = useState("");
  const skipBlurSave = useRef(false);

  async function handleAdd() {
    if (!name.trim() || saving) return;
    setSaving(true); setError("");
    try {
      await onAdd({ name: name.trim(), category });
      setName("");
    } catch (e) {
      setError(e.message || "Failed to add item");
    }
    setSaving(false);
  }

  function startEditLink(f) {
    setEditingLinkId(f.id);
    setLinkDraft(f.link || "");
  }

  function cancelEditLink() {
    skipBlurSave.current = true;
    setEditingLinkId(null);
    setLinkDraft("");
  }

  function saveLink(f) {
    if (skipBlurSave.current) { skipBlurSave.current = false; return; }
    const value = linkDraft.trim();
    setEditingLinkId(null);
    if (value === (f.link || "")) return;
    onUpdateLink(f.id, value);
  }

  return (
    <div className="food-panel">
      <div className="food-panel-add">
        <input type="text" value={name} placeholder="e.g. Kikunoi, Kaiseki, Yudofu"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
          onChange={(e) => setName(e.target.value)} />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {FOOD_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <button type="button" className={"btn primary" + (saving || !name.trim() ? " disabled" : "")}
          disabled={saving || !name.trim()} onClick={handleAdd}>
          {saving ? "Adding…" : "+ Add"}
        </button>
      </div>

      {error && <div className="warn" style={{ marginTop: 8 }}>{error}</div>}

      <div className="food-list" style={{ marginTop: 10 }}>
        {items.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5, padding: "6px 0" }}>Nothing added yet.</div>
        ) : items.map((f) => (
          <div key={f.id} className="food-list-row">
            <span className={`tag food-tag-${f.category}`}>{f.category}</span>
            <span className="food-list-name">{f.name}</span>
            {editingLinkId === f.id ? (
              <input type="url" autoFocus className="food-link-input" value={linkDraft}
                placeholder="https://…"
                onChange={(e) => setLinkDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); saveLink(f); }
                  if (e.key === "Escape") { e.preventDefault(); cancelEditLink(); }
                }}
                onBlur={() => saveLink(f)} />
            ) : f.link ? (
              <>
                <a className="food-list-link" href={f.link} target="_blank" rel="noopener noreferrer" title={f.link}>
                  🔗 Link
                </a>
                <button className="icon-btn" title="Edit link" onClick={() => startEditLink(f)}>✎</button>
              </>
            ) : (
              <button className="btn ghost food-link-add" onClick={() => startEditLink(f)}>+ Link</button>
            )}
            <button className="icon-btn" title="Remove" onClick={() => onDelete(f.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ItineraryTab({ currentUser, users }) {
  const [places,      setPlaces]      = useState([]);
  const [foodItems,   setFoodItems]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showAdd,     setShowAdd]     = useState(false);
  const [editPlace,   setEditPlace]   = useState(null);
  const [deleteId,    setDeleteId]    = useState(null);
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [placeData, foodData] = await Promise.all([
        db.loadItineraryPlaces(),
        db.loadFoodItems(),
      ]);
      setPlaces(placeData || []);
      setFoodItems(foodData || []);
      setExpandedIds(new Set((placeData || []).map((p) => p.id)));
    } catch (e) {
      console.error("ItineraryTab.loadAll:", e.message);
    }
    setLoading(false);
  }

  function toggleExpand(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function expandAll()   { setExpandedIds(new Set(places.map((p) => p.id))); }
  function collapseAll() { setExpandedIds(new Set()); }

  async function handleDelete(id) {
    if (deleteId !== id) { setDeleteId(id); return; }
    try {
      await db.deleteItineraryPlace(id);
      setPlaces((prev) => prev.filter((p) => p.id !== id));
      setFoodItems((prev) => prev.filter((f) => f.place_id !== id));
    } catch (e) {
      console.error("deleteItineraryPlace:", e.message);
    }
    setDeleteId(null);
  }

  async function handleAddFood(place, { name, category }) {
    const item = { id: uid("food"), place_id: place.id, name, category };
    await db.addFoodItem(item);
    setFoodItems((prev) => [...prev, item]);
  }

  async function handleDeleteFood(id) {
    await db.deleteFoodItem(id);
    setFoodItems((prev) => prev.filter((f) => f.id !== id));
  }

  async function handleUpdateFoodLink(id, link) {
    setFoodItems((prev) => prev.map((f) => f.id === id ? { ...f, link } : f));
    try {
      await db.updateFoodItem(id, { link });
    } catch (e) {
      console.error("updateFoodItem:", e.message);
    }
  }

  const foodCountByPlace = useMemo(() => {
    const m = {};
    foodItems.forEach((f) => { m[f.place_id] = (m[f.place_id] || 0) + 1; });
    return m;
  }, [foodItems]);

  const sortedPlaces = useMemo(() =>
    [...places].sort((a, b) => (a.start_date || "9999").localeCompare(b.start_date || "9999")),
    [places]
  );

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: "1rem" }}>
        <span className="toolbar-meta">
          {places.length} place{places.length !== 1 ? "s" : ""} planned
        </span>
        <button className="btn ghost" onClick={expandAll}>Expand all</button>
        <button className="btn ghost" onClick={collapseAll}>Collapse all</button>
        <button className="btn primary" style={{ marginLeft: "auto" }} onClick={() => setShowAdd(true)}>+ Add place</button>
      </div>

      <section className="panel">
        <div className="panel-body no-pad">
          <table className="data itinerary-tree">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th>From</th>
                <th>To</th>
                <th style={{ width: 100 }}>Start</th>
                <th style={{ width: 100 }}>End</th>
                <th style={{ width: 72 }}>Days</th>
                <th style={{ width: 110 }}>Travel by</th>
                <th style={{ width: 120 }}>Food to try</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: 36, color: "var(--muted)" }}>
                    Loading…
                  </td>
                </tr>
              ) : sortedPlaces.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <Empty
                      title="No places yet"
                      sub="Click + Add place to start planning your itinerary."
                    />
                  </td>
                </tr>
              ) : sortedPlaces.map((p, i) => {
                const days = tripDays(p.start_date, p.end_date);
                const mode = TRAVEL_MODES.find((m) => m.value === p.travel_mode);
                const isOpen = expandedIds.has(p.id);
                const placeFood = foodItems.filter((f) => f.place_id === p.id);
                return (
                  <React.Fragment key={p.id}>
                    <tr className="itinerary-place-row">
                      <td className="muted mono" style={{ fontSize: 12 }}>{i + 1}</td>
                      <td style={{ fontSize: 13 }}>{p.origin || "—"}</td>
                      <td style={{ fontSize: 13, fontWeight: 500 }}>{p.destination}</td>
                      <td className="mono muted" style={{ fontSize: 12 }}>{p.start_date ? fmtDate(p.start_date) : "—"}</td>
                      <td className="mono muted" style={{ fontSize: 12 }}>{p.end_date ? fmtDate(p.end_date) : "—"}</td>
                      <td>{days ? <span className="trip-days-badge">{days}</span> : <span className="muted">—</span>}</td>
                      <td><span className={`mode-badge mode-${p.travel_mode}`}>{mode ? mode.label : p.travel_mode || "—"}</span></td>
                      <td>
                        <button className="expand-toggle" onClick={() => toggleExpand(p.id)}>
                          <span className={"expand-chevron" + (isOpen ? " open" : "")}>▸</span>
                          Food to try ({foodCountByPlace[p.id] || 0})
                        </button>
                      </td>
                      <td className="r" style={{ whiteSpace: "nowrap" }}>
                        <button className="icon-btn" title="Edit" onClick={() => setEditPlace(p)}>✎</button>
                        <button
                          className={"row-del" + (deleteId === p.id ? " confirm" : "")}
                          title={deleteId === p.id ? "Click again to confirm" : "Delete"}
                          onClick={() => handleDelete(p.id)}
                          onBlur={() => setDeleteId(null)}
                        >
                          {deleteId === p.id ? "Confirm" : "✕"}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="itinerary-food-row">
                        <td></td>
                        <td colSpan={8}>
                          <FoodToTryPanel
                            items={placeFood}
                            onAdd={(item) => handleAddFood(p, item)}
                            onDelete={handleDeleteFood}
                            onUpdateLink={handleUpdateFoodLink}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {showAdd && (
        <PlaceModal
          users={users}
          currentUser={currentUser}
          onSave={() => { setShowAdd(false); loadAll(); }}
          onClose={() => setShowAdd(false)}
        />
      )}
      {editPlace && (
        <PlaceModal
          place={editPlace}
          users={users}
          currentUser={currentUser}
          onSave={() => { setEditPlace(null); loadAll(); }}
          onClose={() => setEditPlace(null)}
        />
      )}
    </div>
  );
}

// ============================================================
//  SUB-TAB 3 — Things to buy
// ============================================================
function ShoppingTab({ currentUser }) {
  const [items,        setItems]        = useState([]);
  const [loading,       setLoading]      = useState(true);
  const [newItem,       setNewItem]      = useState("");
  const [adding,        setAdding]       = useState(false);
  const [statusFilter,  setStatusFilter] = useState("all");
  const [deleteId,      setDeleteId]     = useState(null);
  const [error,         setError]        = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const data = await db.loadShoppingItems();
      setItems(data || []);
    } catch (e) {
      console.error("ShoppingTab.loadAll:", e.message);
    }
    setLoading(false);
  }

  async function handleAdd() {
    if (!newItem.trim() || adding) return;
    setAdding(true); setError("");
    try {
      const item = {
        id:         uid("buy"),
        item:       newItem.trim(),
        status:     "new",
        created_by: currentUser?.username || "",
      };
      await db.addShoppingItem(item);
      setItems((prev) => [item, ...prev]);
      setNewItem("");
    } catch (e) {
      setError(e.message || "Failed to add item");
    }
    setAdding(false);
  }

  async function handleStatusChange(id, status) {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, status } : it));
    try {
      await db.updateShoppingItem(id, { status });
    } catch (e) {
      console.error("updateShoppingItem:", e.message);
    }
  }

  async function handleDelete(id) {
    if (deleteId !== id) { setDeleteId(id); return; }
    try {
      await db.deleteShoppingItem(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch (e) {
      console.error("deleteShoppingItem:", e.message);
    }
    setDeleteId(null);
  }

  const filtered = useMemo(() => {
    if (statusFilter === "all") return items;
    return items.filter((it) => it.status === statusFilter);
  }, [items, statusFilter]);

  const counts = useMemo(() => {
    const c = { new: 0, will_buy: 0, done: 0, cancelled: 0 };
    items.forEach((it) => { if (c[it.status] !== undefined) c[it.status]++; });
    return c;
  }, [items]);

  return (
    <div>
      <div className="shop-add-bar">
        <input
          type="text" className="shop-add-input" value={newItem} placeholder="What do you want to buy?"
          autoFocus
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
        />
        <button className={"btn primary shop-add-btn" + (adding || !newItem.trim() ? " disabled" : "")}
          disabled={adding || !newItem.trim()} onClick={handleAdd}>
          {adding ? "Adding…" : "+ Add"}
        </button>
      </div>

      <div className="toolbar" style={{ marginBottom: "1rem" }}>
        <span className="toolbar-meta">
          {items.length} item{items.length !== 1 ? "s" : ""} total
        </span>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: "auto", marginLeft: "auto" }}>
          <option value="all">All statuses</option>
          {SHOP_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label} ({counts[s.value] || 0})</option>
          ))}
        </select>
      </div>

      {error && <div className="warn" style={{ marginBottom: "1rem" }}>{error}</div>}

      <section className="panel">
        <div className="panel-body no-pad">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th>Item</th>
                <th style={{ width: 150 }}>Status</th>
                <th style={{ width: 100 }}>Added</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: 36, color: "var(--muted)" }}>
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <Empty
                      title={items.length ? "No items match this filter" : "Nothing on the list yet"}
                      sub={items.length ? "Try a different status filter." : "Add the first thing you want to buy above."}
                    />
                  </td>
                </tr>
              ) : filtered.map((it, i) => (
                <tr key={it.id}>
                  <td className="muted mono" style={{ fontSize: 12 }}>{i + 1}</td>
                  <td style={{ fontSize: 13, textDecoration: it.status === "cancelled" ? "line-through" : "none" }}>
                    {it.item}
                  </td>
                  <td>
                    <select
                      className={`shop-status-select shop-status-${it.status}`}
                      value={it.status}
                      onChange={(e) => handleStatusChange(it.id, e.target.value)}
                    >
                      {SHOP_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </td>
                  <td className="mono muted" style={{ fontSize: 12 }}>{fmtDate(it.created_at)}</td>
                  <td className="r">
                    <button
                      className={"row-del" + (deleteId === it.id ? " confirm" : "")}
                      title={deleteId === it.id ? "Click again to confirm" : "Delete"}
                      onClick={() => handleDelete(it.id)}
                      onBlur={() => setDeleteId(null)}
                    >
                      {deleteId === it.id ? "Confirm" : "✕"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ============================================================
//  Main view — Travel Logs
// ============================================================
function TravelView({ currentUser }) {
  const [tab,   setTab]   = useState("history");
  const [users, setUsers] = useState([]);

  useEffect(() => {
    db.loadUsers().then((u) => setUsers(u || [])).catch((e) => console.error("TravelView.loadUsers:", e.message));
  }, []);

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h1>Travel Logs</h1>
          <p className="view-sub">Trip history, itinerary planning, and your travel shopping list.</p>
        </div>
      </header>

      <div style={{ marginBottom: "1.25rem" }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "history",   label: "Travel History" },
            { value: "itinerary", label: "Itinerary" },
            { value: "shopping",  label: "Things to Buy" },
          ]}
        />
      </div>

      {tab === "history"   && <TravelHistoryTab currentUser={currentUser} users={users} />}
      {tab === "itinerary" && <ItineraryTab currentUser={currentUser} users={users} />}
      {tab === "shopping"  && <ShoppingTab currentUser={currentUser} />}
    </div>
  );
}

window.TravelView = TravelView;
