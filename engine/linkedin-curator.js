// Curates articles from top B2B/founder sources for LinkedIn posts

const RSS_SOURCES = [
  // ── US founder & VC ──────────────────────────────────────────────────────
  { name: 'SaaStr',          url: 'https://www.saastr.com/feed/' },
  { name: 'First Round',     url: 'https://review.firstround.com/feed.xml' },
  { name: 'a16z',            url: 'https://a16z.com/feed/' },
  { name: 'YCombinator',     url: 'https://www.ycombinator.com/blog/rss' },
  { name: 'HBR',             url: 'https://feeds.hbr.org/harvardbusiness' },
  { name: 'Inc',             url: 'https://www.inc.com/rss' },
  { name: 'TechCrunch',      url: 'https://techcrunch.com/feed/' },
  { name: 'Sequoia',         url: 'https://www.sequoiacap.com/feed/' },
  { name: 'NFX',             url: 'https://www.nfx.com/feed' },

  // ── West European startup & VC ────────────────────────────────────────────
  { name: 'Sifted',          url: 'https://sifted.eu/feed/' },
  { name: 'EU-Startups',     url: 'https://eu-startups.com/feed/' },
  { name: 'Tech.eu',         url: 'https://tech.eu/feed/' },
  { name: 'TNW',             url: 'https://thenextweb.com/feed/' },
  { name: 'Silicon Republic', url: 'https://www.siliconrepublic.com/feed' },
  { name: 'Maddyness',       url: 'https://www.maddyness.com/en/feed/' },
  { name: 'Dealroom',        url: 'https://dealroom.co/blog/rss' },
  { name: 'Startups UK',     url: 'https://startups.co.uk/feed/' },
  { name: 'Real Business',   url: 'https://realbusiness.co.uk/feed' },

  // ── West European business & economy ─────────────────────────────────────
  { name: 'The Economist',   url: 'https://www.economist.com/business/rss.xml' },
  { name: 'FT',              url: 'https://www.ft.com/rss/home/uk' },
  { name: 'Reuters Business', url: 'https://feeds.reuters.com/reuters/businessNews' },
  { name: 'Guardian Business', url: 'https://www.theguardian.com/uk/business/rss' },
  { name: 'BBC Business',    url: 'http://feeds.bbci.co.uk/news/business/rss.xml' },
  { name: 'City A.M.',       url: 'https://www.cityam.com/feed/' },
  { name: 'Wired UK',        url: 'https://www.wired.co.uk/rss' },
  { name: 'Management Today', url: 'https://www.managementtoday.co.uk/rss' },
  { name: 'Business Insider', url: 'https://www.businessinsider.com/rss' },
  { name: 'Forbes',          url: 'https://www.forbes.com/feeds/forbeslatam/2014/08/11/forbesfeeds.rss' },
  { name: 'Handelsblatt',    url: 'https://www.handelsblatt.com/contentexport/feed/schlagzeilen' },
  { name: 'Les Echos',       url: 'https://feeds.lesechos.fr/lesechos-start' },
  { name: 'Politico Europe', url: 'https://www.politico.eu/feed/' },
  { name: 'EurActiv Business', url: 'https://www.euractiv.com/feed/' },
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

    // Extract image from media:content or enclosure
    const image = (block.match(/<media:content[^>]+url="([^"]+)"/)?.[1]) ||
                  (block.match(/<enclosure[^>]+url="([^"]+)"/)?.[1]) || null;

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

  // Deduplicate by domain
  const seenDomains = new Set();
  const deduped = allArticles
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .filter(a => {
      try {
        const domain = new URL(a.link).hostname;
        if (seenDomains.has(domain)) return false;
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
