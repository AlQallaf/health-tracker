// setup.js
import { saveGeminiKey, getGeminiKey } from "./settings.js";
import { setCachedGeminiKey } from "./ai/modelLoader.js";

export function initSetupForms({ input, saveBtn, testBtn, statusEl }) {
  if (!input || !saveBtn || !testBtn) return;

  // Load stored key on startup and hydrate the model loader cache
  getGeminiKey()
    .then((value) => {
      if (value) {
        input.value = value;
        setCachedGeminiKey(value);
      }
    })
    .catch((error) => console.error("Failed to load Gemini key", error));

  saveBtn.addEventListener("click", async () => {
    const value = input.value.trim();
    try {
      await saveGeminiKey(value);
      setCachedGeminiKey(value);
      showStatus(statusEl, "API key saved locally.");
    } catch (error) {
      console.error("Failed to save key", error);
      showStatus(statusEl, "Unable to save the key.", true);
    }
  });

  testBtn.addEventListener("click", async () => {
    const value = input.value.trim();
    if (!value) {
      showStatus(statusEl, "Enter a key first.", true);
      return;
    }
    try {
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models?key=" +
          encodeURIComponent(value)
      );
      if (!response.ok) throw new Error("Gemini rejected the key");
      showStatus(statusEl, "Key looks valid!", false);
    } catch (error) {
      console.error(error);
      showStatus(statusEl, "Key test failed. Double-check it.", true);
    }
  });
}

function showStatus(el, message, error = false) {
  if (!el) return;
  el.textContent = message;
  el.style.color = error ? "#b30000" : "#2f3a70";
}
