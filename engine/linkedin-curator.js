// Curates articles from top B2B/founder sources for LinkedIn posts
// Rule: max 1 article per source in final selection — prevents any single source dominating

const RSS_SOURCES = [
  // ── B2B sales & GTM — highest signal for Rain's audience ─────────────────
  { name: 'SaaStr',          url: 'https://www.saastr.com/feed/' },
  { name: 'OpenView',        url: 'https://openviewpartners.com/feed/' },
  { name: 'Predictable Rev', url: 'https://predictablerevenue.com/feed' },
  { name: 'Winning by Design', url: 'https://winnbydesign.com/feed/' },
  { name: 'Sales Hacker',    url: 'https://www.saleshacker.com/feed/rss/' },
  { name: 'Gong Labs',       url: 'https://www.gong.io/blog/feed/' },
  { name: 'ChartMogul',      url: 'https://chartmogul.com/blog/feed/' },
  { name: 'Drift Blog',      url: 'https://www.drift.com/blog/feed/' },
  { name: 'HubSpot Sales',   url: 'https://blog.hubspot.com/sales/rss.xml' },

  // ── Founder & operator insights ───────────────────────────────────────────
  { name: 'First Round',     url: 'https://review.firstround.com/feed.xml' },
  { name: 'NFX',             url: 'https://www.nfx.com/feed' },
  { name: 'Lenny Rachitsky', url: 'https://www.lennysnewsletter.com/feed' },
  { name: 'Tomasz Tunguz',   url: 'https://tomtunguz.com/index.xml' },
  { name: 'Point Nine',      url: 'https://medium.com/feed/point-nine-news' },
  { name: 'YCombinator',     url: 'https://www.ycombinator.com/blog/rss' },
  { name: 'a16z',            url: 'https://a16z.com/feed/' },

  // ── AI in B2B / GTM ───────────────────────────────────────────────────────
  { name: 'TechCrunch',      url: 'https://techcrunch.com/feed/' },
  { name: 'The Information', url: 'https://www.theinformation.com/feed' },
  { name: 'Sequoia',         url: 'https://www.sequoiacap.com/feed/' },

  // ── European B2B & startup ────────────────────────────────────────────────
  { name: 'Sifted',          url: 'https://sifted.eu/feed/' },
  { name: 'EU-Startups',     url: 'https://eu-startups.com/feed/' },
  { name: 'Tech.eu',         url: 'https://tech.eu/feed/' },
  { name: 'ArcticStartup',   url: 'https://arcticstartup.com/feed/' },
  { name: 'The Hub',         url: 'https://thehub.io/blog/rss' },

  // ── Business press ────────────────────────────────────────────────────────
  { name: 'HBR',             url: 'https://feeds.hbr.org/harvardbusiness' },
  { name: 'Raconteur',       url: 'https://www.raconteur.net/feed/' },
  { name: 'FT',              url: 'https://www.ft.com/rss/home/uk' },
  { name: 'The Economist',   url: 'https://www.economist.com/business/rss.xml' },
  { name: 'Bloomberg',       url: 'https://feeds.bloomberg.com/technology/news.rss' },
  { name: 'WSJ',             url: 'https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml' },
  { name: 'Business Insider', url: 'https://www.businessinsider.com/rss' },
];

// ── Topic classification ──────────────────────────────────────────────────────
// Each article gets tagged as 'ai' or 'gtm'. Weekly mix: 1 ai + 2 gtm.

const AI_KEYWORDS = [
  'artificial intelligence', ' ai ', 'openai', 'chatgpt', 'llm', 'large language model',
  'machine learning', 'generative ai', 'gpt', 'anthropic', 'claude', 'copilot',
  'neural network', 'ai agent', 'automation ai', 'ai tool', 'ai platform',
];

const GTM_KEYWORDS = [
  'pipeline', 'lead generation', 'lead gen', 'outbound', 'cold email', 'cold outreach',
  'gtm', 'go-to-market', 'revenue growth', 'sales development', 'sdr', 'bdr',
  'prospecting', 'b2b sales', 'customer acquisition', 'demand generation',
  'account executive', 'sales process', 'sales cycle', 'win rate', 'conversion rate',
  'icp', 'ideal customer', 'sales strategy', 'revenue operations', 'revops',
  'sales enablement', 'crm', 'hubspot', 'salesforce', 'meeting booked',
  'founder-led sales', 'product-led growth', 'plg', 'mrr', 'arr', 'churn',
  'customer success', 'retention', 'upsell', 'expansion revenue',
];

const RELEVANT_KEYWORDS = [
  'sales', 'revenue', 'pipeline', 'leads', 'lead generation', 'growth', 'gtm',
  'founder', 'startup', 'b2b', 'outbound', 'inbound', 'crm', 'automation', 'ai',
  'productivity', 'hiring', 'team', 'customers', 'retention', 'churn', 'mrr', 'arr',
  'fundraising', 'investor', 'vc', 'saas', 'product', 'marketing', 'sdr', 'account',
  'prospecting', 'cold email', 'linkedin', 'strategy', 'scale', 'enterprise',
  // UK / EU / SEA context
  'series a', 'series b', 'seed round', 'exit', 'acquisition', 'scaleup', 'scale-up',
  'southeast asia', 'singapore', 'indonesia', 'vietnam', 'philippines', 'malaysia',
  'nordic', 'baltic', 'estonia', 'scandinavia', 'fintech', 'deep tech',
  'market entry', 'expansion', 'global', 'cross-border',
];

