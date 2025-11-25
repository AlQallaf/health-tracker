import { getDB } from "./db.js";

const STORE_CONFIG = {
  monthlyGoals: { label: "Monthly Goals", keyField: "id" },
  weeklyGoals: { label: "Weekly Goals", keyField: "id" },
  routineTasks: { label: "Routine Tasks", keyField: "id" },
  dailyEntries: { label: "Daily Entries", keyField: "key" },
};

let selectEl;
let listEl;
let refreshBtn;
let clearBtn;
let currentStore = "monthlyGoals";

export function initDataManager({
  selectElement,
  listElement,
  refreshButton,
  clearButton,
}) {
  selectEl = selectElement;
  listEl = listElement;
  refreshBtn = refreshButton;
  clearBtn = clearButton;

  if (!selectEl || !listEl) return;

  populateStoreOptions();

  selectEl.addEventListener("change", () => {
    currentStore = selectEl.value;
    refreshStoreView();
  });

  refreshBtn?.addEventListener("click", refreshStoreView);
  clearBtn?.addEventListener("click", handleClearStore);

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
  entries.forEach((entry) => {
    listEl.appendChild(buildEntryCard(entry));
  });
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

function buildEntryCard(entry) {
  const meta = STORE_CONFIG[currentStore];
  const keyValue = entry[meta.keyField];

  const card = document.createElement("div");
  card.className = "data-entry-card";
  card.dataset.entryKey = keyValue;

  const header = document.createElement("div");
  header.innerHTML = `<strong>${meta.label} Key:</strong> ${keyValue}`;

  const textarea = document.createElement("textarea");
  textarea.value = JSON.stringify(entry, null, 2);
  textarea.dataset.entryKey = keyValue;

  const actions = document.createElement("div");
  actions.className = "data-entry-actions";

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

  actions.appendChild(saveBtn);
  actions.appendChild(deleteBtn);

  card.appendChild(header);
  card.appendChild(textarea);
  card.appendChild(actions);

  return card;
}

async function handleSaveEntry(key) {
  const textarea = listEl.querySelector(`textarea[data-entry-key='${key}']`);
  if (!textarea) return;
  try {
    const value = JSON.parse(textarea.value);
    const meta = STORE_CONFIG[currentStore];
    if (value[meta.keyField] !== key && String(value[meta.keyField]) !== key) {
      alert(`The ${meta.keyField} must remain ${key}.`);
      return;
    }
    const db = await getDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(currentStore, "readwrite");
      tx.objectStore(currentStore).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    alert("Unable to save entry. Ensure the JSON is valid.");
    console.error(error);
  }
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
}

function resolveKeyType(key) {
  const meta = STORE_CONFIG[currentStore];
  return meta.keyField === "id" ? Number(key) : key;
}
