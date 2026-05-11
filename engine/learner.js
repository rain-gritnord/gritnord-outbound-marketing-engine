import { getWeights, saveWeights } from './db.js';

const CHANNELS = [
  'linkedin', 'twitter', 'seo_blog', 'ai_search',
  'newsletter', 'cold_outreach', 'press_release', 'partnership_pitch',
];

// Update weights after a piece is scored
export function recordScore(channel, score) {
  const weights = getWeights();
  if (!weights[channel]) return;

  const w = weights[channel];
  const alpha = 0.2; // learning rate

  // Rolling average score
  w.avgScore = w.avgScore * (1 - alpha) + score * alpha;

  // Success = score above 6
  const success = score >= 6 ? 1 : 0;
  w.successRate = w.successRate * (1 - alpha) + success * alpha;

  // Priority: channels with higher success rate and score get boosted
  w.priority = 0.3 + (w.successRate * 0.4) + ((w.avgScore / 10) * 0.3);
  w.priority = Math.max(0.1, Math.min(2.0, w.priority));

  weights[channel] = w;
  saveWeights(weights);
  return weights;
}

// Get channels sorted by priority (for cycle scheduling)
export function getPrioritizedChannels() {
  const weights = getWeights();
  return CHANNELS
    .map(ch => ({ channel: ch, ...weights[ch] }))
    .sort((a, b) => b.priority - a.priority);
}

// Get a summary of learning state
export function getLearningState() {
  const weights = getWeights();
  return CHANNELS.map(ch => ({
    channel: ch,
    priority:    parseFloat(weights[ch]?.priority?.toFixed(3) ?? '1.000'),
    successRate: parseFloat(weights[ch]?.successRate?.toFixed(3) ?? '0.500'),
    avgScore:    parseFloat(weights[ch]?.avgScore?.toFixed(2) ?? '5.00'),
  }));
}
