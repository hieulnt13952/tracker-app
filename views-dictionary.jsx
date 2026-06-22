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
//  Word detail modal (used by the Saved Words tab)
// ============================================================
function WordDetailModal({ entry, onClose }) {
  const definitions = [];
  (entry.meanings || []).forEach((meaning) => {
    (meaning.definitions || []).forEach((def) => {
      definitions.push({
        partOfSpeech: meaning.partOfSpeech,
        definition:   def.definition,
        example:      def.example || null,
      });
    });
  });

  return (
    <Modal title={entry.word} onClose={onClose} width={680}>
      {/* Phonetic + audio */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        {entry.phonetic && (
          <span style={{ fontSize: 15, color: "var(--muted)", fontFamily: '"IBM Plex Mono", monospace' }}>
            {entry.phonetic}
          </span>
        )}
        <AudioPlayer phonetics={entry.phonetics} />
      </div>

      {/* Definitions table */}
      <div style={{ overflowX: "auto" }}>
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

      <div className="modal-actions" style={{ marginTop: 8 }}>
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

// ============================================================
//  TAB 2 — Saved words
// ============================================================
const PAGE_SIZES = [10, 20, 50, 100];

function DictionarySaved({ savedWords, loading, onDelete }) {
  const [search,       setSearch]       = useState("");
  const [pageSize,     setPageSize]     = useState(20);
  const [page,         setPage]         = useState(1);
  const [selectedWord, setSelectedWord] = useState(null);

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
                    <td>
                      <button
                        className="dict-word-btn"
                        onClick={() => setSelectedWord(w.data)}
                        title="Click to see full definition"
                      >
                        {w.word}
                      </button>
                    </td>
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

      {selectedWord && (
        <WordDetailModal entry={selectedWord} onClose={() => setSelectedWord(null)} />
      )}
    </div>
  );
}

// ============================================================
//  TAB 3 — NPR Reading
// ============================================================
const NPR_TOPICS = [
  { num: "1001", label: "News" },
  { num: "1002", label: "NPR" },
  { num: "1003", label: "National" },
  { num: "1004", label: "World" },
  { num: "1006", label: "Business" },
  { num: "1007", label: "Science" },
  { num: "1008", label: "Culture" },
  { num: "1009", label: "Middle East" },
  { num: "1013", label: "Education" },
  { num: "1014", label: "Politics" },
  { num: "1015", label: "Race" },
  { num: "1016", label: "Religion" },
  { num: "1017", label: "Economy" },
  { num: "1018", label: "Your Money" },
  { num: "1019", label: "Technology" },
  { num: "1020", label: "Media" },
  { num: "1023", label: "Radio Expeditions" },
  { num: "1024", label: "Research News" },
  { num: "1025", label: "Environment" },
  { num: "1026", label: "Space" },
  { num: "1027", label: "Healthcare" },
  { num: "1029", label: "Mental Health" },
  { num: "1030", label: "Children's Health" },
  { num: "1031", label: "Global Health" },
  { num: "1032", label: "Books" },
  { num: "1033", label: "Author Interviews" },
  { num: "1034", label: "Book Reviews" },
];

// ---- Inline word lookup panel (shown beside the article reader) ----
function LookupPanel() {
  const [query,   setQuery]   = useState("");
  const [entry,   setEntry]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function handleSearch(e) {
    e.preventDefault();
    const word = query.trim();
    if (!word) return;
    setLoading(true);
    setError("");
    setEntry(null);
    try {
      const data = await fetchDefinition(word);
      setEntry(data[0]);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  const definitions = useMemo(() => {
    if (!entry) return [];
    const rows = [];
    (entry.meanings || []).forEach((meaning) => {
      (meaning.definitions || []).forEach((def) => {
        rows.push({ pos: meaning.partOfSpeech, def: def.definition, ex: def.example || null });
      });
    });
    return rows;
  }, [entry]);

  return (
    <section className="panel lookup-panel">
      <div className="panel-head"><h2>Look up</h2></div>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 7 }}>
          <input
            type="text" value={query} placeholder="Paste a word…"
            onChange={(e) => { setQuery(e.target.value); setError(""); }}
            style={{ flex: 1, fontSize: 13 }}
          />
          <button type="submit"
            className={`btn primary${(loading || !query.trim()) ? " disabled" : ""}`}
            disabled={loading || !query.trim()}
            style={{ whiteSpace: "nowrap", fontSize: 12, padding: "0 10px" }}>
            {loading ? "…" : "Go"}
          </button>
        </form>
      </div>

      <div className="lookup-scroll">
        {error && <div className="warn" style={{ margin: 12 }}>{error}</div>}

        {!entry && !loading && !error && (
          <div style={{ padding: "28px 14px", textAlign: "center", color: "var(--faint)", fontSize: 12.5 }}>
            Copy a word from the article and paste it here.
          </div>
        )}

        {entry && (
          <div style={{ padding: "12px 14px" }}>
            {/* Word + phonetic */}
            <div style={{ marginBottom: 10 }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{entry.word}</span>
              {entry.phonetic && (
                <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: '"IBM Plex Mono", monospace', marginLeft: 8 }}>
                  {entry.phonetic}
                </span>
              )}
              <AudioPlayer phonetics={entry.phonetics} />
            </div>
            {/* Definitions list */}
            {definitions.map((d, i) => (
              <div key={i} style={{
                marginBottom: 10, paddingBottom: 10,
                borderBottom: i < definitions.length - 1 ? "1px solid var(--border)" : "none",
              }}>
                <span className="tag" style={{ fontSize: 11, marginBottom: 4, display: "inline-block" }}>
                  {d.pos}
                </span>
                <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text)" }}>{d.def}</div>
                {d.ex && (
                  <div style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic", marginTop: 3 }}>
                    "{d.ex}"
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function NPRReading() {
  const [topicNum,       setTopicNum]       = useState("1001");
  const [articles,       setArticles]       = useState([]);
  const [loadingList,    setLoadingList]    = useState(false);
  const [listError,      setListError]      = useState("");
  const [selectedHref,   setSelectedHref]   = useState(null);
  const [articleContent, setArticleContent] = useState(null); // { title, paragraphs[] }
  const [loadingArticle, setLoadingArticle] = useState(false);
  const [articleError,   setArticleError]   = useState("");

  async function fetchList(num) {
    if (!num) return;
    setLoadingList(true);
    setListError("");
    setArticles([]);
    setSelectedHref(null);
    setArticleContent(null);
    try {
      const res  = await fetch("/api/fetch-npr?path=" + encodeURIComponent(num));
      const html = await res.text();
      const doc  = new DOMParser().parseFromString(html, "text/html");
      const links = Array.from(doc.querySelectorAll("a.topic-title"));
      if (links.length === 0) throw new Error("No articles found — try a different topic number.");
      setArticles(links.map((a) => ({
        href:  a.getAttribute("href"),
        title: a.textContent.trim(),
      })));
    } catch (e) {
      setListError(e.message);
    }
    setLoadingList(false);
  }

  async function fetchArticle(href) {
    const path = href.startsWith("/") ? href.slice(1) : href;
    setSelectedHref(href);
    setLoadingArticle(true);
    setArticleError("");
    setArticleContent(null);
    try {
      const res  = await fetch("/api/fetch-npr?path=" + encodeURIComponent(path));
      const html = await res.text();
      const doc  = new DOMParser().parseFromString(html, "text/html");

      const title = doc.querySelector("h1")?.textContent?.trim() || "";
      const paragraphs = Array.from(doc.querySelectorAll("p"))
        .map((p) => p.textContent.trim())
        .filter((t) => t.length > 10); // skip nav crumbs / empty
      setArticleContent({ title, paragraphs });
    } catch (e) {
      setArticleError(e.message);
    }
    setLoadingArticle(false);
  }

  function handleTopicSubmit(e) {
    e.preventDefault();
    fetchList(topicNum);
  }

  return (
    <div>
      {/* Topic picker bar */}
      <div style={{ marginBottom: "1.25rem" }}>
        <form onSubmit={handleTopicSubmit} style={{ display: "flex", gap: 9, marginBottom: 10 }}>
          <input
            type="text" value={topicNum} placeholder="4-digit topic e.g. 1001"
            onChange={(e) => setTopicNum(e.target.value.replace(/\D/g, "").slice(0, 4))}
            style={{ width: 200 }}
          />
          <button type="submit"
            className={`btn primary${(loadingList || !topicNum) ? " disabled" : ""}`}
            disabled={loadingList || !topicNum}>
            {loadingList ? "Loading…" : "Browse topic"}
          </button>
        </form>
        {/* Quick-pick category chips */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {NPR_TOPICS.map((t) => (
            <button
              key={t.num}
              className={"tag npr-chip" + (topicNum === t.num && articles.length ? " active" : "")}
              onClick={() => { setTopicNum(t.num); fetchList(t.num); }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {listError && <div className="warn" style={{ marginBottom: "1rem" }}>{listError}</div>}

      {/* Empty prompt */}
      {!articles.length && !loadingList && !listError && (
        <Empty title="Pick a topic" sub="Select a category above or enter any 4-digit NPR topic number." />
      )}

      {/* Three-panel reader */}
      {articles.length > 0 && (
        <div className="npr-reader-grid">
          {/* LEFT — article list */}
          <section className="panel" style={{ overflow: "hidden" }}>
            <div className="panel-head">
              <h2>Articles</h2>
              <span className="panel-meta">{articles.length} stories</span>
            </div>
            <div className="npr-list-scroll">
              {articles.map((a, i) => (
                <button
                  key={i}
                  className={"npr-article-btn" + (selectedHref === a.href ? " active" : "")}
                  onClick={() => fetchArticle(a.href)}
                >
                  <span className="npr-article-num">{i + 1}</span>
                  {a.title}
                </button>
              ))}
            </div>
          </section>

          {/* MIDDLE — article content */}
          <section className="panel" style={{ overflow: "hidden" }}>
            {!selectedHref && (
              <div className="panel-body" style={{ color: "var(--muted)", textAlign: "center", padding: "60px 20px" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>📰</div>
                <div style={{ fontWeight: 600 }}>Select a story</div>
                <div style={{ fontSize: 13, marginTop: 5 }}>Click any article on the left to read it here.</div>
              </div>
            )}
            {loadingArticle && (
              <div className="panel-body" style={{ color: "var(--muted)", textAlign: "center", padding: 40 }}>
                Loading article…
              </div>
            )}
            {articleError && (
              <div className="panel-body"><div className="warn">{articleError}</div></div>
            )}
            {articleContent && !loadingArticle && (
              <div className="npr-article-scroll">
                <h2 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.35, marginBottom: 16 }}>
                  {articleContent.title}
                </h2>
                <div style={{ height: 1, background: "var(--border)", marginBottom: 16 }} />
                {articleContent.paragraphs.map((p, i) => (
                  <p key={i} style={{ marginBottom: 13, lineHeight: 1.7, fontSize: 14.5, color: "var(--text)" }}>
                    {p}
                  </p>
                ))}
              </div>
            )}
          </section>

          {/* RIGHT — inline look up */}
          <LookupPanel />
        </div>
      )}
    </div>
  );
}

// ============================================================
//  Main view
// ============================================================
function DictionaryView({ currentUser }) {
  const [tab,          setTab]          = useState("reading");
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
            { value: "reading", label: "Reading" },
            { value: "search",  label: "Search" },
            { value: "saved",   label: "Saved Words (" + savedWords.length + ")" },
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
      {tab === "reading" && <NPRReading />}
    </div>
  );
}

window.DictionaryView = DictionaryView;
