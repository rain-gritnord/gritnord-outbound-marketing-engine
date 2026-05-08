// engine/learner.js
// Self-improving content strategy engine
// Runs every 12 hours, analyses performance, updates generation weights

const { DEFAULT_WEIGHTS } = require("./generator");

const LEARNING_RATE = 0.15;       // How fast weights shift per cycle
const EXPLORATION_RATE = 0.12;    // Probability of trying underweighted options
const MIN_WEIGHT = 0.3;           // Floor — nothing completely dropped
const MAX_WEIGHT = 3.5;           // Ceiling — prevent over-concentration
const MIN_SAMPLES_TO_LEARN = 3;   // Need at least this many scored items to adjust

/**
 * Score a single content item on a 0–100 scale.
 * In production: plug in real engagement data from LinkedIn API, Twitter API, etc.
 * Formula: weighted combination of engagement signals.
 */
function computeScore(engagementData) {
  const {
    impressions = 0,
    likes = 0,
    comments = 0,
    shares = 0,
    clicks = 0,
    replies = 0,
    reposts = 0,
    opens = 0,        // email
    ctr = 0,          // email click-through rate
    manualScore = null  // 0-100 override from dashboard
  } = engagementData;

  if (manualScore !== null) return Math.min(100, Math.max(0, manualScore));
  if (impressions === 0) return null; // No data yet

  // Engagement rate weighted by signal quality
  const engagementSignal =
    (likes * 1) +
    (comments * 4) +
    (shares * 6) +
    (clicks * 2) +
    (replies * 3) +
    (reposts * 5);

  const rate = impressions > 0 ? engagementSignal / impressions : 0;

  // Normalise to 0–100 (benchmark: 3% weighted engagement rate = 60/100)
  const normalised = Math.min(100, Math.round((rate / 0.05) * 100));

  // Email signals
  if (opens > 0 || ctr > 0) {
    const emailScore = Math.min(100, Math.round((opens * 0.3 + ctr * 100) * 2));
    return Math.round((normalised + emailScore) / 2);
  }

  return normalised;
}

/**
 * Adjust weights using exponential moving average toward high-performers.
 * High score → increase weight. Low score → decrease weight.
 * Exploration: occasionally boost low-weight options to prevent stagnation.
 */
function updateWeights(currentWeights, scoredItems) {
  const weights = JSON.parse(JSON.stringify(currentWeights));

  // Group scores by dimension
  const scores = {
    angles: {},
    tones: {},
    clusters: {},
    channels: {}
  };

  for (const item of scoredItems) {
    if (item.score === null || item.score === undefined) continue;
    const normalised = item.score / 100; // 0–1

    const dims = [
      ["angles", item.angle],
      ["tones", item.tone],
      ["clusters", item.cluster],
      ["channels", item.channel]
    ];

    for (const [dim, key] of dims) {
      if (!key) continue;
      if (!scores[dim][key]) scores[dim][key] = [];
      scores[dim][key].push(normalised);
    }
  }

  // Update each dimension
  for (const [dim, keyScores] of Object.entries(scores)) {
    for (const [key, vals] of Object.entries(keyScores)) {
      if (vals.length < MIN_SAMPLES_TO_LEARN) continue;

      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const current = weights[dim][key] || 1.0;

      // Move weight toward performance signal
      // avg > 0.5 → increase, avg < 0.5 → decrease
      const delta = (avg - 0.5) * 2 * LEARNING_RATE;
      const updated = Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, current + delta));
      weights[dim][key] = parseFloat(updated.toFixed(3));
    }
  }

  // Exploration: randomly boost the lowest-weighted item in each dimension
  if (Math.random() < EXPLORATION_RATE) {
    for (const dim of Object.keys(weights)) {
      const entries = Object.entries(weights[dim]);
      if (entries.length === 0) continue;
      const [lowestKey] = entries.sort((a, b) => a[1] - b[1])[0];
      weights[dim][lowestKey] = Math.min(
        MAX_WEIGHT,
        weights[dim][lowestKey] * 1.4
      );
    }
  }

  return weights;
}

/**
 * Generate a human-readable learning report for the dashboard
 */
function generateLearningReport(oldWeights, newWeights, scoredItems) {
  const insights = [];
  const scored = scoredItems.filter(i => i.score !== null);

  if (scored.length === 0) {
    return { insights: ["No scored content yet — add engagement data to enable learning."], topPerformers: [], recommendations: [] };
  }

  const avgScore = scored.reduce((s, i) => s + i.score, 0) / scored.length;
  insights.push(`Analysed ${scored.length} content items. Average score: ${Math.round(avgScore)}/100.`);

  // Best performing channel
  const byChannel = {};
  for (const item of scored) {
    if (!byChannel[item.channelLabel]) byChannel[item.channelLabel] = [];
    byChannel[item.channelLabel].push(item.score);
  }
  const channelAvgs = Object.entries(byChannel).map(([ch, scores]) => ({
    channel: ch,
    avg: scores.reduce((a, b) => a + b, 0) / scores.length
  })).sort((a, b) => b.avg - a.avg);

  if (channelAvgs[0]) {
    insights.push(`Best channel: ${channelAvgs[0].channel} (avg ${Math.round(channelAvgs[0].avg)}/100). Production increased.`);
  }

  // Weight changes
  const biggestGains = [];
  for (const [dim, keys] of Object.entries(newWeights)) {
    for (const [key, newVal] of Object.entries(keys)) {
      const oldVal = oldWeights[dim]?.[key] || 1.0;
      const change = newVal - oldVal;
      if (Math.abs(change) > 0.05) {
        biggestGains.push({ dim, key, change: parseFloat(change.toFixed(2)) });
      }
    }
  }

  biggestGains.sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 5).forEach(g => {
    const dir = g.change > 0 ? "↑ boosting" : "↓ reducing";
    insights.push(`${dir} "${g.key}" (${g.dim}): weight ${g.change > 0 ? "+" : ""}${g.change}`);
  });

  const topPerformers = [...scored].sort((a, b) => b.score - a.score).slice(0, 3);
  const recommendations = [];

  if (channelAvgs.length > 1 && channelAvgs[channelAvgs.length - 1].avg < 30) {
    recommendations.push(`Consider pausing ${channelAvgs[channelAvgs.length - 1].channel} — lowest ROI this cycle.`);
  }

  if (avgScore > 70) {
    recommendations.push("Strong performance — consider increasing publish frequency.");
  } else if (avgScore < 40) {
    recommendations.push("Low engagement — try more contrarian or data-backed angles.");
  }

  return { insights, topPerformers, recommendations, avgScore: Math.round(avgScore), cycleItemCount: scored.length };
}

module.exports = { computeScore, updateWeights, generateLearningReport, DEFAULT_WEIGHTS };
