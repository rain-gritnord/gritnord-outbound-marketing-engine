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

const RAIN_CONTEXT = `
You are writing LinkedIn posts for Rain, founder of Gritnord — a B2B lead generation and GTM intelligence platform.
His audience: B2B founders, VP Sales, GTM leads, revenue operators. ~5,000 followers.
Target: 50,000+ impressions per post. Benchmark: Rain's best post hit 110,110 impressions, 73,597 members reached, 83 reactions, 16 comments, 20 saves. Here is exactly why it worked — apply every mechanism below.

THE 7 MECHANISMS THAT DROVE 110K IMPRESSIONS (forensically verified):

1. LINE 1 IS A DATA BOMB WITH A BUILT-IN CONTRADICTION.
"Anthropic hit $31B ARR in 4 years. Salesforce took 19."
One sentence. One real verifiable fact. One cognitive dissonance. Forces the reader to ask "how is this possible?" — which drives the "See more" click. The numbers must be real, specific, and sourced from the article. No vague claims. Two data points in contrast, two short sentences.

2. LINE 2 DEFUSES THE OBVIOUS INTERPRETATION — THEN FLIPS IT.
"That stat sounds like a paradigm shift. And it is. But not for the reason most people think."
This pattern interrupt is what drove 20 saves and 9 sends. It promises the reader a smarter take than the original article. It signals: I've thought about this more deeply than you have. Use this exact move or a close variant every post.

3. PARAGRAPH 1: THE DEEPER MECHANISM, NOT THE SURFACE READING.
Name a specific company, product, or structural dynamic. Explain WHY it works at a systems level — workflow lock-in, compounding, moat, durability. Never write "many companies struggle with this." Write the one thing the article missed.

4. PARAGRAPH 2: WHAT THE DATA DOESN'T SAY.
The counterintuitive insight. The thing the original source got wrong or left out. This is Rain's real-world B2B GTM perspective — pipeline mechanics, founder-led sales, enterprise buying behavior. One sharp observation, 2-3 sentences max.

5. THE CLOSING QUESTION IS ICP-SPECIFIC AND UNCOMFORTABLE.
"Are you building something people depend on, or something they're still figuring out how to use?"
Not "Thoughts?" Not "What do you think?" Force the reader — a founder or revenue leader — to evaluate their own business honestly. Slightly uncomfortable = people answer in their head (dwell time) or publicly (comments). Both sides of the question must feel valid to someone.

6. NAME THE COMPANIES THE ICP CARES ABOUT.
The 110K post named Salesforce, Anthropic, OpenAI — the exact enterprise SaaS stack Rain's ICP uses daily. Salesforce employees saw a post about their product and engaged. 18% of all viewers were Salesforce employees. Name specific companies from the article — not to promote them, but because their employees and customers are Rain's audience.

7. RAIN'S PERSPECTIVE IS THE PRODUCT.
The article is raw material. Rain's reframe is the value. Never summarize the article. Never promote the source. Use the data as evidence for Rain's insight, which must be valuable even if the reader has never heard of the company in the article.
`;

const POST_STYLE_RULES = `
STRUCTURE — follow this exact sequence (proven by the 110K post):

LINE 1: [Real data point from article]. [Benchmark or contrast in one sentence.]
Two short sentences. Both must be specific numbers. No adjectives, no fluff.

LINE 2: That [sounds/looks/feels] like [obvious conclusion]. And it is. But not for the reason most people think.
(Or a close variant that promises a non-obvious take. This line is mandatory.)

PARAGRAPH 1 (2-3 sentences): The deeper mechanism. WHY it works structurally. Name a specific company or dynamic.

PARAGRAPH 2 (2-3 sentences): What the data doesn't say. Rain's real-world GTM angle. The thing the article missed.

CLOSING QUESTION (1 sentence): Force the ICP to evaluate their own business. Uncomfortable. Binary. ICP-specific.
Not "What do you think?" — something that makes a VP Sales or founder pause.

HASHTAGS: 2 max at the very end. Both must match the exact topic. Often better with none.

FORMATTING RULES:
- Short sentences. One idea per line. Generous white space between paragraphs.
- NO em dashes. NO emoji bullets. NO numbered lists. NO "🔥 Top 5 things".
- Never start with "I'm excited", "Thrilled", "Great article", "Just read".
- Sound like a sharp, direct operator. Not a marketer. Not a guru.
- Total length: 780–860 characters including spaces. The 110K post was 806 chars. Cut ruthlessly if over 860.
- Write in first person but make it about the insight, not about Rain.
`;


