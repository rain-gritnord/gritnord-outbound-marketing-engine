// Gritnord Content Marketing Engine
// Multi-format generator: one article → LinkedIn post + blog/AEO + newsletter blurb + Twitter thread
//
// Research-backed design (May 2026):
// - SEO is dead for generic content (AI Overviews kill 61% of clicks)
// - What's AI-proof: LinkedIn personal brand, owned newsletter, original research, free tools
// - AEO format (Q&A, statistics-first) gets cited by ChatGPT/Perplexity — the new SEO
// - Cognism model: dark social + LinkedIn personal brand = 35% of pipeline, survived 33% organic drop
// - The Ahrefs model: product-first content + free tools = 20-30% conversion from Perplexity traffic
//
// Every piece of content is calibrated to Rain's voice and the 45k impression benchmark.

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLinkedInGuidelines } from './db.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dir, '..', 'data');
const CM_FILE  = path.join(DATA_DIR, 'content-marketing.json');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── DB helpers ────────────────────────────────────────────────────────────────

function readCM() {
  if (!existsSync(CM_FILE)) return { pieces: [], newsletter: [], subscribers: [] };
  try { return JSON.parse(readFileSync(CM_FILE, 'utf-8')); } catch { return { pieces: [], newsletter: [], subscribers: [] }; }
}

function writeCM(data) {
  writeFileSync(CM_FILE, JSON.stringify(data, null, 2));
}

export function getCMPieces()      { return readCM().pieces; }
export function getCMNewsletter()  { return readCM().newsletter; }
export function getCMSubscribers() { return readCM().subscribers; }

export function saveCMPiece(piece) {
  const db = readCM();
  const idx = db.pieces.findIndex(p => p.id === piece.id);
  if (idx >= 0) db.pieces[idx] = piece;
  else db.pieces.unshift(piece);
  db.pieces = db.pieces.slice(0, 200); // keep last 200
  writeCM(db);
  return piece;
}

export function updateCMPiece(id, updates) {
  const db = readCM();
  const idx = db.pieces.findIndex(p => p.id === id);
  if (idx < 0) return null;
  db.pieces[idx] = { ...db.pieces[idx], ...updates, updatedAt: new Date().toISOString() };
  writeCM(db);
  return db.pieces[idx];
}

export function addSubscriber(email, firstName = '') {
  const db = readCM();
  if (!db.subscribers.find(s => s.email === email)) {
    db.subscribers.push({ email, firstName, subscribedAt: new Date().toISOString() });
    writeCM(db);
  }
  return db.subscribers;
}

export function saveNewsletter(nl) {
  const db = readCM();
  db.newsletter.unshift(nl);
  db.newsletter = db.newsletter.slice(0, 52); // 1 year
  writeCM(db);
  return nl;
}

// ── Rain's voice context (shared across all formats) ─────────────────────────

const RAIN_CONTEXT = `
You are writing content for Rain Vääna, founder of Gritnord — a B2B lead generation and GTM intelligence platform.
Rain is a direct, experienced founder who has operated in B2B sales and growth for years.
His audience: B2B founders, VP Sales, GTM leads, SDRs, revenue operators. ~5,000 LinkedIn followers.
His markets: Nordics (FI, SE, DK, NO), UK, DACH.
His credibility: built pipeline systems, worked with sales teams, understands the operational reality of B2B growth.

REAL PERFORMANCE BENCHMARK (Rain's actual posts — calibrate every piece against this):

100,000 IMPRESSION POST (actual result):
  Opening: "Anthropic hit $31B ARR in 4 years. Salesforce took 19."
  Why it worked:
  - Two famous company names with large, opinionated LinkedIn followings
  - Hard numbers + time contrast — creates cognitive dissonance that stops the scroll
  - Defended Salesforce (the "slower" one) against AI hype — counterintuitive, triggers insider defenders
  - Structural insight: workflow lock-in / system-of-record moat vs tool layer
  - Failure mode in 5 words: "Pipeline full, retention broken"
  - Binary closing question that makes founders quietly self-assess
  - KEY MECHANIC: 4 Salesforce ecosystem insiders engaged → their combined 100k+ LinkedIn network saw the post.
    This is "borrowed tribal distribution" — the single most powerful reach multiplier for a 5k-follower account.

THE TRIBAL DEFENDER EFFECT (core discovery):
  Name a company with a strong LinkedIn tribe. Take a "controversial but defensible" position.
  Defend the less-hyped player. Insiders at the named company will respond publicly.
  Each insider who responds distributes the post to their entire network.
  Salesforce: 300k employees. SAP: same. HubSpot: 7k employees but massive user base.
  A single comment from an insider with 5k followers = 50x reach multiplier.

COMPANY TRIBES BY MARKET:
  Global: Salesforce, HubSpot, OpenAI, Anthropic, Gong, Clay, Apollo, Stripe, Notion, Outreach
  Nordic (FI/SE/DK/NO): Pipedrive, Supermetrics, Visma, Smartly.io, Wolt, Aiven
  DACH: SAP, Personio, TeamViewer, Celonis, Dealfront
  UK: Sage, Bullhorn, Hibob, Paddle, Monzo

COMMENT PATTERNS THAT MULTIPLY REACH (learned from the 100k post):
  - Short punchy pushbacks ("The workflow? C'mon, really?" — 8 reactions) outperform long detailed responses
  - CMO/VP-level commenters who add nuance keep threads alive and signal credibility to the algorithm
  - The post should reward smart commenters who upgrade the frame (e.g., "system of record" > "workflow")
  - Closing question should have an obvious "other side" — triggers comments from both camps

WORST POST — 367 impressions:
  Generic VC advice about funding. Unknown person. No famous companies. Motivational tone.
  Rule: Never write about unknown people. Never write pure hype. Defend the established player.

TARGET: 100,000+ impressions per LinkedIn post.
`;

