import { getDB } from "./db.js";
import { getCurrentProfile } from "./utils.js";
import {
  fetchDailyEntry,
  getActiveDailyDate,
  updateRoutineCompletion,
} from "./daily.js";

const DEFAULT_ROUTINE_TASKS = [
  "Morning Walk (10 min)",
  "Protein Breakfast",
  "3L Water",
  "Training / Stability",
  "Quran / Meditation",
  "Collagen + Vitamin C",
  "Sleep before 12 AM",
];

let listEl;
let routineListenerAttached = false;

export function initRoutineSection({ listElement }) {
  listEl = listElement;
  if (!listEl) return;

  listEl.addEventListener("change", async (event) => {
    const checkbox = event.target.closest("input[type='checkbox'][data-routine-id]");
    if (!checkbox) return;
    const routineId = Number(checkbox.dataset.routineId);
    await updateRoutineCompletion(routineId, checkbox.checked, getActiveDailyDate());
  });

  if (!routineListenerAttached) {
    window.addEventListener("routineUpdated", () => refreshRoutineList());
    window.addEventListener("dailyDateChanged", () => refreshRoutineList());
    window.addEventListener("dataChanged", () => refreshRoutineList());
    routineListenerAttached = true;
  }

  refreshRoutineList();
}

export async function ensureRoutineDefaults() {
  const tasks = await getRoutineTasks({ includeInactive: true });
  if (tasks.length > 0) return;
  for (const label of DEFAULT_ROUTINE_TASKS) {
    await createRoutineTask(label, { active: true });
  }
}

export async function refreshRoutineList() {
  if (!listEl) return;
  const beforeTop = listEl.getBoundingClientRect().top;
  const beforeScroll = window.scrollY;
  listEl.textContent = "Loading...";
  const [tasks, entry] = await Promise.all([
    getRoutineTasks(),
    fetchDailyEntry(getActiveDailyDate()),
  ]);

  if (tasks.length === 0) {
    listEl.textContent = "No routine tasks configured.";
    return;
  }

  listEl.innerHTML = "";
  const fragment = document.createDocumentFragment();
  const completions = Array.isArray(entry?.routineCompletions)
    ? entry.routineCompletions
    : [];

  tasks.forEach((task) => {
    const completion = completions.find((item) => item.id === task.id);
    const wrapper = document.createElement("div");
    wrapper.className = "checkbox-item";

    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.routineId = task.id;
    checkbox.checked = Boolean(completion?.done);

    label.appendChild(checkbox);
    label.append(` ${task.label}`);
    wrapper.appendChild(label);
    fragment.appendChild(wrapper);
  });

  listEl.appendChild(fragment);
  const afterTop = listEl.getBoundingClientRect().top;
  const delta = afterTop - beforeTop;
  if (Math.abs(delta) > 1) {
    window.scrollTo({ top: beforeScroll + delta });
  }
}

export async function getRoutineTasks({ includeInactive = false } = {}) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("routineTasks", "readonly");
    const request = tx.objectStore("routineTasks").getAll();
    request.onsuccess = () => {
      const profile = getCurrentProfile();
      let tasks = request.result.filter((item) => item.profile === profile);
      if (!includeInactive) {
        tasks = tasks.filter((item) => item.active !== false);
      }
      resolve(tasks);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function createRoutineTask(
  label,
  { active = true, weeklyGoalId = null, source = "manual" } = {}
) {
  const db = await getDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("routineTasks", "readwrite");
    tx.objectStore("routineTasks").add({
      profile: getCurrentProfile(),
      label,
      active,
      weeklyGoalId,
      source,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  emitRoutineUpdate();
}

export async function updateRoutineTask(id, updates = {}) {
  const db = await getDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("routineTasks", "readwrite");
    const store = tx.objectStore("routineTasks");
    const request = store.get(id);
    request.onsuccess = () => {
      const task = request.result;
      if (!task) return;
      Object.assign(task, updates);
      store.put(task);
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  emitRoutineUpdate();
}

export async function deleteRoutineTask(id) {
  const db = await getDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("routineTasks", "readwrite");
    tx.objectStore("routineTasks").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  emitRoutineUpdate();
}

function emitRoutineUpdate() {
  window.dispatchEvent(new CustomEvent("routineUpdated"));
}
