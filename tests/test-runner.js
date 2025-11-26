// Simple in-browser test runner for local checks.
// Uses the production modules with a test DB name so user data remains untouched.
window.__DB_NAME_OVERRIDE__ = "healthProgressTracker_test";

const resultsEl = document.getElementById("results");
const summaryEl = document.getElementById("summary");
const logEl = document.getElementById("log");
const runBtn = document.getElementById("runTestsBtn");
const resetBtn = document.getElementById("resetDbBtn");

const tests = [];

function test(name, description, fn) {
  tests.push({ name, description, fn });
}

function assert(condition, message = "Assertion failed") {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message = "") {
  if (actual !== expected) {
    throw new Error(
      message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

async function deleteTestDb(dbName) {
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Delete blocked"));
  });
}

async function loadModules() {
  const db = await import("../js/db.js");
  const utils = await import("../js/utils.js");
  const daily = await import("../js/daily.js");
  const routine = await import("../js/routine.js");
  const weekly = await import("../js/weekly.js");
  const settings = await import("../js/settings.js");
  return { db, utils, daily, routine, weekly, settings };
}

const modules = await loadModules();
const TEST_DB = window.__DB_NAME_OVERRIDE__ || "healthProgressTracker_test";

async function resetDb() {
  await deleteTestDb(TEST_DB);
  modules.db.resetDB();
  await modules.db.initDB();
}

// ---- Tests ----
test(
  "DB initializes required stores",
  "IndexedDB stores exist after init",
  async () => {
    await resetDb();
    const db = await modules.db.initDB();
    const names = Array.from(db.objectStoreNames);
    ["monthlyGoals", "weeklyGoals", "routineTasks", "dailyEntries", "appSettings"].forEach(
      (store) => assert(names.includes(store), `Store ${store} missing`)
    );
  }
);

test(
  "Daily tasks can be created and fetched",
  "Create daily task and retrieve it",
  async () => {
    await resetDb();
    const date = "2024-01-02";
    await modules.daily.createDailyTask("Hydrate", { date });
    const entry = await modules.daily.fetchDailyEntry(date);
    assert(entry, "Daily entry missing");
    assertEqual(entry.tasks.length, 1, "Task count mismatch");
    assertEqual(entry.tasks[0].label, "Hydrate");
  }
);

test(
  "Routine completions are tracked per day",
  "Mark routine done for a date and read it back",
  async () => {
    await resetDb();
    await modules.routine.createRoutineTask("Stretch", { active: true });
    const routines = await modules.routine.getRoutineTasks();
    assert(routines.length > 0, "Routine not created");
    const routineId = routines[0].id;
    const date = "2024-02-01";
    await modules.daily.updateRoutineCompletion(routineId, true, date);
    const entry = await modules.daily.fetchDailyEntry(date);
    assert(
      entry.routineCompletions.some((c) => c.id === routineId && c.done),
      "Completion missing"
    );
  }
);

test(
  "Weekly goals link to daily tasks",
  "Create weekly goal and link a daily task to it",
  async () => {
    await resetDb();
    await modules.weekly.createWeeklyGoalRecord({ title: "Cardio week" });
    const goals = await modules.weekly.fetchWeeklyGoals();
    const goal = goals[0];
    assert(goal, "Weekly goal missing");
    await modules.daily.createDailyTask("Run 20m", { date: "2024-03-05", weeklyGoalId: goal.id });
    const linked = await modules.daily.getLinkedTasksForWeeklyGoal(goal.id);
    assertEqual(linked.length, 1, "Linked task not found");
    assertEqual(linked[0].label, "Run 20m");
  }
);

test(
  "Backup/export JSON round-trip restores data",
  "Export/import preserves daily task",
  async () => {
    await resetDb();
    await modules.daily.createDailyTask("Test backup", { date: "2024-04-01" });
    const exportJson = await exportAllData();
    await resetDb();
    await importAllData(JSON.parse(exportJson));
    const entry = await modules.daily.fetchDailyEntry("2024-04-01");
    assert(entry && entry.tasks?.some((t) => t.label === "Test backup"), "Import failed");
  }
);

test(
  "Routine active filter works",
  "Inactive routines are hidden unless includeInactive is true",
  async () => {
    await resetDb();
    await modules.routine.createRoutineTask("Active", { active: true });
    await modules.routine.createRoutineTask("Inactive", { active: false });
    const activeOnly = await modules.routine.getRoutineTasks();
    assertEqual(activeOnly.length, 1, "Active filter should hide inactive tasks");
    const all = await modules.routine.getRoutineTasks({ includeInactive: true });
    assertEqual(all.length, 2, "includeInactive should return both tasks");
  }
);

test(
  "Weekly linked tasks are sorted by date",
  "Linked daily tasks for a weekly goal come back in date order",
  async () => {
    await resetDb();
    await modules.weekly.createWeeklyGoalRecord({ title: "Sort test" });
    const goal = (await modules.weekly.fetchWeeklyGoals())[0];
    await modules.daily.createDailyTask("Later", { date: "2024-06-02", weeklyGoalId: goal.id });
    await modules.daily.createDailyTask("Sooner", { date: "2024-06-01", weeklyGoalId: goal.id });
    const linked = await modules.daily.getLinkedTasksForWeeklyGoal(goal.id);
    assertEqual(linked[0].label, "Sooner", "Tasks should be sorted ascending by date");
  }
);

test(
  "Settings save/get round-trip",
  "Gemini key persists via settings store",
  async () => {
    await resetDb();
    await modules.settings.saveGeminiKey("test-key-123");
    const key = await modules.settings.getGeminiKey();
    assertEqual(key, "test-key-123", "Saved key should be retrievable");
  }
);

test(
  "AI tasks honor selected date",
  "createDailyTask with explicit date stores it on that day only",
  async () => {
    await resetDb();
    const today = "2024-07-01";
    const tomorrow = "2024-07-02";
    await modules.daily.createDailyTask("AI future", { date: tomorrow, source: "ai" });
    const todayEntry = await modules.daily.fetchDailyEntry(today);
    assert(
      !todayEntry || !todayEntry.tasks?.some((t) => t.label === "AI future"),
      "Task should not be stored on today's entry"
    );
    const tomorrowEntry = await modules.daily.fetchDailyEntry(tomorrow);
    assert(
      tomorrowEntry && tomorrowEntry.tasks?.some((t) => t.label === "AI future"),
      "Task should be stored on the specified date"
    );
  }
);

// ---- Helpers for export/import within tests ----
async function exportAllData() {
  const db = await modules.db.getDB();
  const payload = {};
  const stores = ["monthlyGoals", "weeklyGoals", "routineTasks", "dailyEntries", "appSettings"];
  for (const store of stores) {
    payload[store] = await new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  return JSON.stringify(payload);
}

async function importAllData(payload) {
  const db = await modules.db.getDB();
  const stores = ["monthlyGoals", "weeklyGoals", "routineTasks", "dailyEntries", "appSettings"];
  for (const store of stores) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      const os = tx.objectStore(store);
      os.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    const items = Array.isArray(payload[store]) ? payload[store] : [];
    if (!items.length) continue;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      const os = tx.objectStore(store);
      items.forEach((item) => os.put(item));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

// ---- Runner wiring ----
runBtn.addEventListener("click", runTests);
resetBtn.addEventListener("click", async () => {
  summaryEl.textContent = "Resetting test DB...";
  await resetDb();
  summaryEl.textContent = "Test DB reset.";
});

async function runTests() {
  runBtn.disabled = true;
  resetBtn.disabled = true;
  resultsEl.innerHTML = "";
  logEl.textContent = "";
  let passed = 0;

  for (const { name, description, fn } of tests) {
    const item = document.createElement("li");
    item.innerHTML = `<strong>${name}</strong>${description ? " — " + description : ""}`;
    resultsEl.appendChild(item);
    try {
      await fn();
      item.innerHTML = `✔ ${name}${description ? " — " + description : ""}`;
      item.classList.add("pass");
      passed += 1;
    } catch (error) {
      item.innerHTML = `✖ ${name}${description ? " — " + description : ""} — ${
        error.message
      }`;
      item.classList.add("fail");
      logEl.textContent += `${name}: ${error.stack || error.message}\n\n`;
    }
  }

  summaryEl.textContent = `Passed ${passed}/${tests.length} tests.`;
  runBtn.disabled = false;
  resetBtn.disabled = false;
}
