// modelLoader.js – OCR-safe Gemini wrapper

import { getGeminiKey, getGeminiModel } from "../settings.js";

// Best model for OCR:
const DEFAULT_MODEL = "models/gemini-1.5-flash-vision-latest";
// For maximum OCR accuracy (slower + expensive):
// const DEFAULT_MODEL = "models/gemini-1.5-pro-vision-latest";

let cachedKey = "";
let cachedModel = "";

// prompt = { system, user, images?: [{ mimeType, data }] }
export async function callGemini(prompt, options = {}, _retry = false) {
  const { system, user, images = [] } = prompt;

  const baseMaxTokens = options.maxTokens ?? 2000;
  const effectiveMaxTokens = _retry ? baseMaxTokens * 4 : baseMaxTokens;

  const safeSystem = system?.trim() || "OCR Mode";
  const safeUser = user?.trim() || "Perform OCR.";

  // Build parts (image first helps a lot!)
  const userParts = [];

  images.forEach((img) => {
    userParts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.data,
      },
    });
  });

  userParts.push({ text: safeUser });

  const body = {
    systemInstruction: {
      role: "system",
      parts: [{ text: safeSystem }],
    },
    contents: [
      {
        role: "user",
        parts: userParts,
      },
    ],
    generationConfig: {
      temperature: options.temperature ?? 0.0,
      topP: options.topP ?? 0.1,
      maxOutputTokens: effectiveMaxTokens,
      responseMimeType: "text/plain",
    },
  };

  const [apiKey, model] = await Promise.all([
    loadGeminiKey(),
    loadGeminiModel(options.modelOverride),
  ]);

  if (!apiKey) {
    throw new Error("Gemini API key missing. Add it on Setup page.");
  }

  const endpoint = buildEndpoint(model);

  const response = await fetch(`${endpoint}?key=${apiKey}`, {
    method: "POST",
    mode: "cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Gemini error (${response.status}): ${JSON.stringify(data)}`
    );
  }

  const cand = data?.candidates?.[0];
  let text = "";

  if (cand?.content?.parts?.length) {
    text = cand.content.parts
      .map((p) => p.text || "")
      .join("\n")
      .trim();
  } else if (typeof data?.text === "string") {
    text = data.text.trim();
  }

  const finish = cand?.finishReason;
  const block = data?.promptFeedback?.blockReason;

  if (!text) {
    if (block) throw new Error(`Gemini blocked: ${block}`);

    // IMPORTANT: retry with ORIGINAL prompt including images
    if (finish === "MAX_TOKENS" && !_retry) {
      return await callGemini(
        prompt, // keep full original prompt incl. images
        { ...options, maxTokens: baseMaxTokens * 4 },
        true
      );
    }

    throw new Error(`Gemini returned empty result (${finish})`);
  }

  return text;
}

async function loadGeminiKey() {
  if (!cachedKey) {
    cachedKey = (await getGeminiKey())?.trim();
  }
  return cachedKey;
}

export function setCachedGeminiKey(value) {
  cachedKey = value;
}

async function loadGeminiModel(override) {
  if (override) return normalizeModelName(override);
  if (!cachedModel) {
    const m = await getGeminiModel();
    cachedModel = normalizeModelName(m) || DEFAULT_MODEL;
  }
  return cachedModel;
}

export function setCachedGeminiModel(value) {
  cachedModel = normalizeModelName(value) || DEFAULT_MODEL;
}

function normalizeModelName(name) {
  if (!name) return "";
  return name.startsWith("models/") ? name : `models/${name}`;
}

function buildEndpoint(modelName) {
  const safe = normalizeModelName(modelName) || DEFAULT_MODEL;
  return `https://generativelanguage.googleapis.com/v1beta/${safe}:generateContent`;
}
