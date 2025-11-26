import { getDB } from "./db.js";

const STORE = "appSettings";
const SETTINGS_ENTRY = "appConfig";

export async function saveGeminiKey(value) {
  return saveGeminiConfig({ key: value });
}

export async function saveGeminiModel(value) {
  return saveGeminiConfig({ model: value });
}

export async function saveGeminiConfig({ key, model }) {
  const db = await getDB();
  const existing = await getSettingsEntry();
  const next = {
    key: SETTINGS_ENTRY,
    geminiApiKey: key ?? existing.geminiApiKey ?? "",
    geminiModel: model ?? existing.geminiModel ?? "",
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(next);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getGeminiKey() {
  const entry = await getSettingsEntry();
  return entry.geminiApiKey || "";
}

export async function getGeminiModel() {
  const entry = await getSettingsEntry();
  return entry.geminiModel || "";
}

export async function getGeminiConfig() {
  return getSettingsEntry();
}

async function getSettingsEntry() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(SETTINGS_ENTRY);
    request.onsuccess = () => resolve(request.result || {});
    request.onerror = () => reject(request.error);
  });
}
