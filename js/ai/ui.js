import { getDB } from "../db.js";
import { getCurrentProfile } from "../utils.js";

let panel;
let coachModulePromise;
let coachModule;

export function openAiPanel() {
  if (!panel) {
    panel = createPanel();
    document.body.appendChild(panel.overlay);
  }
  panel.overlay.style.display = "flex";
}

function createPanel() {
  const overlay = document.createElement("div");
  overlay.className = "ai-panel-overlay";

  const container = document.createElement("div");
  container.className = "ai-panel";

  const heading = document.createElement("h2");
  heading.textContent = "Health Coach";
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "btn secondary ai-reset-btn";
  resetBtn.title = "Reset all inputs";
  resetBtn.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 5a7 7 0 1 1-6.32 4h2.09a5 5 0 1 0 4.23-2.5V10L6 5l6-5v3.5Z"/></svg>';
  const langSwitch = document.createElement("div");
  langSwitch.className = "ai-lang-switch";
  const langEnBtn = document.createElement("button");
  langEnBtn.type = "button";
  langEnBtn.textContent = "EN";
  langEnBtn.classList.add("active");
  const langArBtn = document.createElement("button");
  langArBtn.type = "button";
  langArBtn.textContent = "AR";
  langSwitch.appendChild(langEnBtn);
  langSwitch.appendChild(langArBtn);

  const headerRow = document.createElement("div");
  headerRow.className = "ai-panel-header";
  headerRow.appendChild(heading);
  const headerActions = document.createElement("div");
  headerActions.className = "ai-header-actions";
  headerActions.appendChild(langSwitch);
  headerActions.appendChild(resetBtn);
  headerRow.appendChild(headerActions);

  const modeSelect = document.createElement("select");
  [
    { value: "monthly", label: "Monthly Planning" },
    { value: "weekly", label: "Weekly Reflection" },
    { value: "daily", label: "Daily Action Plan" },
    { value: "motivation", label: "Daily Motivation" },
  ].forEach(({ value, label }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    modeSelect.appendChild(option);
  });

  const formArea = document.createElement("div");
  formArea.className = "ai-mode-area";

  const helper = document.createElement("small");
  helper.className = "muted-text";
  helper.textContent =
    "Fill in the fields below and the coach will craft a short, energetic plan or reflection.";

  const output = document.createElement("div");
  output.className = "ai-panel-output";
  output.textContent = "Ask the assistant for help and your response will appear here.";

  const actions = document.createElement("div");
  actions.className = "ai-panel-actions";

  const closeBtn = document.createElement("button");
  closeBtn.className = "btn secondary";
  closeBtn.type = "button";
  closeBtn.textContent = "Close";

  const runBtn = document.createElement("button");
  runBtn.className = "btn";
  runBtn.type = "button";
  runBtn.textContent = "Generate";

  actions.appendChild(closeBtn);
  actions.appendChild(runBtn);

  container.appendChild(headerRow);
  container.appendChild(modeSelect);
  container.appendChild(formArea);
  container.appendChild(helper);
  container.appendChild(output);
  container.appendChild(actions);

  overlay.appendChild(container);

  closeBtn.addEventListener("click", () => {
    overlay.style.display = "none";
  });

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.style.display = "none";
  });

  const builders = {
    monthly: buildMonthlyFields,
    weekly: buildWeeklyFields,
    daily: buildDailyFields,
    motivation: buildMotivationFields,
  };
  const languageState = { value: "en" };
  let gatherInputs = builders[modeSelect.value](formArea);
  const resetState = () => {
    gatherInputs = builders[modeSelect.value](formArea);
    output.textContent = "Ask the assistant for help and your response will appear here.";
  };

  resetBtn.addEventListener("click", resetState);
  langEnBtn.addEventListener("click", () => {
    languageState.value = "en";
    langEnBtn.classList.add("active");
    langArBtn.classList.remove("active");
  });
  langArBtn.addEventListener("click", () => {
    languageState.value = "ar";
    langArBtn.classList.add("active");
    langEnBtn.classList.remove("active");
  });

  modeSelect.addEventListener("change", () => {
    gatherInputs = builders[modeSelect.value](formArea);
    output.textContent = "Ask the assistant for help and your response will appear here.";
  });

  runBtn.addEventListener("click", async () => {
    let payload;
    try {
      payload = gatherInputs();
      payload.language = languageState.value;
    } catch (validationError) {
      output.textContent = validationError.message;
      return;
    }

    output.textContent = "Checking in with the coach...";
    runBtn.disabled = true;
    container.classList.add("ai-busy");

    try {
      const coach = await loadCoach();
      const mode = modeSelect.value;
      let result = "";
      if (mode === "monthly") {
        result = await coach.generateMonthlyPlan(payload);
      } else if (mode === "weekly") {
        result = await coach.generateWeeklyReflection(payload);
      } else if (mode === "daily") {
        result = await coach.generateDailySuggestions(payload);
      } else if (mode === "motivation") {
        result = await coach.generateMotivation(payload);
      }
      output.textContent = formatResponse(result);
    } catch (error) {
      console.error("AI request failed", error);
      output.textContent = `AI error: ${error.message}`;
    } finally {
      runBtn.disabled = false;
      container.classList.remove("ai-busy");
    }
  });

  return { overlay };
}

