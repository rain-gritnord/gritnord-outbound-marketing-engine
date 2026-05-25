// LinkedIn OAuth + posting engine

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import path from 'path';
import { getLinkedInGuidelines } from './db.js';

// Store tokens in ~/.gritnord/ to avoid macOS Desktop folder TCC restrictions
const TOKEN_DIR = path.join(homedir(), '.gritnord');
const TOKEN_FILE = path.join(TOKEN_DIR, 'linkedin-tokens.json');
if (!existsSync(TOKEN_DIR)) mkdirSync(TOKEN_DIR, { recursive: true });

const CLIENT_ID     = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_URI  = process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:3000/auth/linkedin/callback';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Token storage ───────────────────────────────────────────────────────────

export function loadTokens() {
  if (!existsSync(TOKEN_FILE)) return null;
  try { return JSON.parse(readFileSync(TOKEN_FILE, 'utf-8')); } catch { return null; }
}

export function saveTokens(tokens) {
  writeFileSync(TOKEN_FILE, JSON.stringify({ ...tokens, savedAt: Date.now() }, null, 2));
}

export function isConnected() {
  const t = loadTokens();
  return !!(t?.access_token);
}

// ─── OAuth flow ──────────────────────────────────────────────────────────────

export function getAuthUrl() {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'openid profile w_member_social rw_ads r_ads',
    state: 'gritnord-linkedin',
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
}

export async function exchangeCode(code) {
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  const tokens = await res.json();
  saveTokens(tokens);
  return tokens;
}

async function getPersonUrn() {
  const { access_token } = loadTokens();
  const res = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!res.ok) throw new Error(`Profile fetch failed: ${await res.text()}`);
  const data = await res.json();
  return `urn:li:person:${data.sub}`;
}

// ─── Image upload ────────────────────────────────────────────────────────────

async function uploadImageToLinkedIn(imageUrl, personUrn) {
  const { access_token } = loadTokens();

  // 1. Register upload
  const registerRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: personUrn,
        serviceRelationships: [{
          relationshipType: 'OWNER',
          identifier: 'urn:li:userGeneratedContent',
        }],
      },
    }),
  });

  if (!registerRes.ok) return null;
  const { value } = await registerRes.json();
  const uploadUrl = value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
  const asset = value.asset;

  // 2. Fetch image bytes
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
  if (!imgRes.ok) return null;
  const imgBuffer = await imgRes.arrayBuffer();

  // 3. Upload
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'image/jpeg' },
    body: imgBuffer,
  });

  return uploadRes.ok ? asset : null;
}

// ─── Post to LinkedIn ────────────────────────────────────────────────────────

export async function postToLinkedIn({ text, imageUrl }) {
  const tokens = loadTokens();
  if (!tokens?.access_token) throw new Error('LinkedIn not connected');

  const personUrn = await getPersonUrn();

  // Do not upload images — LinkedIn's native link preview (from the URL in post text)
  // always produces a cleaner result than manually uploaded OG image thumbnails.
  const mediaAsset = null;

  const body = {
    author: personUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: mediaAsset ? 'IMAGE' : 'NONE',
        ...(mediaAsset ? {
          media: [{
            status: 'READY',
            description: { text: '' },
            media: mediaAsset,
          }],
        } : {}),
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`LinkedIn post failed: ${await res.text()}`);
  const data = await res.json();
  return { id: data.id, url: `https://www.linkedin.com/feed/update/${data.id}/` };
}

// ─── Post generation ─────────────────────────────────────────────────────────

