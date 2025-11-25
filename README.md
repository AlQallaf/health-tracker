# Health Progress Tracker (PWA)

This repository hosts a fully offline-capable Health Progress Tracker built with vanilla HTML, CSS, and JavaScript. The app runs entirely in the browser, persisting data with IndexedDB and exposing a modular JS architecture under `js/`.

## Project Structure

```
index.html          # Minimal shell that loads the modules
css/
  style.css         # Global styles + AI/Planner widgets
js/
  app.js            # Main bootstrap & wiring of all modules
  db.js             # IndexedDB init + stores (dailyEntries, weeklyGoals, ...)
  daily.js          # Daily tasks CRUD
  weekly.js         # Weekly goals CRUD
  monthly.js        # Monthly goals + child weekly list
  routine.js        # Routine checklist storage + completions
  routineManager.js # Setup tab routine editor
  dataManager.js    # IndexedDB inspector/editor
  dayPlanner.js     # AI day planner modal & plan editor
  settings.js       # App settings store (Gemini API key)
  setup.js          # Setup tab logic (Gemini key form)
  ai/
    ui.js           # Floating AI panel (Health Coach)
    healthCoach.js  # Prompt builders + fallbacks
    chat.js         # Request queue
    modelLoader.js  # Gemini fetch wrapper (loads key from settings)
service-worker.js   # Offline cache + assets list
manifest.json       # PWA metadata
icons/              # PWA icons
```

## Current Features

1. **Daily Tab**
   - Routine checklist with daily completion stored per day.
   - Daily tasks list with inline add/delete and checkbox state.
   - **AI Day Planner** button: opens a modal to enter tasks/context, calls Gemini to get a JSON day plan in EN/AR, lets the user edit/approve/delete each proposed task, and converts approved ones into actual daily tasks.

2. **Weekly Tab**
   - Add/edit weekly goals with collapsible details.
   - Weekly reflection form can pull saved goals (filtered by month) and send them to Gemini for insights + optional task suggestions.

3. **Monthly Tab**
   - Displays saved monthly goals, their weekly children, and ties weekly additions to selected months.

4. **Setup Tab**
   - Routine manager.
   - Data maintenance inspector.
   - **Gemini API Configuration** card: save/test API key stored locally via IndexedDB (`appSettings` → `appConfig`).

5. **Floating AI Button**
   - Opens Health Coach panel (daily/weekly/monthly/motivation prompts) on any tab with EN/AR toggle.

6. **Offline Support**
   - Service worker caches CSS, JS, icons, AI modules, day planner, settings, etc. (`health-tracker-cache-v5`).

## Gemini API Key Flow

- Users enter their key on the Setup tab.
- `settings.js` saves `{ key: "appConfig", geminiApiKey: <value> }` in the `appSettings` store.
- `modelLoader.js` requests the key via `getGeminiKey()` and caches it; `setCachedGeminiKey()` refreshes the cache after saving.
- If the key is missing, Gemini calls throw a user-facing error instructing them to configure the key.

## Known Work Items / NEXT SESSION NOTES

1. **Weekly reflection improvements** (from previous request):
   - Ensure month filter always updates chips correctly (logic already added but should be verified on device).
   - Manual notes are now part of the AI prompt/fallback; confirm UX copy is final.

2. **Day Planner**
   - AR JSON output currently looks better after the latest prompt tweak, but we should test longer plans/edge cases.
   - Consider persisting AI plans per date if you want history.

3. **Testing Gemini Key**
   - The Setup “Test” button currently hits the list-models endpoint; on GitHub Pages, ensure CORS remains open (works in local testing).

4. **Deployment**
   - Once everything is stable, push `/MyHealth` contents to a GitHub Pages repo root. Ensure `service-worker.js` path remains `/service-worker.js`.

## How to Run Locally

1. Serve `MyHealth/` with any static server (e.g., `npx serve MyHealth`).
2. Open the site, go to the Setup tab, paste your Gemini API key, and hit Save (and optionally Test).
3. Use the floating AI button or AI Day Planner; the app will cache assets for offline use once loaded online.

## How to Continue in Next Session

- Review this README for architecture/context.
- Focus tasks: verify weekly reflection and day planner AR output, then proceed with any new features.
- Remember to always keep secrets out of the repo—keys live only in IndexedDB via the Setup UI.
