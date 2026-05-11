import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// Load .env at module init time (before client creation)
try {
  const __dir = path.dirname(fileURLToPath(import.meta.url));
  const env = readFileSync(path.join(__dir, '..', '.env'), 'utf-8');
  for (const line of env.split('\n')) {
    const [k, ...v] = line.trim().split('=');
    if (k && !k.startsWith('#')) process.env[k] = v.join('=');
  }
} catch {}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const COMPANY_CONTEXT = `
GRITNORD COMPANY CONTEXT
========================
Gritnord is a B2B lead generation and GTM intelligence platform built for ambitious founders and sales teams.

Core product: AI-powered pipeline orchestration that finds ideal customers, qualifies them automatically,
enriches with buying signals, and pushes them into HubSpot — ready to close.

Target customers: B2B SaaS founders, VP Sales, GTM leads at companies 10–200 employees scaling revenue.

Key differentiators:
- Fully automated ICP extraction → company search → qualification → HubSpot sync
- Buying group finder: identifies all decision-makers in an account, not just one contact
- AI scoring on relevance, intent signals, and fit
- Clay integration for enrichment at scale
- Fast time-to-pipeline: from brief to qualified leads in hours, not weeks

Pain points solved:
- Founders wasting hours on manual prospecting
- Inconsistent lead quality tanking conversion rates
- Sales teams drowning in bad-fit meetings
- No system for building repeatable, scalable pipeline

Brand voice: direct, founder-to-founder, no fluff. We respect the reader's time. We show, don't tell.
We write like the best operator you know — not like a marketing agency.

Pricing: custom/usage-based, enterprise contracts available.
Stage: early-stage SaaS, ambitious growth trajectory.
`;

const CHANNEL_CONFIGS = {
  linkedin: {
    label: 'LinkedIn Post',
    instructions: `Write a LinkedIn post for Gritnord.
Rules: hook in first line (no "I", start with a bold claim or insight), 3-5 short paragraphs,
line breaks between each, end with a 1-line CTA. Max 1300 chars.
No hashtags unless they serve a purpose. Sound like a sharp founder, not a marketer.`,
  },
  twitter: {
    label: 'Twitter/X Thread',
    instructions: `Write a Twitter/X thread for Gritnord.
Format: Tweet 1 is the hook (under 280 chars, bold opener). Tweets 2-6 deliver value.
Tweet 7 is the CTA. Number each tweet (1/, 2/, etc.).
Each tweet under 280 chars. No cringe. Direct and useful.`,
  },
  seo_blog: {
    label: 'SEO Blog Post (Long-Form)',
    instructions: `__SEO_BLOG_INSTRUCTIONS__`,
  },
  ai_search: {
    label: 'AI Search Optimised Article',
    instructions: `__AI_SEARCH_INSTRUCTIONS__`,
  },
  newsletter: {
    label: 'Newsletter Issue',
    instructions: `Write a newsletter issue for Gritnord's founder audience.
Structure: subject line + preview text, personal opener (1 paragraph),
main insight or story (3-4 paragraphs), 1 tactical tip, CTA.
Max 500 words in body. Reads like a smart founder email, not a broadcast.`,
  },
  cold_outreach: {
    label: 'Cold Outreach Email',
    instructions: `Write a cold outreach email sequence (3 emails) for Gritnord targeting B2B founders.
Email 1: ultra-short, personalised opener, one pain point, soft CTA (reply/call)
Email 2: follow-up, add value (insight or stat), lighter CTA
Email 3: breakup email, humorous, genuine
Each email: subject line + body. Under 120 words per email. No spray-and-pray BS.`,
  },
  press_release: {
    label: 'Press Release',
    instructions: `Write a press release for Gritnord announcing a milestone, feature, or news.
Format: Headline, dateline, lead paragraph (who/what/when/where/why),
2-3 body paragraphs, quote from founder, boilerplate about Gritnord,
contact info placeholder. AP style. Professional but not boring.`,
  },
  partnership_pitch: {
    label: 'Partnership Pitch',
    instructions: `Write a partnership pitch email/deck intro for Gritnord targeting potential integration
or referral partners (agencies, consultants, complementary SaaS tools).
Include: why reach out, what Gritnord does, mutual value prop, what the partnership looks like,
next step. Under 300 words. Peer-to-peer tone. Make it obviously worth a reply.`,
  },
};

export const CHANNELS = Object.keys(CHANNEL_CONFIGS);