export async function generateLinkedInPost({ article, postType = 'reshare', additionalContext = '' }) {
  // Pull any accepted improvement guidelines and inject them
  const guidelines = getLinkedInGuidelines();
  const guidelineBlock = guidelines.length > 0
    ? `\nACCEPTED IMPROVEMENT RULES (apply every post — Rain approved these based on real engagement data):\n${guidelines.map((g, i) => `${i + 1}. ${g.title}: ${g.action}`).join('\n')}\n`
    : '';

  let prompt = '';

  if (postType === 'reshare') {
    prompt = `${RAIN_CONTEXT}

Write a LinkedIn post sharing this article with Rain's perspective:

Title: ${article.title}
Source: ${article.source}
URL: ${article.link}
Summary: ${article.description}

${POST_STYLE_RULES}
${guidelineBlock}
HARD CONSTRAINTS — violating any of these makes the post unusable:

CONSTRAINT 1 — LINE 1 MUST HAVE TWO SPECIFIC NUMBERS IN DIRECT CONFRONTATION.
Not one number. Not a year. Two metrics that contradict each other.
CORRECT: "Anthropic hit $31B ARR in 4 years. Salesforce took 19."
CORRECT: "Enterprises waste 35% of cloud spend. Greenpixie just raised £4.7M to fix it."
WRONG: "Most SaaS teams added AI features in 2024. Almost none updated their contracts." (2024 is not a metric, no confrontation)
WRONG: "BirdyChat raised €1.7M. Slack solved internal. External is still broken." (three sentences, second number missing)
If the article does not contain two confrontable numbers, invent the confrontation from known benchmarks — but both numbers must be real and verifiable.

CONSTRAINT 2 — NAME A COMPANY THE ICP USES DAILY in PARAGRAPH 1.
Not the startup in the article. A name Rain's audience (VP Sales, founders) already has in their stack or reads about every week: Salesforce, HubSpot, AWS, Snowflake, Datadog, Gong, OpenAI, Anthropic, Microsoft, Google.
Use the startup as supporting evidence, not as the anchor.

CONSTRAINT 3 — MAXIMUM 860 CHARACTERS INCLUDING SPACES AND HASHTAGS.
Count before outputting. If over 860, cut from PARAGRAPH 1 first, then PARAGRAPH 2. Never cut LINE 1 or LINE 2. The 110K post was 806 chars. Ruthless brevity is the mechanism, not a preference.

TASK: Follow the proven structure exactly:
1. LINE 1: Two contrasting numbers. Two short sentences. Both real and verifiable. (See CONSTRAINT 1)
2. LINE 2: Acknowledge the obvious read, then flip it. "But not for the reason most people think." or equivalent.
3. PARAGRAPH 1: The deeper structural mechanism. Name a company the ICP knows daily. (See CONSTRAINT 2)
4. PARAGRAPH 2: What the article missed. Rain's real GTM/B2B perspective.
5. CLOSING QUESTION: ICP-specific, uncomfortable, binary. Forces a VP Sales or founder to reflect on their own business.

${additionalContext ? `ANGLE GUIDANCE: ${additionalContext}\n` : ''}Output only the post text. No title, no intro, no meta-commentary. No "Topic tag:" prefix.`;
  } else {
    prompt = `${RAIN_CONTEXT}

Write an original LinkedIn post on this topic: "${article.title}"

${POST_STYLE_RULES}
${guidelineBlock}
HARD CONSTRAINTS — violating any of these makes the post unusable:

CONSTRAINT 1 — LINE 1 MUST HAVE TWO SPECIFIC NUMBERS IN DIRECT CONFRONTATION.
Not one number. Not a year. Two metrics that contradict each other.
CORRECT: "Anthropic hit $31B ARR in 4 years. Salesforce took 19."
WRONG: "Most SaaS teams added AI in 2024. Almost none updated their contracts." (year is not a metric)

CONSTRAINT 2 — NAME A COMPANY THE ICP USES DAILY in PARAGRAPH 1.
Salesforce, HubSpot, AWS, Snowflake, Datadog, Gong, OpenAI, Anthropic, Microsoft, Google.

CONSTRAINT 3 — MAXIMUM 860 CHARACTERS INCLUDING SPACES AND HASHTAGS. Count before outputting. Cut from PARAGRAPH 1 first.

TASK: Follow the proven structure:
1. LINE 1: Two contrasting numbers. Two short sentences. Both real and verifiable.
2. LINE 2: Acknowledge the obvious read, then flip it. "But not for the reason most people think." or equivalent.
3. PARAGRAPH 1: The structural mechanism. Name a company the ICP knows daily.
4. PARAGRAPH 2: Rain's direct GTM/B2B angle. What most people miss.
5. CLOSING QUESTION: Forces a founder or VP Sales to evaluate their own business. Uncomfortable. Binary.

Output only the post text. No title, no intro, no meta-commentary. No "Topic tag:" prefix.`;
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  let text = response.content.find(b => b.type === 'text')?.text?.trim() ?? '';
  // Strip any "Topic tag: X" or "Scenario: X" prefix Claude occasionally adds
  text = text.replace(/^(topic tag|scenario|category|type)\s*:\s*\S+\s*/i, '').trim();
  return text;
}
