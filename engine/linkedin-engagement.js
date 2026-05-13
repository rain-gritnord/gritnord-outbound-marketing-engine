// LinkedIn post engagement fetcher + learning feedback loop
// Runs 48–72h after a post is published, pulls real likes/comments/shares,
// converts to a score, and feeds it into the channel learner.

import { loadTokens } from './linkedin-poster.js';
import { getLinkedInQueue, updateLinkedInPost } from './db.js';
import { recordScore } from './learner.js';

const MIN_AGE_MS  = 48 * 60 * 60 * 1000; // 48 hours
const MAX_AGE_MS  = 14 * 24 * 60 * 60 * 1000; // 14 days — stop trying after this

// ── Fetch engagement from LinkedIn Social Actions API ────────────────────────

async function fetchEngagement(postUrn) {
  const tokens = loadTokens();
  if (!tokens?.access_token) throw new Error('LinkedIn not connected');

  // Try ugcPosts endpoint which returns share statistics inline
  const encodedUrn = encodeURIComponent(postUrn);
  const res = await fetch(
    `https://api.linkedin.com/v2/ugcPosts/${encodedUrn}`,
    {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    }
  );

  if (!res.ok) {
    // Fallback: try socialActions endpoint
    const res2 = await fetch(
      `https://api.linkedin.com/v2/socialActions/${encodedUrn}`,
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );
    if (!res2.ok) throw new Error(`LinkedIn API ${res2.status}: ${await res2.text()}`);
    const data2 = await res2.json();
    return {
      likes:    data2.likeCount    ?? 0,
      comments: data2.commentCount ?? 0,
      shares:   data2.shareCount   ?? 0,
    };
  }

  const data = await res.json();
  const stats = data.specificContent?.['com.linkedin.ugc.ShareContent']
    ?.shareStatistics?.totalShareStatistics ?? {};

  return {
    likes:    stats.likeCount    ?? 0,
    comments: stats.commentCount ?? 0,
    shares:   stats.shareCount   ?? 0,
  };
}

// ── Convert engagement metrics into a learning score (1–10) ─────────────────
// Comments signal genuine interest (2pt each)
// Likes are passive approval (0.4pt each, capped)
// Shares amplify reach (3pt each)

function engagementToScore({ likes, comments, shares }) {
  const raw = 3                          // baseline: published = decent
    + Math.min(likes * 0.4, 3)           // up to +3 from likes (capped at ~7 likes)
    + Math.min(comments * 2, 4)          // up to +4 from comments (2 comments = max)
    + Math.min(shares * 3, 2);           // up to +2 from shares

  return Math.min(10, Math.max(1, Math.round(raw * 10) / 10));
}

// ── Main: check all published posts, fetch those ready for scoring ───────────

export async function fetchAndLearnFromEngagement() {
  const queue = getLinkedInQueue();
  const now = Date.now();
  const ready = queue.filter(p => {
    if (p.status !== 'posted') return false;
    if (p.engagementScoredAt) return false; // already done
    if (!p.postedAt) return false;
    const age = now - new Date(p.postedAt).getTime();
    return age >= MIN_AGE_MS && age <= MAX_AGE_MS;
  });

  if (ready.length === 0) {
    console.log('[engagement] No posts ready for engagement scoring');
    return [];
  }

  const results = [];

  for (const post of ready) {
    try {
      const postUrn = post.linkedInId;
      if (!postUrn) continue;

      console.log(`[engagement] Fetching metrics for: ${postUrn}`);
      const metrics = await fetchEngagement(postUrn);
      const score = engagementToScore(metrics);

      console.log(`[engagement] ${post.id}: likes=${metrics.likes} comments=${metrics.comments} shares=${metrics.shares} → score=${score}`);

      // Feed into learner
      recordScore('linkedin', score);

      // Mark post as scored, store raw metrics
      updateLinkedInPost(post.id, {
        engagement: metrics,
        engagementScore: score,
        engagementScoredAt: new Date().toISOString(),
      });

      results.push({ id: post.id, metrics, score });
    } catch (err) {
      console.error(`[engagement] Failed for ${post.id}:`, err.message);
    }
  }

  console.log(`[engagement] Scored ${results.length} post(s)`);
  return results;
}
