import { getDB } from "./db.js";
import { dailyKey, getCurrentProfile, todayString } from "./utils.js";

let listEl;
let inputEl;
let hourSelectEl;
let minuteSelectEl;
let addButton;
let dateInputEl;
let progressEl;
let activeDate = todayString();
let progressListenerAttached = false;

export function initDailyTasksSection({
  listElement,
  inputElement,
  hourSelectElement,
  minuteSelectElement,
  addButtonElement,
  progressElement,
  dateInputElement,
}) {
  listEl = listElement;
  inputEl = inputElement;
  hourSelectEl = hourSelectElement;
  minuteSelectEl = minuteSelectElement;
  addButton = addButtonElement;
  progressEl = progressElement;
  dateInputEl = dateInputElement;

  if (!listEl || !inputEl || !addButton) return;

  if (hourSelectEl && minuteSelectEl) populateTimeSelectors(hourSelectEl, minuteSelectEl);

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
    const checkbox = event.target.closest(
      "input[type='checkbox'][data-task-id]"
    );
    if (!checkbox) return;
    toggleDailyTask(checkbox.dataset.taskId, checkbox.checked);
  });

  if (!progressListenerAttached) {
    window.addEventListener("routineUpdated", () => renderDailyProgress());
    window.addEventListener("dailyDateChanged", () => renderDailyProgress());
    window.addEventListener("dataChanged", () => refreshDailyTasks());
    progressListenerAttached = true;
  }

  refreshDailyTasks();
}

