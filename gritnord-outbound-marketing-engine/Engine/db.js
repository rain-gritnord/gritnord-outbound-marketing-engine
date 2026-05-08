// engine/db.js
// Lightweight JSON-file database — no external DB required for deployment
// Swap readData/writeData for Postgres/Supabase/PlanetScale in production

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const CONTENT_FILE = path.join(DATA_DIR, "content.json");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const CYCLES_FILE = path.join(DATA_DIR, "cycles.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ── Content Store ──────────────────────────────────────────────────────────
function getAllContent() {
  return readJSON(CONTENT_FILE, []);
}

function saveContent(items) {
  const existing = getAllContent();
  const merged = [...existing, ...items];
  // Keep last 500 items
  writeJSON(CONTENT_FILE, merged.slice(-500));
  return items;
}

function updateContentItem(id, patch) {
  const all = getAllContent();
  const idx = all.findIndex(c => c.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  writeJSON(CONTENT_FILE, all);
  return all[idx];
}

function getContentById(id) {
  return getAllContent().find(c => c.id === id) || null;
}

function getScoredContent(limit = 100) {
  return getAllContent()
    .filter(c => c.score !== null && c.score !== undefined)
    .slice(-limit);
}

// ── Engine State (weights etc.) ───────────────────────────────────────────
function getState() {
  const { DEFAULT_WEIGHTS } = require("./generator");
  return readJSON(STATE_FILE, {
    weights: JSON.parse(JSON.stringify(DEFAULT_WEIGHTS)),
    lastCycleAt: null,
    nextCycleAt: null,
    totalGenerations: 0,
    totalCycles: 0,
    isRunning: false
  });
}

function saveState(patch) {
  const current = getState();
  const updated = { ...current, ...patch };
  writeJSON(STATE_FILE, updated);
  return updated;
}

// ── Learning Cycles Log ───────────────────────────────────────────────────
function getCycles() {
  return readJSON(CYCLES_FILE, []);
}

function saveCycle(cycleReport) {
  const cycles = getCycles();
  cycles.push({ ...cycleReport, ts: new Date().toISOString() });
  writeJSON(CYCLES_FILE, cycles.slice(-50)); // Keep last 50 cycles
}

// ── Simple ID generator ───────────────────────────────────────────────────
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = {
  getAllContent,
  saveContent,
  updateContentItem,
  getContentById,
  getScoredContent,
  getState,
  saveState,
  getCycles,
  saveCycle,
  generateId
};