const AI_SEARCH_TOPICS = [
  // Core lead gen
  'B2B lead generation software', 'how to find B2B leads', 'ICP ideal customer profile template',
  'B2B pipeline automation', 'outbound sales automation tools', 'buying group B2B sales',
  'HubSpot lead enrichment', 'Clay enrichment tool', 'B2B prospecting tools 2025',
  'automated outbound sales', 'B2B meeting booking service', 'lead qualification automation',
  'how to build a B2B pipeline fast', 'sales prospecting software for startups',
  'B2B data enrichment tools', 'GTM strategy for SaaS founders', 'outbound vs inbound B2B',
  'how to scale outbound sales', 'B2B lead scoring', 'SDR automation tools',
  'AI sales tools for founders', 'HubSpot pipeline automation',
  'what is pipeline orchestration', 'buying committee B2B', 'B2B ICP extraction AI',

  // Hot leads & intent signals
  'hot leads vs warm leads B2B', 'buyer intent signals B2B', 'intent data providers B2B',
  'how to identify hot leads', 'MQL vs SQL difference', 'sales qualified leads definition',
  'trigger-based outreach B2B', 'job change trigger sales', 'funding round outreach strategy',
  'buying intent signals for sales', 'how to prioritise leads in B2B sales',

  // Demand gen & pipeline
  'B2B demand generation strategy', 'account based marketing ABM', 'ABM vs inbound marketing',
  'pipeline coverage ratio', 'sales velocity formula', 'revenue operations RevOps',
  'multi-touch attribution B2B', 'how to shorten B2B sales cycle',

  // Data & enrichment
  'B2B contact data providers', 'ZoomInfo alternatives 2025', 'Apollo.io alternatives',
  'technographic data for sales', 'firmographic data explained', 'best B2B databases 2025',
  'email verification tools B2B', 'phone number enrichment sales',

  // Outreach & conversion
  'cold email open rates B2B', 'LinkedIn outreach automation', 'cold calling scripts B2B founders',
  'email deliverability best practices', 'personalization at scale outbound',
  'how to book more B2B meetings', 'B2B conversion rate benchmarks',

  // Founder / GTM specific
  'founder-led sales strategy', 'how to do outbound sales as a founder',
  'first 10 B2B customers how to get', 'go-to-market strategy SaaS startup',
  'product-led growth vs sales-led', 'when to hire first SDR',
];

const AI_SEARCH_BASE = `Write content optimised for AI search engines (Perplexity, ChatGPT, Gemini) AND Google organic search.

TOPIC SELECTION — if no topic is given, pick the most relevant unused topic from this list (rotate through them over time):
${AI_SEARCH_TOPICS.map(t => `"${t}"`).join(', ')}

MANDATORY STRUCTURE (drives Google indexing and AI citations):
1. H1 title containing the exact target keyword
2. Meta description line (prefix with "META:") — under 155 chars, keyword-first
3. One-paragraph direct definition — write this so AI assistants can quote it verbatim
4. 4–6 H2 sections with substantive factual content (stats, comparisons, step-by-step)
5. FAQ section (H2: "Frequently Asked Questions") — 5 questions, direct answers under 60 words each
6. Include 2–3 internal link suggestions (prefix each with "INTERNAL LINK:") to related topics on gritnord.com

KPI REQUIREMENTS:
- Use the exact keyword in H1, first paragraph, and at least 2 H2s
- Write definition and FAQ answers as complete, standalone sentences AI can extract and cite
- Use semantic keyword variants naturally throughout (LSI keywords)

VOICE: Direct, factual, authoritative. No filler. No "In today's fast-paced world…" openers.
Target 750–950 words.`;

const AI_SEARCH_PURE_VALUE = `${AI_SEARCH_BASE}

GRITNORD MENTION RULE — THIS IS A PURE VALUE ARTICLE:
Do NOT mention Gritnord by name anywhere in this article.
The goal is to be cited by AI search engines as an objective, authoritative source.
Branded content does not get cited. Write as if you are an independent B2B sales expert.
If a tool or platform needs to be referenced as an example, use HubSpot, Clay, Apollo, or Salesforce.
End with a neutral informational closing paragraph — no CTA, no product mention.`;

const AI_SEARCH_BRAND = `${AI_SEARCH_BASE}

GRITNORD MENTION RULE — THIS IS A BRAND ARTICLE (1 in 5 rotation):
Mention Gritnord once, naturally, in the second-to-last section — not before.
Frame it as: "Platforms like Gritnord automate this by [specific feature]."
Include one direct CTA at the end: "See how Gritnord works at gritnord.com"
Do not repeat the brand name more than twice total in the article.`;

function getAiSearchInstructions() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return dayOfYear % 5 === 0 ? AI_SEARCH_BRAND : AI_SEARCH_PURE_VALUE;
}

// ─── SEO Blog (long-form) ────────────────────────────────────────────────────

