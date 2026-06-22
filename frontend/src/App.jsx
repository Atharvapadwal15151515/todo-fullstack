import { useState, useEffect, useCallback, useMemo } from "react";
import "./App.css";

// ============================================================================
// CONFIG — base URL for every API call. Falls back to local dev backend.
// ============================================================================
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Keys used to persist the session in localStorage.
const TOKEN_KEY = "taskflow_token";
const USER_KEY = "taskflow_user";

// ============================================================================
// ICONS — small inline SVGs, no icon library needed.
// ============================================================================
const Icon = {
  Check: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M4 12.5L9.5 18L20 6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Trash: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M4 7H20M9 7V4.6C9 4.1 9.4 3.7 9.9 3.7H14.1C14.6 3.7 15 4.1 15 4.6V7M6.2 7L7.1 19.4C7.1 20.3 7.9 21 8.7 21H15.3C16.1 21 16.9 20.3 16.9 19.4L17.8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Logout: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M9 21H5.5C4.7 21 4 20.3 4 19.5V4.5C4 3.7 4.7 3 5.5 3H9M16 17L21 12L16 7M21 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Search: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20.5 20.5L16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  Alert: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M12 8.5V13M12 16.5H12.01M10.6 4.3L2.7 18.3C2.3 19 2.8 20 3.6 20H20.4C21.2 20 21.7 19 21.3 18.3L13.4 4.3C13 3.6 11 3.6 10.6 4.3Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Plus: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  ),
  Spark: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M12 3L13.8 9.4L20 12L13.8 14.6L12 21L10.2 14.6L4 12L10.2 9.4L12 3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  ),
};

// ============================================================================
// API HELPER
// Centralizes every fetch call: attaches JSON + Authorization headers,
// parses the response safely, and throws a readable Error on failure.
// err.status is attached so callers can special-case 401 (expired session).
// ============================================================================
async function apiRequest(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error("Can't reach the server. Check your connection and try again.");
    err.status = 0;
    throw err;
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // some responses (e.g. DELETE) may not return a JSON body — that's fine
  }

  if (!res.ok) {
    const err = new Error((data && (data.message || data.error)) || "Something went wrong. Please try again.");
    err.status = res.status;
    throw err;
  }

  return data;
}

