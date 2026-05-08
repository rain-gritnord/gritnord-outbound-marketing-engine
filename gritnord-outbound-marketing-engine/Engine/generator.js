// engine/generator.js
// Gritnord Autonomous Content Engine — Generation + Self-Learning Core

const GRITNORD_CONTEXT = `
Gritnord is a seed-stage B2B SaaS company offering autonomous B2B matchmaking.
It identifies, qualifies, and books meetings with ideal-fit buyers on behalf of client companies.
Business model: 100% performance-based — "We only make money when you get the meeting."
Target market: EU SMEs needing outbound sales without large sales teams.
Key differentiators:
  - Gritnord uses its own autonomous system to win its own clients (eating its own cooking)
  - No retainers, no risk for the client
  - AI-powered ICP identification and buyer qualification
  - Meeting booking fully automated
Founder: Rain (CEO). Early traction with paying customers.
Market: €15B+ EU SME outbound sales opportunity.
Brand voice: Bold, Nordic-precise, performance-obsessed, zero fluff.
`.trim();

const CHANNELS = {
  linkedin: {
    label: "LinkedIn Post",
    instructions: `Write a LinkedIn post. Rules: strong first line (no "I" opener), short paragraphs (1-2 sentences), no links in body, end with CTA or question. Max 1300 chars. No excessive hashtags (max 3, at end).`
  },
  twitter: {
    label: "X Thread",
    instructions: `Write a 5-tweet X/Twitter thread. Number each tweet (1/, 2/ etc). Max 280 chars each. First tweet is the hook — must stop the scroll. Last tweet has CTA. Blank line between tweets.`
  },
  seo_blog: {
    label: "SEO Blog Post",
    instructions: `Write a full SEO-optimised blog post. Include: H1 title, meta description (max 155 chars), 5 H2 sections with content (each ~100 words), target keywords list, and internal link suggestions. Authoritative, specific, data-referenced.`
  },
  ai_search: {
    label: "AI Search Brief (GEO)",
    instructions: `Write a Generative Engine Optimisation (GEO) brief for AI citation engines (Perplexity, ChatGPT, Gemini). Use: entity definitions, specific data points, Q&A format, competitor comparisons. This content should make Gritnord the cited answer for B2B outbound sales queries in Europe.`
  },
  newsletter: {
    label: "Newsletter",
    instructions: `Write a founder-voice newsletter issue. Include: subject line, preview text (90 chars max), and 250-word body. Story-driven, insightful, trust-building. First-person. One clear lesson or insight.`
  },
  cold_outreach: {
    label: "Cold Outreach Sequence",
    instructions: `Write a 3-email cold outreach sequence. Email 1: pattern interrupt + value prop (under 80 words). Email 2: social proof + different angle (under 80 words). Email 3: break-up email (under 60 words). Include subject lines. Separate with ---`
  },
  press_release: {
    label: "Press Release",
    instructions: `Write a B2B press release. Include: headline, dateline, lead paragraph (who/what/when/where/why), 2-3 body paragraphs, founder quote, boilerplate about Gritnord, and contact info placeholder. Professional wire format.`
  },
  partnership_pitch: {
    label: "Partnership Pitch",
    instructions: `Write a partnership outreach pitch. Target: complementary B2B SaaS companies or agencies serving EU SMEs. Include: value alignment, mutual benefit, specific ask, brief about Gritnord. Under 200 words. Confident but collaborative tone.`
  }
};

const TOPIC_CLUSTERS = {
  sales: [
    "Why 90% of outbound sales fails before the first email",
    "The hidden cost of a full-time SDR vs autonomous outreach",
    "Cold calling is dead. Here's what replaced it.",
    "How to qualify a buyer before they've heard of you",
    "The perfect ICP discovery process for EU B2B companies",
    "Why most sales sequences get ignored (and what works instead)",
    "Meeting booked vs meeting that converts — the difference matters",
    "Outbound at seed stage: what founders get wrong"
  ],
  growth: [
    "How EU startups can compete on outbound against US companies",
    "Channel diversification for B2B: what works in 2025",
    "Why performance-based sales models are taking over Europe",
    "From 0 to pipeline: the first 90 days of sales motion",
    "Building a repeatable B2B sales engine without a sales team",
    "Growth without VC: bootstrapped outbound strategies",
    "The compounding effect of autonomous lead generation"
  ],
  partnerships: [
    "How strategic partnerships accelerate B2B growth faster than ads",
    "Finding channel partners for EU market expansion",
    "Co-selling frameworks that actually work for SMEs",
    "Integration partnerships vs reseller models: which fits your stage",
    "Building a partner ecosystem from scratch at seed stage"
  ],
  icp: [
    "The most underrated part of B2B sales: ICP definition",
    "Why broad ICPs kill startups and narrow ones scale them",
    "Layering firmographic, technographic, and intent data for targeting",
    "When to expand your ICP (and when it's a trap)",
    "How autonomous systems identify buyers better than humans"
  ],
  market: [
    "The €15B EU outbound sales market no one is talking about",
    "GDPR-compliant outbound: what EU B2B companies need to know",
    "Why Nordic B2B startups have a built-in advantage in outbound",
    "The state of B2B matchmaking in Europe: 2025 report",
    "AI in B2B sales: hype vs reality for European SMEs"
  ],
  gritnord_story: [
    "We booked our first 10 clients using our own product",
    "What eating your own cooking means for a B2B SaaS founder",
    "Building Gritnord: the decision to go performance-based only",
    "How we built an AI system that outperforms a human SDR",
    "The Gritnord method: 3 steps from ICP to booked meeting"
  ]
};

