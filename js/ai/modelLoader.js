// modelLoader.js
// Single place where we talk to Gemini from the browser.

import { getGeminiKey } from "../settings.js";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

let cachedKey = "";

// prompt = { system, user }
// options = { temperature?, maxTokens?, topP? }
export async function callGemini(prompt, options = {}, _retry = false) {
  const { system, user } = prompt;

  const baseMaxTokens = options.maxTokens ?? 2000;
  const effectiveMaxTokens = _retry ? baseMaxTokens * 4 : baseMaxTokens;

  const safeSystem =
    system?.trim() ||
    "You are Health and Life Coach AI, a concise, upbeat wellness companion. Avoid medical advice and keep answers short.";

  const safeUser =
    user?.trim() ||
    "Create a short, encouraging wellness suggestion for the upcoming month.";

  const body = {
    // How the model should behave
    systemInstruction: {
      role: "system",
      parts: [{ text: safeSystem }],
    },

    // What the user is asking for
    contents: [
      {
        role: "user",
        parts: [{ text: safeUser }],
      },
    ],

    generationConfig: {
      temperature: options.temperature ?? 0.7,
      topP: options.topP ?? 0.9,
      maxOutputTokens: effectiveMaxTokens,
      // This is supported; just tells it to give plain text back
      responseMimeType: "text/plain",
    },
  };

  const apiKey = await loadGeminiKey();
  if (!apiKey) {
    throw new Error("Gemini API key missing. Add it from the Setup page.");
  }

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    mode: "cors",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Gemini request failed (${response.status}): ${JSON.stringify(data)}`
    );
  }

  const cand = data?.candidates?.[0];
  let text = "";

  // Normal case: content.parts[]
  if (cand?.content?.parts?.length) {
    text = cand.content.parts
      .map((p) => p.text || "")
      .join("\n")
      .trim();
  } else if (typeof data?.text === "string") {
    // Some wrappers put the text here
    text = data.text.trim();
  }

  const finish = cand?.finishReason;
  const block = data?.promptFeedback?.blockReason;

  // If still nothing, decide what to do
  if (!text) {
    // 1) Safety block
    if (block) {
      throw new Error(`Gemini blocked the response (${block}).`);
    }

    // 2) MAX_TOKENS but no text → retry once with more tokens
    if (finish === "MAX_TOKENS" && !_retry) {
      console.warn(
        "Gemini hit MAX_TOKENS with no text; retrying with higher maxOutputTokens…"
      );
      return await callGemini(
        { system: safeSystem, user: safeUser },
        { ...options, maxTokens: baseMaxTokens * 4 },
        true
      );
    }

    // 3) Still nothing
    throw new Error(
      `Gemini returned no usable content${
        finish ? ` (finishReason=${finish})` : ""
      }.`
    );
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