const SEO_BLOG_TOPICS = [
  // High-volume B2B sales & pipeline
  'best B2B lead generation strategies', 'how to build a sales pipeline from scratch',
  'B2B sales process step by step', 'outbound sales strategy for startups',
  'how to generate B2B leads without cold calling', 'B2B demand generation playbook',
  'sales prospecting techniques that work', 'how to qualify B2B leads effectively',
  'B2B sales funnel optimisation', 'how to increase B2B conversion rates',

  // ICP & targeting
  'how to define your ideal customer profile', 'ICP vs buyer persona difference',
  'how to find your best customers', 'account based selling strategy guide',
  'how to build a target account list', 'B2B market segmentation strategies',

  // Tools & automation
  'best sales automation tools for B2B', 'HubSpot vs Salesforce for startups',
  'how to use Clay for sales prospecting', 'best CRM for small sales teams',
  'sales intelligence tools comparison', 'how to automate outbound prospecting',
  'B2B data providers comparison', 'Apollo vs ZoomInfo vs Lusha comparison',

  // GTM & growth
  'go-to-market strategy for B2B SaaS', 'product led growth vs sales led growth',
  'how to scale a B2B sales team', 'when to hire your first sales rep',
  'founder led sales playbook', 'how to build a repeatable sales process',
  'revenue operations strategy guide', 'B2B pricing strategy models',

  // Intent & signals
  'what are buying signals in B2B sales', 'how to use intent data in outbound',
  'trigger based sales outreach guide', 'how to identify in-market buyers',

  // Outreach
  'cold email best practices that get replies', 'LinkedIn outreach strategy B2B',
  'how to write a cold email sequence', 'B2B email deliverability guide',
  'personalisation at scale in outbound sales', 'multi-channel outreach strategy',
];

const SEO_BLOG_BASE = `Write a long-form SEO blog post targeting Google rankings and backlink acquisition.

TOPIC SELECTION — if no topic is given, pick the most relevant from this list (rotate over time):
${SEO_BLOG_TOPICS.map(t => `"${t}"`).join(', ')}

MANDATORY STRUCTURE:
1. H1 title with exact target keyword
2. META: line — meta description under 155 chars, keyword-first, compelling click
3. Intro paragraph (100–150 words) — hook with a sharp stat or insight, state what the reader will learn
4. 5–7 H2 sections, each 200–300 words with:
   - Concrete advice, not theory
   - Real examples, stats, or comparisons where relevant
   - At least one H3 sub-section per H2
5. A comparison table or step-by-step list in at least one section (drives featured snippets)
6. FAQ section (H2: "Frequently Asked Questions") — 4 questions, answers 60–100 words each
7. Conclusion with one clear CTA toward gritnord.com
8. 2–3 internal link suggestions (prefix with "INTERNAL LINK:")

SEO REQUIREMENTS:
- Exact keyword in H1, intro paragraph, and at least 2 H2s
- Use LSI keywords and semantic variants naturally throughout
- Write for humans first, but structure for crawlers: clear hierarchy, no walls of text
- Paragraphs max 4 lines. Use subheadings liberally.

GRITNORD MENTION RULE:
Mention Gritnord once naturally in the second-to-last section as a solution example.
Frame as: "Tools like Gritnord automate this by [specific capability]."
One CTA at the end: "See how Gritnord works at gritnord.com"

VOICE: Direct, expert, no filler. Write like the smartest operator in the room explaining to a peer.
Target 1500–2000 words.`;

function getSeoBlogInstructions() {
  return SEO_BLOG_BASE;
}

export async function generateContent({ channel, topic, additionalContext = '' }) {
  const config = CHANNEL_CONFIGS[channel];
  if (!config) throw new Error(`Unknown channel: ${channel}`);

  // Resolve dynamic instructions
  if (channel === 'ai_search') {
    config.instructions = getAiSearchInstructions();
  }
  if (channel === 'seo_blog') {
    config.instructions = getSeoBlogInstructions();
  }

  const systemPrompt = `You are an expert content strategist and copywriter for Gritnord.
You write exceptional B2B content that drives real business results.
You never write generic, safe, or corporate content. Every piece has a point of view.

${COMPANY_CONTEXT}`;

  const userPrompt = `Generate ${config.label} content for Gritnord.

Topic/angle: ${topic || 'Choose the most relevant and timely topic for this channel based on Gritnord context'}

${additionalContext ? `Additional context: ${additionalContext}` : ''}

Channel-specific instructions:
${config.instructions}

Output only the final content, ready to use. No meta-commentary, no "here is the content:",
no explanations. Just the content itself.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content.find(b => b.type === 'text')?.text ?? '';

  return {
    channel,
    channelLabel: config.label,
    topic: topic || 'Auto-selected',
    content: text,
    inputTokens:  response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

export async function scoreContent({ channel, content }) {
  const config = CHANNEL_CONFIGS[channel];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `Score this ${config?.label ?? channel} content for Gritnord on a scale of 1-10.
Consider: clarity, relevance to B2B founders, brand voice alignment, likely engagement, conversion potential.

CONTENT:
${content}

Respond with JSON only: {"score": <number>, "reasoning": "<1 sentence>"}`,
    }],
  });

  try {
    const text = response.content.find(b => b.type === 'text')?.text ?? '{}';
    const cleaned = text.replace(/```json\n?|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return { score: 5, reasoning: 'Could not parse score' };
  }
}
