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

  let mediaAsset = null;
  if (imageUrl) {
    try { mediaAsset = await uploadImageToLinkedIn(imageUrl, personUrn); } catch {}
  }

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
You are writing a LinkedIn post for Rain, founder of Gritnord — a B2B lead generation and GTM intelligence platform.
Audience: B2B founders, VP Sales, GTM leads, revenue operators. ~5,000 followers.
Benchmark: Rain's best post hit 110K impressions. Below is the exact structure and rules that drove it. Follow every rule without exception.

━━━ MANDATORY STRUCTURE (5 elements, in this order) ━━━

ELEMENT 1 — LINE 1: DATA BOMB
Two sentences. Both must contain a specific number or metric. The numbers must contradict each other and BOTH must be directly relevant to this article's specific topic.
✓ CORRECT: "Anthropic hit $31B ARR in 4 years. Salesforce took 19." — both numbers are about the same topic (ARR growth speed).
✓ CORRECT: "Enterprises waste 35% of cloud spend on idle resources. Greenpixie raised £4.7M to fix it." — both numbers are about the same situation.
✗ WRONG: "BirdyChat raised €1.7M. Slack solved internal. External is still broken." — three sentences, only one number.
✗ WRONG: "Most teams added AI in 2024. Almost none updated their contracts." — a year is not a metric.
✗ WRONG: Grabbing random famous numbers (Salesforce ARR, Tesla revenue) that have nothing to do with the article's topic. The numbers must come from or be directly relevant to this article's specific situation.
If the article does not contain two relevant confrontable numbers, say CANNOT_GENERATE and nothing else.

ELEMENT 2 — LINE 2: PATTERN INTERRUPT (mandatory)
Acknowledge the obvious conclusion, then flip it.
Template: "That sounds like [X]. And it is. But not for the reason most people think."
This line is not optional. Every post must have it.

ELEMENT 3 — PARAGRAPH 1: THE DEEPER MECHANISM (2–3 sentences)
Explain WHY it works at a structural level — lock-in, compounding, moat, timing.
Name a company Rain's ICP already knows and uses: Salesforce, HubSpot, AWS, Snowflake, Datadog, Gong, OpenAI, Anthropic, Microsoft, Google.
Do NOT use the startup from the article as the anchor name. Use it as supporting evidence only.
The 110K post named Salesforce — 18% of viewers were Salesforce employees who engaged because it was about their product.

ELEMENT 4 — PARAGRAPH 2: WHAT THE DATA DOESN'T SAY (2–3 sentences)
The counterintuitive insight the article missed. Rain's real-world B2B GTM angle: pipeline mechanics, founder-led sales, enterprise buying behavior. One sharp observation.

ELEMENT 5 — CLOSING QUESTION (1 sentence)
Force the reader — a VP Sales or founder — to evaluate their own business. Binary. Slightly uncomfortable. Both sides must feel valid.
Not "Thoughts?" or "What do you think?" — something that makes them pause.

━━━ FORMATTING RULES ━━━
- Short sentences. One idea per line. Empty line between every element.
- NO em dashes (—). Use a period or comma instead.
- NO emoji. NO bullet lists. NO numbered lists.
- Never open with "I", "We", "I'm excited", "Thrilled", "Great article".
- Tone: sharp, direct operator. Not a marketer. Not a guru.
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

  // If Claude signals the article has no confrontable numbers, reject it
  if (text.startsWith('CANNOT_GENERATE')) {
    throw new Error('CANNOT_GENERATE: article lacks two relevant confrontable numbers');
  }

  // Rule 1 validation: Line 1 must contain at least 2 distinct numbers/metrics.
  // A number is any digit sequence, optionally preceded by $£€ or followed by % B M K.
  // If only 1 found, regenerate once with an explicit correction instruction.
  const line1 = text.split('\n')[0] ?? '';
  const numbersInLine1 = line1.match(/[$£€]?\d[\d,.]*[BMK%]?/g) ?? [];
  if (numbersInLine1.length < 2) {
    console.log(`[poster] Rule 1 fail — Line 1 has ${numbersInLine1.length} number(s): "${line1}" — retrying`);
    const retryResponse = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `${prompt}

CRITICAL: Your previous attempt failed Rule 1. Line 1 was: "${line1}"
It contains only ${numbersInLine1.length} number(s). Rule 1 requires EXACTLY 2 sentences in Line 1, each with a specific number that contrasts the other.
Example: "Anthropic hit $31B ARR in 4 years. Salesforce took 19."
Rewrite the entire post now with a correct Line 1.`,
      }],
    });
    const retryText = retryResponse.content.find(b => b.type === 'text')?.text?.trim() ?? text;
    text = retryText.replace(/^(topic tag|scenario|category|type)\s*:\s*\S+\s*/i, '').trim();
    // Check CANNOT_GENERATE again after retry
    if (text.startsWith('CANNOT_GENERATE')) {
      throw new Error('CANNOT_GENERATE: article lacks two relevant confrontable numbers');
    }
  }

  // Enforce 860-char hard ceiling — Claude consistently ignores the prompt instruction.
  // If over limit, ask Claude to trim only the middle paragraphs, keeping Line 1, Line 2, and closing intact.
  if (text.length > 860) {
    console.log(`[poster] Post is ${text.length} chars — trimming to 860`);
    const trimResponse = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `This LinkedIn post is ${text.length} characters. Trim it to under 860 characters total (including spaces and hashtags).

STRICT RULES:
- Keep Line 1 (first two sentences with the data points) UNCHANGED.
- Keep Line 2 ("That sounds like..." or equivalent) UNCHANGED.
- Keep the closing question UNCHANGED.
- Only cut sentences from the middle paragraphs. Remove whole sentences, do not truncate mid-sentence.
- Output only the final post. No commentary.

POST:
${text}`,
      }],
    });
    const trimmed = trimResponse.content.find(b => b.type === 'text')?.text?.trim() ?? text;
    if (trimmed.length <= 860) text = trimmed;
    else text = text.slice(0, 857) + '...'; // last-resort hard cut
  }

  return text;
}
