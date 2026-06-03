// ============================================================
//  auth.jsx — session management
//  Users are stored in the Supabase `users` table.
//  To add a user run this SQL in Supabase → SQL Editor:
//
//    insert into users (username, password_hash, display_name)
//    values ('hieu', crypt('yourpassword', gen_salt('bf')), 'Hieu');
// ============================================================

const SESSION_KEY = "trading_session";

function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setSession(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    username: user.username,
    displayName: user.display_name || user.username,
  }));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

Object.assign(window, { getSession, setSession, clearSession });