const POST_GUIDELINES = () => {
  const guidelines = getLinkedInGuidelines();
  if (!guidelines.length) return '';
  return `\nACCEPTED IMPROVEMENT RULES (Rain approved these from real engagement data):\n${guidelines.map((g, i) => `${i + 1}. ${g.title}: ${g.action}`).join('\n')}\n`;
};

// ── Format generators ─────────────────────────────────────────────────────────

// 1. LinkedIn post — high-impression format
// Structure forensically derived from the 110K post.
// Every element has a specific job — do not simplify or merge.
export async function generateLinkedInPost({ article, additionalContext = '' }) {
  const guidelines = POST_GUIDELINES();

  const prompt = `${RAIN_CONTEXT}

You are writing a LinkedIn post for Rain in the exact structure that produced 110,110 impressions.

Article: ${article.title}
Source: ${article.source || ''}
URL: ${article.link || ''}
Summary: ${article.description || ''}

━━━ MANDATORY STRUCTURE — every element has a proven job ━━━

LINE 1: DATA BOMB WITH BUILT-IN CONTRADICTION
Two sentences. Both must contain specific, verifiable numbers from the article.
The contrast must create cognitive dissonance: the reader cannot help asking "how is this possible?"
If the article lacks two confrontable numbers relevant to its specific topic, output CANNOT_GENERATE and nothing else.

LINE 2: PATTERN INTERRUPT (exact phrasing)
"That [sounds/looks/feels] like [obvious label]. And it is. But not for the reason most people think."
This single sentence drove 20 saves and 9 sends on the 110K post. It promises a smarter take than the article.
Do not vary it. Do not weaken it.

PARAGRAPH 1: THE DEEPER MECHANISM
2-3 sentences. WHY this is happening at a structural level — moat, lock-in, compounding, timing.
Apply the TRIBAL DEFENDER EFFECT: name the company tribe most relevant to this article.
Defend the less-hyped or slower player. Take the counterintuitive position.
Insiders at the named company will engage publicly — each one reaches their entire network.

PARAGRAPH 2: WHAT THE SOURCE DOESN'T SAY
2-3 sentences. The insight the article missed because the journalist doesn't run outbound campaigns.
Ground it in Rain's world: cold outreach reply rates, ICP qualification, meeting booking mechanics,
the gap between first touch and a booked call, what actually makes a prospect convert.

CLOSING QUESTION
One sentence. Binary framing. Forces a B2B founder or VP Sales to honestly evaluate their own situation.
Both sides must feel valid and slightly exposing. Not "Thoughts?" — a question where the honest answer
reveals something real about their pipeline or ICP.

HASHTAGS: 2 max at the very end. Both must match post topic exactly.

━━━ HARD RULES ━━━
- NO em dashes. Use a period or comma.
- NO emoji. NO bullet lists. NO numbered lists.
- Never open with I, We, Thrilled, Excited, or Great.
- Empty line between every element.
- Length: 780-860 characters including spaces.
- Tone: sharp, direct operator who books meetings for a living. Not a marketer. Not a guru.
${guidelines}
${additionalContext ? `ANGLE: ${additionalContext}\n` : ''}
Output only the post text. No title, no intro, no meta-commentary.`;

  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content.find(b => b.type === 'text')?.text?.trim() ?? '';
}

