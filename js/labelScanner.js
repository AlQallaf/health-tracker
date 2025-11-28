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
        context: contextInput?.value?.trim() || "",
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
    maxTokens: 500,
    temperature: 0.0,
    topP: 0.1,
  });

  const parsed = parseResponse(text);
  return { ...parsed, context };
}

function buildPrompt(language = "en", context = "") {
  const langNote =
    language === "ar"
      ? "Respond in Arabic. Keep effect words Good/Bad/Neutral/Unknown in English."
      : "Respond in English. Effect words remain Good/Bad/Neutral/Unknown.";

  const contextLine = context
    ? `Product context provided by user: ${context}. Bias interpretation accordingly (e.g., topical vs edible, whole food vs processed).`
    : "Product context: general (no extra info).";

  return `
You will receive a product label image.

TASK:
1. Read ONLY the clearly visible ingredient text from the image.
2. DO NOT add or guess any missing ingredients.
3. Ingredient names must match the image EXACTLY.
4. Extract nutrition facts if visible: calories (kcal), sugar_g, sat_fat_g, sodium_mg, protein_g, fiber_g.
5. If unsure or text is unclear, use {"name":"Unknown","effect":"Unknown","note":""}
6. For each ingredient found, classify into:
   - Good
   - Bad
   - Neutral
   - Unknown
7. Keep notes short (<= 8 words), factual, no guesses.
8. Also provide a 1-sentence summary describing what the product is and overall health view.
9. Output ONLY JSON in exactly this format:

{"summary":"...","ingredients":[{"name":"...","effect":"Good|Bad|Neutral|Unknown","note":"..."}],"nutrition":{"calories":number,"sugar_g":number,"sat_fat_g":number,"sodium_mg":number,"protein_g":number,"fiber_g":number}}

${contextLine}
${langNote}
`.trim();
}

function parseResponse(text) {
  const cleaned = stripCode(text || "");

  const parsedObj = tryParseJson(cleaned);
  if (isValidParsed(parsedObj)) {
    return {
      summary: (parsedObj.summary || "").trim(),
      ingredients: normalizeItems(parsedObj.ingredients || []),
      nutrition: normalizeNutrition(parsedObj.nutrition || {}),
    };
  }

  const recovered = tryRecoverJson(cleaned);
  if (isValidParsed(recovered)) {
    return {
      summary: (recovered.summary || "").trim(),
      ingredients: normalizeItems(recovered.ingredients || []),
      nutrition: normalizeNutrition(recovered.nutrition || {}),
    };
  }

  throw new Error("Parsing failed. Please try another photo.");
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

function normalizeNutrition(nutrition) {
  if (!nutrition) return null;
  const num = (v) => (typeof v === "number" && !Number.isNaN(v) ? v : null);
  const n = {
    calories: num(nutrition.calories),
    sugar_g: num(nutrition.sugar_g),
    sat_fat_g: num(nutrition.sat_fat_g),
    sodium_mg: num(nutrition.sodium_mg),
    protein_g: num(nutrition.protein_g),
    fiber_g: num(nutrition.fiber_g),
  };
  return Object.values(n).some((v) => v !== null) ? n : null;
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

function isValidParsed(obj) {
  if (!obj || typeof obj !== "object") return false;
  const ingredients = Array.isArray(obj.ingredients) ? obj.ingredients : [];
  const nutrition = obj.nutrition || null;
  if (!ingredients.length && !nutrition) return false;
  return true;
}

function tryRecoverJson(text) {
  // Attempt to extract a top-level JSON object
  const raw = extractJson(text);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {}
  }
  // Attempt to extract ingredients array
  const ingMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  const nutritionMatch = text.match(/\{"calories":[^}]*\}/);
  let ingredients = [];
  let nutrition = null;
  if (ingMatch) {
    try {
      const parsedIng = JSON.parse(ingMatch[0]);
      if (Array.isArray(parsedIng)) ingredients = parsedIng;
    } catch {}
  }
  if (nutritionMatch) {
    try {
      const parsedNut = JSON.parse(nutritionMatch[0]);
      nutrition = parsedNut;
    } catch {}
  }
  if (ingredients.length || nutrition) {
    return { ingredients, nutrition };
  }
  return null;
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
  if (!data.ingredients.length && !data.nutrition) {
    container.textContent =
      "No readable ingredients or nutrition detected. Try a clearer photo.";
    return;
  }

  if (data.summary) {
    const summaryBlock = document.createElement("div");
    summaryBlock.className = "label-summary";
    summaryBlock.textContent = data.summary;
    container.appendChild(summaryBlock);
  }

  const { score, rating, percent } = computeHealthScore(
    data.ingredients,
    data.nutrition
  );
  container.appendChild(buildHealthRing(score, rating, percent));

  if (data.ingredients.length) {
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
  } else {
    const note = document.createElement("div");
    note.className = "muted-text";
    note.textContent = "No ingredients detected; score based on nutrition facts.";
    container.appendChild(note);
  }
}

