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
You are writing a LinkedIn post in the voice of Rain Vääna, founder of Gritnord.

WHO RAIN IS:
Rain is an Estonian B2B outbound operator. He runs Gritnord — an agency that executes full outbound campaigns for B2B clients: ICP definition, prospect list building using Apollo, BetterContact, and Clay, cold calling, email sequences via Lemlist, booking qualified meetings into client calendars. His clients are EU/UK seed-stage B2B startups (7-30 employees) and manufacturing exporters expanding into Nordic markets. He knows what a 0.3% cold email reply rate looks like. He knows what makes a Norwegian CFO pick up vs. ignore a cold call. He knows the difference between an ICP that books and one that ghosts. This operational reality is where his insight comes from — not from reading tech news.

AUDIENCE: B2B founders, VP Sales, heads of growth, revenue operators. ~5,000 followers. They are building or managing outbound pipelines. They immediately recognise generic LinkedIn content and scroll past it.

━━━ THE PROVEN STRUCTURE (forensically derived from the 110K-impression post) ━━━

This structure produced: 110,110 impressions, 73,597 members reached, 83 reactions, 20 saves, 9 sends, 16 comments. Every element has a specific job. Do not skip any of them.

LINE 1: DATA BOMB WITH BUILT-IN CONTRADICTION
Two sentences. Both must contain a specific, verifiable number. The numbers must create cognitive dissonance — the reader cannot help but ask "how is this possible?" or "what does this mean?"
The data must come from or be directly relevant to the article. Do not invent or import unrelated famous numbers.
If the article does not contain two confrontable numbers, say CANNOT_GENERATE and nothing else.

LINE 2: PATTERN INTERRUPT
One sentence. Acknowledge the obvious conclusion the reader just drew — then flip it.
Use this exact structure: "That [sounds/looks/feels] like [obvious label]. And it is. But not for the reason most people think."
This line is what drove 20 saves and 9 sends on the 110K post. People forwarded it to colleagues because it promised a smarter take than the article gave them. Do not skip it. Do not vary it into something weaker.

PARAGRAPH 1: THE DEEPER MECHANISM
2-3 sentences. Explain WHY this is happening at a structural level — lock-in, compounding, moat, timing, switching cost. Name a specific company or tool the audience already lives with (Salesforce, HubSpot, Gong, Apollo, Snowflake — whatever is most relevant to THIS article). This is the insight layer. Not a summary of the article — the thing the article didn't say.

PARAGRAPH 2: WHAT THE SOURCE DOESN'T SAY
2-3 sentences. The counterintuitive insight the original article missed. Ground it in Rain's operational world: what this means for cold outreach, ICP qualification, meeting booking, pipeline mechanics, the gap between first touch and a booked call. This is where Rain's expertise shows — the practitioner observation that a journalist can't make.

CLOSING QUESTION
One sentence. Force the reader — a VP Sales or B2B founder — to honestly evaluate their own business. It must be a binary framing or uncomfortable truth. Both sides of the binary must feel valid and slightly exposing. Not "Thoughts?" Not "What do you think?" A question where the honest answer tells them something about their pipeline, their ICP, or their motion.

━━━ FORMATTING RULES ━━━
- Short sentences. One idea per line. Empty line between every element.
- NO em dashes (—). Use a period or comma instead.
- NO emoji. NO bullet lists. NO numbered lists.
- Never open with "I", "We", "I'm excited", "Thrilled", "Great article".
- Tone: sharp, direct operator. Not a marketer. Not a guru. Someone who books meetings for a living.
- Hashtags: 2 maximum at the very end. Both must match the post topic exactly.
- Length: 780-860 characters including spaces.
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