async function loadCoach() {
  if (coachModule) return coachModule;
  if (!coachModulePromise) {
    coachModulePromise = import("./healthCoach.js").then((mod) => {
      coachModule = mod;
      return mod;
    });
  }
  return coachModulePromise;
}

function formatResponse(text) {
  if (!text) return "No response received.";
  return cleanResponse(text);
}

function cleanResponse(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/#+\s*/g, "")
    .replace(/[-*•]\s+/g, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function buildMonthlyFields(root) {
  root.innerHTML = "";
  const monthInput = document.createElement("input");
  monthInput.type = "month";
  monthInput.value = buildDefaultMonth();

  const goalArea = document.createElement("textarea");
  goalArea.placeholder = "Describe the main focus, challenges, or desired habit.";
  const savedGoalsWrap = document.createElement("div");
  savedGoalsWrap.className = "ai-month-summary-grid";
  const summaryTitle = document.createElement("span");
  summaryTitle.textContent = "Saved goals for this month:";
  savedGoalsWrap.appendChild(summaryTitle);
  const chipList = document.createElement("div");
  chipList.className = "ai-month-chip-list";
  savedGoalsWrap.appendChild(chipList);

  root.appendChild(buildField("Target month", monthInput));
  root.appendChild(savedGoalsWrap);
  root.appendChild(buildField("Monthly goal / context", goalArea));

  let lookupId = 0;
  const refreshSummary = async () => {
    const monthValue = monthInput.value;
    chipList.textContent = "";
    if (!monthValue) {
      chipList.textContent = "Pick a month to see saved goals.";
      return;
    }
    const id = ++lookupId;
    chipList.textContent = "Looking up saved goals...";
    try {
      const goals = await fetchMonthlyGoals(monthValue);
      if (id !== lookupId) return;
      if (goals.length) {
        chipList.textContent = "";
        goals.forEach((goal) => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "ai-month-chip";
          chip.textContent = describeMonthlyGoal(goal);
          chip.dataset.goalId = goal.id;
          chip.addEventListener("click", () => {
            chip.classList.toggle("selected");
            if (!goalArea.value.trim()) {
              goalArea.value = buildMonthlyContext(goal);
            }
          });
          chipList.appendChild(chip);
        });
      } else {
        chipList.textContent = "No saved monthly goals for this month yet.";
      }
    } catch (error) {
      console.error("Failed to load monthly goal", error);
      chipList.textContent = "Unable to load saved goals.";
    }
  };

  monthInput.addEventListener("change", refreshSummary);
  refreshSummary();

  return () => {
    if (!monthInput.value) throw new Error("Please select the month you want to plan.");
    const selectedGoals = Array.from(chipList.querySelectorAll(".ai-month-chip.selected"))
      .map((chip) => chip.textContent)
      .join(" | ");
    const context = [selectedGoals, goalArea.value.trim()].filter(Boolean).join("\n");
    return { month: monthInput.value, goalContext: context || "Plan a balanced, healthy month." };
  };
}

function buildWeeklyFields(root) {
  root.innerHTML = "";
  const monthInput = document.createElement("input");
  monthInput.type = "month";
  monthInput.value = "";

  const savedWrap = document.createElement("div");
  savedWrap.className = "ai-month-summary-grid";
  const savedTitle = document.createElement("span");
  savedTitle.textContent = "Select saved weekly goals to reflect on:";
  savedWrap.appendChild(savedTitle);
  const chipList = document.createElement("div");
  chipList.className = "ai-month-chip-list";
  chipList.textContent = "Loading weekly goals...";
  savedWrap.appendChild(chipList);

  const manualArea = document.createElement("textarea");
  manualArea.placeholder = "Add wins, challenges, or notes you want to reflect on...";

  const taskToggle = document.createElement("select");
  ["reflection", "tasks"].forEach((type) => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type === "tasks" ? "Reflect + suggest tasks" : "Reflection only";
    taskToggle.appendChild(option);
  });

  root.appendChild(buildField("Filter by month (optional)", monthInput));
  root.appendChild(savedWrap);
  root.appendChild(buildField("Extra notes", manualArea));
  root.appendChild(buildField("Task suggestions?", taskToggle));

  let weeklyGoals = [];
  const loadWeekly = async () => {
    chipList.textContent = "Loading weekly goals...";
    weeklyGoals = await fetchWeeklyGoals(monthInput.value);
    chipList.textContent = "";
    if (weeklyGoals.length === 0) {
      chipList.textContent = "No weekly goals captured yet.";
      return;
    }
    weeklyGoals.forEach((goal) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ai-month-chip";
      chip.textContent = describeWeeklyGoal(goal);
      chip.dataset.goalId = goal.id;
      chip.addEventListener("click", () => chip.classList.toggle("selected"));
      chipList.appendChild(chip);
    });
  };
  loadWeekly();
  monthInput.addEventListener("change", loadWeekly);

  return () => {
    const selectedGoalSummaries = Array.from(chipList.querySelectorAll(".ai-month-chip.selected"))
      .map((chip) => {
        const id = Number(chip.dataset.goalId);
        return weeklyGoals.find((goal) => goal.id === id);
      })
      .filter(Boolean)
      .map((goal) => ({
        title: goal.title,
        achieved: goal.achieved,
        challenges: goal.challenges,
        improve: goal.improve,
      }));

    const manualNotes = manualArea.value.trim();

    if (selectedGoalSummaries.length === 0 && !manualNotes) {
      throw new Error("Select at least one weekly goal or add notes to reflect on.");
    }

    return { weeks: selectedGoalSummaries, includeTasks: taskToggle.value === "tasks", manualNotes };
  };
}