const POST_PROMPT = `
You are writing a LinkedIn post for Rain, founder of Gritnord — an AI-powered B2B meeting booking engine.
Rain books qualified meetings between B2B companies and their dream customers. Founder-led sales, pipeline mechanics, and enterprise GTM are Rain's daily reality.
Audience: B2B founders, VP Sales, GTM leads, revenue operators running outbound. ~5,000 followers.
Benchmark: Rain's best post hit 110K impressions. Below is the exact structure that drove it. Follow every rule precisely.

━━━ MANDATORY STRUCTURE (5 elements, in this order) ━━━

ELEMENT 1 — LINE 1: DATA BOMB
Two sentences. Both must contain a specific number, percentage, ratio, or time metric. The two numbers must create a tension or contrast — they must both be directly about this article's specific topic.
✓ CORRECT: "Anthropic hit $31B ARR in 4 years. Salesforce took 19." — same topic, contrasting timelines.
✓ CORRECT: "Enterprises waste 35% of cloud spend on idle resources. Greenpixie raised £4.7M to fix it." — problem scale + response.
✓ CORRECT: "Win rates drop 40% when sales cycles exceed 90 days. Most B2B cycles now average 4 months." — same metric, two expressions of the same problem.
✗ WRONG: Three sentences. Only one number. Grabbing unrelated famous numbers (Tesla revenue) for drama when they have nothing to do with the article.
✗ WRONG: A year alone ("in 2024") is not a metric — pair it with a concrete change: "2024 saw 3x more outbound volume and 40% lower reply rates."
If the article does not have two confrontable numbers relevant to its specific topic, say CANNOT_GENERATE and nothing else.

ELEMENT 2 — LINE 2: PATTERN INTERRUPT (mandatory, pick one style that fits the article)
Acknowledge the obvious conclusion, then flip it. Choose whichever template creates the sharpest flip for this specific article:

Option A: "That sounds like [obvious label]. And it is. But not for the reason most people think."
Option B: "Everyone saw [the obvious takeaway]. Most missed what it actually means for [specific audience]."
Option C: "The headline says [X]. The real story is [Y]."

Do NOT copy-paste the template — write it out for this specific article. The flip must be genuine, not generic.

ELEMENT 3 — PARAGRAPH 1: THE DEEPER MECHANISM (2–3 sentences)
Explain WHY the thing in the article works (or fails) at a structural level — lock-in, compounding, timing, switching cost, feedback loops.
Anchor the mechanism to something Rain's ICP already lives with: a tool (Salesforce, HubSpot, Gong, Apollo, LinkedIn Sales Nav), a motion (founder-led sales, PLG, outbound sequencing), or a well-known dynamic (pipeline decay, champion turnover, committee buying). Pick whatever is most relevant to THIS article — do not default to the same company every post.

ELEMENT 4 — PARAGRAPH 2: WHAT THE DATA DOESN'T SAY (2–3 sentences)
The counterintuitive insight the article missed or understated.
Ground it in Rain's specific world: getting meetings booked, warming cold prospects, ICP qualification, outbound reply rates, meeting-to-pipeline conversion, the gap between interest and a booked call. This is where Rain's expertise shows — not generic insight, but the thing a practitioner sees that journalists miss.

ELEMENT 5 — CLOSING QUESTION (1 sentence)
Force the reader — a VP Sales or B2B founder — to assess their own situation. Binary framing. Slightly uncomfortable because both options reveal something real.
Not "Thoughts?" — a question where the honest answer tells them something about their business.
Examples of the right feel: "Is your pipeline built on relationships or on volume you hope converts?" / "Are you optimising the meeting or the follow-up after it?" / "When did you last win a deal where the first touch wasn't a cold outreach?"
Write a NEW question relevant to this article — do not reuse these examples.

━━━ FORMATTING RULES ━━━
- Short sentences. One idea per line. Empty line between every element.
- NO em dashes (—). Use a period or comma instead.
- NO emoji. NO bullet lists. NO numbered lists.
- Never open with "I", "We", "I'm excited", "Thrilled", "Great article".
- Tone: sharp, direct operator. Someone who books meetings for a living and has seen what works. Not a marketer. Not a guru.
- Hashtags: 2 maximum at the very end. Often better with none.
- Length: 780–860 characters including spaces. The 110K post was 806 chars.
`;


export async function generateLinkedInPost({ article, postType = 'reshare', additionalContext = '' }) {
  // Pull any accepted improvement guidelines and inject them
  const guidelines = getLinkedInGuidelines();
  const guidelineBlock = guidelines.length > 0
    ? `\nACCEPTED IMPROVEMENT RULES (apply every post — Rain approved these based on real engagement data):\n${guidelines.map((g, i) => `${i + 1}. ${g.title}: ${g.action}`).join('\n')}\n`
    : '';

  const articleBlock = postType === 'reshare'
    ? `ARTICLE:\nTitle: ${article.title}\nSource: ${article.source}\nSummary: ${article.description}`
    : `TOPIC: "${article.title}"`;

  const prompt = `${POST_PROMPT}
${guidelineBlock}
${articleBlock}
${additionalContext ? `\nANGLE: ${additionalContext}` : ''}

Output only the post text. No title, no intro, no meta-commentary. No "Topic tag:" prefix.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  let text = response.content.find(b => b.type === 'text')?.text?.trim() ?? '';
  // Strip any "Topic tag: X" or "Scenario: X" prefix Claude occasionally adds
  text = text.replace(/^(topic tag|scenario|category|type)\s*:\s*\S+\s*/i, '').trim();

  // Soft signal: if Claude says the article lacks confrontable numbers, flag for review
  // but still return the text so Rain can decide — not a hard block
  if (text.startsWith('CANNOT_GENERATE')) {
    console.warn('[poster] CANNOT_GENERATE signal — article may lack confrontable numbers. Skipping.');
    throw new Error('CANNOT_GENERATE: article lacks two relevant confrontable numbers');
  }

  // Log Rule 1 status for Rain's awareness — no retry, no hard block
  const line1 = text.split('\n')[0] ?? '';
  const numbersInLine1 = line1.match(/[$£€]?\d[\d,.]*[BMK%]?/g) ?? [];
  if (numbersInLine1.length < 2) {
    console.warn(`[poster] Rule 1 advisory — Line 1 has ${numbersInLine1.length} number(s): "${line1}" — Rain reviews before posting`);
  }

  // Log character count — no auto-trim, Rain reviews in the approval queue
  if (text.length > 860) {
    console.warn(`[poster] Post is ${text.length} chars (target: 780-860) — review before posting`);
  }

  return text;
}
