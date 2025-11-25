import { getDB } from "./db.js";

const STORE = "appSettings";
const SETTINGS_ENTRY = "appConfig";

export async function saveGeminiKey(value) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ key: SETTINGS_ENTRY, geminiApiKey: value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getGeminiKey() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(SETTINGS_ENTRY);
    request.onsuccess = () => resolve(request.result?.geminiApiKey || "");
    request.onerror = () => reject(request.error);
  });
}
