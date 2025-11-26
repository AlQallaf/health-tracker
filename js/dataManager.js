import { getDB } from "./db.js";

const STORE_CONFIG = {
  monthlyGoals: { label: "Monthly Goals", keyField: "id" },
  weeklyGoals: { label: "Weekly Goals", keyField: "id" },
  routineTasks: { label: "Routine Tasks", keyField: "id" },
  dailyEntries: { label: "Daily Entries", keyField: "key" },
  dailyTasks: { label: "Daily Tasks", keyField: "id" },
};

let selectEl;
let listEl;
let refreshBtn;
let clearBtn;
let exportBtn;
let overviewEl;
let exportTextarea;
let copyBtn;
let importBtn;
let statusEl;
let currentStore = "monthlyGoals";
const DAILY_STORE = "dailyEntries";

export function initDataManager({
  overviewElement,
  selectElement,
  listElement,
  refreshButton,
  clearButton,
  exportButton,
  exportTextarea: exportTextareaElement,
  copyButton,
  importButton,
  statusElement,
}) {
  overviewEl = overviewElement;
  selectEl = selectElement;
  listEl = listElement;
  refreshBtn = refreshButton;
  clearBtn = clearButton;
  exportBtn = exportButton;
  exportTextarea = exportTextareaElement;
  copyBtn = copyButton;
  importBtn = importButton;
  statusEl = statusElement;

  if (!selectEl || !listEl) return;

  populateStoreOptions();
  refreshOverview();

  selectEl.addEventListener("change", () => {
    currentStore = selectEl.value;
    refreshStoreView();
  });

  refreshBtn?.addEventListener("click", refreshStoreView);
  clearBtn?.addEventListener("click", handleClearStore);
  exportBtn?.addEventListener("click", handleExportAll);
  copyBtn?.addEventListener("click", handleCopyJson);
  importBtn?.addEventListener("click", handleImportJson);

  listEl.addEventListener("click", async (event) => {
    const saveBtn = event.target.closest("button[data-save-entry]");
    if (saveBtn) {
      const key = saveBtn.dataset.saveEntry;
      await handleSaveEntry(key);
      return;
    }
    const deleteBtn = event.target.closest("button[data-delete-entry]");
    if (deleteBtn) {
      const key = deleteBtn.dataset.deleteEntry;
      await handleDeleteEntry(key);
      return;
    }

    const daySaveBtn = event.target.closest("button[data-day-save]");
    if (daySaveBtn) {
      await handleSaveDay(daySaveBtn.dataset.daySave);
      return;
    }

    const dayDeleteBtn = event.target.closest("button[data-day-delete]");
    if (dayDeleteBtn) {
      await handleDeleteEntry(dayDeleteBtn.dataset.dayDelete);
      return;
    }

    const addTaskBtn = event.target.closest("button[data-add-task]");
    if (addTaskBtn) {
      addTaskRow(addTaskBtn.closest("[data-day-card]")?.querySelector("[data-task-list]"));
      return;
    }

    const addRoutineBtn = event.target.closest("button[data-add-routine]");
    if (addRoutineBtn) {
      const list = addRoutineBtn.closest("[data-day-card]")?.querySelector("[data-routine-list]");
      addRoutineRow(list);
    }
  });

  refreshStoreView();
}

function populateStoreOptions() {
  selectEl.innerHTML = "";
  Object.entries(STORE_CONFIG).forEach(([store, meta]) => {
    const option = document.createElement("option");
    option.value = store;
    option.textContent = meta.label;
    if (store === currentStore) option.selected = true;
    selectEl.appendChild(option);
  });
}

async function refreshStoreView() {
  listEl.textContent = "Loading...";
  const entries = await fetchEntries(currentStore);
  if (!entries || entries.length === 0) {
    listEl.textContent = "No records found in this store.";
    return;
  }

  listEl.innerHTML = "";
  const meta = STORE_CONFIG[currentStore];

  if (currentStore === DAILY_STORE) {
    listEl.appendChild(buildDailyView(entries, meta));
  } else {
    const columns = getColumns(entries, meta.keyField);
    listEl.appendChild(buildTable(entries, columns, meta));
  }
}

