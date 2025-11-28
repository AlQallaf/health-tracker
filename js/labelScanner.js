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
      const dataUrl = await downscaleImage(file, 1200, 1200, 0.9);
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

async function downscaleImage(file, maxW, maxH, quality = 0.9) {
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
  const prompt = buildPrompt(language, context);

  const payload = {
    system: `
STRICT OCR MODE — ZERO HALLUCINATION RULES:
- Read ONLY text visible in the image.
- DO NOT guess, infer, or add missing ingredients.
- Extract EXACT wording exactly as printed.
- If unreadable → skip or label as "Unknown".
- Do NOT use world knowledge or typical ingredient lists.
- Output ONLY valid JSON.
    `.trim(),

    user: prompt,

    images: [
      {
        mimeType: "image/jpeg",
        data: dataUrl.split(",")[1],
      },
    ],
  };

  const text = await callGemini(payload, {
    maxTokens: 400,
    temperature: 0.0,
    topP: 0.1,
  });

  const parsed = parseResponse(text);
  return parsed;
}

function buildPrompt(language = "en", context = "") {
  const langNote =
    language === "ar"
      ? "Respond in Arabic, but effect words must stay in English."
      : "Respond in English.";

  const contextLine = context
    ? `Product context: ${context}.`
    : "Product context: general.";

  return `
You will receive a product label image.

TASK:
1. Read ONLY the clearly visible ingredient text from the image.
2. DO NOT add or guess any missing ingredients.
3. Ingredient names must match the image EXACTLY.
4. If unsure or text is unclear, use {"name":"Unknown","effect":"Unknown","note":""}
5. For each ingredient found, classify into:
   - Good
   - Bad
   - Neutral
   - Unknown
6. Keep notes short (<= 8 words), factual, no guesses.
7. Output ONLY JSON in exactly this format:

{"ingredients":[{"name":"...","effect":"Good|Bad|Neutral|Unknown","note":"..."}]}

${contextLine}
${langNote}
`.trim();
}

function parseResponse(text) {
  const cleaned = stripCode(text || "");

  const parsedObj = tryParseJson(cleaned);
  if (parsedObj?.ingredients?.length) {
    return { ingredients: normalizeItems(parsedObj.ingredients) };
  }

  const parsedArray = tryParseIngredientArray(cleaned);
  if (parsedArray?.length) {
    return { ingredients: normalizeItems(parsedArray) };
  }

  // Fallback: parse lines, trying JSON per line first
  const ingredients = cleaned
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const asJson = tryParseJson(line);
      if (asJson) {
        const items = Array.isArray(asJson.ingredients)
          ? asJson.ingredients
          : [asJson];
        return items[0];
      }
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
  if (
    value.includes("good") ||
    value.includes("benefit") ||
    value.includes("positive")
  ) {
    return "Good";
  }
  if (
    value.includes("bad") ||
    value.includes("avoid") ||
    value.includes("harm")
  ) {
    return "Bad";
  }
  if (value.includes("neutral") || value.includes("moderate")) {
    return "Neutral";
  }
  return "Unknown";
}

function stripCode(text) {
  return text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return "";
}

function tryParseJson(text) {
  const json = extractJson(text);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch (error) {
    return null;
  }
}

function tryParseIngredientArray(text) {
  const marker = text.indexOf("ingredients");
  if (marker === -1) return null;
  const start = text.indexOf("[", marker);
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch (error) {
    return null;
  }
}

function renderResults(container, data) {
  container.innerHTML = "";
  if (!data.ingredients.length) {
    container.textContent =
      "No readable ingredients detected. Try a clearer photo.";
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