// ============================================================================
// ROOT COMPONENT
// ============================================================================
export default function App() {
  // ---- session state ----
  const [authChecked, setAuthChecked] = useState(false); // have we finished the initial localStorage check?
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  // ---- auth screen state ----
  const [authView, setAuthView] = useState("login"); // "login" | "signup"
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState(""); // e.g. "Account created, please sign in"

  // ---- todos state ----
  const [todos, setTodos] = useState([]);
  const [todosLoading, setTodosLoading] = useState(false);
  const [todosError, setTodosError] = useState("");
  const [busyIds, setBusyIds] = useState(() => new Set()); // todo ids mid-toggle/mid-delete
  const [addLoading, setAddLoading] = useState(false);

  // ---- dashboard UI state ----
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // "all" | "active" | "completed"

  // --------------------------------------------------------------------------
  // LOGOUT — clears storage + state. Also used automatically on a 401.
  // --------------------------------------------------------------------------
  const handleLogout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    setTodos([]);
    setAuthView("login");
    setAuthError("");
  }, []);

  // --------------------------------------------------------------------------
  // FETCH TODOS for the logged-in user
  // --------------------------------------------------------------------------
  const fetchTodos = useCallback(
    async (activeToken) => {
      setTodosLoading(true);
      setTodosError("");
      try {
        const data = await apiRequest("/api/todos", { token: activeToken });
        const list = Array.isArray(data) ? data : data?.todos || data?.data || [];
        setTodos(list);
      } catch (err) {
        if (err.status === 401) {
          handleLogout(); // requirement #15: auto-logout on 401
        } else {
          setTodosError(err.message);
        }
      } finally {
        setTodosLoading(false);
      }
    },
    [handleLogout]
  );

  // --------------------------------------------------------------------------
  // ON LOAD — check localStorage for an existing session
  // --------------------------------------------------------------------------
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);

    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setToken(storedToken);
        setUser(parsedUser);
        fetchTodos(storedToken).finally(() => setAuthChecked(true));
        return;
      } catch {
        // corrupted localStorage entry — wipe it and fall through to login
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }
    setAuthChecked(true);
    // fetchTodos is stable (useCallback), safe to omit re-runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------------------------------------------------------------------------
  // LOGIN
  // --------------------------------------------------------------------------
  const handleLogin = async (email, password) => {
    setAuthLoading(true);
    setAuthError("");
    try {
      const data = await apiRequest("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });
      if (!data?.token || !data?.user) {
        throw new Error("Unexpected response from server.");
      }
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setAuthNotice("");
      fetchTodos(data.token);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // SIGNUP — on success, drop back to the login form with a success notice
  // --------------------------------------------------------------------------
  const handleSignup = async (name, email, password) => {
    setAuthLoading(true);
    setAuthError("");
    try {
      await apiRequest("/api/auth/register", {
        method: "POST",
        body: { name, email, password },
      });
      setAuthView("login");
      setAuthNotice("Account created. Sign in to get started.");
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // ADD TODO
  // --------------------------------------------------------------------------
  const addTodo = async (title) => {
    setAddLoading(true);
    setTodosError("");
    try {
      const data = await apiRequest("/api/todos", {
        method: "POST",
        token,
        body: { title },
      });
      const created = data?.todo || data?.data || data;
      setTodos((prev) => [created, ...prev]);
    } catch (err) {
      if (err.status === 401) handleLogout();
      else setTodosError(err.message);
    } finally {
      setAddLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // TOGGLE COMPLETE
  // --------------------------------------------------------------------------
  const toggleTodo = async (todo) => {
    setBusyIds((prev) => new Set(prev).add(todo.id));
    setTodosError("");
    try {
      const data = await apiRequest(`/api/todos/${todo.id}`, {
        method: "PUT",
        token,
        body: { title: todo.title, completed: !todo.completed },
      });
      const updated = data?.todo || data?.data || data || { ...todo, completed: !todo.completed };
      setTodos((prev) => prev.map((t) => (t.id === todo.id ? updated : t)));
    } catch (err) {
      if (err.status === 401) handleLogout();
      else setTodosError(err.message);
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(todo.id);
        return next;
      });
    }
  };

  // --------------------------------------------------------------------------
  // DELETE TODO
  // --------------------------------------------------------------------------
  const deleteTodo = async (todo) => {
    setBusyIds((prev) => new Set(prev).add(todo.id));
    setTodosError("");
    try {
      await apiRequest(`/api/todos/${todo.id}`, { method: "DELETE", token });
      setTodos((prev) => prev.filter((t) => t.id !== todo.id));
    } catch (err) {
      if (err.status === 401) handleLogout();
      else setTodosError(err.message);
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(todo.id);
        return next;
      });
    }
  };

  // --------------------------------------------------------------------------
  // DERIVED DATA — search + filter + stats
  // --------------------------------------------------------------------------
  const visibleTodos = useMemo(() => {
    return todos
      .filter((t) => (filter === "active" ? !t.completed : filter === "completed" ? t.completed : true))
      .filter((t) => t.title?.toLowerCase().includes(search.trim().toLowerCase()));
  }, [todos, filter, search]);

  const stats = useMemo(() => {
    const total = todos.length;
    const completed = todos.filter((t) => t.completed).length;
    return { total, completed, pending: total - completed, pct: total ? Math.round((completed / total) * 100) : 0 };
  }, [todos]);

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------
  if (!authChecked) {
    return (
      <div className="boot-screen">
        <div className="boot-mark">
          <span className="boot-dot" />
          <span className="boot-dot" />
          <span className="boot-dot" />
        </div>
        <p>Loading TaskFlow…</p>
      </div>
    );
  }

  if (!token || !user) {
    return (
      <AuthScreen
        view={authView}
        onSwitchView={(v) => {
          setAuthView(v);
          setAuthError("");
          setAuthNotice("");
        }}
        onLogin={handleLogin}
        onSignup={handleSignup}
        loading={authLoading}
        error={authError}
        notice={authNotice}
      />
    );
  }

  return (
    <Dashboard
      user={user}
      todos={visibleTodos}
      allCount={todos.length}
      stats={stats}
      todosLoading={todosLoading}
      todosError={todosError}
      busyIds={busyIds}
      addLoading={addLoading}
      search={search}
      onSearch={setSearch}
      filter={filter}
      onFilter={setFilter}
      onAdd={addTodo}
      onToggle={toggleTodo}
      onDelete={deleteTodo}
      onLogout={handleLogout}
    />
  );
}

// ============================================================================
// AUTH SCREEN — split hero/form layout, shared by login + signup
// ============================================================================
function AuthScreen({ view, onSwitchView, onLogin, onSignup, loading, error, notice }) {
  return (
    <div className="auth-shell">
      <section className="auth-hero">
        <FlowMark size={40} />
        <h1 className="auth-hero-title">
          Find your <em>flow.</em>
        </h1>
        <p className="auth-hero-copy">
          TaskFlow keeps your day moving — capture tasks the moment they land, and watch
          your progress fill in as you clear them.
        </p>
        <ul className="auth-hero-points">
          <li><Icon.Check className="icon-sm" /> Your tasks, synced to your account</li>
          <li><Icon.Check className="icon-sm" /> Search and filter in an instant</li>
          <li><Icon.Check className="icon-sm" /> A live read on today's progress</li>
        </ul>
        <FlowWave />
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-head">
            <h2>{view === "login" ? "Welcome back" : "Create your account"}</h2>
            <p>
              {view === "login" ? "Sign in to pick up where you left off." : "Takes less than a minute."}
            </p>
          </div>

          {notice && (
            <div className="banner banner-success">
              <Icon.Check className="icon-sm" />
              <span>{notice}</span>
            </div>
          )}
          {error && (
            <div className="banner banner-error">
              <Icon.Alert className="icon-sm" />
              <span>{error}</span>
            </div>
          )}

          {view === "login" ? (
            <LoginForm onSubmit={onLogin} loading={loading} />
          ) : (
            <SignupForm onSubmit={onSignup} loading={loading} />
          )}

          <p className="auth-switch">
            {view === "login" ? (
              <>Don't have an account?{" "}
                <button type="button" onClick={() => onSwitchView("signup")}>Sign up</button>
              </>
            ) : (
              <>Already have an account?{" "}
                <button type="button" onClick={() => onSwitchView("login")}>Sign in</button>
              </>
            )}
          </p>
        </div>
      </section>
    </div>
  );
}

function LoginForm({ onSubmit, loading }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setFieldError("Enter your email and password to continue.");
      return;
    }
    setFieldError("");
    onSubmit(email.trim(), password);
  };

  return (
    <form className="auth-form" onSubmit={submit}>
      {fieldError && <p className="field-error">{fieldError}</p>}
      <label className="field">
        <span>Email</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </label>
      <button className="btn-primary" type="submit" disabled={loading}>
        {loading ? <Spinner /> : "Sign in"}
      </button>
    </form>
  );
}