async function fetchEntries(storeName) {
  try {
    const db = await getDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to fetch store data", error);
    listEl.textContent = "Failed to load data.";
    return [];
  }
}

async function refreshOverview() {
  if (!overviewEl) return;
  overviewEl.textContent = "Loading overview...";
  try {
    const db = await getDB();
    const storeNames = Object.keys(STORE_CONFIG);
    const counts = await Promise.all(storeNames.map((store) => countEntries(db, store)));
    overviewEl.innerHTML = "";
    storeNames.forEach((store, index) => {
      const card = document.createElement("div");
      card.className = "data-overview-card";
      const title = document.createElement("span");
      title.textContent = STORE_CONFIG[store].label;
      const count = document.createElement("span");
      count.className = "data-overview-count";
      count.textContent = counts[index];
      card.appendChild(title);
      card.appendChild(count);
      overviewEl.appendChild(card);
    });
  } catch (error) {
    console.error("Failed to load overview", error);
    overviewEl.textContent = "Unable to load overview.";
  }
}

function countEntries(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).count();
    request.onsuccess = () => resolve(request.result || 0);
    request.onerror = () => reject(request.error);
  });
}

function getColumns(entries, keyField) {
  const set = new Set([keyField]);
  entries.forEach((entry) => {
    Object.keys(entry || {}).forEach((key) => set.add(key));
  });
  return Array.from(set);
}

function buildDailyView(entries, meta) {
  const wrapper = document.createElement("div");
  wrapper.className = "day-list";

  const sorted = [...entries].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  sorted.forEach((entry) => {
    wrapper.appendChild(buildDayCard(entry, meta));
  });
  return wrapper;
}

function buildDayCard(entry, meta) {
  const card = document.createElement("div");
  card.className = "day-card";
  card.dataset.dayCard = entry.key;

  const header = document.createElement("div");
  header.className = "day-card-header";
  const title = document.createElement("div");
  title.innerHTML = `<strong>${entry.date || "Unknown day"}</strong> · ${
    (entry.tasks || []).length
  } tasks`;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "btn secondary";
  toggle.textContent = "Expand";
  header.appendChild(title);
  header.appendChild(toggle);

  const body = document.createElement("div");
  body.className = "day-card-body";
  body.style.display = "none";

  toggle.addEventListener("click", () => {
    const isOpen = body.style.display === "block";
    body.style.display = isOpen ? "none" : "block";
    toggle.textContent = isOpen ? "Expand" : "Collapse";
  });

  const metaSection = document.createElement("div");
  metaSection.className = "day-meta";
  metaSection.innerHTML = `
    <div><strong>Key:</strong> ${entry.key}</div>
    <div><strong>Profile:</strong> ${entry.profile || "default"}</div>
  `;

  const extras = buildExtraFields(entry);

  const tasksSection = document.createElement("div");
  tasksSection.className = "day-tasks";
  const tasksHeader = document.createElement("div");
  tasksHeader.className = "day-section-header";
  tasksHeader.innerHTML = "<strong>Tasks</strong>";
  const taskList = document.createElement("div");
  taskList.dataset.taskList = entry.key;
  taskList.className = "day-task-list";

  (entry.tasks || []).forEach((task) => addTaskRow(taskList, task));
  tasksSection.appendChild(tasksHeader);
  tasksSection.appendChild(taskList);

  const addTaskRowContainer = document.createElement("div");
  addTaskRowContainer.className = "day-task-add";
  const addTaskBtn = document.createElement("button");
  addTaskBtn.type = "button";
  addTaskBtn.className = "btn secondary";
  addTaskBtn.dataset.addTask = entry.key;
  addTaskBtn.textContent = "Add Task";
  addTaskRowContainer.appendChild(addTaskBtn);
  tasksSection.appendChild(addTaskRowContainer);

  const routineSection = document.createElement("div");
  routineSection.className = "day-tasks";
  const routineHeader = document.createElement("div");
  routineHeader.className = "day-section-header";
  routineHeader.innerHTML = "<strong>Routine Completions</strong>";
  const routineList = document.createElement("div");
  routineList.className = "day-routine-list";
  routineList.dataset.routineList = entry.key;
  (entry.routineCompletions || []).forEach((item) => {
    routineList.appendChild(buildRoutineRow(item));
  });
  const routineAdd = document.createElement("div");
  routineAdd.className = "day-task-add";
  const addRoutineBtn = document.createElement("button");
  addRoutineBtn.type = "button";
  addRoutineBtn.className = "btn secondary";
  addRoutineBtn.dataset.addRoutine = entry.key;
  addRoutineBtn.textContent = "Add Routine Completion";
  routineAdd.appendChild(addRoutineBtn);
  routineSection.appendChild(routineHeader);
  routineSection.appendChild(routineList);
  routineSection.appendChild(routineAdd);

  const actions = document.createElement("div");
  actions.className = "day-actions";
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn";
  saveBtn.dataset.daySave = entry.key;
  saveBtn.textContent = "Save Day";
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn secondary danger";
  deleteBtn.dataset.dayDelete = entry.key;
  deleteBtn.textContent = "Delete Day";
  actions.appendChild(saveBtn);
  actions.appendChild(deleteBtn);

  body.appendChild(metaSection);
  if (extras.children.length) {
    body.appendChild(extras);
  }
  body.appendChild(tasksSection);
  body.appendChild(routineSection);
  body.appendChild(actions);

  card.appendChild(header);
  card.appendChild(body);
  return card;
}

