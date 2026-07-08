import { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";

/* ─────────────────────────────────────────────
   CONSTANTS & HELPERS
───────────────────────────────────────────── */

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
console.log("LIVE API_URL =", API_URL);
const META_KEY        = "taskflow_meta";
const THEME_KEY       = "taskflow_theme";
const TOKEN_KEY       = "token";
const USER_KEY        = "user";
const LAST_USER_KEY   = "lastUser";
const GUEST_TODOS_KEY = "taskflow_guest_todos";
const REMEMBER_KEY    = "taskflow_remember_device";

const DAY_MS = 24 * 60 * 60 * 1000;

// ── localStorage helpers (task metadata: priority / due date) ──

function getMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; }
  catch { return {}; }
}

function saveMeta(meta) {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

function getTaskMeta(id) {
  const meta = getMeta();
  return meta[String(id)] || { priority: "Medium", dueDate: "" };
}

function setTaskMeta(id, data) {
  const meta = getMeta();
  meta[String(id)] = { ...meta[String(id)], ...data };
  saveMeta(meta);
}

function removeTaskMeta(id) {
  const meta = getMeta();
  delete meta[String(id)];
  saveMeta(meta);
}

// ── Date helpers ──────────────────────────────

function getDueStatus(dueDate) {
  if (!dueDate) return "no-due-date";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  if (due < today) return "overdue";
  if (due.getTime() === today.getTime()) return "today";
  return "upcoming";
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const DUE_LABEL = {
  overdue: { icon: "⚠️", text: "Overdue" },
  today: { icon: "🔔", text: "Due today" },
  upcoming: { icon: "📅", text: "" },
  "no-due-date": { icon: "—", text: "No date" },
};

// ── Priority helpers ──────────────────────────

const PRIORITY_ICON = { High: "🔴", Medium: "🟡", Low: "🟢" };

// ── Auth helpers ──────────────────────────────

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } }
function getLastUser() { try { return JSON.parse(localStorage.getItem(LAST_USER_KEY)); } catch { return null; } }
function isGuestUser(user) { return !!(user && user.isGuest); }

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// ── Remember-this-device helpers ──────────────
// { enabled: true, type: "7days" | "30days" | "forever", expiresAt: number|null }

function getRememberDevice() {
  try { return JSON.parse(localStorage.getItem(REMEMBER_KEY)); }
  catch { return null; }
}

function saveRememberDevice(type) {
  const expiresAt =
    type === "7days" ? Date.now() + 7 * DAY_MS :
    type === "30days" ? Date.now() + 30 * DAY_MS :
    null; // "forever"
  const record = { enabled: true, type, expiresAt };
  localStorage.setItem(REMEMBER_KEY, JSON.stringify(record));
  return record;
}

function clearRememberDevice() {
  localStorage.removeItem(REMEMBER_KEY);
}

function isRememberValid(record) {
  if (!record || !record.enabled) return false;
  if (record.expiresAt === null) return true;
  return Date.now() < record.expiresAt;
}

// ── Reset-password link parsing ──────────────
// Parses token/email straight out of the raw URL via regex instead of
// relying on a well-formed "?key=value" query string. This is deliberately
// tolerant: it works whether the link is
//   /reset-password?token=abc&email=x@y.com   (well-formed)
// or
//   /reset-passwordemail=x@y.com&token=abc     (missing leading "?", as
//                                                currently sent by the
//                                                password-reset email)
// because it just scans pathname+search for "token=" / "email=" wherever
// they appear, rather than requiring a "?" or "&" separator in front.

function parseResetLink() {
  const full = window.location.pathname + window.location.search;
  if (!/reset-password/i.test(full)) return null;

  const tokenMatch = full.match(/token=([^&]+)/);
  if (!tokenMatch) return null;

  const emailMatch = full.match(/email=([^&]+)/);

  return {
    token: decodeURIComponent(tokenMatch[1]),
    email: emailMatch ? decodeURIComponent(emailMatch[1]) : "",
  };
}

// ── Guest todo storage (local only, never touches backend) ──

function getGuestTodos() {
  try { return JSON.parse(localStorage.getItem(GUEST_TODOS_KEY)) || []; }
  catch { return []; }
}

function saveGuestTodos(todos) {
  localStorage.setItem(GUEST_TODOS_KEY, JSON.stringify(todos));
}

/* ─────────────────────────────────────────────
   TOAST HOOK
───────────────────────────────────────────── */

function useToast() {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  return { toasts, addToast };
}

/* ─────────────────────────────────────────────
   OTP DIGITS HOOK (shared by every 6-digit code screen)
───────────────────────────────────────────── */

