import { getDB } from "./db.js";
import { getCurrentProfile, todayString } from "./utils.js";
import {
  createDailyTask,
  getLinkedTasksForWeeklyGoal,
  refreshDailyTasks,
  getActiveDailyDate,
} from "./daily.js";
import { createRoutineTask, getRoutineTasks, refreshRoutineList } from "./routine.js";

let listEl;
let inputEl;
let addButton;

export function initWeeklySection({ listElement, inputElement, addButtonElement }) {
  listEl = listElement;
  inputEl = inputElement;
  addButton = addButtonElement;

  if (!listEl || !inputEl || !addButton) return;

  addButton.addEventListener("click", handleAddWeeklyGoal);
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleAddWeeklyGoal();
    }
  });

  listEl.addEventListener("click", async (event) => {
    const header = event.target.closest(".weekly-header");
    if (header) {
      const goalId = Number(header.dataset.goalId);
      toggleWeeklyBody(goalId);
      return;
    }

    const saveBtn = event.target.closest("button[data-save-goal]");
    if (saveBtn) {
      const goalId = Number(saveBtn.dataset.saveGoal);
      await saveWeeklyGoalDetails(goalId);
      return;
    }

    const addTaskBtn = event.target.closest("button[data-add-weekly-task]");
    if (addTaskBtn) {
      await handleAddWeeklyTask(addTaskBtn);
      return;
    }
  });

  listEl.addEventListener("change", (event) => {
    const textarea = event.target.closest("textarea[data-goal-id][data-field]");
    if (!textarea) return;
    const goalId = Number(textarea.dataset.goalId);
    const field = textarea.dataset.field;
    saveWeeklyField(goalId, field, textarea.value.trim());
  });

  refreshWeeklyList();
}

export async function refreshWeeklyList() {
  if (!listEl) return;
  const goals = await fetchWeeklyGoals();

  if (goals.length === 0) {
    listEl.textContent = "No weekly goals yet.";
    return;
  }

  listEl.innerHTML = "";
  const fragment = document.createDocumentFragment();

  goals.forEach((goal) => {
    const item = document.createElement("div");
    item.className = "weekly-item";

    const header = document.createElement("div");
    header.className = "weekly-header";
    header.dataset.goalId = goal.id;

    const title = document.createElement("div");
    title.className = "weekly-title";
    title.textContent = goal.title;

    const summary = document.createElement("div");
    summary.className = "weekly-summary-row";
    summary.dataset.goalSummary = goal.id;
    renderSummaryChips(summary, goal);

    header.appendChild(title);
    header.appendChild(summary);

    const body = document.createElement("div");
    body.className = "weekly-body";
    body.dataset.goalBody = goal.id;

    body.appendChild(buildField("What was achieved?", goal.id, "achieved", goal.achieved));
    body.appendChild(buildField("Challenges", goal.id, "challenges", goal.challenges));
    body.appendChild(buildField("What to improve", goal.id, "improve", goal.improve));

    const actionsRow = document.createElement("div");
    actionsRow.className = "weekly-actions-row";
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn secondary";
    saveBtn.dataset.saveGoal = goal.id;
    saveBtn.textContent = "Save Details";
    actionsRow.appendChild(saveBtn);
    body.appendChild(actionsRow);

    const taskSection = buildWeeklyTaskSection(goal.id);
    body.appendChild(taskSection.wrapper);

    item.appendChild(header);
    item.appendChild(body);
    fragment.appendChild(item);
  });

  listEl.appendChild(fragment);

  goals.forEach((goal) => renderGoalDailyTasks(goal.id));
}

async function handleAddWeeklyGoal() {
  const title = inputEl.value.trim();
  if (!title) return;
  inputEl.value = "";
  await createWeeklyGoalRecord({ title });
  refreshWeeklyList();
}

function buildField(labelText, goalId, field, value = "") {
  const container = document.createElement("div");

  const label = document.createElement("p");
  label.innerHTML = `<strong>${labelText}</strong>`;

  const textarea = document.createElement("textarea");
  textarea.value = value || "";
  textarea.dataset.goalId = goalId;
  textarea.dataset.field = field;

  container.appendChild(label);
  container.appendChild(textarea);
  return container;
}

