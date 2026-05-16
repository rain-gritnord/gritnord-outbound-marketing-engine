// LinkedIn post engagement fetcher + learning feedback loop
// Runs 48–72h after a post is published, pulls real likes/comments/shares,
// converts to a score, and feeds it into the channel learner.

import { loadTokens } from './linkedin-poster.js';
import { getLinkedInQueue, updateLinkedInPost, recordFollowerCount, getFollowerHistory } from './db.js';
import { recordScore } from './learner.js';

const MIN_AGE_MS  = 48 * 60 * 60 * 1000; // 48 hours
const MAX_AGE_MS  = 14 * 24 * 60 * 60 * 1000; // 14 days — stop trying after this

// ── Fetch engagement from LinkedIn Social Actions API ────────────────────────

async function fetchEngagement(postUrn) {
  const tokens = loadTokens();
  if (!tokens?.access_token) throw new Error('LinkedIn not connected');

  const headers = {
    Authorization: `Bearer ${tokens.access_token}`,
    'X-Restli-Protocol-Version': '2.0.0',
    'LinkedIn-Version': '202406',
  };

    // ── Attempt 1: versioned REST API /rest/posts/{urn} ──────────────────────
  // Requires Marketing Developer Platform (partner) access — tested 202502–202505
  const shareUrn    = postUrn.startsWith('urn:li:share:') ? postUrn : null;
  const encodedShare = shareUrn ? encodeURIComponent(shareUrn) : null;

  if (encodedShare) {
    // Try the two active version months
    for (const ver of ['202505', '202503', '202502']) {
      const r1 = await fetch(
        `https://api.linkedin.com/rest/posts/${encodedShare}`,
        { headers: { ...headers, 'LinkedIn-Version': ver } }
      );
      if (r1.ok) {
        const d = await r1.json();
        const s = d.totalSocialActivityCounts ?? {};
        console.log(`[engagement] REST API (${ver}) success for ${postUrn}`);
        return {
          likes:       s.numLikes        ?? 0,
          comments:    s.numComments     ?? 0,
          shares:      s.numShares       ?? 0,
          impressions: s.numImpressions  ?? null,
          clicks:      s.numClicks       ?? null,
        };
      }
      if (r1.status === 426) break; // version not active — stop cycling
    }
  }

  // ── Attempt 2: versioned memberPostStatistics ──────────────────────────────
  if (encodedShare) {
    const r2 = await fetch(
      `https://api.linkedin.com/rest/memberPostStatistics?q=post&post=${encodedShare}`,
      { headers: { ...headers, 'LinkedIn-Version': '202505' } }
    );
    if (r2.ok) {
      const d = await r2.json();
      const s = d.elements?.[0]?.totalShareStatistics ?? {};
      console.log(`[engagement] memberPostStatistics success for ${postUrn}`);
      return {
        likes:       s.likeCount        ?? 0,
        comments:    s.commentCount     ?? 0,
        shares:      s.shareCount       ?? 0,
        impressions: s.impressionCount  ?? null,
        clicks:      s.clickCount       ?? null,
      };
    }
  }

  // ── Attempt 3: legacy ugcPosts (share → ugcPost URN conversion) ────────────
  const ugcUrn     = postUrn.startsWith('urn:li:share:')
    ? `urn:li:ugcPost:${postUrn.replace('urn:li:share:','')}`
    : postUrn;
  const encodedUgc = encodeURIComponent(ugcUrn);

  const r3 = await fetch(
    `https://api.linkedin.com/v2/ugcPosts/${encodedUgc}`,
    { headers: { Authorization: `Bearer ${tokens.access_token}`, 'X-Restli-Protocol-Version': '2.0.0' } }
  );
  if (r3.ok) {
    const d = await r3.json();
    const s = d.specificContent?.['com.linkedin.ugc.ShareContent']
      ?.shareStatistics?.totalShareStatistics ?? {};
    console.log(`[engagement] ugcPosts success for ${postUrn}`);
    return {
      likes:       s.likeCount       ?? 0,
      comments:    s.commentCount    ?? 0,
      shares:      s.shareCount      ?? 0,
      impressions: s.impressionCount ?? null,
      clicks:      s.clickCount      ?? null,
    };
  }

  // ── All endpoints blocked: LinkedIn requires Marketing Developer Platform ──
  // This is a known LinkedIn restriction — post stats need partner API access.
  // The Playwright scraper (engine/linkedin-scraper.js) is the automated workaround.
  console.log(`[engagement] All API endpoints blocked for ${postUrn} — marking as api-blocked`);
  throw new Error('api-blocked');
}

