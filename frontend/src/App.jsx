import { useState, useEffect, useMemo } from "react";
import "./App.css";

const API_URL = "https://todo-fullstack-jimd.onrender.com/api/todos";

// ── SVG Icons (inline, no dependency) ──────────────────────────────────────
const Icons = {
  Plus: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Trash: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
    </svg>
  ),
  Check: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Search: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Calendar: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  Flag: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  ),
  Lightning: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  Empty: () => (
    <svg width="80" height="80" viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="50" stroke="url(#eg)" strokeWidth="2" strokeDasharray="6 4" />
      <rect x="38" y="42" width="44" height="6" rx="3" fill="url(#eg)" opacity="0.4" />
      <rect x="38" y="55" width="32" height="6" rx="3" fill="url(#eg)" opacity="0.3" />
      <rect x="38" y="68" width="38" height="6" rx="3" fill="url(#eg)" opacity="0.2" />
      <circle cx="60" cy="30" r="8" fill="url(#eg)" opacity="0.6" />
      <line x1="57" y1="27" x2="63" y2="33" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="63" y1="27" x2="57" y2="33" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <defs>
        <linearGradient id="eg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
    </svg>
  ),
  Error: () => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="20" stroke="#f87171" strokeWidth="2" />
      <line x1="24" y1="14" x2="24" y2="26" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="24" cy="32" r="1.5" fill="#f87171" />
    </svg>
  ),
};