function toggleWeeklyBody(goalId) {
  const body = listEl.querySelector(`[data-goal-body='${goalId}']`);
  if (!body) return;
  const isVisible = body.style.display === "block";
  body.style.display = isVisible ? "none" : "block";
}

function buildWeeklyTaskSection(goalId) {
  const wrapper = document.createElement("div");
  wrapper.className = "weekly-daily-section";

  const title = document.createElement("p");
  title.innerHTML = "<strong>Plan tasks stemming from this goal</strong>";

  const list = document.createElement("div");
  list.className = "weekly-linked-tasks";
  list.dataset.weeklyTasks = goalId;
  list.textContent = "No linked tasks yet.";

  const inputRow = document.createElement("div");
  inputRow.className = "weekly-task-row";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Describe the task";
  input.dataset.weeklyTaskInput = goalId;

  const typeSelect = document.createElement("select");
  typeSelect.dataset.weeklyTaskType = goalId;
  const optionDaily = document.createElement("option");
  optionDaily.value = "daily";
  optionDaily.textContent = "Daily Task";
  const optionRoutine = document.createElement("option");
  optionRoutine.value = "routine";
  optionRoutine.textContent = "Routine Task";
  typeSelect.appendChild(optionDaily);
  typeSelect.appendChild(optionRoutine);

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = todayString();
  dateInput.dataset.weeklyTaskDate = goalId;

  typeSelect.addEventListener("change", () => {
    const isDaily = typeSelect.value === "daily";
    dateInput.style.display = isDaily ? "" : "none";
  });
  typeSelect.dispatchEvent(new Event("change"));

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn secondary";
  addBtn.dataset.addWeeklyTask = goalId;
  addBtn.textContent = "Add Task";

  inputRow.appendChild(input);
  inputRow.appendChild(typeSelect);
  inputRow.appendChild(dateInput);
  inputRow.appendChild(addBtn);

  wrapper.appendChild(title);
  wrapper.appendChild(list);
  wrapper.appendChild(inputRow);

  return { wrapper, list };
}

async function handleAddWeeklyTask(button) {
  const goalId = Number(button.dataset.addWeeklyTask);
  const input = listEl.querySelector(`[data-weekly-task-input='${goalId}']`);
  if (!input) return;
  const label = input.value.trim();
  if (!label) return;
  const typeSelect = listEl.querySelector(`[data-weekly-task-type='${goalId}']`);
  const dateInput = listEl.querySelector(`[data-weekly-task-date='${goalId}']`);
  const taskType = typeSelect ? typeSelect.value : "daily";
    const today = todayString();
    const selectedDate = dateInput?.value || today;
    button.disabled = true;
    try {
      if (taskType === "routine") {
      await createRoutineTask(label, { weeklyGoalId: goalId, active: true, source: "weekly" });
      await refreshRoutineList();
      } else {
        await createDailyTask(label, {
          source: "weekly",
          weeklyGoalId: goalId,
          date: selectedDate,
        });
        if (selectedDate === getActiveDailyDate()) {
          await refreshDailyTasks();
        }
      }
    input.value = "";
    await renderGoalDailyTasks(goalId);
  } finally {
    button.disabled = false;
  }
}

