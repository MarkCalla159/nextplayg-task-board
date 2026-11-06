import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Status } from "./taskStorage";
import { createTaskRepository } from "./taskRepository";
import type { RemoteTask, TaskLabel } from "./taskRepository";
import { dueIndicator, formatDueDate, matchesFilters } from "./boardFilters";
import "./App.css";
import { supabase } from "./lib/supabase";

const columns: { id: Status; title: string }[] = [
  { id: "todo", title: "To Do" },
  { id: "in_progress", title: "In Progress" },
  { id: "in_review", title: "In Review" },
  { id: "done", title: "Done" },
];

const dragType = "application/x-nextplayg-task";
let repository: ReturnType<typeof createTaskRepository> | undefined;

function getRepository() {
  return repository ??= createTaskRepository(supabase, window.localStorage);
}

function App() {
  const [tasks, setTasks] = useState<RemoteTask[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [labels, setLabels] = useState<TaskLabel[]>([]);
  const [schemaReady, setSchemaReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [newTask, setNewTask] = useState("");
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const [deleted, setDeleted] = useState<{ task: RemoteTask; index: number } | null>(
    null,
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPriority, setEditPriority] = useState<"low" | "normal" | "high">("normal");
  const [editDueDate, setEditDueDate] = useState("");
  const [editAssignee, setEditAssignee] = useState("");
  const [editLabels, setEditLabels] = useState<string[]>([]);
  const [editError, setEditError] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [labelError, setLabelError] = useState("");
  const [filters, setFilters] = useState({ query: "", priority: "", assignee: "", label: "" });
  const [today, setToday] = useState(() => new Date());
  const busyRef = useRef(false);
  const undoRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const focusTaskId = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setToday(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (deleted) undoRef.current?.focus();
  }, [deleted]);

  useEffect(() => {
    if (editing) editInputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (focusTaskId.current) {
      document.getElementById(`status-${focusTaskId.current}`)?.focus();
      focusTaskId.current = null;
    }
  }, [tasks]);

  useEffect(() => {
    let active = true;
    async function loadBoard() {
      try {
        const result = await getRepository().initialize();
        if (!active) return;
        setUserId(result.userId);
        setTasks(result.tasks);
        setLabels(result.labels);
        setSchemaReady(result.schemaReady);
        setStorageError("");
      } catch (error) {
        if (active) {
          setStorageError(error instanceof Error && error.message === "The local task backup could not be read"
            ? "Your local task backup could not be read, so it has not been imported or changed."
            : "Could not load your tasks. Check your connection and try again. Your local backup is unchanged.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadBoard();
    return () => { active = false; };
  }, [reloadKey]);

  async function runChange(action: (id: string) => Promise<void>) {
    if (!userId || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setStorageError("");
    try {
      await action(userId);
    } catch {
      setStorageError("Could not save your change. Check your connection and try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTask.trim();
    if (!title) {
      setFormError("Enter a task name to add it to the board.");
      inputRef.current?.focus();
      return;
    }

    void runChange(async (id) => {
      const task = await getRepository().create(id, title);
      setTasks((current) => [task, ...current]);
      setNewTask("");
      setFormError("");
      setMessage(`Added ${title} to To Do.`);
    });
  }

  function moveTask(taskId: string, newStatus: Status, returnFocus = false) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status === newStatus) return;
    void runChange(async (id) => {
      const updated = await getRepository().update(id, taskId, { status: newStatus });
      if (returnFocus) focusTaskId.current = taskId;
      setTasks((current) => current.map((item) => item.id === taskId ? updated : item));
      setMessage(`Moved ${task.title} to ${columns.find((column) => column.id === newStatus)?.title}.`);
    });
  }

  function deleteTask(taskId: string) {
    const index = tasks.findIndex((task) => task.id === taskId);
    if (index < 0) return;
    void runChange(async (id) => {
      await getRepository().remove(id, taskId);
      setDeleted({ task: tasks[index], index });
      setTasks((current) => current.filter((task) => task.id !== taskId));
      setMessage("");
    });
  }

  function undoDelete() {
    if (!deleted) return;
    void runChange(async (id) => {
      const task = await getRepository().restore(id, deleted.task);
      setTasks((current) => {
        const restored = [...current];
        restored.splice(Math.min(deleted.index, restored.length), 0, task);
        return restored;
      });
      setMessage(`Restored ${task.title}.`);
      setDeleted(null);
      inputRef.current?.focus();
    });
  }

  function saveEdit(event: FormEvent<HTMLFormElement>, taskId: string) {
    event.preventDefault();
    const title = editTitle.trim();
    if (!title) { setEditError("Enter a task name."); return; }
    void runChange(async (id) => {
      const changes = schemaReady ? { title, priority: editPriority, due_date: editDueDate || null, assignee: editAssignee.trim(), labels: editLabels } : { title };
      const updated = await getRepository().update(id, taskId, changes);
      setTasks((current) => current.map((item) => item.id === taskId ? updated : item));
      setEditing(null);
      setEditError("");
      setMessage(`Updated ${title}.`);
    });
  }

  function startEdit(task: RemoteTask) {
    setEditing(task.id);
    setEditTitle(task.title);
    setEditPriority(task.priority === "low" || task.priority === "high" ? task.priority : "normal");
    setEditDueDate(task.due_date ?? "");
    setEditAssignee(task.assignee);
    setEditLabels(task.labels);
    setEditError("");
  }

  function addLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newLabel.trim();
    if (!name) { setLabelError("Enter a label name."); return; }
    if (labels.some((label) => label.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setLabelError("This label already exists."); return;
    }
    void runChange(async (id) => {
      const label = await getRepository().createLabel(id, name);
      setLabels((current) => [...current, label].sort((a, b) => a.name.localeCompare(b.name)));
      setNewLabel("");
      setLabelError("");
      setMessage(`Created label ${name}.`);
    });
  }

  const assignees = [...new Set(tasks.map((task) => task.assignee).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <main className="app">
      <header className="header">
        <div>
          <p className="eyebrow">NEXTPLAYG WORKSPACE</p>
          <h1>My task board</h1>
          <p className="subtitle">
            Organize your work and keep your momentum going.
          </p>
        </div>

        <form className="create-task" onSubmit={addTask} noValidate>
          <div className="task-input-group">
            <label htmlFor="new-task">New task</label>
            <input
              ref={inputRef}
              id="new-task"
              value={newTask}
              onChange={(event) => {
                setNewTask(event.target.value);
                setFormError("");
              }}
              placeholder="Add a new task..."
              maxLength={300}
              disabled={!userId || busy}
              aria-invalid={!!formError}
              aria-describedby={formError ? "task-error" : undefined}
            />
            {formError && (
              <p className="form-error" id="task-error" role="alert">
                {formError}
              </p>
            )}
          </div>
          <button type="submit" disabled={!userId || busy}>+ New task</button>
        </form>
      </header>

      <div className="board-notices">
        {storageError ? (
          <div className="storage-warning" role="alert">
            {storageError}
            {!userId && (
              <button
                type="button"
                onClick={() => { setLoading(true); setStorageError(""); setReloadKey((current) => current + 1); }}
              >
                Try again
              </button>
            )}
          </div>
        ) : (
          <p className="storage-note" role="status">{loading ? "Loading tasks…" : busy ? "Saving…" : "Tasks are saved to your guest session."}</p>
        )}
        {deleted && (
          <div className="undo-notice">
            <span>Deleted “{deleted.task.title}”.</span>
            <button ref={undoRef} type="button" onClick={undoDelete} disabled={busy}>
              Undo
            </button>
          </div>
        )}
        <p className="sr-only" role="status" aria-live="polite">
          {message}
        </p>
      </div>

      {userId && (
        <section className="board-tools" aria-label="Search and filters">
          {!schemaReady && (
            <p className="schema-notice" role="status">To use labels and task filters, run <code>supabase-features-migration.sql</code> in your Supabase SQL editor, then reload this page.</p>
          )}
          <div className="filter-controls">
            <div className="filter-search">
              <label htmlFor="task-search">Search tasks</label>
              <input id="task-search" type="search" placeholder="Search by title" value={filters.query}
                onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} />
            </div>
            <div>
              <label htmlFor="filter-priority">Priority</label>
              <select id="filter-priority" value={filters.priority} disabled={!schemaReady}
                onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))}>
                <option value="">All priorities</option><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
              </select>
            </div>
            <div>
              <label htmlFor="filter-assignee">Assignee</label>
              <select id="filter-assignee" value={filters.assignee} disabled={!schemaReady}
                onChange={(event) => setFilters((current) => ({ ...current, assignee: event.target.value }))}>
                <option value="">All assignees</option><option value="unassigned">Unassigned</option>
                {assignees.map((name) => <option key={name} value={`assigned:${name}`}>{name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="filter-label">Label</label>
              <select id="filter-label" value={filters.label} disabled={!schemaReady}
                onChange={(event) => setFilters((current) => ({ ...current, label: event.target.value }))}>
                <option value="">All labels</option>{labels.map((label) => <option key={label.id} value={label.name}>{label.name}</option>)}
              </select>
            </div>
            {hasFilters && <button className="clear-filters" type="button" onClick={() => setFilters({ query: "", priority: "", assignee: "", label: "" })}>Clear filters</button>}
          </div>
          {schemaReady && <details className="label-manager">
            <summary>Manage labels <span>({labels.length})</span></summary>
            <div className="label-manager-content">
              {labels.length > 0 ? <ul className="label-list">{labels.map((label) => <li key={label.id}>{label.name}</li>)}</ul> : <p>No labels yet. Create one to use on your tasks.</p>}
              <form className="label-form" onSubmit={addLabel} noValidate>
                <div><label htmlFor="new-label">New label</label>
                  <input id="new-label" value={newLabel} maxLength={40} placeholder="e.g. Design" disabled={busy}
                    onChange={(event) => { setNewLabel(event.target.value); setLabelError(""); }}
                    aria-invalid={!!labelError} aria-describedby={labelError ? "label-error" : undefined} />
                  {labelError && <p id="label-error" className="field-error" role="alert">{labelError}</p>}
                </div>
                <button type="submit" disabled={busy}>Add label</button>
              </form>
            </div>
          </details>}
        </section>
      )}

      {userId && <section className="board" aria-label="Task board" aria-busy={busy}>
        {columns.map((column) => {
          const columnTasks = tasks.filter((task) => task.status === column.id && matchesFilters(task, filters));
          return (
            <section
              className={`column column--${column.id}`}
              key={column.id}
              aria-labelledby={`column-${column.id}`}
              onDragOver={(event) => {
                if (!busy && event.dataTransfer.types.includes(dragType))
                  event.preventDefault();
              }}
              onDrop={(event) => {
                const taskId = event.dataTransfer.getData(dragType);
                if (taskId) {
                  event.preventDefault();
                  moveTask(taskId, column.id);
                }
              }}
            >
              <div className="column-header">
                <h2 id={`column-${column.id}`}>{column.title}</h2>
                <span
                  aria-label={`${columnTasks.length} ${columnTasks.length === 1 ? "task" : "tasks"}`}
                >
                  {columnTasks.length}
                </span>
              </div>

              <div className="task-list">
                {columnTasks.map((task) => (
                  <article
                    className="task-card"
                    key={task.id}
                    draggable={!busy}
                    onDragStart={(event) =>
                      event.dataTransfer.setData(dragType, task.id)
                    }
                  >
                    <div className="task-card-top">
                      <span className="task-dot" aria-hidden="true" />
                      <div className="task-card-actions">
                      <button
                        type="button"
                        onClick={() => startEdit(task)}
                        aria-label={`Edit ${task.title}`}
                        disabled={busy}
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTask(task.id)}
                        aria-label={`Delete ${task.title}`}
                        disabled={busy}
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          width="18"
                          height="18"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        >
                          <path d="M6 6l12 12M18 6 6 18" />
                        </svg>
                      </button>
                      </div>
                    </div>
                    {editing === task.id ? (
                      <form className="edit-task" onSubmit={(event) => saveEdit(event, task.id)}>
                        <label htmlFor={`edit-${task.id}`}>Task name</label>
                        <input ref={editInputRef} id={`edit-${task.id}`} value={editTitle} maxLength={300} disabled={busy}
                          onChange={(event) => { setEditTitle(event.target.value); setEditError(""); }}
                          aria-invalid={!!editError} aria-describedby={editError ? `edit-error-${task.id}` : undefined} />
                        {editError && <p id={`edit-error-${task.id}`} role="alert">{editError}</p>}
                        {schemaReady && <>
                          <label htmlFor={`priority-${task.id}`}>Priority</label>
                          <select id={`priority-${task.id}`} value={editPriority} disabled={busy}
                            onChange={(event) => setEditPriority(event.target.value as "low" | "normal" | "high")}>
                            <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
                          </select>
                          <label htmlFor={`due-${task.id}`}>Due date</label>
                          <input id={`due-${task.id}`} type="date" value={editDueDate} disabled={busy} onChange={(event) => setEditDueDate(event.target.value)} />
                          <label htmlFor={`assignee-${task.id}`}>Assignee <span>(personal note)</span></label>
                          <input id={`assignee-${task.id}`} value={editAssignee} maxLength={80} disabled={busy} placeholder="Optional name"
                            onChange={(event) => setEditAssignee(event.target.value)} />
                          <fieldset className="edit-labels">
                            <legend>Labels</legend>
                            {labels.length ? labels.map((label) => <label key={label.id}>
                              <input type="checkbox" checked={editLabels.includes(label.name)} disabled={busy}
                                onChange={(event) => setEditLabels((current) => event.target.checked ? [...current, label.name] : current.filter((name) => name !== label.name))} />
                              {label.name}
                            </label>) : <span>Create a label above to add it here.</span>}
                          </fieldset>
                        </>}
                        <div className="edit-actions">
                          <button type="submit" disabled={busy}>Save</button>
                          <button type="button" disabled={busy} onClick={() => { setEditing(null); setEditError(""); }}>Cancel</button>
                        </div>
                      </form>
                    ) : <>
                      <h3 dir="auto">{task.title}</h3>
                      {schemaReady && <div className="task-metadata">
                        <span className={`priority-badge priority--${task.priority}`}>{task.priority} priority</span>
                        {task.due_date && (() => {
                          const urgency = dueIndicator(task.due_date, task.status, today);
                          const text = urgency === "overdue" ? "Overdue" : urgency === "today" ? "Due today" : urgency === "soon" ? "Due soon" : "Due";
                          return <span className={`due-badge due--${urgency ?? "completed"}`}>{text}: {formatDueDate(task.due_date)}</span>;
                        })()}
                        {task.assignee && <span className="assignee-note">Assignee: {task.assignee}</span>}
                        {task.labels.length > 0 && <ul className="task-labels" aria-label="Task labels">{task.labels.map((label) => <li key={label}>{label}</li>)}</ul>}
                      </div>}
                    </>}
                    <label
                      className="status-label"
                      htmlFor={`status-${task.id}`}
                    >
                      Move to
                    </label>
                    <select
                      id={`status-${task.id}`}
                      aria-label={`Move ${task.title} to`}
                      value={task.status}
                      disabled={busy}
                      onChange={(event) =>
                        moveTask(task.id, event.target.value as Status, true)
                      }
                    >
                      {columns.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.title}
                        </option>
                      ))}
                    </select>
                  </article>
                ))}
              </div>
              {columnTasks.length === 0 && (
                <div className="empty-column">{hasFilters ? "No tasks match your filters." : "No tasks here yet."}</div>
              )}
            </section>
          );
        })}
      </section>}
    </main>
  );
}

export default App;