function buildExtraFields(entry) {
  const wrapper = document.createElement("div");
  wrapper.className = "day-extras";
  const skip = new Set(["key", "profile", "date", "tasks", "routineCompletions"]);

  Object.entries(entry).forEach(([field, value]) => {
    if (skip.has(field)) return;
    const label = document.createElement("label");
    label.className = "day-extra-field";
    label.textContent = field;
    const input = document.createElement("input");
    input.type = "text";
    input.value = formatFieldValue(value);
    input.dataset.extraField = field;
    label.appendChild(input);
    wrapper.appendChild(label);
  });
  return wrapper;
}

function addTaskRow(taskList, task = {}) {
  if (!taskList) return;
  const row = document.createElement("div");
  row.className = "day-task-row";
  row.dataset.taskRow = task.id || "";

  const label = document.createElement("input");
  label.type = "text";
  label.placeholder = "Label";
  label.value = task.label || "";
  label.dataset.taskField = "label";

  const source = document.createElement("input");
  source.type = "text";
  source.placeholder = "Source";
  source.value = task.source || "";
  source.dataset.taskField = "source";

  const weekly = document.createElement("input");
  weekly.type = "text";
  weekly.placeholder = "Weekly Goal ID";
  weekly.value = task.weeklyGoalId ?? "";
  weekly.dataset.taskField = "weeklyGoalId";

  const done = document.createElement("input");
  done.type = "checkbox";
  done.checked = Boolean(task.done);
  done.dataset.taskField = "done";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn secondary danger";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", () => row.remove());

  row.append(label, source, weekly, done, removeBtn);
  taskList.appendChild(row);
}

function buildRoutineRow(item) {
  const row = document.createElement("div");
  row.className = "day-routine-row";
  const idInput = document.createElement("input");
  idInput.type = "number";
  idInput.placeholder = "Routine ID";
  idInput.value = item.id ?? "";
  idInput.dataset.routineField = "id";
  const done = document.createElement("input");
  done.type = "checkbox";
  done.checked = Boolean(item.done);
  done.dataset.routineField = "done";
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn secondary danger";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", () => row.remove());
  row.append(idInput, done, removeBtn);
  return row;
}

