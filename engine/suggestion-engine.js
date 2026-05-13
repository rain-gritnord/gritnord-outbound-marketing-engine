// LinkedIn post improvement suggestion engine
// Analyses scored posts, generates 3–5 specific actionable suggestions via Claude,
// stores them so Rain can accept (→ bakes into future post generation) or dismiss.

import Anthropic from '@anthropic-ai/sdk';
import { getLinkedInQueue, getLinkedInGuidelines } from './db.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Build a data summary Claude can reason over ───────────────────────────────

function buildPostSummary(scoredPosts) {
  return scoredPosts.map(p => ({
    date:     p.postedAt ? new Date(p.postedAt).toLocaleDateString('en-GB') : '?',
    topic:    p.article?.topic || 'unknown',
    source:   p.article?.source || 'unknown',
    score:    p.engagementScore,
    likes:    p.engagement?.likes    ?? 0,
    comments: p.engagement?.comments ?? 0,
    shares:   p.engagement?.shares   ?? 0,
    impressions: p.engagement?.impressions ?? null,
    // First 200 chars of post text as style signal
    opening:  (p.text || '').slice(0, 200).replace(/\n/g, ' '),
  }));
}

// ── Call Claude to generate suggestions ──────────────────────────────────────

export async function generateSuggestions() {
  const queue = getLinkedInQueue();
  const scored = queue.filter(p => p.status === 'posted' && p.engagementScoredAt);

  if (scored.length === 0) {
    return { suggestions: [], reason: 'No scored posts yet — suggestions available after first engagement pull' };
  }

  const existingGuidelines = getLinkedInGuidelines();
  const existingTitles = existingGuidelines.map(g => g.title).join(', ');

  const summary = buildPostSummary(scored);
  const avgScore = (scored.reduce((s, p) => s + (p.engagementScore || 0), 0) / scored.length).toFixed(1);

  const aiPosts  = scored.filter(p => p.article?.topic === 'ai');
  const gtmPosts = scored.filter(p => p.article?.topic === 'gtm');
  const avgAi    = aiPosts.length  ? (aiPosts.reduce((s, p)  => s + p.engagementScore, 0) / aiPosts.length).toFixed(1)  : null;
  const avgGtm   = gtmPosts.length ? (gtmPosts.reduce((s, p) => s + p.engagementScore, 0) / gtmPosts.length).toFixed(1) : null;

  const prompt = `You are a LinkedIn growth advisor for Rain, founder of Gritnord — a B2B lead generation platform.
Rain posts 3x/week (Mon/Wed/Fri). His audience: B2B founders, VP Sales, GTM leads.
His goal: more comments, reposts, and new followers from target ICP.

Here is Rain's LinkedIn post performance data (${scored.length} posts scored out of ${queue.filter(p=>p.status==='posted').length} total posted):

Overall avg score: ${avgScore}/10
AI topic posts avg: ${avgAi ?? 'not enough data'}/10 (${aiPosts.length} posts)
GTM/pipeline topic posts avg: ${avgGtm ?? 'not enough data'}/10 (${gtmPosts.length} posts)

Individual posts (newest first):
${JSON.stringify(summary, null, 2)}

${existingGuidelines.length > 0 ? `Already accepted improvements (don't repeat these): ${existingTitles}` : ''}

Generate 4–5 SPECIFIC, ACTIONABLE improvement suggestions. Each must be:
- Based on actual patterns in the data above (reference specific scores or posts)
- Immediately applicable to the next post
- Concrete enough that Rain can say "yes, do this" and it changes how posts are written

Format as a JSON array. Each item:
{
  "id": "sug_<short_slug>",
  "title": "Short title (max 8 words)",
  "insight": "What the data shows — 1 sentence",
  "action": "Exactly what to change in future posts — 1–2 sentences. Be specific.",
  "impact": "high" | "medium",
  "category": "hook" | "topic_mix" | "length" | "timing" | "cta" | "format"
}

Return ONLY the JSON array, no other text.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.content.find(b => b.type === 'text')?.text?.trim() ?? '[]';

  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const suggestions = JSON.parse(cleaned);
    return { suggestions, scoredCount: scored.length };
  } catch {
    console.error('[suggestions] Failed to parse Claude response:', cleaned.slice(0, 300));
    return { suggestions: [], reason: 'Parse error — try again' };
  }
}
