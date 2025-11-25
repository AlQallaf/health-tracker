import { getDB } from "./db.js";
import { getCurrentProfile } from "./utils.js";
import { createWeeklyGoalRecord, refreshWeeklyList } from "./weekly.js";

let rootEl;
let formElements = {};
let listEl;

export function initMonthlySection(container) {
  rootEl = container;
  if (!rootEl) return;
  renderLayout();
  attachEvents();
  refreshMonthlyList();
}

function renderLayout() {
  rootEl.innerHTML = `
    <div class="card">
      <div class="card-title">
        <h2>Create Monthly Goal</h2>
      </div>
      <div class="monthly-form">
        <label>
          Month
          <input type="month" id="monthlyForMonth" />
        </label>
        <label>
          Title
          <input type="text" id="monthlyTitle" placeholder="e.g. Reclaim energy" />
        </label>
        <textarea id="monthlyNotes" placeholder="Key focus or notes"></textarea>
      </div>
      <div class="card-actions">
        <button class="btn" id="addMonthlyGoalBtn">Save Monthly Goal</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">
        <h2>Monthly Goals</h2>
      </div>
      <div id="monthlyGoalList" class="monthly-goal-list">
        Loading...
      </div>
    </div>
  `;

  formElements = {
    month: rootEl.querySelector("#monthlyForMonth"),
    title: rootEl.querySelector("#monthlyTitle"),
    notes: rootEl.querySelector("#monthlyNotes"),
    addBtn: rootEl.querySelector("#addMonthlyGoalBtn"),
  };
  listEl = rootEl.querySelector("#monthlyGoalList");
}

function attachEvents() {
  if (!formElements.addBtn) return;
  formElements.addBtn.addEventListener("click", handleAddMonthlyGoal);
  formElements.title.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAddMonthlyGoal();
    }
  });

  if (listEl) {
    listEl.addEventListener("click", async (event) => {
      const header = event.target.closest(".monthly-goal-header");
      if (header) {
        const goalId = Number(header.dataset.goalId);
        toggleMonthlyGoal(goalId);
        return;
      }

      const saveBtn = event.target.closest("button[data-save-monthly]");
      if (saveBtn) {
        const goalId = Number(saveBtn.dataset.saveMonthly);
        await handleSaveMonthlyNotes(goalId);
        return;
      }

      const addWeeklyBtn = event.target.closest("button[data-add-monthly-weekly]");
      if (addWeeklyBtn) {
        const goalId = Number(addWeeklyBtn.dataset.addMonthlyWeekly);
        await handleAddWeeklyChild(goalId, addWeeklyBtn);
        return;
      }
    });
  }
}

async function handleAddMonthlyGoal() {
  const forMonthRaw = formElements.month.value;
  const title = formElements.title.value.trim();
  const notes = formElements.notes.value.trim();
  if (!forMonthRaw || !title) return;

  const forMonth = normalizeMonthValue(forMonthRaw);
  formElements.addBtn.disabled = true;
  try {
    await createMonthlyGoal({ forMonth, title, notes });
    formElements.month.value = "";
    formElements.title.value = "";
    formElements.notes.value = "";
    await refreshMonthlyList();
  } finally {
    formElements.addBtn.disabled = false;
  }
}

async function refreshMonthlyList() {
  if (!listEl) return;
  listEl.textContent = "Loading...";
  const goals = await fetchMonthlyGoals();

  if (goals.length === 0) {
    listEl.textContent = "No monthly goals yet.";
    return;
  }

  listEl.innerHTML = "";
  const fragment = document.createDocumentFragment();

  goals.forEach((goal) => {
    const item = document.createElement("div");
    item.className = "monthly-goal-item";

    const header = document.createElement("div");
    header.className = "monthly-goal-header";
    header.dataset.goalId = goal.id;

    const title = document.createElement("h3");
    title.className = "monthly-goal-title";
    title.textContent = goal.title;

    const monthLabel = document.createElement("span");
    monthLabel.className = "badge";
    monthLabel.textContent = formatMonthLabel(goal.forMonth);

    header.appendChild(title);
    header.appendChild(monthLabel);

    const body = document.createElement("div");
    body.className = "monthly-goal-body";
    body.dataset.monthBody = goal.id;

    const label = document.createElement("p");
    label.innerHTML = "<strong>Notes</strong>";

    const textarea = document.createElement("textarea");
    textarea.value = goal.notes || "";
    textarea.dataset.monthNotes = goal.id;

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn secondary";
    saveBtn.dataset.saveMonthly = goal.id;
    saveBtn.textContent = "Save Notes";

    const created = document.createElement("p");
    created.className = "muted-text";
    const createdDate = goal.createdAt ? new Date(goal.createdAt) : new Date();
    created.textContent = `Created ${createdDate.toLocaleDateString()}`;

    const weeklyHeader = document.createElement("p");
    weeklyHeader.innerHTML = "<strong>Weekly goals linked</strong>";

    const weeklyForm = document.createElement("div");
    weeklyForm.className = "task-row monthly-weekly-add";

    const weeklyInput = document.createElement("input");
    weeklyInput.type = "text";
    weeklyInput.placeholder = "Add a weekly goal";
    weeklyInput.dataset.monthWeeklyInput = goal.id;

    const addWeeklyBtn = document.createElement("button");
    addWeeklyBtn.type = "button";
    addWeeklyBtn.className = "btn secondary";
    addWeeklyBtn.dataset.addMonthlyWeekly = goal.id;
    addWeeklyBtn.textContent = "Add Weekly Goal";

    weeklyInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addWeeklyBtn.click();
      }
    });

    weeklyForm.appendChild(weeklyInput);
    weeklyForm.appendChild(addWeeklyBtn);

    const weeklyList = document.createElement("ul");
    weeklyList.className = "monthly-weekly-list";
    weeklyList.dataset.monthWeekly = goal.id;
    weeklyList.textContent = "Loading...";

    body.appendChild(label);
    body.appendChild(textarea);
    body.appendChild(saveBtn);
    body.appendChild(created);
    body.appendChild(weeklyHeader);
    body.appendChild(weeklyForm);
    body.appendChild(weeklyList);

    item.appendChild(header);
    item.appendChild(body);
    fragment.appendChild(item);
  });

  listEl.appendChild(fragment);

  goals.forEach((goal) => renderWeeklyChildren(goal.id));
}

