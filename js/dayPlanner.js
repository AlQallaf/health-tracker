import { todayString } from "./utils.js";
import { callGemini } from "./ai/modelLoader.js";
import { createDailyTask, refreshDailyTasks } from "./daily.js";

let planTasks = [];
let planDate = todayString();
let planLanguage = "en";
let listEl;
let clearBtn;
let planContainer;
let modal;

export function initDayPlanner({
  buttonElement,
  listElement,
  clearButtonElement,
}) {
  listEl = listElement;
  clearBtn = clearButtonElement;
  planContainer = listEl?.closest(".ai-day-plan");

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      planTasks = [];
      renderPlan();
    });
  }

  if (buttonElement) {
    buttonElement.addEventListener("click", () => {
      if (modal) {
        modal.remove();
        modal = null;
      }
      modal = buildModal();
      document.body.appendChild(modal);
    });
  }

  renderPlan();
}

function buildModal() {
  const overlay = document.createElement("div");
  overlay.className = "ai-panel-overlay";

  const panel = document.createElement("div");
  panel.className = "ai-panel planner-panel";

  const close = () => {
    overlay.remove();
    modal = null;
  };

  const heading = document.createElement("h2");
  heading.textContent = "AI Day Planner";

  let currentLang = planLanguage;
  const langSwitch = buildLangSwitch(currentLang, (next) => {
    currentLang = next;
  });

  const headerRow = document.createElement("div");
  headerRow.className = "ai-panel-header";
  headerRow.appendChild(heading);
  headerRow.appendChild(langSwitch);

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = planDate || todayString();

  const tasksInput = document.createElement("textarea");
  tasksInput.placeholder = "List tasks for your day (one per line)...";

  const notesInput = document.createElement("textarea");
  notesInput.placeholder = "Add extra context (energy, focus, meetings, etc.)";

  const status = document.createElement("div");
  status.className = "ai-panel-output";
  status.textContent = "Provide tasks/context and tap Generate.";

  const actions = document.createElement("div");
  actions.className = "ai-panel-actions";
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn secondary";
  cancelBtn.textContent = "Cancel";
  const generateBtn = document.createElement("button");
  generateBtn.className = "btn";
  generateBtn.textContent = "Generate";
  actions.appendChild(cancelBtn);
  actions.appendChild(generateBtn);

  panel.append(
    headerRow,
    buildField("Day", dateInput),
    buildField("Your tasks", tasksInput),
    buildField("Context", notesInput),
    status,
    actions
  );
  overlay.appendChild(panel);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  cancelBtn.addEventListener("click", close);

  generateBtn.addEventListener("click", async () => {
    const date = dateInput.value || todayString();
    status.textContent = "Asking Gemini for a plan...";
    generateBtn.disabled = true;
    try {
      const plan = await requestDayPlan({
        date,
        tasks: tasksInput.value.trim(),
        notes: notesInput.value.trim(),
        language: currentLang,
      });
      planTasks = Array.isArray(plan.tasks)
        ? plan.tasks.map((t) => ({ ...normalizeTask(t), plannedDate: date }))
        : [];
      planDate = date;
      planLanguage = currentLang;
      renderPlan();
      status.textContent = "Plan created. Close to review.";
    } catch (error) {
      console.error("Day planner error", error);
      status.textContent = `AI error: ${error.message}`;
    } finally {
      generateBtn.disabled = false;
    }
  });

  return overlay;
}

function buildLangSwitch(active, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "ai-lang-switch";
  const enBtn = document.createElement("button");
  enBtn.type = "button";
  enBtn.textContent = "EN";
  const arBtn = document.createElement("button");
  arBtn.type = "button";
  arBtn.textContent = "AR";

  const setLang = (lang) => {
    enBtn.classList.toggle("active", lang === "en");
    arBtn.classList.toggle("active", lang === "ar");
    onChange(lang);
  };

  enBtn.addEventListener("click", () => setLang("en"));
  arBtn.addEventListener("click", () => setLang("ar"));
  wrap.append(enBtn, arBtn);
  setLang(active);
  return wrap;
}

function buildField(label, control) {
  const wrapper = document.createElement("label");
  wrapper.className = "ai-field";
  const span = document.createElement("span");
  span.textContent = label;
  wrapper.append(span, control);
  return wrapper;
}