function useOtpDigits(length = 6) {
  const [digits, setDigits] = useState(Array(length).fill(""));
  const inputRefs = useRef([]);

  function handleChange(idx, val) {
    const clean = val.replace(/\D/g, "");
    if (!clean) {
      const next = [...digits];
      next[idx] = "";
      setDigits(next);
      return;
    }
    const next = [...digits];
    next[idx] = clean[clean.length - 1];
    setDigits(next);
    if (idx < length - 1) inputRefs.current[idx + 1]?.focus();
  }

  function handleKeyDown(idx, e) {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    const next = Array(length).fill("");
    pasted.split("").forEach((d, i) => { next[i] = d; });
    setDigits(next);
    inputRefs.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  function reset() {
    setDigits(Array(length).fill(""));
    inputRefs.current[0]?.focus();
  }

  return { digits, inputRefs, handleChange, handleKeyDown, handlePaste, reset, code: digits.join("") };
}

function OtpBoxes({ otp }) {
  return (
    <div className="otp-row" onPaste={otp.handlePaste}>
      {otp.digits.map((d, i) => (
        <input
          key={i}
          ref={el => (otp.inputRefs.current[i] = el)}
          className="otp-box"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={e => otp.handleChange(i, e.target.value)}
          onKeyDown={e => otp.handleKeyDown(i, e)}
        />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   DONUT CHART COMPONENT
───────────────────────────────────────────── */

function DonutChart({ completed, total }) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const pending = total - completed;
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <div className="donut-card">
      <div className="donut-card-title">Completion</div>
      <div className="donut-container">
        <svg className="donut-svg" width="140" height="140" viewBox="0 0 140 140">
          <circle className="donut-track" cx="70" cy="70" r={r} />
          <circle
            className="donut-progress"
            cx="70" cy="70" r={r}
            strokeDasharray={circ}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="donut-center">
          <div className="donut-pct">{pct}%</div>
          <div className="donut-label">done</div>
        </div>
      </div>
      <div className="donut-legend">
        <div className="donut-legend-item">
          <div className="donut-legend-dot" style={{ background: "var(--primary)" }} />
          {completed} done
        </div>
        <div className="donut-legend-item">
          <div className="donut-legend-dot" style={{ background: "var(--border)" }} />
          {pending} left
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   ANALYTICS SECTION
   (Stat cards limited to real, directly-computable
   numbers from the user's own todos: total, completed,
   pending, and — for guests — a Guest Mode indicator.)
───────────────────────────────────────────── */

function AnalyticsSection({ todos, guest }) {
  const total = todos.length;
  const completed = todos.filter(t => t.completed).length;
  const pending = total - completed;

  return (
    <div className="analytics-section">
      <DonutChart completed={completed} total={total} />

      <div className="stat-cards-col">
        <div className="stat-cards-grid">
          <div className="stat-card icon-blue">
            <div className="stat-card-icon">📋</div>
            <div className="stat-card-body">
              <div className="stat-card-label">Total tasks</div>
              <div className="stat-card-value">{total}</div>
            </div>
          </div>
          <div className="stat-card icon-green">
            <div className="stat-card-icon">✅</div>
            <div className="stat-card-body">
              <div className="stat-card-label">Completed</div>
              <div className="stat-card-value">{completed}</div>
            </div>
          </div>
          <div className="stat-card icon-purple">
            <div className="stat-card-icon">⏳</div>
            <div className="stat-card-body">
              <div className="stat-card-label">Pending</div>
              <div className="stat-card-value">{pending}</div>
            </div>
          </div>
          {guest && (
            <div className="stat-card icon-orange">
              <div className="stat-card-icon">👤</div>
              <div className="stat-card-body">
                <div className="stat-card-label">Guest mode</div>
                <div className="stat-card-value">Active</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   TASK INSIGHTS CHART
   (Lives under the Completed section. Built purely
   from the user's own todos — priority mix, overdue
   count, and completion rate. Click (or Enter) opens
   a modal listing every task with its full detail.)
───────────────────────────────────────────── */

const PRIORITY_ORDER = ["High", "Medium", "Low"];

function buildPriorityCounts(todos) {
  const counts = { High: 0, Medium: 0, Low: 0 };
  todos.forEach(t => {
    const meta = getTaskMeta(t.id);
    const p = meta.priority || "Medium";
    counts[p] = (counts[p] || 0) + 1;
  });
  return counts;
}

function InsightsHeader({ showHint }) {
  return (
    <div className="insights-header">
      <div className="insights-header-left">
        <span className="insights-icon" aria-hidden="true">📊</span>
        <div>
          <div className="insights-title">Task Insights</div>
          <div className="insights-subtitle">Priority mix &amp; progress at a glance</div>
        </div>
      </div>
      {showHint && <span className="insights-expand-hint">View all ↗</span>}
    </div>
  );
}

function InsightsModal({ todos, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows = todos.map(t => {
    const meta = getTaskMeta(t.id);
    return { ...t, priority: meta.priority || "Medium", dueDate: meta.dueDate || "" };
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">All tasks — full breakdown</span>
          <button className="modal-close" onClick={onClose} title="Close" aria-label="Close">✕</button>
        </div>
        <div className="modal-body">
          {rows.length === 0 ? (
            <div className="modal-empty">No tasks to show yet.</div>
          ) : (
            <table className="modal-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Priority</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr className="modal-row" key={r.id}>
                    <td>
                      <div className={`modal-row-title ${r.completed ? "done" : ""}`}>
                        <span>{r.title}</span>
                      </div>
                    </td>
                    <td>{PRIORITY_ICON[r.priority]} {r.priority}</td>
                    <td>{r.dueDate ? formatDate(r.dueDate) : "—"}</td>
                    <td>
                      <span className={`modal-status-dot ${r.completed ? "done" : "pending"}`} />{" "}
                      {r.completed ? "Done" : "Pending"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function InsightsCard({ todos }) {
  const [open, setOpen] = useState(false);

  if (todos.length === 0) {
    return (
      <div className="insights-card" style={{ cursor: "default" }}>
        <InsightsHeader showHint={false} />
        <div className="insights-empty">
          <div className="insights-empty-icon">📊</div>
          <div className="insights-empty-text">Add a few tasks to see your priority breakdown and progress insights here.</div>
        </div>
      </div>
    );
  }

  const counts = buildPriorityCounts(todos);
  const max = Math.max(counts.High, counts.Medium, counts.Low, 1);

  const completed = todos.filter(t => t.completed).length;
  const completionRate = Math.round((completed / todos.length) * 100);
  const overdue = todos.filter(t => !t.completed && getDueStatus(getTaskMeta(t.id).dueDate) === "overdue").length;
  const dueSoon = todos.filter(t => {
    if (t.completed) return false;
    const status = getDueStatus(getTaskMeta(t.id).dueDate);
    return status === "today" || status === "upcoming";
  }).length;

  return (
    <>
      <div
        className="insights-card"
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === "Enter") setOpen(true); }}
        title="Click to see the full task breakdown"
      >
        <InsightsHeader showHint />

        <div className="insights-bars">
          {PRIORITY_ORDER.map(p => (
            <div className="insights-bar-row" key={p}>
              <span className="insights-bar-label">{PRIORITY_ICON[p]} {p}</span>
              <div className="insights-bar-track">
                <div
                  className={`insights-bar-fill fill-${p.toLowerCase()}`}
                  style={{ width: `${Math.max(4, Math.round((counts[p] / max) * 100))}%` }}
                />
              </div>
              <span className="insights-bar-count">{counts[p]}</span>
            </div>
          ))}
        </div>

        <div className="insights-stats-row">
          <div className="insights-stat">
            <span className="insights-stat-label">Completion rate</span>
            <span className="insights-stat-value">{completionRate}%</span>
          </div>
          <div className="insights-stat">
            <span className="insights-stat-label">Overdue</span>
            <span className="insights-stat-value">{overdue}</span>
          </div>
          <div className="insights-stat">
            <span className="insights-stat-label">Due soon</span>
            <span className="insights-stat-value">{dueSoon}</span>
          </div>
        </div>
      </div>

      {open && <InsightsModal todos={todos} onClose={() => setOpen(false)} />}
    </>
  );
}

/* ─────────────────────────────────────────────
   TASK CARD COMPONENT
───────────────────────────────────────────── */

function TaskCard({ todo, onToggle, onDelete, onSaveEdit }) {
  const [editing, setEditing] = useState(false);
  const meta = getTaskMeta(todo.id);

  const [editTitle, setEditTitle] = useState(todo.title);
  const [editPriority, setEditPriority] = useState(meta.priority || "Medium");
  const [editDueDate, setEditDueDate] = useState(meta.dueDate || "");

  const dueStatus = getDueStatus(meta.dueDate);
  const dueInfo = DUE_LABEL[dueStatus];

  function startEdit() {
    setEditTitle(todo.title);
    setEditPriority(meta.priority || "Medium");
    setEditDueDate(meta.dueDate || "");
    setEditing(true);
  }

  function cancelEdit() { setEditing(false); }

  async function saveEdit() {
    const trimmed = editTitle.trim();
    if (!trimmed) return;
    await onSaveEdit(todo.id, trimmed, editPriority, editDueDate);
    setEditing(false);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") cancelEdit();
  }

  const cardClasses = [
    "task-card",
    `priority-${(meta.priority || "medium").toLowerCase()}`,
    todo.completed ? "completed-card" : "",
    !todo.completed && dueStatus === "overdue" ? "overdue-card" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={cardClasses}>
      <div className="task-checkbox-wrapper">
        <input
          type="checkbox"
          className="task-checkbox"
          checked={todo.completed}
          onChange={() => onToggle(todo)}
        />
      </div>

      <div className="task-content">
        {editing ? (
          <div className="task-edit-form">
            <input
              className="task-edit-input"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              placeholder="Task title…"
            />
            <div className="task-edit-row">
              <select
                className="task-edit-select"
                value={editPriority}
                onChange={e => setEditPriority(e.target.value)}
              >
                <option value="High">🔴 High</option>
                <option value="Medium">🟡 Medium</option>
                <option value="Low">🟢 Low</option>
              </select>
              <input
                type="date"
                className="task-edit-date"
                value={editDueDate}
                onChange={e => setEditDueDate(e.target.value)}
              />
            </div>
            <div className="task-edit-actions">
              <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
              <button className="btn btn-secondary btn-sm" onClick={cancelEdit}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div className="task-main-row">
              <span className={`task-title ${todo.completed ? "task-completed" : ""}`}>
                {todo.title}
              </span>
              <span className={`priority-badge ${(meta.priority || "medium").toLowerCase()}`}>
                {PRIORITY_ICON[meta.priority || "Medium"]} {meta.priority || "Medium"}
              </span>
            </div>
            <div className="task-meta-row">
              {meta.dueDate ? (
                <span className={`due-badge ${dueStatus}`}>
                  {dueInfo.icon} {dueStatus === "upcoming" ? formatDate(meta.dueDate) : dueInfo.text}
                </span>
              ) : (
                <span className="due-badge no-due-date">— No date</span>
              )}
            </div>
          </>
        )}
      </div>

      {!editing && (
        <div className="task-actions">
          <button className="task-action-btn edit" onClick={startEdit} title="Edit task">✏️</button>
          <button className="task-action-btn delete" onClick={() => onDelete(todo.id)} title="Delete task">🗑️</button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   DEVICE STATUS CARD (remember-this-device)
───────────────────────────────────────────── */

function DeviceStatusCard({ addToast }) {
  const [record, setRecord] = useState(() => getRememberDevice());

  function turnOff() {
    clearRememberDevice();
    setRecord(null);
    addToast("Remember this device turned off", "info");
  }

  const on = isRememberValid(record);
  const typeLabel = record?.type === "7days" ? "for 7 days" : record?.type === "30days" ? "for 30 days" : "until you turn it off";

  return (
    <div className="device-status-card">
      <span className="device-status-text">
        Remember this device: <strong className={on ? "device-status-on" : "device-status-off"}>{on ? "ON" : "OFF"}</strong>
        {on && <> — staying signed in {typeLabel}</>}
      </span>
      {on && (
        <button className="btn btn-secondary btn-sm" onClick={turnOff}>Turn off</button>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   DASHBOARD PAGE
   (Existing Todo CRUD logic preserved. A guest
   branch was added so guest sessions store todos
   in localStorage only, per the guest-mode spec,
   without touching the real Todo endpoints.)
───────────────────────────────────────────── */

function Dashboard({ user, onLogout, addToast }) {
  const guest = isGuestUser(user);

  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState("Medium");
  const [newDueDate, setNewDueDate] = useState("");
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");

  // ── Fetch todos ─────────────────────────────

  const fetchTodos = useCallback(async () => {
    if (guest) {
      setTodos(getGuestTodos());
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/todos`, { headers: authHeaders() });
      if (res.status === 401) { onLogout(); return; }
      const data = await res.json();
      setTodos(Array.isArray(data) ? data : []);
    } catch {
      addToast("Failed to load tasks", "error");
    } finally {
      setLoading(false);
    }
  }, [guest, onLogout, addToast]);

  useEffect(() => { fetchTodos(); }, [fetchTodos]);

  // ── Add todo ─────────────────────────────────

  async function handleAdd(e) {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      if (guest) {
        const created = { id: `guest_${Date.now()}`, title: trimmed, completed: false };
        const next = [created, ...getGuestTodos()];
        saveGuestTodos(next);
        setTaskMeta(created.id, { priority: newPriority, dueDate: newDueDate });
        setTodos(next);
      } else {
        const res = await fetch(`${API_URL}/api/todos`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ title: trimmed, completed: false }),
        });
        if (res.status === 401) { onLogout(); return; }
        const created = await res.json();
        setTaskMeta(created.id, { priority: newPriority, dueDate: newDueDate });
        setTodos(prev => [created, ...prev]);
      }
      setNewTitle("");
      setNewPriority("Medium");
      setNewDueDate("");
      addToast("Task added ✓", "success");
    } catch {
      addToast("Failed to add task", "error");
    } finally {
      setAdding(false);
    }
  }

  // ── Toggle completed ──────────────────────────

  async function handleToggle(todo) {
    try {
      if (guest) {
        const next = getGuestTodos().map(t => t.id === todo.id ? { ...t, completed: !t.completed } : t);
        saveGuestTodos(next);
        setTodos(next);
        return;
      }
      const res = await fetch(`${API_URL}/api/todos/${todo.id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ title: todo.title, completed: !todo.completed }),
      });
      if (res.status === 401) { onLogout(); return; }
      const updated = await res.json();
      setTodos(prev => prev.map(t => t.id === updated.id ? updated : t));
    } catch {
      addToast("Failed to update task", "error");
    }
  }

  // ── Delete todo ───────────────────────────────

  async function handleDelete(id) {
    try {
      if (guest) {
        const next = getGuestTodos().filter(t => t.id !== id);
        saveGuestTodos(next);
        removeTaskMeta(id);
        setTodos(next);
        addToast("Task deleted", "info");
        return;
      }
      const res = await fetch(`${API_URL}/api/todos/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.status === 401) { onLogout(); return; }
      removeTaskMeta(id);
      setTodos(prev => prev.filter(t => t.id !== id));
      addToast("Task deleted", "info");
    } catch {
      addToast("Failed to delete task", "error");
    }
  }

  // ── Edit / save ───────────────────────────────

  async function handleSaveEdit(id, title, priority, dueDate) {
    try {
      if (guest) {
        const next = getGuestTodos().map(t => t.id === id ? { ...t, title } : t);
        saveGuestTodos(next);
        setTaskMeta(id, { priority, dueDate });
        setTodos(next);
        addToast("Task updated ✓", "success");
        return;
      }
      const res = await fetch(`${API_URL}/api/todos/${id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ title, completed: todos.find(t => t.id === id)?.completed || false }),
      });
      if (res.status === 401) { onLogout(); return; }
      const updated = await res.json();
      setTaskMeta(id, { priority, dueDate });
      setTodos(prev => prev.map(t => t.id === updated.id ? updated : t));
      addToast("Task updated ✓", "success");
    } catch {
      addToast("Failed to update task", "error");
    }
  }

  // ── Filtering ─────────────────────────────────

  const filtered = todos.filter(todo => {
    const meta = getTaskMeta(todo.id);
    const matchSearch = todo.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all"
      ? true
      : filterStatus === "completed" ? todo.completed : !todo.completed;
    const matchPriority = filterPriority === "all"
      ? true
      : (meta.priority || "Medium") === filterPriority;
    return matchSearch && matchStatus && matchPriority;
  });

  const priorityWeight = { High: 0, Medium: 1, Low: 2 };
  const sorted = [...filtered].sort((a, b) => {
    const ma = getTaskMeta(a.id);
    const mb = getTaskMeta(b.id);
    const statusA = getDueStatus(ma.dueDate);
    const statusB = getDueStatus(mb.dueDate);
    if (!a.completed && statusA === "overdue" && statusB !== "overdue") return -1;
    if (!b.completed && statusB === "overdue" && statusA !== "overdue") return 1;
    return (priorityWeight[ma.priority] || 1) - (priorityWeight[mb.priority] || 1);
  });

  const pendingCount = todos.filter(t => !t.completed).length;
  const completedCount = todos.filter(t => t.completed).length;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">My Tasks</h1>
        <p className="page-subtitle">{pendingCount} pending · {completedCount} completed</p>
      </div>

      {todos.length > 0 && <AnalyticsSection todos={todos} guest={guest} />}

      <div className="task-form-card">
        <div className="task-form-title">New task</div>
        <form onSubmit={handleAdd}>
          <div className="task-form-row">
            <div className="task-form-title-field">
              <input
                id="new-task-input"
                className="task-input"
                style={{ width: "100%" }}
                placeholder="What needs to be done?"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                disabled={adding}
              />
            </div>
            <div className="task-form-meta">
              <div className="task-form-group">
                <label className="task-form-label">Priority</label>
                <select className="task-select" value={newPriority} onChange={e => setNewPriority(e.target.value)}>
                  <option value="High">🔴 High</option>
                  <option value="Medium">🟡 Medium</option>
                  <option value="Low">🟢 Low</option>
                </select>
              </div>
              <div className="task-form-group">
                <label className="task-form-label">Due date</label>
                <input
                  type="date"
                  className="task-date-input"
                  value={newDueDate}
                  onChange={e => setNewDueDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
              <div className="task-form-group" style={{ justifyContent: "flex-end" }}>
                <label className="task-form-label">&nbsp;</label>
                <button type="submit" className="btn btn-primary" disabled={adding || !newTitle.trim()}>
                  {adding ? "Adding…" : "+ Add task"}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      <div className="filter-bar">
        <div className="search-wrapper">
          <span className="search-icon">🔍</span>
          <input className="search-input" placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All tasks</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
        </select>
        <select className="filter-select" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
          <option value="all">All priorities</option>
          <option value="High">🔴 High</option>
          <option value="Medium">🟡 Medium</option>
          <option value="Low">🟢 Low</option>
        </select>
        <span className="filter-count">{sorted.length} task{sorted.length !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <div className="loading-wrapper"><div className="spinner" /></div>
      ) : sorted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">{todos.length === 0 ? "📋" : "🔍"}</div>
          <div className="empty-title">{todos.length === 0 ? "No tasks yet" : "No tasks match your filter"}</div>
          <div className="empty-desc">
            {todos.length === 0 ? "Add your first task above to get started." : "Try changing the search or filters."}
          </div>
        </div>
      ) : (
        <div className="task-list">
          {sorted.some(t => !t.completed) && (
            <>
              <div className="section-header">
                <span className="section-title">Pending <span className="section-badge">{sorted.filter(t => !t.completed).length}</span></span>
              </div>
              {sorted.filter(t => !t.completed).map(todo => (
                <TaskCard key={todo.id} todo={todo} onToggle={handleToggle} onDelete={handleDelete} onSaveEdit={handleSaveEdit} />
              ))}
            </>
          )}
          {sorted.some(t => t.completed) && (
            <>
              <div className="section-header" style={{ marginTop: "16px" }}>
                <span className="section-title">
                  Completed
                  <span className="section-badge" style={{ background: "var(--success-soft)", color: "var(--success)" }}>
                    {sorted.filter(t => t.completed).length}
                  </span>
                </span>
              </div>
              {sorted.filter(t => t.completed).map(todo => (
                <TaskCard key={todo.id} todo={todo} onToggle={handleToggle} onDelete={handleDelete} onSaveEdit={handleSaveEdit} />
              ))}
            </>
          )}
        </div>
      )}

      <InsightsCard todos={todos} />
    </>
  );
}

/* ─────────────────────────────────────────────
   SHARED AUTH BITS
───────────────────────────────────────────── */

function TaskSyncLogo({ size = "md" }) {
  return (
    <div className={`tf-logo tf-logo-${size}`}>
      <span className="tf-logo-icon">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4.5 12.5L9.5 17.5L19.5 6.5" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="tf-logo-text">
        <span className="tf-logo-task">Task</span><span className="tf-logo-flow">Sync</span>
      </span>
    </div>
  );
}

const BENEFITS = [
  { icon: "🗂️", title: "Stay organized", desc: "Keep every task, priority, and deadline in one calm place." },
  { icon: "⚡", title: "Boost productivity", desc: "Cut through the noise and focus on what matters today." },
  { icon: "🏆", title: "Achieve more", desc: "Track progress and build momentum, one task at a time." },
];

function AuthBranding() {
  return (
    <div className="auth-branding">
      <TaskSyncLogo size="lg" />
      <p className="auth-branding-tagline">The clean, focused way to manage your day — from first task to last.</p>
      <ul className="auth-benefit-list">
        {BENEFITS.map(b => (
          <li className="auth-benefit-item" key={b.title}>
            <span className="auth-benefit-icon">{b.icon}</span>
            <span>
              <span className="auth-benefit-title">{b.title}</span>
              <span className="auth-benefit-desc">{b.desc}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AuthShell({ children }) {
  return (
    <div className="auth-wrapper">
      <div className="auth-split">
        <AuthBranding />
        <div className="auth-card">{children}</div>
      </div>
    </div>
  );
}

function PasswordField({ label, value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="password-field">
        <input
          className="form-input"
          type={show ? "text" : "password"}
          placeholder={placeholder || "••••••••"}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          required
        />
        <button type="button" className="password-toggle" onClick={() => setShow(s => !s)} tabIndex={-1}>
          {show ? "🙈" : "👁️"}
        </button>
      </div>
    </div>
  );
}

function passwordStrength(pw) {
  if (!pw) return { score: 0, label: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong", "Strong"];
  return { score, label: labels[score] };
}

function PasswordStrength({ password }) {
  if (!password) return null;
  const { score, label } = passwordStrength(password);
  const pct = Math.min(100, (score / 5) * 100);
  const tone = score <= 1 ? "danger" : score <= 2 ? "warning" : score <= 3 ? "accent" : "success";
  return (
    <div className="strength-meter">
      <div className="strength-track">
        <div className={`strength-fill strength-${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`strength-label strength-text-${tone}`}>{label}</span>
    </div>
  );
}

/* ── Remember-this-device control (checkbox + duration chips) ── */

function RememberDeviceControl({ checked, onCheckedChange, type, onTypeChange }) {
  return (
    <div className="remember-block">
      <label className="checkbox-row">
        <input type="checkbox" checked={checked} onChange={e => onCheckedChange(e.target.checked)} />
        <span>Remember this device</span>
      </label>
      {checked && (
        <div className="remember-options">
          {[
            { key: "7days", label: "1 week" },
            { key: "30days", label: "30 days" },
            { key: "forever", label: "Until I change" },
          ].map(opt => (
            <button
              key={opt.key}
              type="button"
              className={`remember-option ${type === opt.key ? "active" : ""}`}
              onClick={() => onTypeChange(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   WELCOME SCREEN
───────────────────────────────────────────── */

function WelcomeScreen({ onNavigate, onGuest, guestLoading }) {
  return (
    <AuthShell>
      <div className="welcome-center">
        <div className="welcome-logo-mobile"><TaskSyncLogo size="lg" /></div>
        <h1 className="auth-heading welcome-heading">Welcome to TaskSync</h1>
        <p className="auth-subheading welcome-subheading">Organize your day with clarity and focus.</p>

        <div className="welcome-actions">
          <button className="btn btn-primary btn-full" onClick={() => onNavigate("login")}>Login</button>
          <button className="btn btn-secondary btn-full" onClick={() => onNavigate("signup")}>Create Account</button>
          <button className="btn btn-ghost btn-full" onClick={onGuest} disabled={guestLoading}>
            {guestLoading ? "Starting…" : "Continue as Guest"}
          </button>
        </div>
      </div>
    </AuthShell>
  );
}

/* ─────────────────────────────────────────────
   LOGIN SCREEN (incl. returning-user experience)
───────────────────────────────────────────── */

function LoginScreen({ onNavigate, onAuthed, onGuest, guestLoading, addToast }) {
  const [lastUser, setLastUser] = useState(() => getLastUser());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [rememberDevice, setRememberDeviceChecked] = useState(false);
  const [rememberType, setRememberType] = useState("7days");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (lastUser?.email) setEmail(lastUser.email);
  }, [lastUser]);

  function validate() {
    if (!lastUser && !isValidEmail(email) && !email.trim()) return "Enter your email or username.";
    if (!password) return "Password is required.";
    return "";
  }

  function persistSession(data, identifierUsedForLastUser) {
    const user = data.user || { email: identifierUsedForLastUser };
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    if (remember) {
      localStorage.setItem(LAST_USER_KEY, JSON.stringify({ name: user.name || user.username || "", email: user.email || identifierUsedForLastUser }));
    } else {
      localStorage.removeItem(LAST_USER_KEY);
    }
    if (rememberDevice) {
      saveRememberDevice(rememberType);
    } else {
      clearRememberDevice();
    }
    return user;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    setError("");
    setLoading(true);
    try {
      const identifier = lastUser ? lastUser.email : email;
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Invalid email or password.");
        return;
      }
      const user = persistSession(data, identifier);
      addToast(`Welcome back${user.name ? ", " + user.name : ""} ✓`, "success");
      onAuthed();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function notYou() {
    localStorage.removeItem(LAST_USER_KEY);
    setLastUser(null);
    setEmail("");
    setPassword("");
    setError("");
  }

  return (
    <AuthShell>
      <TaskSyncLogo />

      {lastUser ? (
        <>
          <div className="returning-user">
            <div className="returning-avatar">{(lastUser.name || lastUser.email || "U")[0].toUpperCase()}</div>
            <h1 className="auth-heading">Welcome back, {lastUser.name || lastUser.email.split("@")[0]}</h1>
            <p className="auth-subheading">{lastUser.email}</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <PasswordField label="Password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />

            <RememberDeviceControl
              checked={rememberDevice}
              onCheckedChange={setRememberDeviceChecked}
              type={rememberType}
              onTypeChange={setRememberType}
            />

            <div className="form-row-between">
              <button type="button" className="link-btn" onClick={() => onNavigate("forgot")}>Forgot password?</button>
            </div>

            {error && <div className="auth-error">⚠️ {error}</div>}
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? "Signing in…" : "Login"}
            </button>
            <button type="button" className="btn btn-ghost btn-full" onClick={notYou}>Not you?</button>
          </form>
        </>
      ) : (
        <>
          <h1 className="auth-heading">Sign in</h1>
          <p className="auth-subheading">Welcome back to your workspace</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email or username</label>
              <input
                className="form-input"
                type="text"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <PasswordField label="Password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />

            <div className="form-row-between">
              <label className="checkbox-row">
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                <span>Remember me</span>
              </label>
              <button type="button" className="link-btn" onClick={() => onNavigate("forgot")}>Forgot password?</button>
            </div>

            <RememberDeviceControl
              checked={rememberDevice}
              onCheckedChange={setRememberDeviceChecked}
              type={rememberType}
              onTypeChange={setRememberType}
            />

            {error && <div className="auth-error">⚠️ {error}</div>}

            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? (<span className="btn-spinner" />) : "Login"}
            </button>

            <button type="button" className="btn btn-secondary btn-full" onClick={onGuest} disabled={guestLoading}>
              {guestLoading ? "Starting…" : "Continue as Guest"}
            </button>
          </form>
        </>
      )}

      <div className="auth-switch">
        Don't have an account?{" "}
        <button onClick={() => onNavigate("signup")}>Sign up free</button>
      </div>
    </AuthShell>
  );
}

/* ─────────────────────────────────────────────
   SIGNUP SCREEN
───────────────────────────────────────────── */

function SignupScreen({ onNavigate, onOtpSent, addToast }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function validate() {
    if (!username.trim()) return "Choose a username.";
    if (!isValidEmail(email)) return "Enter a valid email address.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== confirm) return "Passwords do not match.";
    return "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password, confirmPassword: confirm }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Could not create account.");
        return;
      }
      addToast("Verification code sent ✓", "success");
      onOtpSent(email);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <TaskSyncLogo />
      <h1 className="auth-heading">Create account</h1>
      <p className="auth-subheading">Start managing your tasks</p>

      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Username</label>
          <input className="form-input" type="text" placeholder="janedoe" value={username} onChange={e => setUsername(e.target.value)} required />
        </div>

        <div className="form-group">
          <label className="form-label">Email</label>
          <input className="form-input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>

        <PasswordField label="Password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
        <PasswordStrength password={password} />

        <PasswordField label="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />

        {error && <div className="auth-error">⚠️ {error}</div>}

        <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
          {loading ? "Creating account…" : "Create Account"}
        </button>
      </form>

      <div className="auth-switch">
        Already have an account?{" "}
        <button onClick={() => onNavigate("login")}>Sign in</button>
      </div>
    </AuthShell>
  );
}

/* ─────────────────────────────────────────────
   OTP SCREEN (signup email verification)
───────────────────────────────────────────── */

const OTP_SECONDS = 300;

function OtpScreen({ email, onAuthed, onNavigate, addToast }) {
  const otp = useOtpDigits(6);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(OTP_SECONDS);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  async function handleVerify(e) {
    e.preventDefault();
    if (otp.code.length !== 6) { setError("Enter the full 6-digit code."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: otp.code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Invalid or expired code.");
        return;
      }
      const user = data.user || { email };
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      localStorage.setItem(LAST_USER_KEY, JSON.stringify({ name: user.name || user.username || "", email: user.email || email }));
      addToast("Email verified ✓", "success");
      onAuthed();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, resend: true }),
      });
      if (res.ok) {
        addToast("Code resent ✓", "info");
        setSeconds(OTP_SECONDS);
        otp.reset();
      } else {
        addToast("Could not resend code", "error");
      }
    } catch {
      addToast("Network error", "error");
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell>
      <TaskSyncLogo />
      <h1 className="auth-heading">Verify your email</h1>
      <p className="auth-subheading">
        We have sent a 6-digit code to<br /><strong className="otp-email">{email}</strong>
      </p>

      <form className="auth-form" onSubmit={handleVerify}>
        <OtpBoxes otp={otp} />

        <div className="otp-timer-row">
          <span className="otp-timer">{seconds > 0 ? `${mm}:${ss}` : "Code expired"}</span>
          <button type="button" className="link-btn" onClick={handleResend} disabled={seconds > 0 || resending}>
            {resending ? "Resending…" : "Resend OTP"}
          </button>
        </div>

        {error && <div className="auth-error">⚠️ {error}</div>}

        <button type="submit" className="btn btn-primary btn-full" disabled={loading || otp.code.length !== 6}>
          {loading ? "Verifying…" : "Verify"}
        </button>
      </form>

      <div className="auth-switch">
        <button onClick={() => onNavigate("login")}>Back to login</button>
      </div>
    </AuthShell>
  );
}

/* ─────────────────────────────────────────────
   FORGOT PASSWORD FLOW
   request email → choose method (link / otp) →
     email-link branch: "check your inbox"
     otp branch: verify-reset-otp → new password → success
───────────────────────────────────────────── */

function ForgotPasswordFlow({ onNavigate, addToast }) {
  const [step, setStep] = useState("request"); // request | choose | email-sent | otp | new-password | done
  const [email, setEmail] = useState("");
  const [verifiedOtp, setVerifiedOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const otp = useOtpDigits(6);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    if (step !== "done") return;
    const t = setTimeout(() => onNavigate("login"), 2000);
    return () => clearTimeout(t);
  }, [step, onNavigate]);

  async function handleRequestSubmit(e) {
    e.preventDefault();
    if (!isValidEmail(email)) { setError("Enter a valid email address."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || data.error || "Could not send reset instructions.");
        return;
      }
      setStep("choose");
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyResetOtp(e) {
    e.preventDefault();
    if (otp.code.length !== 6) { setError("Enter the full 6-digit code."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/verify-reset-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: otp.code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || data.error || "Invalid or expired code.");
        return;
      }
      setVerifiedOtp(otp.code);
      setStep("new-password");
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetWithOtp(e) {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: verifiedOtp, newPassword: password, confirmPassword: confirm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || data.error || "Could not reset password.");
        return;
      }
      setStep("done");
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "request") {
    return (
      <AuthShell>
        <TaskSyncLogo />
        <h1 className="auth-heading">Reset your password</h1>
        <p className="auth-subheading">Enter your email and we'll send you reset instructions.</p>
        <form className="auth-form" onSubmit={handleRequestSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          {error && <div className="auth-error">⚠️ {error}</div>}
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? "Sending…" : "Send Reset Instructions"}
          </button>
        </form>
        <div className="auth-switch">
          <button onClick={() => onNavigate("login")}>Back to login</button>
        </div>
      </AuthShell>
    );
  }

  if (step === "choose") {
    return (
      <AuthShell>
        <TaskSyncLogo />
        <h1 className="auth-heading">Choose how to reset your password</h1>
        <p className="auth-subheading">We sent something to <strong>{email}</strong>. Pick whichever is easier.</p>
        <div className="method-choice-list">
          <button className="method-choice-card method-email" onClick={() => setStep("email-sent")}>
            <span className="method-choice-title">📧 Continue with Email Link</span>
            <span className="method-choice-desc">We have sent a secure reset link to your email.</span>
          </button>
          <button className="method-choice-card method-otp" onClick={() => setStep("otp")}>
            <span className="method-choice-title">🔢 Continue with OTP</span>
            <span className="method-choice-desc">Use the 6-digit code from the same email.</span>
          </button>
        </div>
        <div className="auth-switch">
          <button onClick={() => onNavigate("login")}>Back to login</button>
        </div>
      </AuthShell>
    );
  }

  if (step === "email-sent") {
    return (
      <AuthShell>
        <TaskSyncLogo />
        <h1 className="auth-heading">Check your inbox</h1>
        <div className="success-block">
          <div className="success-check">✓</div>
          <p className="success-text">A secure reset link is on its way to <strong>{email}</strong>. Open it on this device to set a new password.</p>
        </div>
        <div className="auth-switch">
          <button onClick={() => onNavigate("login")}>Back to Login</button>
        </div>
      </AuthShell>
    );
  }

  if (step === "otp") {
    return (
      <AuthShell>
        <TaskSyncLogo />
        <h1 className="auth-heading">Verify Reset Code</h1>
        <p className="auth-subheading">
          Enter the 6-digit code sent to<br /><strong className="otp-email">{email}</strong>
        </p>
        <form className="auth-form" onSubmit={handleVerifyResetOtp}>
          <OtpBoxes otp={otp} />
          {error && <div className="auth-error">⚠️ {error}</div>}
          <button type="submit" className="btn btn-primary btn-full" disabled={loading || otp.code.length !== 6}>
            {loading ? "Verifying…" : "Verify Code"}
          </button>
        </form>
        <div className="auth-switch">
          <button onClick={() => onNavigate("login")}>Back to login</button>
        </div>
      </AuthShell>
    );
  }

  if (step === "new-password") {
    return (
      <AuthShell>
        <TaskSyncLogo />
        <h1 className="auth-heading">Set a new password</h1>
        <p className="auth-subheading">Choose a new password for <strong>{email}</strong>.</p>
        <form className="auth-form" onSubmit={handleResetWithOtp}>
          <PasswordField label="New password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
          <PasswordStrength password={password} />
          <PasswordField label="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
          {error && <div className="auth-error">⚠️ {error}</div>}
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? "Resetting…" : "Reset Password"}
          </button>
        </form>
      </AuthShell>
    );
  }

  // done
  return (
    <AuthShell>
      <TaskSyncLogo />
      <h1 className="auth-heading">Password reset</h1>
      <div className="success-block">
        <div className="success-check">✓</div>
        <p className="success-text">Your password has been changed. Redirecting you to login…</p>
      </div>
    </AuthShell>
  );
}

/* ─────────────────────────────────────────────
   RESET PASSWORD SCREEN (deep-link, token based)
───────────────────────────────────────────── */

function ResetPasswordScreen({ token, email, onNavigate }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => onNavigate("login"), 2000);
    return () => clearTimeout(t);
  }, [done, onNavigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, newPassword: password, confirmPassword: confirm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || data.error || "Could not reset password.");
        return;
      }
      setDone(true);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <TaskSyncLogo />
      <h1 className="auth-heading">Reset Password</h1>
      <p className="auth-subheading">
        {email ? <>Choose a new password for <strong>{email}</strong>.</> : "Choose a new password for your account."}
      </p>

      {done ? (
        <div className="success-block">
          <div className="success-check">✓</div>
          <p className="success-text">Password reset. Redirecting you to login…</p>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          <PasswordField label="New password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
          <PasswordStrength password={password} />
          <PasswordField label="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
          {error && <div className="auth-error">⚠️ {error}</div>}
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? "Resetting…" : "Reset Password"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

/* ─────────────────────────────────────────────
   AUTH FLOW ROUTER (welcome / login / signup / otp / forgot)
───────────────────────────────────────────── */

function AuthFlow({ onAuthed, addToast, theme, toggleTheme }) {
  const [screen, setScreen] = useState("welcome");
  const [otpEmail, setOtpEmail] = useState("");
  const [guestLoading, setGuestLoading] = useState(false);

  async function handleGuest() {
    setGuestLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/guest`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addToast(data.message || data.error || "Could not start guest session", "error");
        return;
      }
      const user = { ...(data.user || {}), isGuest: true };
      localStorage.setItem(TOKEN_KEY, data.token || "guest");
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      addToast("Continuing as guest", "info");
      onAuthed();
    } catch {
      addToast("Network error starting guest session", "error");
    } finally {
      setGuestLoading(false);
    }
  }

  return (
    <>
      <button className="theme-toggle theme-toggle-floating" onClick={toggleTheme} title="Toggle theme">
        {theme === "dark" ? "☀️" : "🌙"}
      </button>

      {screen === "welcome" && (
        <WelcomeScreen onNavigate={setScreen} onGuest={handleGuest} guestLoading={guestLoading} />
      )}
      {screen === "login" && (
        <LoginScreen onNavigate={setScreen} onAuthed={onAuthed} onGuest={handleGuest} guestLoading={guestLoading} addToast={addToast} />
      )}
      {screen === "signup" && (
        <SignupScreen onNavigate={setScreen} onOtpSent={email => { setOtpEmail(email); setScreen("otp"); }} addToast={addToast} />
      )}
      {screen === "otp" && (
        <OtpScreen email={otpEmail} onAuthed={onAuthed} onNavigate={setScreen} addToast={addToast} />
      )}
      {screen === "forgot" && (
        <ForgotPasswordFlow onNavigate={setScreen} addToast={addToast} />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────
   SIDEBAR (desktop) + MOBILE BOTTOM NAV
   (Simplified to only working destinations: logo,
   Dashboard, Logout. My Tasks / Analytics / Settings
   removed — they had no real screens behind them.)
───────────────────────────────────────────── */

function Sidebar({ onLogout }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <TaskSyncLogo size="sm" />
      </div>
      <nav className="sidebar-nav">
        <span className="sidebar-nav-item active">
          <span className="sidebar-nav-icon">🏠</span> Dashboard
        </span>
      </nav>
      <div className="sidebar-bottom">
        <button className="sidebar-nav-item sidebar-logout" onClick={onLogout}>
          <span className="sidebar-nav-icon">🚪</span> Logout
        </button>
      </div>
    </aside>
  );
}

function MobileBottomNav({ onOpenProfile }) {
  function focusAddTask() {
    const el = document.getElementById("new-task-input");
    el?.focus();
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  return (
    <nav className="mobile-bottom-nav">
      <button className="mobile-nav-item active">
        <span>🏠</span><small>Home</small>
      </button>
      <button className="mobile-nav-item" onClick={focusAddTask}>
        <span className="mobile-nav-add">➕</span><small>Add</small>
      </button>
      <button className="mobile-nav-item" onClick={onOpenProfile}>
        <span>👤</span><small>Profile</small>
      </button>
    </nav>
  );
}

/* ─────────────────────────────────────────────
   PROFILE MENU (avatar dropdown: identity, guest
   badge, theme toggle, remember-device controls)
───────────────────────────────────────────── */

function ProfileMenu({ user, theme, toggleTheme, onLogout, addToast, open, onOpenChange }) {
  const guest = isGuestUser(user);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) onOpenChange(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [onOpenChange]);

  const initial = (user?.name || user?.username || user?.email || "U")[0].toUpperCase();
  const displayName = user?.name || user?.username || user?.email || "User";

  return (
    <div className="profile-menu" ref={ref}>
      <button className="profile-trigger" onClick={() => onOpenChange(!open)}>
        <div className="header-avatar">{initial}</div>
        <span className="header-username">{displayName}</span>
        {guest && <span className="guest-badge">Guest</span>}
      </button>

      {open && (
        <div className="profile-dropdown">
          <div className="profile-dropdown-header">
            <div className="header-avatar profile-dropdown-avatar">{initial}</div>
            <div className="profile-dropdown-identity">
              <span className="profile-dropdown-name">{displayName}</span>
              {!guest && user?.email && <span className="profile-dropdown-email">{user.email}</span>}
              {guest && <span className="guest-badge">Guest Mode</span>}
            </div>
          </div>

          <div className="profile-dropdown-row">
            <span>Theme</span>
            <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
              {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
            </button>
          </div>

          {!guest && (
            <div className="profile-dropdown-device">
              <DeviceStatusCard addToast={addToast} />
            </div>
          )}

          <button className="btn btn-secondary btn-full profile-dropdown-logout" onClick={onLogout}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   ROOT APP
───────────────────────────────────────────── */

function computeInitialAuthed() {
  const token = getToken();
  if (!token) return false;

  const user = getUser();
  if (isGuestUser(user)) return true; // guest sessions aren't gated by remember-device

  const remember = getRememberDevice();
  if (isRememberValid(remember)) return true;

  // No valid remember-device record: don't silently keep the session alive.
  if (remember) clearRememberDevice();
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  return false;
}

export default function App() {
  // Checked once, synchronously, on first render — before we even look at
  // whether a session is already logged in. A password-reset link must
  // always win over "you happen to already have a token in localStorage."
  const [resetLink, setResetLink] = useState(() => parseResetLink());

  const [authed, setAuthed] = useState(computeInitialAuthed);
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "dark");
  const [profileOpen, setProfileOpen] = useState(false);

  const { toasts, addToast } = useToast();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  function toggleTheme() {
    setTheme(prev => (prev === "dark" ? "light" : "dark"));
  }

  function handleAuthed() {
    setAuthed(true);
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    // lastUser and rememberDevice are intentionally kept — logging out
    // shouldn't forget "who you are" or "this device is trusted."
    setAuthed(false);
  }

  // Called once the reset flow is finished (password changed, or the user
  // otherwise leaves the screen). Any old session is cleared — the password
  // just changed, so the stale token shouldn't silently stay valid in the
  // UI — and the URL is cleaned up so refreshing doesn't re-trigger it.
  function exitResetFlow() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.history.replaceState({}, "", "/");
    setResetLink(null);
    setAuthed(false);
  }

  const user = getUser();

  // A reset-password link always takes priority, regardless of whether a
  // session is already logged in.
  if (resetLink) {
    return (
      <>
        <ResetPasswordScreen token={resetLink.token} email={resetLink.email} onNavigate={exitResetFlow} />
        <ToastContainer toasts={toasts} />
      </>
    );
  }

  if (!authed) {
    return (
      <>
        <AuthFlow onAuthed={handleAuthed} addToast={addToast} theme={theme} toggleTheme={toggleTheme} />
        <ToastContainer toasts={toasts} />
      </>
    );
  }

  function focusAddTask() {
    const el = document.getElementById("new-task-input");
    el?.focus();
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="app-shell">
      <Sidebar onLogout={handleLogout} />

      <div className="main-column">
        <header className="header">
          <div className="header-left">
            <div className="header-logo header-logo-mobile">
              <TaskSyncLogo size="sm" />
            </div>
            <span className="header-page-title">Dashboard</span>
          </div>
          <div className="header-right">
            <button className="btn btn-primary btn-sm header-add-btn" onClick={focusAddTask}>
              + Add task
            </button>
            <ProfileMenu
              user={user}
              theme={theme}
              toggleTheme={toggleTheme}
              onLogout={handleLogout}
              addToast={addToast}
              open={profileOpen}
              onOpenChange={setProfileOpen}
            />
          </div>
        </header>

        <main className="main">
          <Dashboard user={user} onLogout={handleLogout} addToast={addToast} />
        </main>
      </div>

      <MobileBottomNav onOpenProfile={() => setProfileOpen(true)} />

      <ToastContainer toasts={toasts} />
    </div>
  );
}

/* ─────────────────────────────────────────────
   TOAST CONTAINER
───────────────────────────────────────────── */

function ToastContainer({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span>
            {t.type === "success" && "✅ "}
            {t.type === "error" && "❌ "}
            {t.type === "info" && "ℹ️ "}
            {t.message}
          </span>
        </div>
      ))}
    </div>
  );
}