function classifyArticle(title, description = '') {
  const text = (title + ' ' + description).toLowerCase();
  const aiScore = AI_KEYWORDS.filter(kw => text.includes(kw)).length;
  const gtmScore = GTM_KEYWORDS.filter(kw => text.includes(kw)).length;
  // If strong AI signal and weak GTM signal → ai. Otherwise → gtm.
  return aiScore >= 2 && aiScore > gtmScore ? 'ai' : 'gtm';
}

const BLOCKED_KEYWORDS = [
  'politic', 'election', 'government', 'war', 'conflict', 'religion', 'church',
  'geopolitic', 'ukraine', 'russia', 'china', 'taiwan', 'israel', 'gaza', 'iran',
  'gender', 'abortion', 'immigration', 'refugee', 'racist', 'discrimination',
  'sexual', 'abuse', 'violence', 'death', 'tragedy', 'shooting', 'crime',
  'divorce', 'lawsuit', 'scandal',
];

function scoreArticle(title, description = '') {
  const text = (title + ' ' + description).toLowerCase();

  for (const blocked of BLOCKED_KEYWORDS) {
    if (text.includes(blocked)) return -1;
  }

  let score = 0;
  for (const kw of RELEVANT_KEYWORDS) {
    if (text.includes(kw)) score++;
  }
  return score;
}

function parseRSSItems(xml) {
  const items = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);

  for (const match of itemMatches) {
    const block = match[1];

    const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                   block.match(/<title>(.*?)<\/title>/))?.[1]?.trim() || '';

    const link = (block.match(/<link>(.*?)<\/link>/) ||
                  block.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/))?.[1]?.trim() || '';

    const description = (block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                         block.match(/<description>(.*?)<\/description>/))?.[1]
                         ?.replace(/<[^>]+>/g, '').trim().slice(0, 300) || '';

    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() || '';

    // Extract image from media:content or enclosure (reject non-image files)
    const rawImg = (block.match(/<media:content[^>]+url="([^"]+)"/)?.[1]) ||
                   (block.match(/<enclosure[^>]+url="([^"]+)"/)?.[1]) || null;
    const image = rawImg && /\.(mp3|mp4|wav|ogg|m4a|pdf|webm)(\?|$)/i.test(rawImg) ? null : rawImg;

    if (title && link && link.startsWith('http')) {
      items.push({ title, link, description, pubDate, image });
    }
  }

  return items;
}

async function fetchOGImage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Gritnord-Bot/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();
    const og = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/)?.[1] ||
               html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/)?.[1];
    // Reject audio/video/non-image URLs (e.g. Substack podcasts return .mp3)
    if (og && /\.(mp3|mp4|wav|ogg|m4a|pdf|webm)(\?|$)/i.test(og)) return null;
    return og || null;
  } catch {
    return null;
  }
}

export async function curateArticles({ count = 3, usedLinks = [] } = {}) {
  const allArticles = [];
  const usedSet = new Set(usedLinks);

  for (const source of RSS_SOURCES) {
    try {
      const res = await fetch(source.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Gritnord-Bot/1.0)' },
        signal: AbortSignal.timeout(10000),
      });
      const xml = await res.text();
      const items = parseRSSItems(xml).slice(0, 10);

      for (const item of items) {
        if (usedSet.has(item.link)) continue; // skip already-used articles
        const score = scoreArticle(item.title, item.description);
        if (score > 0) {
          const topic = classifyArticle(item.title, item.description);
          allArticles.push({ ...item, source: source.name, relevanceScore: score, topic });
        }
      }
    } catch (err) {
      console.warn(`[curator] ${source.name} failed:`, err.message);
    }
  }

  // Deduplicate: max 1 article per source name AND per domain
  const seenSources = new Set();
  const seenDomains = new Set();
  const deduped = allArticles
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .filter(a => {
      if (seenSources.has(a.source)) return false;
      try {
        const domain = new URL(a.link).hostname;
        if (seenDomains.has(domain)) return false;
        seenSources.add(a.source);
        seenDomains.add(domain);
        return true;
      } catch { return false; }
    });

  // ── Enforce weekly content mix: 1 AI post + 2 GTM/growth posts ──────────────
  const aiArticles  = deduped.filter(a => a.topic === 'ai');
  const gtmArticles = deduped.filter(a => a.topic === 'gtm');

  const selected = [];
  if (aiArticles.length > 0)  selected.push(aiArticles[0]);
  // Fill remaining slots with GTM, pad with AI if GTM runs dry
  for (const a of gtmArticles) {
    if (selected.length >= count) break;
    selected.push(a);
  }
  while (selected.length < count && aiArticles.length > selected.filter(a => a.topic === 'ai').length) {
    const next = aiArticles[selected.filter(a => a.topic === 'ai').length];
    if (next) selected.push(next);
    else break;
  }

  // Fetch OG images for articles missing one
  for (const article of selected) {
    if (!article.image) {
      article.image = await fetchOGImage(article.link);
    }
  }

  return selected.slice(0, count);
}
