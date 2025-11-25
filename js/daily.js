import { getDB } from "./db.js";
import { dailyKey, getCurrentProfile, todayString } from "./utils.js";

let listEl;
let inputEl;
let addButton;
let dateInputEl;
let progressEl;
let activeDate = todayString();
let progressListenerAttached = false;

export function initDailyTasksSection({
  listElement,
  inputElement,
  addButtonElement,
  progressElement,
  dateInputElement,
}) {
  listEl = listElement;
  inputEl = inputElement;
  addButton = addButtonElement;
  progressEl = progressElement;
  dateInputEl = dateInputElement;

  if (!listEl || !inputEl || !addButton) return;

  addButton.addEventListener("click", handleAddTask);
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleAddTask();
    }
  });

  if (dateInputEl) {
    if (!dateInputEl.value) {
      dateInputEl.value = activeDate;
    } else {
      activeDate = dateInputEl.value;
    }
    dateInputEl.addEventListener("change", () => {
      setActiveDailyDate(dateInputEl.value || todayString());
    });
  }

  listEl.addEventListener("change", (event) => {
    const checkbox = event.target.closest("input[type='checkbox'][data-task-id]");
    if (!checkbox) return;
    toggleDailyTask(checkbox.dataset.taskId, checkbox.checked);
  });

  if (!progressListenerAttached) {
    window.addEventListener("routineUpdated", () => renderDailyProgress());
    window.addEventListener("dailyDateChanged", () => renderDailyProgress());
    progressListenerAttached = true;
  }

  refreshDailyTasks();
}

export async function refreshDailyTasks() {
  if (!listEl) return;
  const entry = await fetchDailyEntry(activeDate);
  const tasks = Array.isArray(entry?.tasks) ? entry.tasks : [];

  if (tasks.length === 0) {
    listEl.textContent = "No tasks yet.";
    return;
  }

  listEl.innerHTML = "";
  const fragment = document.createDocumentFragment();

  tasks.forEach((task) => {
    const wrapper = document.createElement("div");
    wrapper.className = "daily-task-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(task.done);
    checkbox.dataset.taskId = task.id;

    const span = document.createElement("span");
    span.textContent = task.label;

    wrapper.appendChild(checkbox);
    wrapper.appendChild(span);
    fragment.appendChild(wrapper);
  });

  listEl.appendChild(fragment);
  renderDailyProgress();
}

export async function updateRoutineCompletion(
  routineId,
  done,
  date = activeDate || todayString()
) {
  const entry = await ensureDailyEntry(date);
  entry.routineCompletions = Array.isArray(entry.routineCompletions)
    ? entry.routineCompletions
    : [];
  const existing = entry.routineCompletions.find((item) => item.id === routineId);
  if (existing) {
    existing.done = done;
  } else {
    entry.routineCompletions.push({ id: routineId, done });
  }
  await saveDailyEntry(entry);
  renderDailyProgress();
}

export async function fetchDailyEntry(date = todayString()) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("dailyEntries", "readonly");
    const request = tx.objectStore("dailyEntries").get(dailyKey(date));
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function createDailyTask(
  label,
  { source = "adhoc", weeklyGoalId = null, date = activeDate || todayString() } = {}
) {
  const entry = await ensureDailyEntry(date);
  entry.tasks = Array.isArray(entry.tasks) ? entry.tasks : [];
  entry.tasks.push({
    id: `t${Date.now()}`,
    label,
    done: false,
    source,
    weeklyGoalId,
  });
  await saveDailyEntry(entry);
}

export async function getLinkedTasksForWeeklyGoal(weeklyGoalId) {
  if (!weeklyGoalId) return [];
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("dailyEntries", "readonly");
    const request = tx.objectStore("dailyEntries").getAll();
    request.onsuccess = () => {
      const entries = request.result || [];
      const profile = getCurrentProfile();
      const linked = [];
      entries
        .filter((entry) => entry.profile === profile)
        .forEach((entry) => {
          const tasks = Array.isArray(entry.tasks) ? entry.tasks : [];
          tasks.forEach((task) => {
            if (task.weeklyGoalId === weeklyGoalId) {
              linked.push({
                id: task.id,
                label: task.label,
                done: task.done,
                date: entry.date,
                source: task.source,
              });
            }
          });
        });
      linked.sort((a, b) => a.date.localeCompare(b.date));
      resolve(linked);
    };
    request.onerror = () => reject(request.error);
  });
}

