// ============================================================
//  views-travel.jsx — Travel History
// ============================================================

function tripDays(start, end) {
  if (!start || !end) return 0;
  const diff = Math.ceil((new Date(end) - new Date(start)) / 86400000);
  return diff < 0 ? 0 : diff + 1;
}

// ============================================================
//  Add / Edit modal
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
//  Main view
// ============================================================
function TravelView({ currentUser }) {
  const [trips,      setTrips]      = useState([]);
  const [users,      setUsers]      = useState([]);
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
      const [tripData, userData] = await Promise.all([
        db.loadTravelTrips(),
        db.loadUsers(),
      ]);
      setTrips(tripData || []);
      setUsers(userData || []);
    } catch (e) {
      console.error("TravelView.loadAll:", e.message);
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
    <div className="view">
      <header className="view-head">
        <div>
          <h1>Travel History</h1>
          <p className="view-sub">
            Track trips, destinations and travel days · {trips.length} trip{trips.length !== 1 ? "s" : ""} logged.
          </p>
        </div>
        <div className="head-actions">
          <button className="btn primary" onClick={() => setShowAdd(true)}>+ Add trip</button>
        </div>
      </header>

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

window.TravelView = TravelView;