function toggleMonthlyGoal(goalId) {
  const body = rootEl?.querySelector(`[data-month-body='${goalId}']`);
  if (!body) return;
  const isOpen = body.style.display === "block";
  body.style.display = isOpen ? "none" : "block";
}

async function handleSaveMonthlyNotes(goalId) {
  const textarea = rootEl?.querySelector(`[data-month-notes='${goalId}']`);
  if (!textarea) return;
  const notes = textarea.value.trim();
  await updateMonthlyGoal(goalId, { notes });
}

async function handleAddWeeklyChild(goalId, button) {
  const input = rootEl?.querySelector(`[data-month-weekly-input='${goalId}']`);
  if (!input) return;
  const title = input.value.trim();
  if (!title) return;
  button.disabled = true;
  try {
    await createWeeklyGoalRecord({ title, monthGoalId: goalId });
    input.value = "";
    await renderWeeklyChildren(goalId);
    await refreshWeeklyList();
  } finally {
    button.disabled = false;
  }
}

async function renderWeeklyChildren(goalId) {
  const list = rootEl?.querySelector(`[data-month-weekly='${goalId}']`);
  if (!list) return;
  list.textContent = "Loading...";
  const weeklyGoals = await fetchWeeklyGoalsForMonth(goalId);
  if (weeklyGoals.length === 0) {
    list.textContent = "No weekly goals linked yet.";
    return;
  }

  list.innerHTML = "";
  weeklyGoals.forEach((goal) => {
    const li = document.createElement("li");
    li.textContent = goal.title;
    list.appendChild(li);
  });
}

async function fetchMonthlyGoals() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("monthlyGoals", "readonly");
    const request = tx.objectStore("monthlyGoals").getAll();
    request.onsuccess = () => {
      const profile = getCurrentProfile();
      const goals = request.result
        .filter((goal) => goal.profile === profile)
        .sort((a, b) => b.forMonth.localeCompare(a.forMonth));
      resolve(goals);
    };
    request.onerror = () => reject(request.error);
  });
}

async function createMonthlyGoal({ forMonth, title, notes }) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("monthlyGoals", "readwrite");
    tx.objectStore("monthlyGoals").add({
      profile: getCurrentProfile(),
      forMonth,
      title,
      notes,
      createdAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function updateMonthlyGoal(id, updates) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("monthlyGoals", "readwrite");
    const store = tx.objectStore("monthlyGoals");
    const request = store.get(id);
    request.onsuccess = () => {
      const goal = request.result;
      if (!goal) return;
      Object.assign(goal, updates);
      store.put(goal);
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function fetchWeeklyGoalsForMonth(monthGoalId) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("weeklyGoals", "readonly");
    const request = tx.objectStore("weeklyGoals").getAll();
    request.onsuccess = () => {
      const profile = getCurrentProfile();
      resolve(
        request.result.filter(
          (goal) => goal.profile === profile && goal.monthGoalId === monthGoalId
        )
      );
    };
    request.onerror = () => reject(request.error);
  });
}

function formatMonthLabel(monthValue) {
  if (!monthValue) return "No month";
  const [year, month] = monthValue.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

function normalizeMonthValue(raw) {
  const [year, month] = raw.split("-");
  return `${year}-${month.padStart(2, "0")}`;
}