function addRoutineRow(list) {
  if (!list) return;
  list.appendChild(buildRoutineRow({ id: "", done: false }));
}
function buildTable(entries, columns, meta) {
  const table = document.createElement("table");
  table.className = "data-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col;
    headRow.appendChild(th);
  });
  const actionsTh = document.createElement("th");
  actionsTh.textContent = "Actions";
  headRow.appendChild(actionsTh);
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  entries.forEach((entry) => {
    const row = document.createElement("tr");
    const keyValue = entry[meta.keyField];
    row.dataset.entryKey = keyValue;

    columns.forEach((col) => {
      const cell = document.createElement("td");
      if (col === meta.keyField) {
        cell.textContent = keyValue;
      } else {
        const input = document.createElement("input");
        input.type = "text";
        input.value = formatFieldValue(entry[col]);
        input.dataset.field = col;
        input.dataset.entryKey = keyValue;
        cell.appendChild(input);
      }
      row.appendChild(cell);
    });

    const actionsCell = document.createElement("td");
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn secondary";
    saveBtn.dataset.saveEntry = keyValue;
    saveBtn.textContent = "Save";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn secondary danger";
    deleteBtn.dataset.deleteEntry = keyValue;
    deleteBtn.textContent = "Delete";

    actionsCell.appendChild(saveBtn);
    actionsCell.appendChild(deleteBtn);
    row.appendChild(actionsCell);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  return table;
}

async function handleSaveEntry(key) {
  const row = listEl.querySelector(`tr[data-entry-key='${key}']`);
  if (!row) return;
  const meta = STORE_CONFIG[currentStore];
  const inputs = Array.from(row.querySelectorAll("input[data-field]"));

  try {
    const db = await getDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(currentStore, "readwrite");
      const store = tx.objectStore(currentStore);
      const getReq = store.get(resolveKeyType(key));
      getReq.onsuccess = () => {
        const entry = getReq.result || { [meta.keyField]: resolveKeyType(key) };
        inputs.forEach((input) => {
          entry[input.dataset.field] = parseFieldValue(input.value);
        });
        entry[meta.keyField] = resolveKeyType(key);
        store.put(entry);
      };
      getReq.onerror = () => reject(getReq.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    refreshOverview();
  } catch (error) {
    alert("Unable to save entry. Please check your input.");
    console.error(error);
  }
}

async function handleSaveDay(key) {
  const card = listEl.querySelector(`[data-day-card='${key}']`);
  if (!card) return;
  const db = await getDB();
  const meta = STORE_CONFIG[currentStore];
  const existing = await new Promise((resolve, reject) => {
    const tx = db.transaction(currentStore, "readonly");
    const store = tx.objectStore(currentStore);
    const req = store.get(resolveKeyType(key));
    req.onsuccess = () => resolve(req.result || { key, profile: "default", date: "" });
    req.onerror = () => reject(req.error);
  });

  const taskRows = Array.from(card.querySelectorAll("[data-task-list] .day-task-row"));
  const tasks = taskRows
    .map((row) => {
      const data = {};
      row.querySelectorAll("input").forEach((input) => {
        const field = input.dataset.taskField;
        if (!field) return;
        data[field] = field === "done" ? input.checked : parseFieldValue(input.value);
      });
      data.id = row.dataset.taskRow || "";
      if (!data.id) {
        data.id = `t${Date.now()}${Math.random().toString(16).slice(2, 6)}`;
      }
      data.done = Boolean(data.done);
      return data.label ? data : null;
    })
    .filter(Boolean);

  const routineRows = Array.from(card.querySelectorAll("[data-routine-list] .day-routine-row"));
  const routineCompletions = routineRows
    .map((row) => {
      const idInput = row.querySelector("input[data-routine-field='id']");
      const doneInput = row.querySelector("input[data-routine-field='done']");
      if (!idInput) return null;
      const idValue = idInput.value.trim();
      if (!idValue) return null;
      return { id: Number(idValue), done: Boolean(doneInput?.checked) };
    })
    .filter(Boolean);

  const extras = Array.from(card.querySelectorAll("input[data-extra-field]"));
  extras.forEach((input) => {
    const field = input.dataset.extraField;
    existing[field] = parseFieldValue(input.value);
  });

  existing.tasks = tasks;
  existing.routineCompletions = routineCompletions;
  existing[meta.keyField] = resolveKeyType(key);

  await new Promise((resolve, reject) => {
    const tx = db.transaction(currentStore, "readwrite");
    tx.objectStore(currentStore).put(existing);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await refreshStoreView();
  refreshOverview();
}

async function handleDeleteEntry(key) {
  if (!confirm("Delete this record permanently?")) return;
  const db = await getDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(currentStore, "readwrite");
    tx.objectStore(currentStore).delete(resolveKeyType(key));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  refreshStoreView();
  refreshOverview();
}

async function handleClearStore() {
  if (!confirm(`This clears all data in ${STORE_CONFIG[currentStore].label}. Continue?`)) {
    return;
  }
  const db = await getDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(currentStore, "readwrite");
    tx.objectStore(currentStore).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  refreshStoreView();
  refreshOverview();
}

function resolveKeyType(key, keyField = STORE_CONFIG[currentStore]?.keyField) {
  return keyField === "id" ? Number(key) : key;
}

function parseFieldValue(rawValue) {
  const trimmed = rawValue.trim();
  if (trimmed === "") return "";
  try {
    return JSON.parse(trimmed);
  } catch {
    return rawValue;
  }
}

async function handleExportAll() {
  if (!exportBtn) return;
  exportBtn.disabled = true;
  try {
    const payload = await gatherAllData();
    if (exportTextarea) {
      exportTextarea.value = JSON.stringify(payload, null, 2);
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "health-progress-tracker-data.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  } catch (error) {
    alert("Unable to export data.");
    console.error("Export failed", error);
  } finally {
    exportBtn.disabled = false;
  }
}

function formatFieldValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

async function handleCopyJson() {
  if (!exportTextarea) return;
  try {
    // Use existing textarea content if present; otherwise gather fresh data
    let json = exportTextarea.value.trim();
    if (!json) {
      const payload = await gatherAllData();
      json = JSON.stringify(payload, null, 2);
      exportTextarea.value = json;
    }
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(json);
      setStatus("Copied JSON to clipboard.");
    } else {
      exportTextarea.select();
      setStatus("Clipboard unavailable; select text and copy manually.");
    }
  } catch (error) {
    console.error("Copy failed", error);
    setStatus("Unable to copy data.", true);
  }
}

async function handleImportJson() {
  if (!exportTextarea) return;
  const text = exportTextarea.value.trim();
  if (!text) {
    setStatus("Paste JSON before importing.", true);
    return;
  }
  if (
    !confirm(
      "Importing will replace data in all stores with this JSON. Continue? (Make sure you exported a backup first.)"
    )
  ) {
    return;
  }
  try {
    const payload = JSON.parse(text);
    if (typeof payload !== "object" || Array.isArray(payload) || !payload) {
      throw new Error("JSON must be an object with store arrays.");
    }
    await importAllData(payload);
    setStatus("Import complete. Refreshing view...");
    refreshOverview();
    refreshStoreView();
  } catch (error) {
    console.error("Import failed", error);
    setStatus("Import failed. Check JSON format.", true);
  }
}

async function gatherAllData() {
  const db = await getDB();
  const payload = {};
  for (const store of Object.keys(STORE_CONFIG)) {
    payload[store] = await new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  return payload;
}

async function importAllData(payload) {
  const db = await getDB();
  const stores = Object.keys(STORE_CONFIG);
  for (const store of stores) {
    const items = Array.isArray(payload[store]) ? payload[store] : [];
    await clearStore(db, store);
    if (items.length === 0) continue;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      const os = tx.objectStore(store);
      items.forEach((item) => {
        os.put(normalizeEntry(store, item));
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

function normalizeEntry(storeName, entry) {
  const meta = STORE_CONFIG[storeName];
  if (!meta) return entry;
  const normalized = { ...entry };
  if (meta.keyField in normalized) {
    normalized[meta.keyField] = resolveKeyType(normalized[meta.keyField], meta.keyField);
  }
  return normalized;
}

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b30000" : "#2f3a70";
}

function clearStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
