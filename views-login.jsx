// ============================================================
//  views-login.jsx — login screen
// ============================================================

function LoginView({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    setError(null);
    const user = await db.login(username, password);
    setLoading(false);
    if (!user) {
      setError("Incorrect username or password.");
      return;
    }
    setSession(user);
    onLogin(user);
  };

  const change = (setter) => (e) => { setter(e.target.value); setError(null); };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark" style={{ width: 44, height: 44, fontSize: 14 }}>Hieu</div>
          <div>
            <div className="brand-name" style={{ color: "var(--text)", fontSize: 17 }}>Personal Tracker App</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>ETFs, Gold, Cryptocurrency &amp; more</div>
          </div>
        </div>
        <form onSubmit={submit} autoComplete="on">
          <Field label="Username">
            <input
              type="text"
              value={username}
              autoFocus
              autoComplete="username"
              placeholder="Enter username"
              onChange={change(setUsername)}
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              placeholder="Enter password"
              onChange={change(setPassword)}
            />
          </Field>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="btn primary login-submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

window.LoginView = LoginView;
