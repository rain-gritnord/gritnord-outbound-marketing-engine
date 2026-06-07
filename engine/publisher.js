// Publishes ai_search content to Supabase blog_posts table

const SUPABASE_URL = process.env.SUPABASE_URL;
// Service key is required for INSERT — anon key is blocked by RLS on blog_posts
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

// Sequential photo pool — 60 distinct images cycled by total post count in DB.
// Never uses hash/bucket — guarantees no two adjacent posts share a photo.
// 47 unique verified IDs — no duplicates, no 404s, no food photos
// Verified June 2026. Each post gets a distinct image. Pool cycles after 47.
const PHOTO_POOL_SEQ = [
  '1556761223-4c4282c73f77','1551288049-bebda4e38f71','1552664730-d307ca884978',
  '1573496359142-b8d87734a5a2','1516321318423-f06f85e504b3','1560472354-b33ff0c44a43',
  '1498050108023-c5249f4df085','1531973576160-7125cd663d86','1507679799987-c73779587ccf',
  '1519389950473-47ba0277781c','1563013544-824ae1b704d3','1460925895917-afdab827c52f',
  '1600880292203-757bb62b4baf','1529400971008-f566de0e6dfc','1573164713988-8665fc963095',
  '1542744173-8e7e53415bb0','1556742049-0cfed4f6a45d','1454165804606-c3d57bc86b40',
  '1486312338219-ce68d2c6f44d','1504868584819-f8e8b4b6d7e3','1450101499163-c8848c66ca85',
  '1553028826-f4804a6dba3b','1507003211169-0a1dd7228f2d','1522202176988-66273c2fd55f',
  '1559136555-9303baea8ebd','1497366216548-37526070297c','1551836022-d5d88e9218df',
  '1497366811353-6870744d04b2','1520607162513-77705c0f0d4a','1522071820081-009f0129c71c',
  '1483389127117-b6a2102724ae','1557804506-669a67965ba0','1568992687947-868a62a9f521',
  '1524758631624-e2822e304c36','1606857521015-7f9fcf423740','1515378960530-7c0da6231fb1',
  '1551434678-e076c223a692','1423666639041-f56000c27a9a','1558618666-fcd25c85cd64',
  '1476357471311-43c0db9fb2b4','1530099486328-e021101a494a','1589829545856-d10d557cf95f',
  '1600195077077-7c815f540a3d','1609921212029-bb5a28e60960','1517245386807-bb43f82c33c4',
  '1543269865-cbf427effbad','1499750310107-5fef28a66643',
];

// Kept for legacy reference only — no longer used for new posts
const PHOTO_POOLS = {
  sales: [
    '1556761223-4c4282c73f77', // sales call at desk
    '1563013544-824ae1b704d3', // phone call sales rep
    '1507679799987-c73779587ccf', // suited professional walking
    '1560472354-b33ff0c44a43', // business handshake
    '1600880292203-757bb62b4baf', // confident professional portrait
    '1450101499163-c8848c66ca85', // meeting notes whiteboard
  ],
  pipeline: [
    '1551288049-bebda4e38f71', // analytics dashboard dark
    '1516321318423-f06f85e504b3', // data visualisation screen
    '1531973576160-7125cd663d86', // business analytics charts
    '1556742049-0cfed4f6a45d', // CRM/sales dashboard
    '1460925895917-afdab827c52f', // laptop with charts
    '1504868584819-f8e8b4b6d7e3', // data analysis laptop
  ],
  team: [
    '1552664730-d307ca884978', // team collaboration
    '1551836022-d5d88e9218df', // boardroom meeting
    '1519389950473-47ba0277781c', // team standing around screen
    '1522202176988-66273c2fd55f', // small team discussion
    '1542744173-8e7e53415bb0', // business meeting round table
    '1529400971008-f566de0e6dfc', // strategy planning overhead
  ],
  founder: [
    '1573496359142-b8d87734a5a2', // professional woman laptop
    '1573164713988-8665fc963095', // entrepreneur at desk dark
    '1507003211169-0a1dd7228f2d', // man focused at desk
    '1521737604082-1edd29267789', // desk with notebook and laptop
    '1454165804606-c3d57bc86b40', // laptop open coffee desk
    '1498050108023-c5249f4df085', // laptop code dark
  ],
  office: [
    '1553028826-f4804a6dba3b', // open-plan tech office
    '1497366216548-37526070297c', // minimal office workspace
    '1497366811353-6870744d04b2', // modern open office
    '1486312338219-ce68d2c6f44d', // person typing on laptop
    '1565106430-d6d7d90978e5', // tech startup workspace
    '1559136555-9303baea8ebd', // whiteboard strategy
  ],
};

function topicBucket(slugOrTopic = '') {
  const t = slugOrTopic.toLowerCase();
  if (/sales|meeting|outreach|cold|prospect|lead/.test(t)) return 'sales';
  if (/pipeline|revenue|crm|data|analytics|dashboard|automation/.test(t)) return 'pipeline';
  if (/team|hiring|sdr|bdr|headcount|manager/.test(t)) return 'team';
  if (/founder|startup|saas|gtm|strategy|growth/.test(t)) return 'founder';
  return 'office';
}

