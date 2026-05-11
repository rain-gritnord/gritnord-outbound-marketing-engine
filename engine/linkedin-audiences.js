// LinkedIn Matched Audiences sync
// Uploads UC candidate emails to a LinkedIn DMP segment (Customer Match list)
// LinkedIn then automatically builds a lookalike audience from the seed list
//
// Setup (one-time):
//   1. Add rw_ads + r_ads scopes to your LinkedIn app in developer portal
//   2. Re-connect LinkedIn in the dashboard to get a token with the new scopes
//   3. Set LINKEDIN_AD_ACCOUNT_ID in .env (from Campaign Manager URL: /campaignManager/accounts/{ID})
//   4. Run the engine once — it will auto-create the segment and store LINKEDIN_AUDIENCE_SEGMENT_ID
//
// Docs: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/matched-audiences/matched-audiences

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const SEGMENT_FILE = path.join(__dir, '..', 'data', 'linkedin-audience-segment.json');

const AD_ACCOUNT_ID = process.env.LINKEDIN_AD_ACCOUNT_ID;
const TOKEN_FILE    = path.join(__dir, '..', 'data', 'linkedin-tokens.json');

function getAccessToken() {
  if (!existsSync(TOKEN_FILE)) return null;
  try { return JSON.parse(readFileSync(TOKEN_FILE, 'utf-8'))?.access_token; } catch { return null; }
}

function sha256(email) {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

function loadSegmentId() {
  if (!existsSync(SEGMENT_FILE)) return null;
  try { return JSON.parse(readFileSync(SEGMENT_FILE, 'utf-8'))?.segmentId; } catch { return null; }
}

function saveSegmentId(segmentId) {
  writeFileSync(SEGMENT_FILE, JSON.stringify({ segmentId, updatedAt: new Date().toISOString() }, null, 2));
}

// ─── Create segment (runs once on first sync) ─────────────────────────────────

async function createDmpSegment(accessToken) {
  const res = await fetch('https://api.linkedin.com/v2/dmpSegments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': '202401',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      name: 'Gritnord UC Candidates',
      type: 'LIST_BASED',
      sourcePlatform: 'ONLINE',
      adAccount: `urn:li:sponsoredAccount:${AD_ACCOUNT_ID}`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LinkedIn create segment failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const segmentId = data.id;
  saveSegmentId(segmentId);
  console.log(`[li-audience] Created DMP segment: ${segmentId}`);
  return segmentId;
}

// ─── Add emails to segment ────────────────────────────────────────────────────

async function addEmailsToSegment(segmentId, emails, accessToken) {
  const elements = emails
    .filter(e => e && e.includes('@'))
    .map(email => ({
      action: 'ADD',
      userIds: [{ idType: 'SHA256_EMAIL', idValue: sha256(email) }],
    }));

  if (elements.length === 0) return { added: 0 };

  const res = await fetch(`https://api.linkedin.com/v2/dmpSegments/${segmentId}/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': '202401',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({ elements }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LinkedIn add users failed (${res.status}): ${body}`);
  }

  console.log(`[li-audience] Added ${elements.length} email(s) to segment ${segmentId}`);
  return { added: elements.length, segmentId };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function syncEmailsToLinkedInAudience(emails) {
  const accessToken = getAccessToken();

  if (!accessToken) {
    return { skipped: true, reason: 'LinkedIn not connected — reconnect LinkedIn in the dashboard' };
  }
  if (!AD_ACCOUNT_ID) {
    return { skipped: true, reason: 'LINKEDIN_AD_ACCOUNT_ID not set in .env' };
  }

  let segmentId = loadSegmentId();
  if (!segmentId) {
    segmentId = await createDmpSegment(accessToken);
  }

  return addEmailsToSegment(segmentId, emails, accessToken);
}

// Sync a single candidate email — called automatically after research
export async function syncCandidateToAudience(candidate) {
  if (!candidate.email) return { skipped: true, reason: 'No email on candidate' };
  try {
    const result = await syncEmailsToLinkedInAudience([candidate.email]);
    console.log(`[li-audience] Synced ${candidate.firstName} ${candidate.lastName} (${candidate.email})`);
    return result;
  } catch (err) {
    console.error(`[li-audience] Sync failed for ${candidate.email}: ${err.message}`);
    return { error: err.message, email: candidate.email };
  }
}