function buildDailyFields(root) {
  root.innerHTML = "";
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = buildDefaultDate();

  const tasksArea = document.createElement("textarea");
  tasksArea.placeholder = "List tasks, one per line";

  const scheduleArea = document.createElement("textarea");
  scheduleArea.placeholder = "Schedule / energy notes (optional)";

  const savedTasksWrap = document.createElement("div");
  savedTasksWrap.className = "ai-saved-list";
  const savedTitle = document.createElement("span");
  savedTitle.textContent = "Tasks already logged:";
  const savedList = document.createElement("div");
  savedList.className = "ai-task-chip-list";
  savedTasksWrap.appendChild(savedTitle);
  savedTasksWrap.appendChild(savedList);

  root.appendChild(buildField("Day", dateInput));
  root.appendChild(savedTasksWrap);
  root.appendChild(buildField("Daily tasks", tasksArea));
  root.appendChild(buildField("Schedule notes", scheduleArea));

  const loadTasks = async () => {
    savedList.textContent = "Loading tasks...";
    try {
      const entry = await fetchDailyEntry(dateInput.value);
      savedList.textContent = "";
      if (!entry || !entry.tasks?.length) {
        savedList.textContent = "No saved tasks for this day.";
        return;
      }
      entry.tasks.forEach((task) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "ai-month-chip";
        chip.textContent = task.label;
        chip.addEventListener("click", () => chip.classList.toggle("selected"));
        savedList.appendChild(chip);
      });
    } catch (error) {
      console.error("Failed to load daily tasks", error);
      savedList.textContent = "Unable to load saved tasks.";
    }
  };
  loadTasks();
  dateInput.addEventListener("change", loadTasks);

  const defaultContext = "Plan a productive but balanced day.";
  return () => {
    const extraTasks = tasksArea.value
      .split(/\n+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const savedSelections = Array.from(savedList.querySelectorAll(".ai-month-chip.selected"))
      .map((chip) => chip.textContent)
      .filter(Boolean);
    const tasks = [...savedSelections, ...extraTasks];
    if (tasks.length === 0) throw new Error("Select or list at least one task you want to plan.");
    return {
      date: dateInput.value,
      tasks,
      schedule: scheduleArea.value.trim() || defaultContext,
    };
  };
}

function buildMotivationFields(root) {
  root.innerHTML = "";
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = buildDefaultDate();

  const savedTasksWrap = document.createElement("div");
  savedTasksWrap.className = "ai-saved-list";
  const savedTitle = document.createElement("span");
  savedTitle.textContent = "Pick tasks to encourage:";
  const savedList = document.createElement("div");
  savedList.className = "ai-task-chip-list";
  savedTasksWrap.appendChild(savedTitle);
  savedTasksWrap.appendChild(savedList);

  const tasksArea = document.createElement("textarea");
  tasksArea.placeholder = "Add more tasks (one per line)...";

  const moodInput = document.createElement("textarea");
  moodInput.placeholder = "Describe how you feel or any blockers.";

  root.appendChild(buildField("Day", dateInput));
  root.appendChild(savedTasksWrap);
  root.appendChild(buildField("Extra tasks", tasksArea));
  root.appendChild(buildField("Mood / context", moodInput));

  const loadTasks = async () => {
    savedList.textContent = "Loading tasks...";
    try {
      const entry = await fetchDailyEntry(dateInput.value);
      savedList.textContent = "";
      if (!entry || !entry.tasks?.length) {
        savedList.textContent = "No saved tasks for this day.";
        return;
      }
      entry.tasks.forEach((task) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "ai-month-chip";
        chip.textContent = task.label;
        chip.addEventListener("click", () => chip.classList.toggle("selected"));
        savedList.appendChild(chip);
      });
    } catch (error) {
      console.error("Failed to load motivation tasks", error);
      savedList.textContent = "Unable to load saved tasks.";
    }
  };
  loadTasks();
  dateInput.addEventListener("change", loadTasks);

  const defaultMood = "Feeling neutral but want to keep momentum.";
  return () => {
    const selectedSaved = Array.from(savedList.querySelectorAll(".ai-month-chip.selected"))
      .map((chip) => chip.textContent)
      .filter(Boolean);
    const extraTasks = tasksArea.value
      .split(/\n+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const tasks = [...selectedSaved, ...extraTasks];
    const mood = moodInput.value.trim();
    if (!tasks.length && !mood) {
      throw new Error("Share tasks or mood so the coach can tailor the motivation.");
    }
    return { tasks, mood: mood || defaultMood };
  };
}