export async function refreshDailyTasks() {
  if (!listEl) return;
  const beforeTop = listEl.getBoundingClientRect().top;
  const beforeScroll = window.scrollY;

  const tasks = await fetchDailyTasks(activeDate);

  listEl.innerHTML = "";

  if (tasks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "no-tasks";
    empty.textContent = "No tasks yet.";
    listEl.appendChild(empty);
    renderDailyProgress();
  } else {
    const fragment = document.createDocumentFragment();

    tasks.forEach((task) => {
      const wrapper = document.createElement("div");
      wrapper.className = "daily-task-item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(task.done);
      checkbox.dataset.taskId = task.id;

      const label = document.createElement("span");
      label.textContent = task.label;

      const time = document.createElement("span");
      time.className = "task-date";
      time.textContent = task.time || "";

      wrapper.appendChild(checkbox);
      wrapper.appendChild(label);
      if (task.time) wrapper.appendChild(time);
      fragment.appendChild(wrapper);
    });

    listEl.appendChild(fragment);
    renderDailyProgress();
  }

  const afterTop = listEl.getBoundingClientRect().top;
  const delta = afterTop - beforeTop;
  if (Math.abs(delta) > 1) {
    window.scrollTo({ top: beforeScroll + delta });
  }
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
  const existing = entry.routineCompletions.find(
    (item) => item.id === routineId
  );
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
  {
    source = "adhoc",
    weeklyGoalId = null,
    date = activeDate || todayString(),
    time = "",
  } = {}
) {
  const db = await getDB();
  const normalizedTime = normalizeTimeString(time);
  const now = Date.now();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("dailyTasks", "readwrite");
    tx.objectStore("dailyTasks").add({
      profile: getCurrentProfile(),
      date,
      label,
      time: normalizedTime,
      done: false,
      source,
      weeklyGoalId,
      createdAt: now,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getLinkedTasksForWeeklyGoal(weeklyGoalId) {
  if (!weeklyGoalId) return [];
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("dailyTasks", "readonly");
    const request = tx.objectStore("dailyTasks").getAll();
    request.onsuccess = () => {
      const tasks = request.result || [];
      const profile = getCurrentProfile();
      const linked = tasks
        .filter((task) => task.profile === profile && task.weeklyGoalId === weeklyGoalId)
        .map((task) => ({
          id: task.id,
          label: task.label,
          done: task.done,
          date: task.date,
          source: task.source,
          time: task.time,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
      resolve(linked);
    };
    request.onerror = () => reject(request.error);
  });
}

async function handleAddTask() {
  const value = inputEl.value.trim();
  if (!value) return;
  inputEl.value = "";
  const time = buildTimeFromSelectors(hourSelectEl, minuteSelectEl);
  await createDailyTask(value, { time });
  if (hourSelectEl) hourSelectEl.value = "09";
  if (minuteSelectEl) minuteSelectEl.value = "00";
  refreshDailyTasks();
  emitDataChanged();
}

async function toggleDailyTask(taskId, done) {
  const db = await getDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("dailyTasks", "readwrite");
    const store = tx.objectStore("dailyTasks");
    const req = store.get(Number(taskId));
    req.onsuccess = () => {
      const task = req.result;
      if (task) {
        task.done = done;
        store.put(task);
      }
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  renderDailyProgress();
  emitDataChanged();
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
  };
}

export async function fetchDailyTasks(date = activeDate || todayString()) {
  const db = await getDB();
  const profile = getCurrentProfile();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("dailyTasks", "readonly");
    const store = tx.objectStore("dailyTasks");
    const request = store.getAll();
    request.onsuccess = () => {
      const tasks = (request.result || [])
        .filter((t) => t.profile === profile && t.date === date)
        .sort((a, b) => {
          if (a.time && b.time && a.time !== b.time) return a.time.localeCompare(b.time);
          return (a.createdAt || 0) - (b.createdAt || 0);
        });
      resolve(tasks);
    };
    request.onerror = () => reject(request.error);
  });
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

  let entry = { tasks: [], routineCompletions: [] };
  let routineTasks = [];
  let tasks = [];

  try {
    const [fetchedEntry, fetchedRoutines, fetchedTasks] = await Promise.all([
      fetchDailyEntry(activeDate),
      fetchRoutineTasksForProgress(),
      fetchDailyTasks(activeDate),
    ]);
    entry = fetchedEntry || entry;
    routineTasks = fetchedRoutines || [];
    tasks = fetchedTasks || [];
  } catch (error) {
    console.error("Progress fetch error", error);
  }

  const taskDone = tasks.filter((t) => t.done).length;

  const routineCompletions = Array.isArray(entry?.routineCompletions)
    ? entry.routineCompletions
    : [];
  const routineDone = (routineTasks || []).reduce((count, task) => {
    const completion = routineCompletions.find((item) => item.id === task.id);
    return count + (completion?.done ? 1 : 0);
  }, 0);

  const rings = [
    { label: "Tasks", done: taskDone, total: tasks.length, color: "#24a83cff" },
    {
      label: "Routine",
      done: routineDone,
      total: routineTasks?.length || 0,
      color: "#24a83cff",
    },
  ];

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

function normalizeTimeString(raw) {
  if (!raw) return "";
  const text = raw.trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?:\s*([ap]m))?$/i);
  if (!match) return "";
  let [_, hh, mm, period] = match;
  let hours = Number(hh);
  const minutes = Number(mm);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return "";
  if (period) {
    const isPM = period.toLowerCase() === "pm";
    hours = (hours % 12) + (isPM ? 12 : 0);
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function populateTimeSelectors(hourSelect, minuteSelect) {
  if (hourSelect) {
    const frag = document.createDocumentFragment();
    for (let h = 0; h < 24; h++) {
      const opt = document.createElement("option");
      opt.value = String(h).padStart(2, "0");
      opt.textContent = opt.value;
      if (opt.value === "09") opt.selected = true;
      frag.appendChild(opt);
    }
    hourSelect.innerHTML = "";
    hourSelect.appendChild(frag);
  }
  if (minuteSelect) {
    const frag = document.createDocumentFragment();
    for (let m = 0; m < 60; m++) {
      const opt = document.createElement("option");
      opt.value = String(m).padStart(2, "0");
      opt.textContent = opt.value;
      if (opt.value === "00") opt.selected = true;
      frag.appendChild(opt);
    }
    minuteSelect.innerHTML = "";
    minuteSelect.appendChild(frag);
  }
}

function buildTimeFromSelectors(hourSelect, minuteSelect) {
  const hh = hourSelect?.value || "";
  const mm = minuteSelect?.value || "";
  if (!hh || !mm) return "";
  return `${hh}:${mm}`;
}

function emitDataChanged() {
  window.dispatchEvent(new Event("dataChanged"));
}

async function fetchRoutineTasksForProgress() {
  try {
    const db = await getDB();
    const profile = getCurrentProfile();
    return await new Promise((resolve, reject) => {
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
  } catch (error) {
    console.error("Routine progress fetch failed", error);
    return [];
  }
}
