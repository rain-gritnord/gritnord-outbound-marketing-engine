// Curates articles from globally trusted publishers for LinkedIn posts

const RSS_SOURCES = [
  // ── Global business & finance ─────────────────────────────────────────────
  { name: 'Bloomberg Technology', url: 'https://feeds.bloomberg.com/technology/news.rss' },
  { name: 'Bloomberg Business',   url: 'https://feeds.bloomberg.com/businessweek/news.rss' },
  { name: 'WSJ Business',         url: 'https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml' },
  { name: 'WSJ Technology',       url: 'https://feeds.a.dj.com/rss/RSSWSJD.xml' },
  { name: 'Financial Times',      url: 'https://www.ft.com/rss/home/uk' },
  { name: 'The Economist',        url: 'https://www.economist.com/business/rss.xml' },
  { name: 'Forbes',               url: 'https://www.forbes.com/innovation/feed2' },
  { name: 'Fortune',              url: 'https://fortune.com/feed/' },
  { name: 'Business Insider',     url: 'https://www.businessinsider.com/rss' },
  { name: 'HBR',                  url: 'https://feeds.hbr.org/harvardbusiness' },
  { name: 'Reuters Business',     url: 'https://feeds.reuters.com/reuters/businessNews' },
  { name: 'CNBC Technology',      url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html' },
  { name: 'Fast Company',         url: 'https://www.fastcompany.com/latest/rss' },
  { name: 'Inc',                  url: 'https://www.inc.com/rss' },
  { name: 'Quartz',               url: 'https://qz.com/feed/' },
  { name: 'MIT Sloan Review',     url: 'https://sloanreview.mit.edu/feed/' },

  // ── Global technology ─────────────────────────────────────────────────────
  { name: 'TechCrunch',           url: 'https://techcrunch.com/feed/' },
  { name: 'TechCrunch Startups',  url: 'https://techcrunch.com/category/startups/feed/' },
  { name: 'Wired',                url: 'https://www.wired.com/feed/rss' },
  { name: 'MIT Tech Review',      url: 'https://www.technologyreview.com/feed/' },
  { name: 'The Verge',            url: 'https://www.theverge.com/rss/index.xml' },
  { name: 'Ars Technica',         url: 'https://feeds.arstechnica.com/arstechnica/index' },
  { name: 'VentureBeat',          url: 'https://venturebeat.com/feed/' },
  { name: 'TNW',                  url: 'https://thenextweb.com/feed/' },
  { name: 'ZDNet',                url: 'https://www.zdnet.com/news/rss.xml' },
  { name: 'Axios',                url: 'https://api.axios.com/feed/' },

  // ── VC & startup intelligence ─────────────────────────────────────────────
  { name: 'SaaStr',               url: 'https://www.saastr.com/feed/' },
  { name: 'a16z',                 url: 'https://a16z.com/feed/' },
  { name: 'First Round',          url: 'https://review.firstround.com/feed.xml' },
  { name: 'YCombinator',          url: 'https://www.ycombinator.com/blog/rss' },
  { name: 'Sequoia',              url: 'https://www.sequoiacap.com/feed/' },
  { name: 'NFX',                  url: 'https://www.nfx.com/feed' },
  { name: 'Bessemer',             url: 'https://www.bvp.com/atlas/rss.xml' },
  { name: 'OpenView',             url: 'https://openviewpartners.com/blog/feed/' },
  { name: 'Both Sides of Table',  url: 'https://bothsidesofthetable.com/feed' },
  { name: 'Andrew Chen',          url: 'https://andrewchen.com/feed/' },
  { name: 'Lenny Rachitsky',      url: 'https://www.lennysnewsletter.com/feed' },
  { name: 'ChartMogul',           url: 'https://chartmogul.com/blog/feed/' },

  // ── GTM, sales & B2B practitioners ───────────────────────────────────────
  { name: 'Sales Hacker',         url: 'https://www.saleshacker.com/feed/' },
  { name: 'Gong Labs',            url: 'https://www.gong.io/blog/feed/' },
  { name: 'HubSpot Blog',         url: 'https://blog.hubspot.com/marketing/rss.xml' },
  { name: 'HubSpot Sales',        url: 'https://blog.hubspot.com/sales/rss.xml' },
  { name: 'Drift',                url: 'https://www.drift.com/blog/feed/' },
  { name: 'Pavilion',             url: 'https://www.joinpavilion.com/blog/rss.xml' },
  { name: 'Predictable Revenue',  url: 'https://predictablerevenue.com/feed' },

  // ── AI & the future of work ───────────────────────────────────────────────
  { name: 'The Information',      url: 'https://www.theinformation.com/feed' },
  { name: 'AI News',              url: 'https://artificialintelligence-news.com/feed/' },
  { name: 'Import AI',            url: 'https://jack-clark.net/feed/' },

  // ── Global business news ──────────────────────────────────────────────────
  { name: 'Guardian Business',    url: 'https://www.theguardian.com/uk/business/rss' },
  { name: 'BBC Business',         url: 'http://feeds.bbci.co.uk/news/business/rss.xml' },
  { name: 'AP Business',          url: 'https://rsshub.app/ap/topics/business' },

  // ── European startup & tech ───────────────────────────────────────────────
  { name: 'Sifted',               url: 'https://sifted.eu/feed/' },
  { name: 'EU-Startups',          url: 'https://eu-startups.com/feed/' },
  { name: 'Tech.eu',              url: 'https://tech.eu/feed/' },
  { name: 'Dealroom',             url: 'https://dealroom.co/blog/rss' },
  { name: 'Silicon Canals',       url: 'https://siliconcanals.com/news/startups/feed/' },
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

// ── Companies with large LinkedIn tribes ──────────────────────────────────────
// Articles mentioning 2+ of these get a bonus score — they have audiences that
// engage publicly when their company is mentioned. This is the tribal reach multiplier.
const TRIBAL_COMPANIES = [
  'salesforce', 'hubspot', 'microsoft', 'google', 'openai', 'anthropic',
  'gong', 'outreach', 'apollo', 'clay', 'zoominfo', 'linkedin', 'zoom',
  'snowflake', 'datadog', 'stripe', 'notion', 'slack', 'workday', 'servicenow',
  'sap', 'oracle', 'aws', 'amazon', 'meta', 'apple',
  'klarna', 'revolut', 'pipedrive', 'wolt', 'wise',
];

// Count how many tribal companies are named in the article
function tribalScore(title, description = '') {
  const text = (title + ' ' + description).toLowerCase();
  return TRIBAL_COMPANIES.filter(co => text.includes(co)).length;
}

// Count numeric data points — % figures, $M/$B numbers, ratios, year-over-year stats
function dataScore(title, description = '') {
  const text = title + ' ' + description;
  const matches = text.match(/\d+(\.\d+)?(%|\s?x\b|\$[MBK]|\s?billion|\s?million|\s?percent|\s?times|x\s)/gi);
  return matches ? matches.length : 0;
}

function classifyArticle(title, description = '') {
  const text = (title + ' ' + description).toLowerCase();
  const aiScore = AI_KEYWORDS.filter(kw => text.includes(kw)).length;
  const gtmScore = GTM_KEYWORDS.filter(kw => text.includes(kw)).length;
  // If strong AI signal and weak GTM signal → ai. Otherwise → gtm.
  return aiScore >= 2 && aiScore > gtmScore ? 'ai' : 'gtm';
}

const BLOCKED_KEYWORDS = [
  // Politics / geopolitics
  'politic', 'election', 'government', 'war', 'conflict', 'religion', 'church',
  'geopolitic', 'ukraine', 'russia', 'taiwan', 'israel', 'gaza', 'iran',
  'gender', 'abortion', 'immigration', 'refugee', 'racist', 'discrimination',
  'sexual', 'abuse', 'violence', 'death', 'tragedy', 'shooting', 'crime',
  'divorce', 'lawsuit', 'scandal',
  // Consumer/retail stories — not Rain's B2B world
  'toy', 'charger', 'e-commerce consumer', 'retail store', 'fast fashion',
  'cancer', 'medical', 'healthcare', 'hospital', 'drug discovery', 'clinical',
  'drug trial', 'oncology',
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

  // Bonus: tribal companies mentioned (each +3, max +9)
  // Two named companies with audiences = reach multiplier potential
  const tribal = tribalScore(title, description);
  score += Math.min(tribal * 3, 9);

  // Bonus: hard data present (each number +2, max +6)
  // Articles with real numbers are the raw material for the data bomb hook
  const data = dataScore(title, description);
  score += Math.min(data * 2, 6);

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

        // Freshness filter: reject articles older than 14 days
        if (item.pubDate) {
          const pub = new Date(item.pubDate);
          if (!isNaN(pub) && (Date.now() - pub.getTime()) > 14 * 24 * 60 * 60 * 1000) continue;
        }

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

  // Return up to 10 candidates so generate has fallbacks if some articles fail
  return selected.slice(0, Math.max(count, 10));
}