function buildField(labelText, control) {
  const wrapper = document.createElement("label");
  wrapper.className = "ai-field";
  const span = document.createElement("span");
  span.textContent = labelText;
  wrapper.appendChild(span);
  wrapper.appendChild(control);
  return wrapper;
}

function addWeekEntry(list) {
  const entry = document.createElement("div");
  entry.className = "ai-week-entry";

  const controls = document.createElement("div");
  controls.className = "ai-week-entry-controls";

  const weekInput = document.createElement("input");
  weekInput.type = "number";
  weekInput.min = "1";
  weekInput.max = "6";
  weekInput.placeholder = "Week #";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn secondary";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", () => {
    entry.remove();
    if (!list.querySelector(".ai-week-entry")) addWeekEntry(list);
  });

  controls.appendChild(weekInput);
  controls.appendChild(removeBtn);

  const notesArea = document.createElement("textarea");
  notesArea.placeholder = "Wins, challenges, or notes for this week...";

  entry.appendChild(controls);
  entry.appendChild(notesArea);
  list.appendChild(entry);
}

function buildDefaultMonth() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function buildDefaultDate() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

async function fetchMonthlyGoals(forMonth) {
  if (!forMonth) return [];
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("monthlyGoals", "readonly");
    const store = tx.objectStore("monthlyGoals");
    const request = store.openCursor();
    const results = [];
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) {
        resolve(results);
        return;
      }
      if (cursor.value?.forMonth === forMonth && cursor.value.profile === getCurrentProfile()) {
        results.push(cursor.value);
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

function describeMonthlyGoal(goal) {
  const parts = [`Saved goal: ${goal.title || "Untitled goal"}`];
  if (goal.notes) parts.push(`Notes: ${goal.notes}`);
  if (goal.createdAt) {
    parts.push(`Created: ${new Date(goal.createdAt).toLocaleDateString()}`);
  }
  return parts.join(" • ");
}

function buildMonthlyContext(goal) {
  const parts = [];
  if (goal.title) parts.push(goal.title);
  if (goal.notes) parts.push(goal.notes);
  return parts.join(" — ");
}

async function fetchWeeklyGoals(monthFilter) {
  const profile = getCurrentProfile();
  const [weeklyGoals, monthlyGoals] = await Promise.all([
    getAllFromStore("weeklyGoals"),
    getAllFromStore("monthlyGoals"),
  ]);
  const monthMap = new Map();
  monthlyGoals
    .filter((goal) => goal.profile === profile)
    .forEach((goal) => monthMap.set(goal.id, goal.forMonth));

  return weeklyGoals
    .filter((goal) => goal.profile === profile)
    .filter((goal) => {
      if (!monthFilter) return true;
      const linkedMonth = monthMap.get(goal.monthGoalId);
      if (linkedMonth) return linkedMonth === monthFilter;
      if (!goal.createdAt) return false;
      const createdMonth = new Date(goal.createdAt)
        .toISOString()
        .slice(0, 7);
      return createdMonth === monthFilter;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

async function getAllFromStore(storeName) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function describeWeeklyGoal(goal) {
  const bits = [goal.title || "Untitled weekly goal"];
  if (goal.achieved) {
    const snippet = goal.achieved.length > 50 ? `${goal.achieved.slice(0, 47)}…` : goal.achieved;
    bits.push(`Wins: ${snippet}`);
  }
  return bits.join(" • ");
}

async function fetchDailyEntry(date) {
  const targetDate = date || buildDefaultDate();
  const profile = getCurrentProfile();
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("dailyEntries", "readonly");
    const store = tx.objectStore("dailyEntries");
    const request = store.get(`${profile}_${targetDate}`);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}
