// setup.js
import { saveGeminiConfig, getGeminiConfig } from "./settings.js";
import { setCachedGeminiKey, setCachedGeminiModel } from "./ai/modelLoader.js";

export function initSetupForms({ input, modelSelect, saveBtn, testBtn, statusEl }) {
  if (!input || !saveBtn || !testBtn || !modelSelect) return;

  // Load stored config on startup and hydrate the model loader cache
  getGeminiConfig()
    .then((config) => {
      if (config.geminiApiKey) {
        input.value = config.geminiApiKey;
        setCachedGeminiKey(config.geminiApiKey);
        loadModels(config.geminiApiKey, modelSelect, config.geminiModel, statusEl);
      }
    })
    .catch((error) => console.error("Failed to load Gemini config", error));

  saveBtn.addEventListener("click", async () => {
    const key = input.value.trim();
    const model = modelSelect.value;
    try {
      await saveGeminiConfig({ key, model });
      setCachedGeminiKey(key);
      setCachedGeminiModel(model);
      showStatus(statusEl, "API key and model saved locally.");
    } catch (error) {
      console.error("Failed to save config", error);
      showStatus(statusEl, "Unable to save the configuration.", true);
    }
  });

  testBtn.addEventListener("click", async () => {
    const key = input.value.trim();
    if (!key) {
      showStatus(statusEl, "Enter a key first.", true);
      return;
    }
    await loadModels(key, modelSelect, modelSelect.value || "", statusEl, true);
  });
}

async function loadModels(key, selectEl, currentModel, statusEl, showStatusOnly = false) {
  selectEl.innerHTML = `<option value="">Loading models...</option>`;
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models?key=" +
        encodeURIComponent(key)
    );
    if (!response.ok) throw new Error("Gemini rejected the key");
    const data = await response.json();
    const models = (data.models || []).filter((m) =>
      Array.isArray(m.supportedGenerationMethods)
        ? m.supportedGenerationMethods.includes("generateContent")
        : true
    );
    if (!models.length) throw new Error("No compatible models found.");

    selectEl.innerHTML = "";
    models.forEach((m) => {
      const option = document.createElement("option");
      option.value = m.name || "";
      option.textContent = m.displayName || m.name || "";
      if (option.value === currentModel) option.selected = true;
      selectEl.appendChild(option);
    });

    if (!selectEl.value) selectEl.value = models[0].name;
    if (!showStatusOnly) {
      showStatus(
        statusEl,
        `Loaded ${models.length} models. Selected: ${selectEl.selectedOptions[0].textContent}`
      );
    } else {
      showStatus(statusEl, "Key looks valid. Models loaded.");
    }
  } catch (error) {
    console.error("Model load failed", error);
    selectEl.innerHTML = `<option value="">Unable to load models</option>`;
    showStatus(statusEl, "Model load failed. Check key.", true);
  }
}

function showStatus(el, message, error = false) {
  if (!el) return;
  el.textContent = message;
  el.style.color = error ? "#b30000" : "#2f3a70";
}