// ── Fetch follower count for Rain's personal profile ─────────────────────────

export async function fetchFollowerCount() {
  const tokens = loadTokens();
  if (!tokens?.access_token) return null;

  try {
    // Get person URN first
    const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileRes.ok) return null;
    const profile = await profileRes.json();
    const personUrn = encodeURIComponent(`urn:li:person:${profile.sub}`);

    // Follower count via networkSizes
    const res = await fetch(
      `https://api.linkedin.com/v2/networkSizes/${personUrn}?edgeType=CompanyFollowedByMember`,
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const count = data.firstDegreeSize ?? data.followerCount ?? null;
    if (count !== null) recordFollowerCount(count);
    return count;
  } catch {
    return null;
  }
}

// ── Convert engagement metrics into a learning score (1–10) ─────────────────
// Impressions = reach signal (primary — most reliable metric we can get)
// Comments = genuine interest (2pt each, capped at 4)
// Likes = passive approval (0.4pt each, capped at 2)
// Shares = amplification (3pt each, capped at 2)
// Impression benchmarks for Rain's ~5k follower account:
//   <500 = very low (1pt), 500-2k = below avg (2pt), 2k-8k = average (3pt)
//   8k-20k = good (4pt), 20k-50k = great (5pt), 50k+ = viral (6pt)

// Calibrated for a ~5k follower account (Rain's current size).
// Impressions are the primary signal — everything else adds on top.
// Tiers: <300 terrible | 300-1k low | 1k-5k average | 5k-15k good | 15k-40k great | 40k+ viral
export function engagementToScore({ likes = 0, comments = 0, shares = 0, impressions = null }) {
  let impScore = 3; // default when no impressions data
  if (impressions != null) {
    if      (impressions >= 40000) impScore = 8;
    else if (impressions >= 15000) impScore = 6.5;
    else if (impressions >= 5000)  impScore = 5;
    else if (impressions >= 1000)  impScore = 3.5;
    else if (impressions >= 300)   impScore = 2;
    else                           impScore = 1;
  }

  const raw = impScore
    + Math.min(comments * 2,   3)   // up to +3 from comments (strongest signal)
    + Math.min(likes    * 0.3, 1.5) // up to +1.5 from likes
    + Math.min(shares   * 2,   1.5);// up to +1.5 from shares

  return Math.min(10, Math.max(1, Math.round(raw * 10) / 10));
}

// ── Main: check all published posts, fetch those ready for scoring ───────────

export async function fetchAndLearnFromEngagement() {
  const queue = getLinkedInQueue();
  const now = Date.now();
  const ready = queue.filter(p => {
    if (p.status !== 'posted') return false;
    if (p.engagementScoredAt) return false;  // already done
    if (p.engagementBlocked) return false;   // API blocked — scraper handles these
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

      console.log(`[engagement] ${post.id}: likes=${metrics.likes} comments=${metrics.comments} shares=${metrics.shares} impressions=${metrics.impressions ?? '?'} → score=${score}`);

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
      if (err.message === 'api-blocked') {
        // Mark as blocked so we don't retry; the scraper will handle these
        updateLinkedInPost(post.id, {
          engagementBlocked: true,
          engagementBlockedAt: new Date().toISOString(),
        });
      } else {
        console.error(`[engagement] Failed for ${post.id}:`, err.message);
      }
    }
  }

  console.log(`[engagement] Scored ${results.length} post(s)`);
  return results;
}