function setStatus(el, message, isError = false) {
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "#b30000" : "#2f3a70";
}

function computeHealthScore(ingredients, nutrition) {
  const hasIngredients = ingredients?.length > 0;
  const hasNutrition = Boolean(nutrition);

  // Ingredient-only score
  const ingredientScore = (() => {
    if (!hasIngredients) return null;
    const weights = { good: 1.5, neutral: 0, unknown: -0.25, bad: -2.5 };
    const total = ingredients.reduce((sum, item) => {
      const w = weights[item.effect?.toLowerCase()] ?? weights.unknown;
      return sum + w;
    }, 0);
    const avg = total / ingredients.length; // range roughly [-2.5, +1.5]
    return Math.min(10, Math.max(0, ((avg + 2.5) / 4) * 10));
  })();

  // Nutrition-only score
  const nutritionScore = (() => {
    if (!hasNutrition) return null;
    const { sugar_g, sat_fat_g, sodium_mg, calories, fiber_g, protein_g } = nutrition;
    let score = 5; // start neutral
    if (typeof sugar_g === "number") {
      if (sugar_g > 25) score -= 3;
      else if (sugar_g > 15) score -= 2;
      else if (sugar_g < 5) score += 0.5;
    }
    if (typeof sat_fat_g === "number") {
      if (sat_fat_g > 6) score -= 3;
      else if (sat_fat_g > 3) score -= 1.5;
      else if (sat_fat_g < 1) score += 0.5;
    }
    if (typeof sodium_mg === "number") {
      if (sodium_mg > 700) score -= 3;
      else if (sodium_mg > 400) score -= 1.5;
      else if (sodium_mg < 150) score += 0.5;
    }
    if (typeof calories === "number") {
      if (calories > 350) score -= 1.5;
      else if (calories < 150) score += 0.5;
    }
    if (typeof fiber_g === "number" && fiber_g > 5) score += 0.5;
    if (typeof protein_g === "number" && protein_g > 10) score += 0.5;
    return Math.min(10, Math.max(0, score));
  })();

  let combined = 5;
  if (hasIngredients && hasNutrition) {
    combined = (ingredientScore * 0.6 + nutritionScore * 0.4);
  } else if (hasIngredients) {
    combined = ingredientScore;
  } else if (hasNutrition) {
    combined = nutritionScore;
  }

  let rating = "Caution";
  let color = "#e6a700";
  if (combined < 3.5) {
    rating = "High Risk";
    color = "#c1121f";
  } else if (combined > 7.5) {
    rating = "Safer Choice";
    color = "#0b7a3f";
  }
  const percent = Math.round(combined * 10) / 10;
  return { score: combined, rating, percent, color, label: rating };
}

function buildHealthRing(score, rating, percent) {
  const color =
    rating === "Safer Choice" ? "#0b7a3f" : rating === "Caution" ? "#e6a700" : "#c1121f";
  const ring = document.createElement("div");
  ring.className = "health-ring";
  ring.style.background = `conic-gradient(${color} 0%, #e7ebff 0%)`;

  const value = document.createElement("div");
  value.className = "health-ring-value";
  value.textContent = percent.toFixed(1);

  const label = document.createElement("div");
  label.className = "health-ring-label";
  label.textContent = rating;

  ring.appendChild(value);
  ring.appendChild(label);

  requestAnimationFrame(() => {
    ring.style.background = `conic-gradient(${color} ${percent * 10}%, #e7ebff ${percent * 10}%)`;
  });

  const wrapper = document.createElement("div");
  wrapper.className = "health-ring-wrapper";
  const title = document.createElement("div");
  title.className = "health-ring-title";
  title.textContent = "Health Score";
  wrapper.appendChild(title);
  wrapper.appendChild(ring);
  return wrapper;
}
