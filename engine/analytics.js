// Gritnord Visitor Analytics — reads page_views from Supabase
// Provides weekly KPI summaries and Claude-generated growth suggestions

import Anthropic from '@anthropic-ai/sdk';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function supabaseHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
  };
}

// ── Data fetchers ─────────────────────────────────────────────────────────────

export async function getVisitorStats({ days = 7 } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/page_views?created_at=gte.${since}&select=page,country,country_code,city,referrer,utm_source,utm_medium,session_id,created_at&limit=5000`,
    { headers: supabaseHeaders() }
  );

  if (!res.ok) throw new Error(`Supabase error ${res.status}`);
  const rows = await res.json();

  // Aggregate
  const totalViews = rows.length;
  const uniqueSessions = new Set(rows.map(r => r.session_id).filter(Boolean)).size;

  // Country breakdown — skip empty/unknown, group by country name
  const byCountry = {};
  for (const r of rows) {
    // Empty country = IP geolocation failed or timed out — skip from country stats
    if (!r.country || !r.country_code) continue;
    const key = r.country;
    byCountry[key] = (byCountry[key] || 0) + 1;
  }
  const topCountries = Object.entries(byCountry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([country, views]) => ({ country, views, pct: Math.round(views / totalViews * 100) }));

  // Page breakdown — map paths to readable labels
  const PAGE_LABELS = {
    '/': 'Homepage',
    '/blog': 'Blog index',
    '/about': 'About',
    '/contact': 'Contact',
    '/referrals': 'Referrals',
    '/sales-tools-guide': 'Sales Tools Guide',
    '/resources/nordic-meeting-booking-benchmark': 'Nordic Benchmark',
    '/lead-magnet': 'Lead Magnet',
    '/former-leaders': 'Former Leaders',
  };

  const byPage = {};
  for (const r of rows) {
    const path = r.page?.replace(/\?.*/, '') || '/';
    let label = PAGE_LABELS[path];
    if (!label) {
      if (path.startsWith('/blog/')) label = `Blog: ${path.replace('/blog/', '').replace(/-[a-z0-9]{6,10}$/, '').replace(/-/g, ' ')}`;
      else label = path;
    }
    const key = `${label}||${path}`;
    byPage[key] = (byPage[key] || 0) + 1;
  }
  const topPages = Object.entries(byPage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([key, views]) => {
      const [label, path] = key.split('||');
      return { page: label, path, views };
    });

  // Referrer breakdown
  const byReferrer = {};
  for (const r of rows) {
    const ref = r.referrer ? (new URL(r.referrer).hostname || 'direct') : 'direct';
    byReferrer[ref] = (byReferrer[ref] || 0) + 1;
  }
  const topReferrers = Object.entries(byReferrer)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([referrer, views]) => ({ referrer, views }));

  // UTM sources
  const byUTM = {};
  for (const r of rows) {
    const src = r.utm_source || 'organic';
    byUTM[src] = (byUTM[src] || 0) + 1;
  }
  const utmBreakdown = Object.entries(byUTM)
    .sort((a, b) => b[1] - a[1])
    .map(([source, views]) => ({ source, views }));

  // Daily trend (last 7 days)
  const byDay = {};
  for (const r of rows) {
    const day = r.created_at?.slice(0, 10);
    if (day) byDay[day] = (byDay[day] || 0) + 1;
  }
  const dailyTrend = Object.entries(byDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, views]) => ({ date, views }));

  return {
    period: `Last ${days} days`,
    totalViews,
    uniqueSessions,
    topCountries,
    topPages,
    topReferrers,
    utmBreakdown,
    dailyTrend,
    generatedAt: new Date().toISOString(),
  };
}

// Compare this week vs last week
export async function getWeeklyComparison() {
  const thisWeek = await getVisitorStats({ days: 7 });

  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/page_views?created_at=gte.${twoWeeksAgo}&created_at=lt.${oneWeekAgo}&select=session_id,country_code&limit=5000`,
    { headers: supabaseHeaders() }
  );
  const lastWeekRows = res.ok ? await res.json() : [];
  const lastWeekViews = lastWeekRows.length;
  const lastWeekSessions = new Set(lastWeekRows.map(r => r.session_id).filter(Boolean)).size;

  const viewsChange = lastWeekViews > 0
    ? Math.round((thisWeek.totalViews - lastWeekViews) / lastWeekViews * 100)
    : null;
  const sessionsChange = lastWeekSessions > 0
    ? Math.round((thisWeek.uniqueSessions - lastWeekSessions) / lastWeekSessions * 100)
    : null;

  return {
    thisWeek,
    lastWeek: { totalViews: lastWeekViews, uniqueSessions: lastWeekSessions },
    viewsChange,
    sessionsChange,
  };
}

// ── Weekly AI analysis ────────────────────────────────────────────────────────

export async function generateWeeklySuggestions(stats) {
  const prompt = `You are the growth analyst for Gritnord — a B2B meeting booking service targeting EU/UK B2B founders and VP Sales.

Gritnord's goal: drive qualified inbound traffic from B2B founders who need outbound meetings booked for them. Target markets: UK, Germany, Nordics (FI/SE/DK/NO), Netherlands, Estonia, US.

Website analytics for the past 7 days:
- Total page views: ${stats.thisWeek.totalViews}
- Unique sessions: ${stats.thisWeek.uniqueSessions}
- Views vs last week: ${stats.viewsChange !== null ? `${stats.viewsChange > 0 ? '+' : ''}${stats.viewsChange}%` : 'no prior data'}
- Sessions vs last week: ${stats.sessionsChange !== null ? `${stats.sessionsChange > 0 ? '+' : ''}${stats.sessionsChange}%` : 'no prior data'}

Top countries:
${stats.thisWeek.topCountries.map(c => `- ${c.country}: ${c.views} views (${c.pct}%)`).join('\n')}

Top pages:
${stats.thisWeek.topPages.map(p => `- ${p.page}: ${p.views} views`).join('\n')}

Top referrers:
${stats.thisWeek.topReferrers.map(r => `- ${r.referrer}: ${r.views} views`).join('\n')}

Traffic sources:
${stats.thisWeek.utmBreakdown.map(u => `- ${u.source}: ${u.views} views`).join('\n')}

Give exactly 5 specific, actionable suggestions to increase qualified UC (paying client) traffic to gritnord.com this week. Each suggestion must:
- Be specific to the data above (reference actual countries, pages, or sources)
- Have a clear action Rain can take in the next 7 days
- Focus on EU/UK B2B founder audience
- Not be generic marketing advice

Format: numbered list, one sentence per suggestion. No preamble, no summary.`;

  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });

  return res.content.find(b => b.type === 'text')?.text?.trim() ?? '';
}
