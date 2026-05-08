// server.js
// Gritnord Autonomous Content Engine — Main Server
// Deploy to Railway, Render, Fly.io, or any Node.js host

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const Anthropic = require("@anthropic-ai/sdk");
const path = require("path");

const { generateContent, generateBatch, CHANNELS, ANGLES, TONES } = require("./engine/generator");
const { computeScore, updateWeights, generateLearningReport } = require("./engine/learner");
const db = require("./engine/db");

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error("❌ ANTHROPIC_API_KEY environment variable is required.");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

app.use(cors({
  origin: [
    "https://gritnord.com",
    "https://www.gritnord.com",
    /localhost/
  ]
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── API Routes ─────────────────────────────────────────────────────────────

/**
 * GET /api/status
 * Engine health + current state
 */
app.get("/api/status", (req, res) => {
  const state = db.getState();
  const allContent = db.getAllContent();
  const scored = db.getScoredContent();
  const cycles = db.getCycles();

  res.json({
    status: "running",
    engine: {
      lastCycleAt: state.lastCycleAt,
      nextCycleAt: state.nextCycleAt,
      totalGenerations: state.totalGenerations,
      totalCycles: state.totalCycles,
      isRunning: state.isRunning
    },
    content: {
      total: allContent.length,
      scored: scored.length,
      pending: allContent.filter(c => c.status === "pending").length
    },
    recentCycle: cycles[cycles.length - 1] || null,
    weights: state.weights
  });
});

/**
 * GET /api/content
 * List all generated content (paginated)
 */
app.get("/api/content", (req, res) => {
  const { channel, status, limit = 50, offset = 0 } = req.query;
  let content = db.getAllContent().reverse(); // newest first

  if (channel) content = content.filter(c => c.channel === channel);
  if (status) content = content.filter(c => c.status === status);

  res.json({
    total: content.length,
    items: content.slice(Number(offset), Number(offset) + Number(limit))
  });
});

/**
 * POST /api/generate
 * Generate a single content item on demand
 */
app.post("/api/generate", async (req, res) => {
  const { channel, topic, angle, tone } = req.body;

  if (!channel || !topic) {
    return res.status(400).json({ error: "channel and topic are required" });
  }

  try {
    const state = db.getState();
    const item = await generateContent({
      anthropic, channel, topic, angle, tone,
      weights: state.weights, db
    });
    item.id = db.generateId();
    item.status = "draft";
    db.saveContent([item]);
    db.saveState({ totalGenerations: state.totalGenerations + 1 });

    res.json(item);
  } catch (err) {
    console.error("Generate error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/score
 * Submit engagement data for a content item — triggers weight update
 */
app.post("/api/score/:id", (req, res) => {
  const { id } = req.params;
  const { engagementData, manualScore, status } = req.body;

  const item = db.getContentById(id);
  if (!item) return res.status(404).json({ error: "Content item not found" });

  const score = manualScore !== undefined
    ? Math.min(100, Math.max(0, Number(manualScore)))
    : computeScore(engagementData || {});

  const updated = db.updateContentItem(id, {
    score,
    engagementData: engagementData || item.engagementData,
    status: status || item.status,
    scoredAt: new Date().toISOString()
  });

  res.json(updated);
});

/**
 * PATCH /api/content/:id
 * Update content status (draft → approved → published)
 */
app.patch("/api/content/:id", (req, res) => {
  const updated = db.updateContentItem(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

/**
 * POST /api/cycle/run
 * Manually trigger a learning + generation cycle
 */
app.post("/api/cycle/run", async (req, res) => {
  const state = db.getState();
  if (state.isRunning) {
    return res.status(409).json({ error: "Cycle already running" });
  }

  res.json({ message: "Cycle started", cycleAt: new Date().toISOString() });
  runLearningCycle(); // async, don't await
});

/**
 * GET /api/cycles
 * History of learning cycles
 */
app.get("/api/cycles", (req, res) => {
  res.json(db.getCycles());
});

/**
 * GET /api/channels
 * Available channels
 */
app.get("/api/channels", (req, res) => {
  res.json(Object.entries(CHANNELS).map(([id, ch]) => ({ id, ...ch })));
});

/**
 * GET /api/options
 * Angles, tones etc for the dashboard
 */
app.get("/api/options", (req, res) => {
  res.json({ angles: ANGLES, tones: TONES });
});

// ── Learning Cycle ──────────────────────────────────────────────────────────

async function runLearningCycle() {
  console.log("\n🔄 Starting 12-hour learning cycle...", new Date().toISOString());
  db.saveState({ isRunning: true });

  try {
    const state = db.getState();
    const scoredItems = db.getScoredContent(200);

    // 1. Update weights based on past performance
    const oldWeights = state.weights;
    const newWeights = scoredItems.length >= 3
      ? updateWeights(oldWeights, scoredItems)
      : oldWeights;

    // 2. Generate a full batch of new content
    console.log("📝 Generating content batch...");
    const batch = await generateBatch({ anthropic, weights: newWeights, db });
    const batchWithIds = batch.map(item => ({
      ...item,
      id: db.generateId(),
      status: "pending",
      cycleGenerated: true
    }));
    db.saveContent(batchWithIds);

    // 3. Generate learning report
    const report = generateLearningReport(oldWeights, newWeights, scoredItems);

    // 4. Save cycle + update state
    const nextCycle = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    db.saveCycle({ report, itemsGenerated: batch.length, weightsUpdated: scoredItems.length >= 3 });
    db.saveState({
      weights: newWeights,
      lastCycleAt: new Date().toISOString(),
      nextCycleAt: nextCycle,
      totalCycles: state.totalCycles + 1,
      totalGenerations: state.totalGenerations + batch.length,
      isRunning: false
    });

    console.log(`✅ Cycle complete. Generated ${batch.length} items. Avg score: ${report.avgScore || "N/A"}/100`);
    report.insights.forEach(i => console.log(" →", i));

  } catch (err) {
    console.error("❌ Cycle failed:", err.message);
    db.saveState({ isRunning: false });
  }
}

// ── Scheduler: Every 12 hours ───────────────────────────────────────────────
// Runs at 06:00 and 18:00 UTC daily
cron.schedule("0 6,18 * * *", () => {
  runLearningCycle();
}, { timezone: "UTC" });

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Gritnord Content Engine running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔗 API: http://localhost:${PORT}/api/status`);
  console.log(`⏱  Next cycle: 06:00 or 18:00 UTC\n`);

  // Set next cycle time in state
  const state = db.getState();
  if (!state.nextCycleAt) {
    const now = new Date();
    const next = new Date();
    next.setUTCHours(now.getUTCHours() < 6 ? 6 : now.getUTCHours() < 18 ? 18 : 30, 0, 0, 0);
    db.saveState({ nextCycleAt: next.toISOString() });
  }
});
