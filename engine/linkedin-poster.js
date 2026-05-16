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
Rain is a direct, experienced founder who has operated in B2B sales and growth for years.
His audience: B2B founders, VP Sales, GTM leads, SDRs, revenue operators. ~5,000 followers.
His credibility: he has built pipeline systems, worked with sales teams, understands the operational reality of B2B growth.

WHAT DRIVES IMPRESSIONS — learned from Rain's best post (105,000+ impressions, 70,000+ members reached, 50 new followers, 20 new connections):
1. Counterintuitive take: defend the slower, older, or less-hyped side of a story. This triggers people who disagree to comment — and each comment distributes the post further.
2. Structural insight, not execution tips: explain WHY something works at a systems level (moats, lock-in, compounding). Never write a tip list.
3. One specific failure mode: 5-7 words, crime-scene language. "Pipeline full, retention broken." Not "many companies struggle with this."
4. Binary closing question: force readers to pick a side. Both sides must feel valid to someone. This generates comments from both camps.
5. The post is Rain's independent perspective. Companies or numbers from the article are evidence, not the subject. Never promote or feature any company.
Target: 45,000+ impressions per post.
`;

const POST_STYLE_RULES = `
STYLE RULES — study the most viral founder posts on LinkedIn:
- First line is everything. It must stop the scroll. Bold claim, surprising insight, or counterintuitive take.
- Never start with "I'm excited to share", "Thrilled to announce", "Great article", "Just read this".
- Short sentences. One idea per line. Generous white space between paragraphs.
- Maximum 3 paragraphs. Each paragraph max 3 lines.
- NO emoji bullets. NO numbered lists with emoji. NO "🔥 Top 5 things".
- NO em dashes (—) or hyphens in the middle of sentences. Use a period or rewrite the sentence instead. Only use a hyphen if grammar strictly requires it.
- At most 1-2 hashtags at the very end, only if genuinely useful. Often none.
- End with a question or invitation to debate. Not a CTA to buy anything.
- Sound like a sharp, direct operator. Not a marketer. Not a coach. Not a guru.
- Total length: 700–900 characters including spaces. Tight. Every word earns its place. The best post was 802 characters.
- Write in first person, but don't make it about Rain — make it about the insight.
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
TASK: Write a post that:
1. Opens with Rain's hot take or the most interesting angle from the article
2. Adds one insight or pushback that the article doesn't cover — Rain's real-world experience angle
3. Ends by asking the audience a sharp question related to this topic
4. Naturally reference the article in context (not as "check out this great piece")

${additionalContext ? `IMPORTANT ANGLE GUIDANCE: ${additionalContext}\n` : ''}Output only the post text. No title, no intro, no meta-commentary.`;
  } else {
    prompt = `${RAIN_CONTEXT}

Write an original LinkedIn post on this topic: "${article.title}"

${POST_STYLE_RULES}
${guidelineBlock}
TASK: Write an original post where Rain shares a direct insight, counterintuitive observation, or tactical lesson from his experience building B2B pipeline and running Gritnord.
End with a question that sparks comments from founders and sales leaders.

Output only the post text. No title, no intro, no meta-commentary.`;
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
