import { callGemini } from "./modelLoader.js";

let inFlight = Promise.resolve();

export function queuePrompt(task) {
  inFlight = inFlight.then(() => task()).catch((error) => {
    console.error("AI pipeline error", error);
    throw error;
  });
  return inFlight;
}

export async function generateChatCompletion(payload, options = {}) {
  return queuePrompt(async () => {
    const response = await callGemini(payload, options);
    return response.trim();
  });
}