function SignupForm({ onSubmit, loading }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) {
      setFieldError("Fill in every field to create your account.");
      return;
    }
    if (password.length < 6) {
      setFieldError("Use at least 6 characters for your password.");
      return;
    }
    setFieldError("");
    onSubmit(name.trim(), email.trim(), password);
  };

  return (
    <form className="auth-form" onSubmit={submit}>
      {fieldError && <p className="field-error">{fieldError}</p>}
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Atharva" autoComplete="name" />
      </label>
      <label className="field">
        <span>Email</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
        />
      </label>
      <button className="btn-primary" type="submit" disabled={loading}>
        {loading ? <Spinner /> : "Create account"}
      </button>
    </form>
  );
}

// ============================================================================
// DASHBOARD
// ============================================================================
function Dashboard({
  user,
  todos,
  allCount,
  stats,
  todosLoading,
  todosError,
  busyIds,
  addLoading,
  search,
  onSearch,
  filter,
  onFilter,
  onAdd,
  onToggle,
  onDelete,
  onLogout,
}) {
  const [draft, setDraft] = useState("");

  const submitAdd = (e) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title || addLoading) return;
    onAdd(title);
    setDraft("");
  };

  return (
    <div className="dashboard">
      <header className="dash-nav">
        <div className="dash-brand">
          <FlowMark size={26} />
          <span>TaskFlow</span>
        </div>
        <div className="dash-user">
          <span className="dash-greeting">
            Hey, <strong>{user.name}</strong>
          </span>
          <button className="btn-ghost" onClick={onLogout}>
            <Icon.Logout className="icon-sm" />
            Log out
          </button>
        </div>
      </header>

      <main className="dash-main">
        <FlowStats stats={stats} />

        {todosError && (
          <div className="banner banner-error">
            <Icon.Alert className="icon-sm" />
            <span>{todosError}</span>
          </div>
        )}

        <form className="add-row" onSubmit={submitAdd}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What's next on your list?"
            disabled={addLoading}
          />
          <button className="btn-primary btn-add" type="submit" disabled={addLoading || !draft.trim()}>
            {addLoading ? <Spinner /> : <Icon.Plus className="icon-sm" />}
            <span>Add task</span>
          </button>
        </form>

        <div className="toolbar">
          <label className="search-field">
            <Icon.Search className="icon-sm" />
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search tasks…"
            />
          </label>
          <div className="filter-pills">
            {["all", "active", "completed"].map((f) => (
              <button
                key={f}
                className={`pill ${filter === f ? "pill-active" : ""}`}
                onClick={() => onFilter(f)}
                type="button"
              >
                {f === "all" ? "All" : f === "active" ? "Active" : "Completed"}
              </button>
            ))}
          </div>
        </div>

        <TaskList
          todos={todos}
          allCount={allCount}
          loading={todosLoading}
          busyIds={busyIds}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      </main>
    </div>
  );
}