async function renderGoalDailyTasks(goalId) {
  const container = listEl.querySelector(`[data-weekly-tasks='${goalId}']`);
  if (!container) return;
  container.textContent = "Loading...";
  const [dailyTasks, routineTasks] = await Promise.all([
    getLinkedTasksForWeeklyGoal(goalId),
    getRoutineTasks({ includeInactive: true }).then((tasks) =>
      tasks.filter((task) => task.weeklyGoalId === goalId)
    ),
  ]);

  container.innerHTML = "";
  let hasContent = false;

  if (dailyTasks.length > 0) {
    hasContent = true;
    const heading = document.createElement("p");
    heading.className = "muted-text";
    heading.textContent = "Daily tasks";
    container.appendChild(heading);

    dailyTasks.forEach((task) => {
      const item = document.createElement("div");
      item.className = "daily-task-item";
      const label = document.createElement("span");
      label.textContent = task.label;
      const date = document.createElement("span");
      date.className = "task-date";
      date.textContent = task.date;
      item.appendChild(label);
      item.appendChild(date);
      container.appendChild(item);
    });
  }

  if (routineTasks.length > 0) {
    hasContent = true;
    const heading = document.createElement("p");
    heading.className = "muted-text";
    heading.textContent = "Routine tasks";
    container.appendChild(heading);

    routineTasks.forEach((task) => {
      const item = document.createElement("div");
      item.className = "daily-task-item";
      const label = document.createElement("span");
      label.textContent = task.label;
      const status = document.createElement("span");
      status.className = "task-date";
      status.textContent = task.active === false ? "Inactive" : "Active";
      item.appendChild(label);
      item.appendChild(status);
      container.appendChild(item);
    });
  }

  if (!hasContent) {
    container.textContent = "No linked tasks yet.";
  }
}

async function saveWeeklyGoalDetails(goalId) {
  const values = {};
  ["achieved", "challenges", "improve"].forEach((field) => {
    const textarea = listEl.querySelector(
      `textarea[data-goal-id='${goalId}'][data-field='${field}']`
    );
    values[field] = textarea ? textarea.value.trim() : "";
  });

  await mutateWeeklyGoal(goalId, (goal) => {
    Object.assign(goal, values);
  });
  updateWeeklySummary(goalId, values);
}

function renderSummaryChips(container, data) {
  container.innerHTML = "";
  const fields = [
    { key: "achieved", label: "Achieved" },
    { key: "challenges", label: "Challenges" },
    { key: "improve", label: "Improve" },
  ];

  fields.forEach(({ key, label }) => {
    const chip = document.createElement("span");
    chip.className = `weekly-summary-chip chip-${key}`;
    const value = (data?.[key] || "").trim();
    chip.textContent = value
      ? `${label}: ${truncateSummary(value)}`
      : `${label}: pending`;
    container.appendChild(chip);
  });
}

function truncateSummary(text, limit = 40) {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

function updateWeeklySummary(goalId, overrides = null) {
  const container = listEl?.querySelector(`[data-goal-summary='${goalId}']`);
  if (!container) return;
  const values =
    overrides ||
    ["achieved", "challenges", "improve"].reduce((acc, field) => {
      const textarea = listEl.querySelector(
        `textarea[data-goal-id='${goalId}'][data-field='${field}']`
      );
      acc[field] = textarea ? textarea.value.trim() : "";
      return acc;
    }, {});
  renderSummaryChips(container, values);
}

function updateWeeklySummaryFromDOM(goalId) {
  updateWeeklySummary(goalId);
}

export async function fetchWeeklyGoals() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("weeklyGoals", "readonly");
    const request = tx.objectStore("weeklyGoals").getAll();
    request.onsuccess = () => {
      const profile = getCurrentProfile();
      const goals = request.result
        .filter((goal) => goal.profile === profile)
        .sort((a, b) => b.createdAt - a.createdAt);
      resolve(goals);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function createWeeklyGoalRecord({ title, monthGoalId = null }) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("weeklyGoals", "readwrite");
    tx.objectStore("weeklyGoals").add({
      profile: getCurrentProfile(),
      title,
      achieved: "",
      challenges: "",
      improve: "",
      createdAt: Date.now(),
      monthGoalId,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function saveWeeklyField(goalId, field, value) {
  const editableFields = new Set(["achieved", "challenges", "improve"]);
  if (!editableFields.has(field)) return;
  await mutateWeeklyGoal(goalId, (goal) => {
    goal[field] = value;
  });
  updateWeeklySummaryFromDOM(goalId);
}

async function mutateWeeklyGoal(goalId, mutator) {
  const db = await getDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("weeklyGoals", "readwrite");
    const store = tx.objectStore("weeklyGoals");
    const request = store.get(goalId);
    request.onsuccess = () => {
      const goal = request.result;
      if (!goal) {
        resolve();
        return;
      }
      mutator(goal);
      store.put(goal);
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