// Pick next photo sequentially based on current published post count.
// Pass postCount = (current total posts in DB) so each new post advances by 1.
function getCoverImageUrl(slugOrTopic = '', postCount = 0) {
  const idx = postCount % PHOTO_POOL_SEQ.length;
  return `https://images.unsplash.com/photo-${PHOTO_POOL_SEQ[idx]}?w=1200&h=630&fit=crop&auto=format&q=80`;
}

// Convert markdown to clean HTML for proper blog rendering
function markdownToHtml(md) {
  let html = md
    // Strip META: and INTERNAL LINK: lines
    .replace(/^META:.*$/gm, '')
    .replace(/^INTERNAL LINK:.*$/gm, '')
    // H1, H2, H3
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Horizontal rule
    .replace(/^---+$/gm, '<hr>')
    // Numbered lists
    .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
    // Bullet lists
    .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');

  // Wrap consecutive <li> in <ul> or <ol>
  html = html.replace(/(<li>.*<\/li>\n?)+/g, match => {
    return `<ul>${match}</ul>`;
  });

  // Wrap plain text lines in <p> (skip lines that are already HTML tags)
  html = html
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<')) return trimmed;
      return `<p>${trimmed}</p>`;
    })
    .join('\n');

  // Clean up empty paragraphs
  html = html.replace(/<p><\/p>/g, '').replace(/\n{3,}/g, '\n\n');

  return html.trim();
}


function supabaseHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Prefer': 'return=representation',
  };
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .slice(0, 80);
}

// Strip all META: variants the model might produce (plain, bolded, with asterisks)
function stripMetaPrefix(line) {
  return line
    .replace(/^\*\*META:\*\*\s*/i, '')
    .replace(/^\*META:\*\s*/i, '')
    .replace(/^META:\s*/i, '')
    .trim();
}

function isMetaLine(line) {
  return /^(\*\*)?META:(\*\*)?\s/i.test(line.trim());
}

function parseArticle(content) {
  const lines = content.split('\n');
  let title = '';
  let metaDescription = '';
  const bodyLines = [];

  for (const line of lines) {
    if (!title && line.startsWith('# ')) {
      title = line.replace(/^# /, '').trim();
    } else if (isMetaLine(line)) {
      metaDescription = stripMetaPrefix(line);
    } else {
      bodyLines.push(line);
    }
  }

  if (!title) {
    const h2 = lines.find(l => l.startsWith('## '));
    title = h2 ? h2.replace(/^## /, '').trim() : 'Gritnord Article';
  }

  // Excerpt: first real paragraph — skip headings, META lines, INTERNAL LINK lines
  const excerpt = bodyLines
    .map(l => l.trim())
    .find(l => l && !l.startsWith('#') && !isMetaLine(l) && !l.startsWith('INTERNAL LINK:') && l.length > 40)
    ?.replace(/\*\*/g, '') // strip any bold markdown from excerpt
    .slice(0, 200) || metaDescription.slice(0, 200);

  // Reading time: ~200 words per minute
  const wordCount = content.split(/\s+/).length;
  const readingTimeMinutes = Math.max(1, Math.round(wordCount / 200));

  // SEO keywords: extract from title words + topic
  const seoKeywords = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(' ')
    .filter(w => w.length > 3)
    .slice(0, 8)
    .join(', ');

  return { title, metaDescription, excerpt, readingTimeMinutes, seoKeywords };
}

export async function publishToSupabase(item) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase credentials not configured');
  }

  const { title, metaDescription, excerpt, readingTimeMinutes, seoKeywords } = parseArticle(item.content);
  const baseSlug = slugify(title);
  const slug = item.customSlug || (baseSlug + '-' + Date.now().toString(36));
  const htmlContent = markdownToHtml(item.content);
  // Count existing posts to get next sequential image slot
  const countRes = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts?select=id&status=eq.published`, { headers: supabaseHeaders() });
  const existing = countRes.ok ? await countRes.json() : [];
  const imageUrl = getCoverImageUrl(item.topic || title, existing.length);

  const post = {
    title,
    slug,
    content: htmlContent,
    excerpt,
    meta_description: metaDescription,
    seo_title: title,
    seo_description: metaDescription || excerpt,
    seo_keywords: seoKeywords,
    featured_image_url: imageUrl,
    cover_image_url: imageUrl,
    author_name: 'Gritnord Team',
    reading_time_minutes: readingTimeMinutes,
    is_featured: false,
    channel: item.channel,
    topic: item.topic,
    score: item.score ?? null,
    content_engine_id: item.id,
    status: 'published',
    published_at: new Date().toISOString(),
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts`, {
    method: 'POST',
    headers: supabaseHeaders(),
    body: JSON.stringify(post),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data[0] ?? data;
}

export async function getBlogPosts({ limit = 20, status = 'published' } = {}) {
  const params = new URLSearchParams({
    status: `eq.${status}`,
    order: 'published_at.desc',
    limit: String(limit),
  });

  const res = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts?${params}`, {
    headers: supabaseHeaders(),
  });

  if (!res.ok) throw new Error(`Supabase error ${res.status}`);
  return res.json();
}
