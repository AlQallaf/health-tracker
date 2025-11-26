import { callGemini } from "./ai/modelLoader.js";

export function initLabelScanner() {
  const fileInput = document.getElementById("labelFileInput");
  const analyzeBtn = document.getElementById("labelAnalyzeBtn");
  const resultsEl = document.getElementById("labelResults");
  const statusEl = document.getElementById("labelStatus");
  const fileNameEl = document.getElementById("labelFileName");
  const langSelect = document.getElementById("labelLanguage");
  const contextInput = document.getElementById("labelContext");

  if (!fileInput || !analyzeBtn || !resultsEl) return;

  fileInput.addEventListener("change", () => {
    if (fileInput.files?.length) {
      fileNameEl.textContent = fileInput.files[0].name;
    } else {
      fileNameEl.textContent = "Choose or drop an image";
    }
  });

  analyzeBtn.addEventListener("click", async () => {
    if (!fileInput.files?.length) {
      setStatus(statusEl, "Please choose an image first.", true);
      return;
    }
    const file = fileInput.files[0];
    setStatus(statusEl, "Processing image...");
    resultsEl.textContent = "";
    analyzeBtn.disabled = true;
    try {
      const dataUrl = await downscaleImage(file, 800, 800, 0.7);
      setStatus(statusEl, "Asking Gemini...");
      const response = await analyzeLabel(dataUrl, {
        language: langSelect?.value || "en",
        context: contextInput?.value || "",
      });
      renderResults(resultsEl, response);
      setStatus(statusEl, "Analysis complete.");
    } catch (error) {
      console.error("Label analysis failed", error);
      setStatus(statusEl, error.message || "Analysis failed.", true);
      resultsEl.textContent = "No analysis available.";
    } finally {
      analyzeBtn.disabled = false;
    }
  });
}

async function downscaleImage(file, maxW, maxH, quality = 0.7) {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
  const targetW = Math.round(bitmap.width * ratio);
  const targetH = Math.round(bitmap.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  return canvas.toDataURL("image/jpeg", quality);
}

async function analyzeLabel(dataUrl, { language, context }) {
  const prompt = buildPrompt(dataUrl, language, context);
  const text = await callGemini(
    {
      system:
        "You are a concise nutrition label analyst. Extract ingredients and classify their health effect. Avoid long explanations.",
      user: prompt,
    },
    { maxTokens: 600 }
  );
  const parsed = parseResponse(text);
  if (!parsed.ingredients.length) {
    throw new Error("No ingredients found in the response.");
  }
  return parsed;
}

function buildPrompt(dataUrl, language = "en", context = "") {
  const langNote =
    language === "ar"
      ? "Respond in Arabic. Effect words should remain Good/Bad/Neutral/Unknown in English for clarity."
      : "Respond in English.";
  const contextLine = context ? `Product context: ${context}.` : "Product context: general.";
  return `You are given a product label image as base64-encoded JPEG. Steps:
1) Extract the list of ingredients from the image (if you cannot read it, say unknown).
2) For each ingredient, classify effect as one of: Good, Bad, Neutral, Unknown.
3) Provide a very brief note (<=10 words) on the health effect or typical concern/benefit.

Return ONLY JSON in this shape:
{"ingredients":[{"name":"...","effect":"Good|Bad|Neutral|Unknown","note":"..."}]}

${contextLine}
${langNote}

Image (base64 JPEG, scaled): ${dataUrl}`;
}

function parseResponse(text) {
  const cleaned = stripCode(text || "");
  const json = extractJson(cleaned);
  if (json) {
    try {
      const parsed = JSON.parse(json);
      const items = Array.isArray(parsed?.ingredients) ? parsed.ingredients : [];
      return { ingredients: normalizeItems(items) };
    } catch (error) {
      console.warn("Failed to parse JSON", error);
    }
  }
  // Fallback: parse lines "name - effect - note"
  const ingredients = cleaned
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[-–—|]/).map((p) => p.trim());
      return {
        name: parts[0] || line,
        effect: normalizeEffect(parts[1]),
        note: parts.slice(2).join(" - "),
      };
    });
  return { ingredients: normalizeItems(ingredients) };
}

function normalizeItems(items) {
  const normalized = items
    .map((item) => ({
      name: (item.name || item.ingredient || "").trim(),
      effect: normalizeEffect(item.effect),
      note: (item.note || item.description || "").trim(),
    }))
    .filter((item) => item.name);

  // Count per category
  const counts = { bad: 0, neutral: 0, good: 0, unknown: 0 };
  normalized.forEach((item) => {
    const key = item.effect.toLowerCase();
    if (key in counts) counts[key] += 1;
    else counts.unknown += 1;
  });

  // Order categories by descending count (ties: Bad > Neutral > Good > Unknown)
  const tieBreak = { bad: 3, neutral: 2, good: 1, unknown: 0 };
  const ordered = Object.keys(counts).sort((a, b) => {
    if (counts[b] !== counts[a]) return counts[b] - counts[a];
    return tieBreak[b] - tieBreak[a];
  });
  const rank = ordered.reduce((acc, key, idx) => {
    acc[key] = idx;
    return acc;
  }, {});

  normalized.sort((a, b) => {
    const ra = rank[a.effect.toLowerCase()] ?? rank.unknown;
    const rb = rank[b.effect.toLowerCase()] ?? rank.unknown;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
  return normalized;
}

function normalizeEffect(effect = "") {
  const value = effect.toLowerCase();
  if (value.includes("good") || value.includes("benefit") || value.includes("positive")) {
    return "Good";
  }
  if (value.includes("bad") || value.includes("avoid") || value.includes("harm")) {
    return "Bad";
  }
  if (value.includes("neutral") || value.includes("moderate")) {
    return "Neutral";
  }
  return "Unknown";
}

function stripCode(text) {
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

function renderResults(container, data) {
  container.innerHTML = "";
  if (!data.ingredients.length) {
    container.textContent = "No ingredients identified.";
    return;
  }
  const list = document.createElement("div");
  list.className = "label-list";
  data.ingredients.forEach((item) => {
    const row = document.createElement("div");
    row.className = "label-row";

    const name = document.createElement("div");
    name.className = "label-name";
    name.textContent = item.name;

    const effect = document.createElement("span");
    effect.className = `label-effect label-${item.effect.toLowerCase()}`;
    effect.textContent = item.effect;

    const note = document.createElement("div");
    note.className = "label-note";
    note.textContent = item.note || "";

    row.appendChild(name);
    row.appendChild(effect);
    if (item.note) row.appendChild(note);
    list.appendChild(row);
  });
  container.appendChild(list);
}

function setStatus(el, message, isError = false) {
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "#b30000" : "#2f3a70";
}
