import {
  createRoutineTask,
  deleteRoutineTask,
  getRoutineTasks,
  updateRoutineTask,
} from "./routine.js";

let listEl;
let inputEl;
let addButtonEl;
let managerListenerAttached = false;

export function initRoutineManager({ listElement, inputElement, addButtonElement }) {
  listEl = listElement;
  inputEl = inputElement;
  addButtonEl = addButtonElement;

  if (!listEl || !inputEl || !addButtonEl) return;

  addButtonEl.addEventListener("click", handleAddRoutineTask);
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleAddRoutineTask();
    }
  });

  listEl.addEventListener("click", async (event) => {
    const deleteBtn = event.target.closest("button[data-delete-routine]");
    if (deleteBtn) {
      const id = Number(deleteBtn.dataset.deleteRoutine);
      await deleteRoutineTask(id);
      await refreshRoutineManager();
      return;
    }

    const saveBtn = event.target.closest("button[data-save-routine]");
    if (saveBtn) {
      const id = Number(saveBtn.dataset.saveRoutine);
      await handleSaveRoutine(id);
      return;
    }
  });

  if (!managerListenerAttached) {
    window.addEventListener("routineUpdated", () => refreshRoutineManager());
    managerListenerAttached = true;
  }

  refreshRoutineManager();
}

async function handleAddRoutineTask() {
  const label = inputEl.value.trim();
  if (!label) return;
  addButtonEl.disabled = true;
  try {
    await createRoutineTask(label);
    inputEl.value = "";
    await refreshRoutineManager();
  } finally {
    addButtonEl.disabled = false;
  }
}

async function handleSaveRoutine(id) {
  const labelInput = listEl.querySelector(`[data-routine-label='${id}']`);
  const activeToggle = listEl.querySelector(`[data-routine-active='${id}']`);
  if (!labelInput || !activeToggle) return;
  const updates = {
    label: labelInput.value.trim(),
    active: activeToggle.checked,
  };
  await updateRoutineTask(id, updates);
  await refreshRoutineManager();
}

export async function refreshRoutineManager() {
  if (!listEl) return;
  listEl.textContent = "Loading routine tasks...";
  const tasks = await getRoutineTasks({ includeInactive: true });

  if (tasks.length === 0) {
    listEl.textContent = "No routine tasks defined yet.";
    return;
  }

  listEl.innerHTML = "";
  const fragment = document.createDocumentFragment();

  tasks.forEach((task) => {
    const item = document.createElement("div");
    item.className = "routine-manage-item";
    item.dataset.taskId = task.id;

    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.value = task.label;
    labelInput.dataset.routineLabel = task.id;

    const activeLabel = document.createElement("label");
    activeLabel.className = "checkbox-item";
    const activeToggle = document.createElement("input");
    activeToggle.type = "checkbox";
    activeToggle.checked = task.active !== false;
    activeToggle.dataset.routineActive = task.id;
    activeLabel.appendChild(activeToggle);
    activeLabel.append(" Active");

    const actions = document.createElement("div");
    actions.className = "routine-manage-actions";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn secondary";
    saveBtn.dataset.saveRoutine = task.id;
    saveBtn.textContent = "Save";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn secondary";
    deleteBtn.dataset.deleteRoutine = task.id;
    deleteBtn.textContent = "Delete";

    if (task.weeklyGoalId) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "Linked to weekly goal";
      item.appendChild(badge);
    }

    item.appendChild(labelInput);
    item.appendChild(activeLabel);
    actions.appendChild(saveBtn);
    actions.appendChild(deleteBtn);
    item.appendChild(actions);

    if (task.active === false) {
      const status = document.createElement("span");
      status.className = "badge";
      status.textContent = "Inactive";
      actions.appendChild(status);
    }

    fragment.appendChild(item);
  });

  listEl.appendChild(fragment);
}
