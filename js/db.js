// db.js
const DEFAULT_DB_NAME = "healthProgressTracker";
const DB_NAME =
  typeof window !== "undefined" && window.__DB_NAME_OVERRIDE__
    ? window.__DB_NAME_OVERRIDE__
    : DEFAULT_DB_NAME;
// ⬅️ bump version so onupgradeneeded runs and creates appSettings for old DBs
const DB_VERSION = 3;

let dbPromise;

export function initDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        ensureStore(database, "monthlyGoals", {
          keyPath: "id",
          autoIncrement: true,
        });
        ensureStore(database, "weeklyGoals", {
          keyPath: "id",
          autoIncrement: true,
        });
        ensureStore(database, "routineTasks", {
          keyPath: "id",
          autoIncrement: true,
        });
        ensureStore(database, "dailyEntries", { keyPath: "key" });
        ensureStore(database, "dailyTasks", {
          keyPath: "id",
          autoIncrement: true,
        });
        // ✅ this will now be created for everyone when version upgrades to 2
        ensureStore(database, "appSettings", { keyPath: "key" });
      };

      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
        };
        // If a required store is missing (e.g., stale DB), reset and reopen
        const requiredStores = ["monthlyGoals", "weeklyGoals", "routineTasks", "dailyEntries", "dailyTasks", "appSettings"];
        const missing = requiredStores.some((name) => !database.objectStoreNames.contains(name));
        if (missing) {
          database.close();
          indexedDB.deleteDatabase(DB_NAME).onsuccess = () => {
            dbPromise = null;
            resolve(initDB());
          };
          return;
        }
        resolve(database);
      };

      request.onerror = () => reject(request.error);
    });
  }

  return dbPromise;
}

export function getDB() {
  return initDB();
}

export function resetDB() {
  if (dbPromise) {
    dbPromise.then((db) => db?.close()).catch(() => {});
  }
  dbPromise = null;
}

function ensureStore(db, name, options) {
  if (!db.objectStoreNames.contains(name)) {
    db.createObjectStore(name, options);
  }
}