async function requestDayPlan({ date, tasks, notes, language }) {
  const languageInstruction =
    language === "ar"
      ? "Respond ONLY with JSON. Keep keys label/time/notes in English and use ASCII digits. The values may be Arabic sentences. Do not add any words outside the JSON or use Markdown."
      : "Respond ONLY with JSON in concise English. Do not add any explanation or Markdown outside the JSON.";

  const prompt = `Create a JSON day planner for ${date}. Tasks to schedule: ${
    tasks || "none provided"
  }. Context: ${
    notes || "general productivity"
  }. ${languageInstruction} Required JSON shape: {"tasks":[{"label":"task name","time":"HH:MM or short note","notes":"short tip"}]}. Skip empty entries.`;

  const response = await callGemini(
    {
      system:
        "You are an energetic productivity coach. Respond strictly with JSON when asked and keep descriptions concise.",
      user: prompt,
    },
    { maxTokens: 700 }
  );
  return parsePlanResponse(response);
}

function parsePlanResponse(text) {
  const cleaned = stripCodeFence(text || "");
  const jsonCandidate = extractJson(cleaned);
  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate);
      const tasks = normalizeParsedTasks(parsed);
      if (tasks.length) return { tasks };
    } catch (error) {
      console.warn("Failed to parse JSON", error);
    }
  }

  // Final fallback: split into lines/bullets and build tasks
  const tasks = cleaned
    .split(/\n|•|-|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ label: line, time: "", notes: "" }));
  return { tasks };
}

function normalizeTask(task) {
  return {
    label: (task.label || task.title || task.goal || "").trim(),
    time: (task.time || task.duration || "").trim(),
    notes: (task.notes || task.tip || "").trim(),
    plannedDate: task.plannedDate,
  };
}

function renderPlan() {
  if (!listEl) return;
  if (!planTasks.length) {
    listEl.textContent = "";
    if (planContainer) planContainer.style.display = "none";
    if (clearBtn) clearBtn.style.display = "none";
    return;
  }

  if (planContainer) planContainer.style.display = "";
  if (clearBtn) clearBtn.style.display = "";

  listEl.textContent = "";
  const header = document.createElement("div");
  header.className = "ai-plan-date";
  header.textContent = `AI plan for ${planDate}`;
  listEl.appendChild(header);

  planTasks = planTasks.filter((task) => task.label && task.label.trim().length > 0);

  planTasks.forEach((task, index) => {
    const row = document.createElement("div");
    row.className = "ai-plan-row";

    const labelInput = document.createElement("input");
    labelInput.value = task.label || "";
    labelInput.placeholder = "Task";
    labelInput.addEventListener("input", () => {
      planTasks[index].label = labelInput.value;
    });

    const timeInput = document.createElement("input");
    timeInput.value = task.time || "";
    timeInput.placeholder = "Time";
    timeInput.addEventListener("input", () => {
      planTasks[index].time = timeInput.value;
    });

    const notesInput = document.createElement("input");
    notesInput.value = task.notes || "";
    notesInput.placeholder = "Notes";
    notesInput.addEventListener("input", () => {
      planTasks[index].notes = notesInput.value;
    });

    const approveBtn = document.createElement("button");
    approveBtn.type = "button";
    approveBtn.className = "btn";
    approveBtn.textContent = "Approve";
    approveBtn.addEventListener("click", async () => {
      if (!planTasks[index].label) return;
      const targetDate = planTasks[index].plannedDate || planDate || todayString();
      await createDailyTask(composeLabel(planTasks[index]), {
        source: "ai",
        date: targetDate,
      });
      planTasks.splice(index, 1);
      renderPlan();
      refreshDailyTasks();
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn secondary";
    removeBtn.textContent = "Delete";
    removeBtn.addEventListener("click", () => {
      planTasks.splice(index, 1);
      renderPlan();
    });

    row.append(labelInput, timeInput, notesInput, approveBtn, removeBtn);
    listEl.appendChild(row);
  });
}

function composeLabel(task) {
  const parts = [];
  if (task.time) parts.push(task.time);
  if (task.label) parts.push(task.label);
  if (task.notes) parts.push(`(${task.notes})`);
  return parts.join(" ").trim();
}

function stripCodeFence(text) {
  return text.replace(/```json/gi, "").replace(/```/g, "").trim();
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return "";
}

function normalizeParsedTasks(parsed) {
  // Handle { tasks: [...] } or array directly
  const candidate =
    Array.isArray(parsed) ? parsed : Array.isArray(parsed?.tasks) ? parsed.tasks : [];
  return candidate
    .map((t) => normalizeTask(t))
    .filter((t) => t.label && t.label.trim().length > 0);
}
