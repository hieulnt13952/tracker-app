// ============================================================
//  views-dictionary.jsx — Learning Dictionary
// ============================================================

async function fetchDefinition(word) {
  const res = await fetch(
    "https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word.trim())
  );
  if (res.status === 404) throw new Error("No definition found for \"" + word + "\"");
  if (!res.ok) throw new Error("API error " + res.status);
  return res.json();
}

// ---- Pronunciation audio player ------------------------------------
function AudioPlayer({ phonetics }) {
  const audioUrl = (phonetics || []).find((p) => p.audio)?.audio;
  if (!audioUrl) return null;
  return (
    <audio controls style={{ height: 28, verticalAlign: "middle" }}>
      <source src={audioUrl} type="audio/mpeg" />
    </audio>
  );
}

// ============================================================
//  TAB 1 — Dictionary search
// ============================================================
function DictionarySearch({ currentUser, savedWords, onSave }) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [saving,  setSaving]  = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setResults(null);
    setJustSaved(false);
    try {
      const data = await fetchDefinition(query.trim());
      setResults(data);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!results || !results.length) return;
    setSaving(true);
    setError("");
    try {
      await onSave(results[0]);
      setJustSaved(true);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  const entry = results && results[0];

  const alreadySaved = entry && savedWords.some(
    (w) => w.word.toLowerCase() === entry.word.toLowerCase() &&
           (w.saved_by || "") === (currentUser?.username || "")
  );

  // Flatten all meanings → definitions into table rows
  const definitions = useMemo(() => {
    if (!entry) return [];
    const rows = [];
    (entry.meanings || []).forEach((meaning) => {
      (meaning.definitions || []).forEach((def) => {
        rows.push({
          partOfSpeech: meaning.partOfSpeech,
          definition:   def.definition,
          example:      def.example || null,
        });
      });
    });
    return rows;
  }, [results]);

  return (
    <div>
      {/* Search bar */}
      <form onSubmit={handleSearch} style={{ display: "flex", gap: 9, marginBottom: "1.25rem" }}>
        <input
          type="text" value={query} placeholder="Type any English word…" autoFocus
          onChange={(e) => { setQuery(e.target.value); setError(""); }}
          style={{ flex: 1 }}
        />
        <button type="submit" className={`btn primary${(loading || !query.trim()) ? " disabled" : ""}`}
          disabled={loading || !query.trim()}>
          {loading ? "Looking up…" : "Search"}
        </button>
      </form>

      {error && <div className="warn" style={{ marginBottom: "1rem" }}>{error}</div>}

      {!entry && !loading && !error && (
        <Empty title="Search for a word" sub="Type any English word above to get its definition, phonetics and examples." />
      )}

      {entry && (
        <>
          {/* Word header card */}
          <div style={{
            display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12,
            padding: "14px 18px", marginBottom: "1rem",
            background: "var(--surface-2)", borderRadius: 10, border: "1px solid var(--border)",
          }}>
            <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-.01em" }}>
              {entry.word}
            </span>
            {entry.phonetic && (
              <span style={{ fontSize: 15, color: "var(--muted)", fontFamily: '"IBM Plex Mono", monospace' }}>
                {entry.phonetic}
              </span>
            )}
            <AudioPlayer phonetics={entry.phonetics} />
            <span style={{ marginLeft: "auto" }}>
              {alreadySaved || justSaved ? (
                <span style={{ fontSize: 13, color: "var(--pos)", fontWeight: 500 }}>✓ Saved</span>
              ) : (
                <button className={`btn primary${saving ? " disabled" : ""}`}
                  disabled={saving} onClick={handleSave}>
                  {saving ? "Saving…" : "Save word"}
                </button>
              )}
            </span>
          </div>

          {/* Definitions table */}
          <section className="panel">
            <div className="panel-head">
              <h2>Definitions</h2>
              <span className="panel-meta">
                {definitions.length} definition{definitions.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="panel-body no-pad">
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th style={{ width: 120 }}>Part of speech</th>
                    <th>Definition</th>
                    <th>Example</th>
                  </tr>
                </thead>
                <tbody>
                  {definitions.map((def, i) => (
                    <tr key={i}>
                      <td className="muted mono" style={{ fontSize: 12 }}>{i + 1}</td>
                      <td><span className="tag">{def.partOfSpeech}</span></td>
                      <td style={{ lineHeight: 1.5 }}>{def.definition}</td>
                      <td className="muted" style={{ fontSize: 12.5, fontStyle: def.example ? "italic" : "normal" }}>
                        {def.example ? "“" + def.example + "”" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// ============================================================
//  TAB 2 — Saved words
// ============================================================
const PAGE_SIZES = [10, 20, 50, 100];

function DictionarySaved({ savedWords, loading, onDelete }) {
  const [search,   setSearch]   = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [page,     setPage]     = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return savedWords;
    return savedWords.filter(
      (w) => w.word.toLowerCase().includes(q) ||
             (w.saved_by || "").toLowerCase().includes(q)
    );
  }, [savedWords, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows   = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [search, pageSize]);

  return (
    <div>
      {/* Toolbar */}
      <div className="toolbar" style={{ marginBottom: "1rem" }}>
        <input
          type="text" value={search} placeholder="Filter by word or user…"
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span className="toolbar-meta">Show</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            style={{ width: "auto" }}
          >
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="toolbar-meta">per page · {filtered.length} total</span>
        </div>
      </div>

      <section className="panel">
        <div className="panel-body no-pad">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Word</th>
                <th>Phonetic</th>
                <th>Parts of speech</th>
                <th>Saved by</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 36, color: "var(--muted)" }}>
                    Loading…
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <Empty
                      title="No saved words"
                      sub={search ? "No words match your search." : "Save a word from the Search tab."}
                    />
                  </td>
                </tr>
              ) : pageRows.map((w, i) => {
                const parts = [...new Set(
                  ((w.data && w.data.meanings) || []).map((m) => m.partOfSpeech)
                )];
                return (
                  <tr key={w.id}>
                    <td className="muted mono" style={{ fontSize: 12 }}>
                      {(page - 1) * pageSize + i + 1}
                    </td>
                    <td><span className="sym">{w.word}</span></td>
                    <td className="muted mono" style={{ fontSize: 12 }}>{w.phonetic || "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {parts.length > 0
                          ? parts.map((p) => <span key={p} className="tag">{p}</span>)
                          : <span className="muted">—</span>
                        }
                      </div>
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>{w.saved_by || "—"}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{fmtDate(w.created_at)}</td>
                    <td className="r">
                      <button className="row-del" title="Delete" onClick={() => onDelete(w.id)}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 14 }}>
          <button className="btn ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>
            ← Prev
          </button>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            Page {page} of {totalPages}
          </span>
          <button className="btn ghost" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
//  Main view
// ============================================================
function DictionaryView({ currentUser }) {
  const [tab,          setTab]          = useState("search");
  const [savedWords,   setSavedWords]   = useState([]);
  const [loadingWords, setLoadingWords] = useState(true);

  useEffect(() => { loadWords(); }, []);

  async function loadWords() {
    setLoadingWords(true);
    try {
      const data = await db.loadDictionaryWords();
      setSavedWords(data);
    } catch (e) {
      console.error("loadWords:", e.message);
    }
    setLoadingWords(false);
  }

  async function handleSave(entry) {
    await db.saveDictionaryWord(entry, currentUser?.username || "unknown");
    await loadWords();
  }

  async function handleDelete(id) {
    await db.deleteDictionaryWord(id);
    setSavedWords((prev) => prev.filter((w) => w.id !== id));
  }

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h1>Learning Dictionary</h1>
          <p className="view-sub">Look up English words · save them for reference · {savedWords.length} saved so far.</p>
        </div>
      </header>

      <div style={{ marginBottom: "1.25rem" }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "search", label: "Search" },
            { value: "saved",  label: "Saved Words (" + savedWords.length + ")" },
          ]}
        />
      </div>

      {tab === "search" && (
        <DictionarySearch
          currentUser={currentUser}
          savedWords={savedWords}
          onSave={handleSave}
        />
      )}
      {tab === "saved" && (
        <DictionarySaved
          savedWords={savedWords}
          loading={loadingWords}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

window.DictionaryView = DictionaryView;