// ── Skeleton Loader ─────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-check" />
      <div className="skeleton-body">
        <div className="skeleton-line wide" />
        <div className="skeleton-line narrow" />
      </div>
      <div className="skeleton-btn" />
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form state
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [adding, setAdding] = useState(false);

  // UI state
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [deletingId, setDeletingId] = useState(null);

  // Frontend-only metadata keyed by todo id
  const [meta, setMeta] = useState({});

  // ── API helpers ────────────────────────────────────────────────────────
  async function fetchTodos() {
    try {
      setError(null);
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error("Server error");
      const data = await res.json();
      setTodos(data);
    } catch {
      setError("Backend not reachable. Start Spring Boot on port 8080.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchTodos(); }, []);

  async function addTodo() {
    if (!input.trim()) { setInputError("Task title cannot be empty."); return; }
    setInputError("");
    setAdding(true);
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: input.trim(), completed: false }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      // Store priority + due date in frontend meta
      setMeta(prev => ({
        ...prev,
        [created.id]: { priority, dueDate, createdAt: Date.now() },
      }));
      setInput("");
      setDueDate("");
      setPriority("medium");
      await fetchTodos();
    } catch {
      setInputError("Failed to add task. Is the backend running?");
    } finally {
      setAdding(false);
    }
  }

  async function toggleTodo(todo) {
    try {
      await fetch(`${API_URL}/${todo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...todo, completed: !todo.completed }),
      });
      await fetchTodos();
    } catch {
      setError("Failed to update task.");
    }
  }

  async function deleteTodo(id) {
    setDeletingId(id);
    try {
      await fetch(`${API_URL}/${id}`, { method: "DELETE" });
      setMeta(prev => { const n = { ...prev }; delete n[id]; return n; });
      await fetchTodos();
    } catch {
      setError("Failed to delete task.");
    } finally {
      setDeletingId(null);
    }
  }

  // ── Derived data ───────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = todos.length;
    const completed = todos.filter(t => t.completed).length;
    const pending = total - completed;
    const pct = total ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pending, pct };
  }, [todos]);

  const filtered = useMemo(() => {
    let list = [...todos];
    if (filter === "active") list = list.filter(t => !t.completed);
    if (filter === "completed") list = list.filter(t => t.completed);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      const ma = meta[a.id] || {}; const mb = meta[b.id] || {};
      if (sort === "newest") return (mb.createdAt || 0) - (ma.createdAt || 0);
      if (sort === "oldest") return (ma.createdAt || 0) - (mb.createdAt || 0);
      if (sort === "completed") return Number(b.completed) - Number(a.completed);
      if (sort === "pending") return Number(a.completed) - Number(b.completed);
      return 0;
    });
    return list;
  }, [todos, filter, search, sort, meta]);

  const priorityColors = { low: "#34d399", medium: "#fbbf24", high: "#f87171" };
  const priorityLabels = { low: "Low", medium: "Med", high: "High" };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* Ambient blobs */}
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />

      <div className="container">

        {/* ── Header ── */}
        <header className="header">
          <div className="header-left">
            <div className="logo-mark">
              <Icons.Lightning />
            </div>
            <div>
              <h1 className="app-title">TaskFlow</h1>
              <p className="app-subtitle">Organize your day with clarity</p>
            </div>
          </div>
          <div className="stack-badge">
            <span>React</span>
            <span className="badge-dot" />
            <span>Spring Boot</span>
            <span className="badge-dot" />
            <span>PostgreSQL</span>
          </div>
        </header>

        {/* ── Stats ── */}
        <div className="stats-grid">
          {[
            { label: "Total", value: stats.total, cls: "stat-total" },
            { label: "Completed", value: stats.completed, cls: "stat-done" },
            { label: "Pending", value: stats.pending, cls: "stat-pending" },
            { label: "Done", value: `${stats.pct}%`, cls: "stat-pct" },
          ].map(s => (
            <div key={s.label} className={`stat-card ${s.cls}`}>
              <span className="stat-value">{s.value}</span>
              <span className="stat-label">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="progress-wrap">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${stats.pct}%` }} />
          </div>
          <span className="progress-label">{stats.pct}% complete</span>
        </div>

        {/* ── Add Task ── */}
        <div className="add-panel glass-card">
          <div className="add-row">
            <div className="input-wrap">
              <input
                className={`task-input ${inputError ? "input-err" : ""}`}
                type="text"
                placeholder="What needs to be done?"
                value={input}
                onChange={e => { setInput(e.target.value); setInputError(""); }}
                onKeyDown={e => e.key === "Enter" && addTodo()}
              />
              {inputError && <p className="err-msg">{inputError}</p>}
            </div>
            <button className="add-btn" onClick={addTodo} disabled={adding}>
              {adding ? <span className="spinner" /> : <Icons.Plus />}
              <span>{adding ? "Adding…" : "Add Task"}</span>
            </button>
          </div>

          {/* Meta row */}
          <div className="meta-row">
            <div className="meta-field">
              <Icons.Flag />
              <label>Priority</label>
              <div className="priority-pills">
                {["low", "medium", "high"].map(p => (
                  <button
                    key={p}
                    className={`pill ${priority === p ? "pill-active" : ""}`}
                    style={{ "--pill-color": priorityColors[p] }}
                    onClick={() => setPriority(p)}
                  >
                    {priorityLabels[p]}
                  </button>
                ))}
              </div>
            </div>
            <div className="meta-field">
              <Icons.Calendar />
              <label>Due date</label>
              <input
                type="date"
                className="date-input"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ── Controls row ── */}
        <div className="controls-row">
          {/* Search */}
          <div className="search-wrap">
            <Icons.Search />
            <input
              type="text"
              className="search-input"
              placeholder="Search tasks…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Filter */}
          <div className="filter-group">
            {["all", "active", "completed"].map(f => (
              <button
                key={f}
                className={`filter-btn ${filter === f ? "filter-active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select className="sort-select" value={sort} onChange={e => setSort(e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="completed">Completed first</option>
            <option value="pending">Pending first</option>
          </select>
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div className="error-banner">
            <Icons.Error />
            <div>
              <p className="error-title">Connection failed</p>
              <p className="error-body">{error}</p>
            </div>
            <button className="retry-btn" onClick={fetchTodos}>Retry</button>
          </div>
        )}

        {/* ── Task list ── */}
        <div className="task-list">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          ) : filtered.length === 0 ? (
            <div className="empty-state glass-card">
              <Icons.Empty />
              <h3 className="empty-title">
                {search || filter !== "all" ? "No tasks match your filters." : "No tasks yet."}
              </h3>
              <p className="empty-sub">
                {search || filter !== "all"
                  ? "Try adjusting your search or filters."
                  : "Add your first task to get started."}
              </p>
            </div>
          ) : (
            filtered.map(todo => {
              const m = meta[todo.id] || {};
              const isDeleting = deletingId === todo.id;
              const overdue = m.dueDate && !todo.completed && new Date(m.dueDate) < new Date();
              return (
                <div
                  key={todo.id}
                  className={`task-card glass-card ${todo.completed ? "task-done" : ""} ${isDeleting ? "task-deleting" : ""}`}
                >
                  {/* Priority stripe */}
                  {m.priority && (
                    <div
                      className="priority-stripe"
                      style={{ background: priorityColors[m.priority] }}
                    />
                  )}

                  {/* Checkbox */}
                  <button
                    className={`check-btn ${todo.completed ? "check-checked" : ""}`}
                    onClick={() => toggleTodo(todo)}
                    aria-label="Toggle complete"
                  >
                    {todo.completed && <Icons.Check />}
                  </button>

                  {/* Content */}
                  <div className="task-content">
                    <p className={`task-title ${todo.completed ? "task-strike" : ""}`}>
                      {todo.title}
                    </p>
                    <div className="task-chips">
                      {m.priority && (
                        <span
                          className="chip"
                          style={{ color: priorityColors[m.priority], borderColor: priorityColors[m.priority] + "44", background: priorityColors[m.priority] + "18" }}
                        >
                          <Icons.Flag /> {priorityLabels[m.priority]}
                        </span>
                      )}
                      {m.dueDate && (
                        <span className={`chip ${overdue ? "chip-overdue" : ""}`}>
                          <Icons.Calendar />
                          {new Date(m.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          {overdue && " · Overdue"}
                        </span>
                      )}
                      <span className={`chip ${todo.completed ? "chip-done" : "chip-pending"}`}>
                        {todo.completed ? "Completed" : "Pending"}
                      </span>
                    </div>
                  </div>

                  {/* Delete */}
                  <button
                    className="delete-btn"
                    onClick={() => deleteTodo(todo.id)}
                    disabled={isDeleting}
                    aria-label="Delete task"
                  >
                    {isDeleting ? <span className="spinner spinner-sm" /> : <Icons.Trash />}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <footer className="footer">
          Built with React + Spring Boot · {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}
