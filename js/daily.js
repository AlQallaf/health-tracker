import { getDB } from "./db.js";
import { dailyKey, getCurrentProfile, todayString } from "./utils.js";

let listEl;
let inputEl;
let addButton;

export function initDailyTasksSection({ listElement, inputElement, addButtonElement }) {
  listEl = listElement;
  inputEl = inputElement;
  addButton = addButtonElement;

  if (!listEl || !inputEl || !addButton) return;

  addButton.addEventListener("click", handleAddTask);
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleAddTask();
    }
  });

  listEl.addEventListener("change", (event) => {
    const checkbox = event.target.closest("input[type='checkbox'][data-task-id]");
    if (!checkbox) return;
    toggleDailyTask(checkbox.dataset.taskId, checkbox.checked);
  });

  refreshDailyTasks();
}

export async function refreshDailyTasks() {
  if (!listEl) return;
  const entry = await fetchDailyEntry();
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
}

export async function updateRoutineCompletion(routineId, done, date = todayString()) {
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
  { source = "adhoc", weeklyGoalId = null, date = todayString() } = {}
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
  const entry = await ensureDailyEntry();
  entry.tasks = Array.isArray(entry.tasks) ? entry.tasks : [];
  const task = entry.tasks.find((item) => item.id === taskId);
  if (!task) return;
  task.done = done;
  await saveDailyEntry(entry);
}

async function ensureDailyEntry(date = todayString()) {
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