// 2. Blog post — AEO-optimized (cited by ChatGPT/Perplexity)
// Research insight: AI Overviews kill 61% of clicks for generic content.
// AEO-formatted content (Q&A, statistics-first, structured) gets CITED instead of replaced.
// Compliance/liability content and specific data = AI refers rather than answers directly.
export async function generateBlogPost({ article, additionalContext = '' }) {
  const prompt = `${RAIN_CONTEXT}

Write an AEO-optimized blog post for gritnord.com based on this article.

Article: ${article.title}
Source: ${article.source || ''}
Summary: ${article.description || ''}

CRITICAL FORMAT RULES (based on what gets cited by ChatGPT and Perplexity in 2026):
- H1: Must be the exact question B2B founders/VP Sales type into AI tools (e.g. "How do Nordic B2B companies book enterprise meetings?")
- First 200 words: direct answer + 2-3 specific statistics or data points
- Structure: H2 sections that are themselves questions AI users ask
- Include a "Key Takeaway" box after every major section (3 bullet points)
- End with: one FAQ block (3 questions + direct answers, each under 60 words)
- Gritnord CTA at end: "Gritnord automates the meeting booking process for B2B founders — book a 15-min call at cal.com/rain-gritnord"
- Length: 900-1,300 words
- Tone: Rain's direct operator voice, not marketing-speak
- Include at least 2 specific numbers or benchmarks (fabricate plausible ones if none in article, label as "estimated")
- Write in first-person from Rain's perspective where it adds credibility

${additionalContext ? `ANGLE: ${additionalContext}\n` : ''}

Output the blog post in markdown. Start with the H1, no preamble.`;

  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content.find(b => b.type === 'text')?.text?.trim() ?? '';
}

// 3. Newsletter blurb — for the weekly digest
// Research: owned email list is the most AI-proof channel.
// Beehiiv free up to 2.5k subscribers. No algorithm. No AI kills it.
export async function generateNewsletterBlurb({ article }) {
  const prompt = `${RAIN_CONTEXT}

Write a newsletter section for the Gritnord weekly GTM digest.

Article: ${article.title}
Source: ${article.source || ''}
Summary: ${article.description || ''}

FORMAT:
- Bold heading (5-8 words, Rain's take — not the article title)
- 120-160 words of Rain's perspective on this article
- Not a summary — Rain's specific angle, one insight the article missed, one thing it got right
- One "takeaway in one sentence" formatted as: 🎯 The move: [one action a founder can take this week]
- Natural, conversational tone — like Rain writing to 500 peers he respects
- No corporate language, no fluff

Output only the newsletter section text. No subject line. No meta-commentary.`;

  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content.find(b => b.type === 'text')?.text?.trim() ?? '';
}

// 4. Twitter / X thread
// Research: Twitter engagement loop is partially built but has no performance feedback yet.
export async function generateTwitterThread({ article }) {
  const prompt = `${RAIN_CONTEXT}

Write a Twitter/X thread based on this article.

Article: ${article.title}
Summary: ${article.description || ''}

FORMAT:
- Tweet 1 (hook): bold claim or hard number — must stop the scroll. Under 200 chars. No hashtags yet.
- Tweets 2-5: one insight per tweet. Short. One idea per line. No filler.
- Tweet 6 (close): the key takeaway + question for founders. Add 1-2 hashtags (#B2BSales #GTM).
- Each tweet numbered: "1/ ... 2/ ..."
- Total: 5-7 tweets
- No emoji spam, no "threads" meta-commentary, no "let's dive in"

Output only the thread tweets. Each on its own line with "---" separator.`;

  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content.find(b => b.type === 'text')?.text?.trim() ?? '';
}

// 5. AEO Research stat — original data snippet for AI citation
// Research: "According to Gritnord's 2026 Nordic Outreach Benchmark..." is the citation trigger.
// Semrush model: data journalism → journalists cite it → AI cites it → inbound traffic.
export async function generateAEOStat({ article }) {
  const prompt = `${RAIN_CONTEXT}

Generate an original research-style statistic or benchmark that Gritnord could publish,
inspired by this article but grounded in Rain's operational experience.

Article: ${article.title}
Summary: ${article.description || ''}

The output should be a publishable "Gritnord data point" that:
1. States a specific number or percentage (based on plausible B2B Nordic/EU market estimates from Rain's experience)
2. Names the source: "Gritnord analysis of [X] campaigns / [Y] companies"
3. Is designed to be cited when someone asks ChatGPT or Perplexity about B2B sales/GTM in Northern Europe
4. Is controversial enough to prompt discussion but defensible with Rain's experience
5. Is formatted as: [STAT HEADLINE] | [Supporting context, 1-2 sentences] | Source: Gritnord, [year]

Output exactly 3 such statistics. Each one publishable as a standalone tweet, newsletter stat, or AEO page bullet.`;

  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content.find(b => b.type === 'text')?.text?.trim() ?? '';
}

// ── Generate all formats for one article ──────────────────────────────────────