function TaskList({ todos, allCount, loading, busyIds, onToggle, onDelete }) {
  if (loading) {
    return (
      <ul className="task-list">
        {[0, 1, 2].map((i) => (
          <li key={i} className="task-row task-skeleton">
            <span className="skeleton-box checkbox-skeleton" />
            <span className="skeleton-box text-skeleton" />
          </li>
        ))}
      </ul>
    );
  }

  if (allCount === 0) {
    return (
      <div className="empty-state">
        <Icon.Spark className="icon-lg" />
        <h3>Your list is wide open</h3>
        <p>Add your first task above and watch the flow fill in.</p>
      </div>
    );
  }

  if (todos.length === 0) {
    return (
      <div className="empty-state">
        <Icon.Search className="icon-lg" />
        <h3>No tasks match</h3>
        <p>Try a different search term or filter.</p>
      </div>
    );
  }

  return (
    <ul className="task-list">
      {todos.map((todo) => {
        const busy = busyIds.has(todo.id);
        return (
          <li key={todo.id} className={`task-row ${todo.completed ? "task-done" : ""}`}>
            <button
              type="button"
              className={`checkbox ${todo.completed ? "checkbox-checked" : ""}`}
              onClick={() => onToggle(todo)}
              disabled={busy}
              aria-label={todo.completed ? "Mark task as active" : "Mark task as complete"}
            >
              {todo.completed && <Icon.Check className="icon-sm" />}
            </button>
            <span className="task-title">{todo.title}</span>
            <button
              type="button"
              className="icon-btn icon-btn-danger"
              onClick={() => onDelete(todo)}
              disabled={busy}
              aria-label="Delete task"
            >
              {busy ? <Spinner small /> : <Icon.Trash className="icon-sm" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ============================================================================
// SIGNATURE ELEMENT — liquid "flow" progress card + small stat numbers
// ============================================================================
function FlowStats({ stats }) {
  return (
    <div className="stats-row">
      <div className="flow-card">
        <div className="flow-liquid" style={{ height: `${stats.pct}%` }}>
          <svg className="flow-wave" viewBox="0 0 600 24" preserveAspectRatio="none">
            <path d="M0 12 C 50 0, 100 24, 150 12 C 200 0, 250 24, 300 12 C 350 0, 400 24, 450 12 C 500 0, 550 24, 600 12 V24 H0 Z" />
          </svg>
        </div>
        <div className="flow-card-text">
          <span className="flow-pct">{stats.pct}%</span>
          <span className="flow-label">today's flow</span>
        </div>
      </div>
      <div className="stat-mini">
        <span className="stat-num">{stats.total}</span>
        <span className="stat-label">Total</span>
      </div>
      <div className="stat-mini">
        <span className="stat-num">{stats.pending}</span>
        <span className="stat-label">Pending</span>
      </div>
      <div className="stat-mini">
        <span className="stat-num">{stats.completed}</span>
        <span className="stat-label">Completed</span>
      </div>
    </div>
  );
}

// ============================================================================
// SHARED VISUAL BITS
// ============================================================================
function FlowMark({ size = 28 }) {
  return (
    <svg className="flow-mark" width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path
        d="M4 20C8 20 8 12 12 12C16 12 16 22 20 22C24 22 24 10 28 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FlowWave() {
  return (
    <svg className="hero-wave" viewBox="0 0 500 120" preserveAspectRatio="none">
      <path
        className="hero-wave-path"
        d="M0 60 C 60 10, 120 110, 180 60 C 240 10, 300 110, 360 60 C 410 20, 460 90, 500 60"
        fill="none"
        strokeWidth="2.5"
      />
    </svg>
  );
}

function Spinner({ small }) {
  return <span className={`spinner ${small ? "spinner-sm" : ""}`} aria-label="Loading" />;
}