async function handleAddTask() {
  const value = inputEl.value.trim();
  if (!value) return;
  inputEl.value = "";
  await createDailyTask(value);
  refreshDailyTasks();
}

async function toggleDailyTask(taskId, done) {
  const entry = await ensureDailyEntry(activeDate);
  entry.tasks = Array.isArray(entry.tasks) ? entry.tasks : [];
  const task = entry.tasks.find((item) => item.id === taskId);
  if (!task) return;
  task.done = done;
  await saveDailyEntry(entry);
  renderDailyProgress();
}

async function ensureDailyEntry(date = activeDate || todayString()) {
  const existing = await fetchDailyEntry(date);
  if (existing) {
    existing.routineCompletions = Array.isArray(existing.routineCompletions)
      ? existing.routineCompletions
      : [];
    existing.tasks = Array.isArray(existing.tasks) ? existing.tasks : [];
    return existing;
  }
  return {
    key: dailyKey(date),
    profile: getCurrentProfile(),
    date,
    routineCompletions: [],
    tasks: [],
  };
}

async function saveDailyEntry(entry) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("dailyEntries", "readwrite");
    tx.objectStore("dailyEntries").put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function getActiveDailyDate() {
  return activeDate;
}

export function setActiveDailyDate(nextDate) {
  activeDate = nextDate || todayString();
  if (dateInputEl && dateInputEl.value !== activeDate) {
    dateInputEl.value = activeDate;
  }
  refreshDailyTasks();
  window.dispatchEvent(
    new CustomEvent("dailyDateChanged", {
      detail: { date: activeDate },
    })
  );
}

async function renderDailyProgress() {
  if (!progressEl) return;
  progressEl.textContent = "Loading...";
  const [entry, routineTasks] = await Promise.all([
    fetchDailyEntry(activeDate),
    fetchRoutineTasksForProgress(),
  ]);

  const tasks = Array.isArray(entry?.tasks) ? entry.tasks : [];
  const taskDone = tasks.filter((t) => t.done).length;

  const routineCompletions = Array.isArray(entry?.routineCompletions)
    ? entry.routineCompletions
    : [];
  const routineDone = routineTasks.reduce((count, task) => {
    const completion = routineCompletions.find((item) => item.id === task.id);
    return count + (completion?.done ? 1 : 0);
  }, 0);

  const rings = [
    { label: "Tasks", done: taskDone, total: tasks.length, color: "#0047b3" },
    { label: "Routine", done: routineDone, total: routineTasks.length, color: "#0d9f6a" },
  ];

  const hasData = rings.some((ring) => ring.total > 0);
  if (!hasData) {
    progressEl.textContent = "No items yet for this day.";
    return;
  }

  progressEl.innerHTML = "";
  rings.forEach((ring) => {
    progressEl.appendChild(buildRing(ring));
  });
}

function buildRing({ label, done, total, color }) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const ring = document.createElement("div");
  ring.className = "ring-card";

  const dial = document.createElement("div");
  dial.className = "ring";
  dial.style.background = `conic-gradient(${color} ${percent}%, #e7ebff ${percent}%)`;
  const value = document.createElement("span");
  value.textContent = `${percent}%`;
  dial.appendChild(value);

  const meta = document.createElement("div");
  meta.className = "ring-meta";
  const labelEl = document.createElement("div");
  labelEl.className = "ring-label";
  labelEl.textContent = label;
  const sub = document.createElement("div");
  sub.className = "ring-sub";
  sub.textContent = `${done} / ${total} completed`;
  meta.appendChild(labelEl);
  meta.appendChild(sub);

  ring.appendChild(dial);
  ring.appendChild(meta);
  return ring;
}

async function fetchRoutineTasksForProgress() {
  const db = await getDB();
  const profile = getCurrentProfile();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("routineTasks", "readonly");
    const request = tx.objectStore("routineTasks").getAll();
    request.onsuccess = () => {
      const tasks = (request.result || []).filter(
        (task) => task.profile === profile && task.active !== false
      );
      resolve(tasks);
    };
    request.onerror = () => reject(request.error);
  });
}