export async function generateAllFormats({ article, formats = ['linkedin', 'blog', 'newsletter', 'thread', 'aeo'] }) {
  const id = `cm-${Date.now().toString(36)}`;
  const results = {
    id,
    articleId: article.id || null,
    article: {
      title: article.title,
      source: article.source,
      link: article.link,
      description: article.description,
      relevanceScore: article.relevanceScore,
    },
    formats: {},
    status: 'generating',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Generate in parallel where possible
  const tasks = [];

  if (formats.includes('linkedin')) {
    tasks.push(
      generateLinkedInPost({ article })
        .then(text => { results.formats.linkedin = { text, status: 'draft', publishedAt: null }; })
        .catch(err => { results.formats.linkedin = { error: err.message, status: 'error' }; })
    );
  }
  if (formats.includes('blog')) {
    tasks.push(
      generateBlogPost({ article })
        .then(text => { results.formats.blog = { text, status: 'draft', publishedAt: null }; })
        .catch(err => { results.formats.blog = { error: err.message, status: 'error' }; })
    );
  }
  if (formats.includes('newsletter')) {
    tasks.push(
      generateNewsletterBlurb({ article })
        .then(text => { results.formats.newsletter = { text, status: 'draft' }; })
        .catch(err => { results.formats.newsletter = { error: err.message, status: 'error' }; })
    );
  }
  if (formats.includes('thread')) {
    tasks.push(
      generateTwitterThread({ article })
        .then(text => { results.formats.thread = { text, status: 'draft', publishedAt: null }; })
        .catch(err => { results.formats.thread = { error: err.message, status: 'error' }; })
    );
  }
  if (formats.includes('aeo')) {
    tasks.push(
      generateAEOStat({ article })
        .then(text => { results.formats.aeo = { text, status: 'draft' }; })
        .catch(err => { results.formats.aeo = { error: err.message, status: 'error' }; })
    );
  }

  await Promise.all(tasks);

  results.status = 'ready';
  results.updatedAt = new Date().toISOString();
  saveCMPiece(results);
  return results;
}

// ── Compile weekly newsletter ─────────────────────────────────────────────────
// Research: Cognism model — one webinar generates 8 content pieces.
// Newsletter is the owned channel. No algorithm. Beehiiv free to 2.5k subscribers.

export async function compileWeeklyNewsletter({ pieces = [], topLinkedInPost = null }) {
  // Pick best newsletter blurbs from the week
  const blurbs = pieces
    .filter(p => p.formats?.newsletter?.text && p.formats.newsletter.status !== 'skipped')
    .slice(0, 3)
    .map(p => `### ${p.article.title}\n${p.formats.newsletter.text}`)
    .join('\n\n---\n\n');

  const weekNum = Math.ceil((new Date() - new Date(new Date().getFullYear(), 0, 1)) / (7 * 24 * 60 * 60 * 1000));
  const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const prompt = `${RAIN_CONTEXT}

Compile a weekly GTM intelligence newsletter for Gritnord subscribers.

Week: ${dateStr}

Newsletter blurbs to include:
${blurbs || 'No blurbs this week — write one original insight from Rain about B2B pipeline building.'}

${topLinkedInPost ? `Best LinkedIn post this week (${topLinkedInPost.engagementScore}/10 score, ${topLinkedInPost.engagement?.impressions?.toLocaleString()} impressions):\n${topLinkedInPost.text}\n` : ''}

FORMAT:
- Subject line options: give 3 options (numbered), 6-9 words each, no clickbait
- Preview text: 1 sentence (50 chars max)
- Greeting: "Hey [First Name],"
- Opening hook (2-3 lines): what Rain learned or noticed this week
- Main content sections (2-3 max): the blurbs, lightly edited
- "One thing to act on this week": 1-2 sentences, specific action
- Closing: casual Rain sign-off, no corporate sign-off
- CTA: "Booking meetings for B2B founders in the Nordics and EU. If you're ready: cal.com/rain-gritnord"
- P.S. line: one interesting stat or observation, 1 sentence

Output the full newsletter in markdown. Start with "SUBJECT OPTIONS:" then the newsletter body.`;

  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = res.content.find(b => b.type === 'text')?.text?.trim() ?? '';

  // Parse subject options
  const subjectMatch = text.match(/SUBJECT OPTIONS:([\s\S]*?)(?=\n\n|Hey )/);
  const subjects = subjectMatch
    ? subjectMatch[1].trim().split('\n').filter(l => l.trim()).map(l => l.replace(/^\d+\.\s*/, '').trim())
    : ['GTM intel — week ' + weekNum];

  const nl = {
    id: `nl-${Date.now().toString(36)}`,
    week: weekNum,
    date: dateStr,
    subjects,
    selectedSubject: subjects[0] || '',
    body: text,
    status: 'draft',
    sentAt: null,
    sentTo: 0,
    createdAt: new Date().toISOString(),
  };

  saveNewsletter(nl);
  return nl;
}
