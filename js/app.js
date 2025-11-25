import { initDB } from "./db.js";
import { initTabs } from "./ui.js";
import { initDailyTasksSection } from "./daily.js";
import { ensureRoutineDefaults, initRoutineSection } from "./routine.js";
import { initWeeklySection } from "./weekly.js";
import { initMonthlySection } from "./monthly.js";
import { initDataManager } from "./dataManager.js";
import { initRoutineManager } from "./routineManager.js";
import { openAiPanel } from "./ai/ui.js";
import { initDayPlanner } from "./dayPlanner.js";
import { initSetupForms } from "./setup.js";

async function bootstrap() {
  try {
    await initDB();
    initTabs();

    const elements = {
      routineList: document.getElementById("routineList"),
      dailyTaskList: document.getElementById("dailyTaskList"),
      newDailyTask: document.getElementById("newDailyTask"),
      addDailyTask: document.getElementById("addDailyTaskBtn"),
      dailyDatePicker: document.getElementById("dailyDatePicker"),
      weeklyList: document.getElementById("weeklyList"),
      newWeeklyGoal: document.getElementById("newWeeklyGoal"),
      addWeeklyGoal: document.getElementById("addWeeklyGoalBtn"),
      routineManageList: document.getElementById("routineManageList"),
      newRoutineTask: document.getElementById("newRoutineTask"),
      addRoutineTask: document.getElementById("addRoutineTaskBtn"),
      aiDayPlannerBtn: document.getElementById("aiDayPlannerBtn"),
      aiDayPlanList: document.getElementById("aiDayPlanList"),
      aiClearPlanBtn: document.getElementById("aiClearPlanBtn"),
      launchAiCoach: document.getElementById("launchAiCoachBtn"),
      floatingAiBtn: document.getElementById("floatingAiBtn"),
      dataOverview: document.getElementById("dataOverview"),
      dataStoreSelect: document.getElementById("dataStoreSelect"),
      dataStoreList: document.getElementById("dataStoreList"),
      dataRefreshBtn: document.getElementById("dataRefreshBtn"),
      dataClearStoreBtn: document.getElementById("dataClearStoreBtn"),
      dataExportBtn: document.getElementById("dataExportBtn"),
      monthlyContent: document.getElementById("monthlyContent"),
      geminiKeyInput: document.getElementById("geminiApiKeyInput"),
      geminiSaveBtn: document.getElementById("saveGeminiKeyBtn"),
      geminiTestBtn: document.getElementById("testGeminiKeyBtn"),
      geminiStatus: document.getElementById("geminiKeyStatus"),
    };

    await ensureRoutineDefaults();
    initRoutineSection({ listElement: elements.routineList });

    initDailyTasksSection({
      listElement: elements.dailyTaskList,
      inputElement: elements.newDailyTask,
      addButtonElement: elements.addDailyTask,
      dateInputElement: elements.dailyDatePicker,
    });

    initWeeklySection({
      listElement: elements.weeklyList,
      inputElement: elements.newWeeklyGoal,
      addButtonElement: elements.addWeeklyGoal,
    });

    initMonthlySection(elements.monthlyContent);
    initRoutineManager({
      listElement: elements.routineManageList,
      inputElement: elements.newRoutineTask,
      addButtonElement: elements.addRoutineTask,
    });
    initDataManager({
      overviewElement: elements.dataOverview,
      selectElement: elements.dataStoreSelect,
      listElement: elements.dataStoreList,
      refreshButton: elements.dataRefreshBtn,
      clearButton: elements.dataClearStoreBtn,
      exportButton: elements.dataExportBtn,
    });
    wireAiAssistant([elements.launchAiCoach, elements.floatingAiBtn]);
    initDayPlanner({
      buttonElement: elements.aiDayPlannerBtn,
      listElement: elements.aiDayPlanList,
      clearButtonElement: elements.aiClearPlanBtn,
    });
    initSetupForms({
      input: elements.geminiKeyInput,
      saveBtn: elements.geminiSaveBtn,
      testBtn: elements.geminiTestBtn,
      statusEl: elements.geminiStatus,
    });
    registerServiceWorker();
  } catch (error) {
    console.error("Error bootstrapping Health Progress Tracker", error);
  }
}

document.addEventListener("DOMContentLoaded", bootstrap);

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("service-worker.js")
    .catch((error) => console.error("Service worker registration failed", error));
}

function wireAiAssistant(buttons) {
  buttons.forEach((button) => {
    if (!button) return;
    button.addEventListener("click", () => {
      openAiPanel();
    });
  });
}