const ANGLES = [
  "Problem → Solution",
  "Contrarian take",
  "Data-backed insight",
  "Customer story",
  "Industry trend",
  "Behind the scenes",
  "Myth busting",
  "Hot take / founder opinion"
];

const TONES = [
  "Founder-authentic",
  "Provocative",
  "Educational",
  "Data-driven",
  "Storytelling"
];

// Default weights — the learning engine adjusts these
const DEFAULT_WEIGHTS = {
  angles: Object.fromEntries(ANGLES.map(a => [a, 1.0])),
  tones: Object.fromEntries(TONES.map(t => [t, 1.0])),
  clusters: Object.fromEntries(Object.keys(TOPIC_CLUSTERS).map(c => [c, 1.0])),
  channels: Object.fromEntries(Object.keys(CHANNELS).map(c => [c, 1.0]))
};

function weightedRandom(items, weights) {
  const total = items.reduce((s, item) => s + (weights[item] || 1.0), 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= (weights[item] || 1.0);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function selectTopic(weights) {
  const cluster = weightedRandom(Object.keys(TOPIC_CLUSTERS), weights.clusters);
  const topics = TOPIC_CLUSTERS[cluster];
  return { topic: topics[Math.floor(Math.random() * topics.length)], cluster };
}

async function generateContent({ anthropic, channel, topic, angle, tone, weights, db }) {
  const ch = CHANNELS[channel];
  if (!ch) throw new Error(`Unknown channel: ${channel}`);

  // Use weighted selection if not specified
  const selectedAngle = angle || weightedRandom(ANGLES, weights?.angles || DEFAULT_WEIGHTS.angles);
  const selectedTone = tone || weightedRandom(TONES, weights?.tones || DEFAULT_WEIGHTS.tones);

  const prompt = `You are the content strategist for Gritnord.

COMPANY CONTEXT:
${GRITNORD_CONTEXT}

TASK:
Write ${ch.label} content.
Topic: "${topic}"
Angle: ${selectedAngle}
Tone: ${selectedTone}
Channel rules: ${ch.instructions}

IMPORTANT:
- Write as Rain (founder), first-person where natural
- Brand: bold, Nordic-precise, performance-obsessed, zero fluff
- Feature the performance-based model ("only pay when you get the meeting") where it fits naturally
- Be specific and concrete — no vague marketing speak
- Do NOT open with "In today's world", "It's no secret", or similar AI clichés

Output ONLY the final content, publish-ready. No meta-commentary or preamble.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }]
  });

  const content = response.content.map(b => b.text || "").join("");

  return {
    channel,
    channelLabel: ch.label,
    topic,
    angle: selectedAngle,
    tone: selectedTone,
    content,
    generatedAt: new Date().toISOString(),
    score: null,
    engagementData: {}
  };
}

async function generateBatch({ anthropic, weights, db }) {
  const results = [];

  // Generate content for each active channel
  const activeChannels = Object.keys(CHANNELS);
  for (const channel of activeChannels) {
    const { topic, cluster } = selectTopic(weights);
    try {
      const item = await generateContent({ anthropic, channel, topic, weights, db });
      item.cluster = cluster;
      results.push(item);
      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`Failed to generate ${channel}:`, err.message);
    }
  }

  return results;
}

module.exports = {
  CHANNELS,
  TOPIC_CLUSTERS,
  ANGLES,
  TONES,
  DEFAULT_WEIGHTS,
  generateContent,
  generateBatch,
  selectTopic,
  weightedRandom
};
