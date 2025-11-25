import { generateChatCompletion } from "./chat.js";

const baseSystemPrompt =
  "You are Health Coach AI, a concise, upbeat wellness companion. Keep replies under 170 words, use short headings or bullets, and sound encouraging without medical advice.";

export function generateMonthlyPlan({ month, goalContext, language = "en" }) {
  const prettyMonth = month ? formatMonth(month) : "the upcoming month";
  const user = withLanguage(
    `Plan weekly milestones for ${prettyMonth}. Monthly focus: ${goalContext || "general wellness"}. Provide four weekly milestones with 2-3 bullet micro-tasks each. Keep it motivating and concise.`,
    language
  );
  return callModel(
    { system: baseSystemPrompt, user },
    {},
    () => fallbackMonthlyPlan(prettyMonth, goalContext, language)
  );
}

export function generateWeeklyReflection({ weeks, includeTasks, manualNotes, language = "en" }) {
  const summary =
    weeks?.length > 0
      ? weeks
          .map(
            (entry, idx) =>
              entry.title
                ? `${entry.title}: wins=${entry.achieved || "n/a"}, challenges=${entry.challenges || "n/a"}`
                : `Week ${entry.week || idx + 1}: ${entry.notes || "no notes provided"}`
          )
          .join("\n")
      : "No week summaries provided.";
  const user = withLanguage(
    `Help me reflect on the following weeks:\n${summary}\nReturn quick wins, lessons, and priorities. ${
      includeTasks
        ? "Also suggest 3 actionable weekly tasks that could become daily habits."
        : "Offer one gentle reminder to stay consistent."
    }
Additional reflection notes: ${manualNotes || "none"}.`,
    language
  );
  return callModel(
    { system: baseSystemPrompt, user },
    {},
    () => fallbackWeeklyReflection(weeks || [], includeTasks, manualNotes, language)
  );
}

export function generateDailySuggestions({ date, tasks, schedule, language = "en" }) {
  const prettyDate = date ? formatDate(date) : "today";
  const taskList = (tasks || [])
    .filter(Boolean)
    .map((task) => `- ${task}`)
    .join("\n")
    .trim() || "- General wellness tasks";
  const user = withLanguage(
    `Create an ordered action plan for ${prettyDate}. Tasks:\n${taskList}\nSchedule context: ${
      schedule || "flexible day"
    }.\nReturn a numbered list with suggested timing and motivational note at the end.`,
    language
  );
  return callModel(
    { system: baseSystemPrompt, user },
    {},
    () => fallbackDailySuggestions(prettyDate, tasks, schedule, language)
  );
}

export function generateMotivation({ tasks, mood, language = "en" }) {
  const user = withLanguage(
    `I need a motivational boost. Current mood/context: ${mood || "not specified"}. Key tasks today: ${
      tasks?.join(", ") || "general to-do list"
    }.\nProvide one short pep talk and one quote aligned with the tasks.`,
    language
  );
  return callModel(
    { system: baseSystemPrompt, user },
    { temperature: 0.85, maxTokens: 180 },
    () => fallbackMotivation(tasks, mood, language)
  );
}

async function callModel(prompt, options, fallback) {
  try {
    return await generateChatCompletion(prompt, options);
  } catch (error) {
    console.error("AI request failed", error);
    if (navigator.onLine === false) {
      return fallback();
    }
    throw error;
  }
}

function fallbackMonthlyPlan(monthLabel, context, language) {
  const focus = context || "balance movement, nutrition, and recovery";
  return [
    `Monthly Plan (${monthLabel})`,
    `Focus: ${focus}`,
    "",
    "Week 1: set clear targets",
    "• Define one nutrition tweak",
    "• Schedule two training blocks",
    "",
    "Week 2: consistency check",
    "• Track hydration daily",
    "• Add mindful cooldown after workouts",
    "",
    "Week 3: reset & refine",
    "• Review sleep routine",
    "• Swap one snack for a protein-rich option",
    "",
    "Week 4: celebrate + prep",
    "• Log wins and challenges",
    "• Prep next month's top focus",
    fallbackFootnote(language),
  ].join("\n");
}

function fallbackWeeklyReflection(weeks, includeTasks, manualNotes, language) {
  const reflections =
    weeks.length > 0
      ? weeks
          .map(
            (entry, idx) =>
              entry.title
                ? `${entry.title}: wins=${entry.achieved || "n/a"}, challenges=${entry.challenges || "n/a"}`
                : `Week ${entry.week || idx + 1}: ${entry.notes || "remember to capture highlights"}`
          )
          .join("\n")
      : "No week info captured—take 2 minutes to jot down highlights.";
  const manual = manualNotes ? `Extra notes: ${manualNotes}` : "";
  const tasks = includeTasks
    ? "\nSuggested tasks:\n• Prioritize one big rock daily\n• Block time for recovery\n• Share goals with an accountability buddy"
    : "";
  return [`Weekly Reflection Template`, reflections, manual, tasks, fallbackFootnote(language)].join("\n");
}

function fallbackDailySuggestions(dateLabel, tasks, schedule, language) {
  const listed = tasks?.length
    ? tasks.map((t, i) => `${i + 1}. ${t}`).join("\n")
    : "1. Hydration anchoring\n2. Movement snack\n3. Evening review";
  return [
    `Daily Plan (${dateLabel})`,
    `Schedule notes: ${schedule || "flexible"}`,
    "",
    listed,
    "",
    "Tip: pair each task with an existing habit for easier follow-through.",
    fallbackFootnote(language),
  ].join("\n");
}

function fallbackMotivation(tasks, mood, language) {
  const taskLine = tasks?.length ? tasks.join(", ") : "your planned actions";
  return [
    "Motivation Boost",
    `Mood: ${mood || "unspecified"}`,
    "",
    `You've already committed to ${taskLine}. Show up for the first 5 minutes and momentum will carry you further.`,
    'Quote: "Discipline is choosing between what you want now and what you want most." — Augusta F. Kantra',
    fallbackFootnote(language),
  ].join("\n");
}

function fallbackFootnote(language) {
  const note = "(Generated with the fallback template because Gemini was unavailable.)";
  return language === "ar"
    ? `${note}\n(تم إنشاء هذه الخطة الاحتياطية باللغة الإنجليزية.)`
    : note;
}

function withLanguage(userPrompt, language) {
  if (language === "ar") {
    return `${userPrompt}\nRespond in Arabic using friendly motivational tone.`;
  }
  return userPrompt;
}

function formatMonth(value) {
  if (!value) return "this month";
  const [year, month] = value.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatDate(value) {
  if (!value) return "today";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
