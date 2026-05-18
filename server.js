import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { readFileSync, readdirSync, renameSync, mkdirSync as fsMkdirSync, existsSync as fsExistsSync } from 'fs';

import { generateContent, scoreContent, CHANNELS } from './engine/generator.js';
import { recordScore, getPrioritizedChannels, getLearningState } from './engine/learner.js';
import { publishToSupabase, getBlogPosts } from './engine/publisher.js';
import { curateArticles } from './engine/linkedin-curator.js';
import { generateLinkedInPost, postToLinkedIn, getAuthUrl, exchangeCode, isConnected, loadTokens } from './engine/linkedin-poster.js';
import { generateTweet, postTweet, postThread, isConnected as isTwitterConnected } from './engine/twitter-poster.js';
import {
  getAllContent, getContentById, saveContent, updateContent,
  getAllCycles, saveCycle,
  getLinkedInQueue, saveLinkedInDraft, updateLinkedInPost, deleteLinkedInPost,
  getLinkedInGuidelines, saveLinkedInGuideline, dismissLinkedInGuideline,
  getFollowerHistory,
  getTwitterQueue, saveTwitterDraft, updateTwitterPost, deleteTwitterPost,
  getUCCandidates, saveUCCandidate, updateUCCandidate, deleteUCCandidate,
  getUCSequences, saveUCSequence, updateUCSequence, getUCSequenceByCandidateId,
} from './engine/db.js';
import { researchUCCandidate, batchResearchUCCandidates } from './engine/uc-researcher.js';
import { generateKineticVideo } from './engine/video-generator.js';
import { tickSequences, startUCSequence, fireSequenceStep } from './engine/uc-sequencer.js';
import { syncCandidateToAudience, syncEmailsToLinkedInAudience } from './engine/linkedin-audiences.js';
import { fetchAndLearnFromEngagement, fetchFollowerCount, engagementToScore } from './engine/linkedin-engagement.js';
import { generateSuggestions } from './engine/suggestion-engine.js';
import {
  getCMPieces, getCMNewsletter, getCMSubscribers,
  saveCMPiece, updateCMPiece, addSubscriber, saveNewsletter,
  generateAllFormats, compileWeeklyNewsletter,
} from './engine/content-engine.js';
import { sendNewsletter, sendTestNewsletter, previewNewsletterHtml } from './engine/newsletter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

// ─── Session Auth ─────────────────────────────────────────────────────────────

const SESSION_SECRET = process.env.SESSION_SECRET || 'gritnord-dev-secret-change-me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const i = c.indexOf('=');
    if (i < 0) return;
    out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}

function signSession(data) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySession(token) {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch { return null; }
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return null; }
}

function setSessionCookie(res, data) {
  const token = signSession(data);
  res.setHeader('Set-Cookie', `grtn_session=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 3600}; SameSite=Lax`);
}

const PROTECTED = new Set(['/dashboard.html', '/linkedin.html', '/twitter.html', '/roadmap.html', '/architecture-v7.html', '/uc-acquisition.html', '/content-marketing.html']);
const AUTH_PUBLIC = new Set(['/login.html', '/auth/login', '/auth/logout', '/auth/google', '/auth/google/callback', '/auth/linkedin', '/auth/linkedin/callback', '/bookmarklet-sync']);

function authMiddleware(req, res, next) {
  if (AUTH_PUBLIC.has(req.path) || (!PROTECTED.has(req.path) && !req.path.startsWith('/api/'))) return next();
  const session = verifySession(parseCookies(req).grtn_session);
  if (session?.authenticated) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  res.redirect('/login.html?next=' + encodeURIComponent(req.path));
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(authMiddleware);
app.use(express.static(path.join(__dirname, 'public')));

// ─── Auth Routes ─────────────────────────────────────────────────────────────

app.post('/auth/login', (req, res) => {
  const { password, next } = req.body;
  if (ADMIN_PASSWORD && password === ADMIN_PASSWORD) {
    setSessionCookie(res, { authenticated: true, via: 'password' });
    return res.redirect(next && next.startsWith('/') ? next : '/dashboard.html');
  }
  res.redirect('/login.html?error=1&next=' + encodeURIComponent(next || '/dashboard.html'));
});

app.get('/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'grtn_session=; HttpOnly; Path=/; Max-Age=0');
  res.redirect('/login.html');
});

const GOOGLE_CLIENT_ID     = () => process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = () => process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT      = () => process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';

app.get('/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID()) return res.status(500).send('GOOGLE_CLIENT_ID not set in .env');
  const state = Buffer.from(req.query.next || '/dashboard.html').toString('base64url');
  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID(),
    redirect_uri:  GOOGLE_REDIRECT(),
    response_type: 'code',
    scope:         'openid email profile',
    state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error || !code) return res.redirect('/login.html?error=google');
  let next = '/dashboard.html';
  try { next = Buffer.from(state, 'base64url').toString() || next; } catch {}
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     GOOGLE_CLIENT_ID(),
        client_secret: GOOGLE_CLIENT_SECRET(),
        redirect_uri:  GOOGLE_REDIRECT(),
        grant_type:    'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) throw new Error('No access token received');
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const user = await userRes.json();
    setSessionCookie(res, { authenticated: true, email: user.email, name: user.name, via: 'google' });
    res.redirect(next.startsWith('/') ? next : '/dashboard.html');
  } catch (err) {
    console.error('[auth/google]', err.message);
    res.redirect('/login.html?error=google');
  }
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function newId() {
  return crypto.randomBytes(6).toString('hex');
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// GET /api/status — health check + engine state
app.get('/api/status', (req, res) => {
  const content = getAllContent();
  const cycles  = getAllCycles();
  res.json({
    status:       'running',
    timestamp:    new Date().toISOString(),
    totalContent: content.length,
    totalCycles:  cycles.length,
    channels:     CHANNELS.length,
    learning:     getLearningState(),
  });
});

// GET /api/content — list all content (with optional ?channel= filter)
app.get('/api/content', (req, res) => {
  let items = getAllContent();
  if (req.query.channel) {
    items = items.filter(i => i.channel === req.query.channel);
  }
  if (req.query.status) {
    items = items.filter(i => i.status === req.query.status);
  }
  res.json({ items, total: items.length });
});

// POST /api/generate — generate content for a single channel
app.post('/api/generate', async (req, res) => {
  const { channel, topic, additionalContext } = req.body;

  if (!channel || !CHANNELS.includes(channel)) {
    return res.status(400).json({ error: `Invalid channel. Valid: ${CHANNELS.join(', ')}` });
  }

  try {
    const result = await generateContent({ channel, topic, additionalContext });

    const item = {
      id:         newId(),
      ...result,
      status:     'draft',
      score:      null,
      createdAt:  new Date().toISOString(),
      updatedAt:  new Date().toISOString(),
    };

    saveContent(item);
    res.json({ success: true, item });
  } catch (err) {
    console.error('[generate]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/score/:id — score a piece of content
app.post('/api/score/:id', async (req, res) => {
  const item = getContentById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Content not found' });

  try {
    const { score, reasoning } = await scoreContent({ channel: item.channel, content: item.content });

    const updated = updateContent(item.id, { score, scoreReasoning: reasoning, status: 'scored' });

    // Feed score into learning system
    recordScore(item.channel, score);

    res.json({ success: true, item: updated, score, reasoning });
  } catch (err) {
    console.error('[score]', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/content/:id — update status, notes, etc.
app.patch('/api/content/:id', (req, res) => {
  const item = getContentById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Content not found' });

  const allowed = ['status', 'notes', 'content', 'topic'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const updated = updateContent(item.id, updates);
  res.json({ success: true, item: updated });
});

// POST /api/cycle/run — run a full generation cycle across all channels
app.post('/api/cycle/run', async (req, res) => {
  const { topic, channels: requestedChannels } = req.body;
  const targetChannels = requestedChannels?.length
    ? requestedChannels.filter(c => CHANNELS.includes(c))
    : CHANNELS;

  const cycleId = newId();
  const started = new Date().toISOString();
  const results = [];
  const errors  = [];

  // Stream response for real-time progress
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');

  const send = obj => res.write(JSON.stringify(obj) + '\n');
  send({ event: 'cycle_start', cycleId, channels: targetChannels, topic: topic || 'auto' });

  for (const channel of targetChannels) {
    send({ event: 'channel_start', channel });
    try {
      const result = await generateContent({ channel, topic });
      const item = {
        id:        newId(),
        ...result,
        cycleId,
        status:    'draft',
        score:     null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveContent(item);
      results.push({ channel, id: item.id, success: true });
      send({ event: 'channel_done', channel, id: item.id });
    } catch (err) {
      errors.push({ channel, error: err.message });
      send({ event: 'channel_error', channel, error: err.message });
    }
  }

  const cycle = {
    id:        cycleId,
    startedAt: started,
    endedAt:   new Date().toISOString(),
    topic:     topic || 'auto',
    channels:  targetChannels,
    generated: results.length,
    errors:    errors.length,
    results,
    errors,
  };
  saveCycle(cycle);

  send({ event: 'cycle_done', cycle });
  res.end();
});

// GET /api/cycles — list all cycles
app.get('/api/cycles', (req, res) => {
  res.json({ cycles: getAllCycles() });
});

// GET /api/channels — channel info + learning weights
app.get('/api/channels', (req, res) => {
  const prioritized = getPrioritizedChannels();
  res.json({ channels: prioritized });
});

// GET /api/options — valid channels list (for UI dropdowns)
app.get('/api/options', (req, res) => {
  res.json({ channels: CHANNELS });
});

// POST /api/publish/:id — publish a content item to Supabase blog_posts
app.post('/api/publish/:id', async (req, res) => {
  const item = getContentById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Content not found' });

  try {
    const post = await publishToSupabase(item);
    const updated = updateContent(item.id, { status: 'published', supabaseId: post.id });
    res.json({ success: true, item: updated, post });
  } catch (err) {
    console.error('[publish]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/blog — list published blog posts from Supabase
app.get('/api/blog', async (req, res) => {
  try {
    const posts = await getBlogPosts({ limit: Number(req.query.limit) || 20 });
    res.json({ posts, total: posts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── LinkedIn Routes ─────────────────────────────────────────────────────────

// GET /auth/linkedin — redirect to LinkedIn OAuth consent screen
app.get('/auth/linkedin', (req, res) => {
  if (!process.env.LINKEDIN_CLIENT_ID) {
    return res.status(500).send('LINKEDIN_CLIENT_ID not set in .env');
  }
  res.redirect(getAuthUrl());
});

// GET /auth/linkedin/callback — handle OAuth callback
app.get('/auth/linkedin/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.status(400).send(`OAuth error: ${error || 'no code'}`);
  try {
    await exchangeCode(code);
    res.send('<h2>LinkedIn connected. You can close this tab.</h2><script>setTimeout(()=>window.close(),2000)</script>');
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

// GET /api/linkedin/status — connection status
app.get('/api/linkedin/status', (req, res) => {
  const tokens = loadTokens();
  // r_member_social scope lets us auto-fetch likes/comments/shares after posting
  const scope = tokens?.scope || '';
  const hasReadScope = scope.includes('r_member_social');
  res.json({
    connected:    isConnected(),
    hasReadScope,
    expiresAt: tokens?.expires_in
      ? new Date(tokens.savedAt + tokens.expires_in * 1000).toISOString()
      : null,
  });
});

// GET /api/linkedin/queue — list all drafts
app.get('/api/linkedin/queue', (req, res) => {
  const queue = getLinkedInQueue();
  res.json({ posts: queue, total: queue.length });
});

// POST /api/linkedin/generate — manually curate + generate drafts
app.post('/api/linkedin/generate', async (req, res) => {
  try {
    // Pass already-queued article links so we never repeat the same article/image
    const existingQueue = getLinkedInQueue();
    const usedLinks = existingQueue.map(p => p.article?.link).filter(Boolean);

    const articles = await curateArticles({ count: 3, usedLinks });
    const drafts = [];

    // Track links already in the queue (including existing drafts) to prevent duplicates
    const existingLinks = new Set(existingQueue.map(p => p.article?.link).filter(Boolean));

    for (const article of articles) {
      // Skip if a draft already exists for this article (prevents double-generation on repeated clicks)
      if (existingLinks.has(article.link)) {
        console.log(`[linkedin/generate] Skipping duplicate: ${article.link}`);
        continue;
      }
      existingLinks.add(article.link);

      // AI articles → 'reshare' with AI angle; GTM articles → 'reshare' with sales/pipeline angle
      const postType = 'reshare';
      const topicHint = article.topic === 'gtm'
        ? 'Focus on the GTM, sales, pipeline, or customer acquisition angle. Avoid making this about AI as a trend — make it about getting customers and growing revenue.'
        : 'This is the weekly AI-related post. Tie the AI angle back to practical B2B sales impact.';

      const text = await generateLinkedInPost({ article, postType, additionalContext: topicHint });
      const draft = {
        id: newId(),
        text,
        article,
        imageUrl: article.image || null,
        status: 'draft',
        topic: article.topic,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveLinkedInDraft(draft);
      drafts.push(draft);
    }

    res.json({ success: true, drafts, total: drafts.length });
  } catch (err) {
    console.error('[linkedin/generate]', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/linkedin/queue/:id — edit draft text
app.patch('/api/linkedin/queue/:id', (req, res) => {
  const { text } = req.body;
  const updated = updateLinkedInPost(req.params.id, { text });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true, post: updated });
});

// POST /api/linkedin/approve/:id — approve and post to LinkedIn
app.post('/api/linkedin/approve/:id', async (req, res) => {
  const queue = getLinkedInQueue();
  const post = queue.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  if (!isConnected()) return res.status(400).json({ error: 'LinkedIn not connected. Visit /auth/linkedin first.' });

  try {
    updateLinkedInPost(post.id, { status: 'posting' });
    const articleLink = post.article?.link;
    const finalText = articleLink ? `${post.text}\n\n${articleLink}` : post.text;
    const result = await postToLinkedIn({ text: finalText, imageUrl: post.imageUrl });
    updateLinkedInPost(post.id, { status: 'posted', linkedInId: result.id, linkedInUrl: result.url, postedAt: new Date().toISOString() });
    res.json({ success: true, url: result.url });
  } catch (err) {
    updateLinkedInPost(post.id, { status: 'draft' });
    console.error('[linkedin/approve]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/linkedin/engagement/sync — manually trigger engagement fetch + learning
app.post('/api/linkedin/engagement/sync', async (req, res) => {
  try {
    const results = await fetchAndLearnFromEngagement();
    res.json({ success: true, scored: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/linkedin/suggestions — AI-generated improvement suggestions
app.get('/api/linkedin/suggestions', async (req, res) => {
  try {
    const result = await generateSuggestions();
    const accepted = getLinkedInGuidelines();
    res.json({ ...result, accepted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/linkedin/suggestions/accept — accept a suggestion as a guideline
app.post('/api/linkedin/suggestions/accept', (req, res) => {
  const { id, title, action, category } = req.body;
  if (!id || !title) return res.status(400).json({ error: 'id and title required' });
  const guideline = saveLinkedInGuideline({
    id, title, action, category,
    acceptedAt: new Date().toISOString(),
  });
  res.json({ success: true, guideline });
});

// DELETE /api/linkedin/suggestions/accept/:id — dismiss a guideline
app.delete('/api/linkedin/suggestions/accept/:id', (req, res) => {
  dismissLinkedInGuideline(req.params.id);
  res.json({ success: true });
});

// GET /api/linkedin/followers — follower count history
app.get('/api/linkedin/followers', async (req, res) => {
  const history = getFollowerHistory();
  const current = await fetchFollowerCount().catch(() => null);
  res.json({ current, history });
});

// OPTIONS preflight for bookmarklet CORS
app.options('/api/linkedin/engagement/enter', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

// GET /bookmarklet-sync — popup opened by bookmarklet from LinkedIn
// No auth required — localhost only, data flows in only (no reads exposed)
// Query params: textSnippet, likes, comments, shares, impressions, urlUrn
app.get('/bookmarklet-sync', (req, res) => {
  const { textSnippet = '', urlUrn = '', likes = 0, comments = 0, shares = 0, impressions } = req.query;

  const queue = getLinkedInQueue();
  let post = null;

  // Match by text snippet (most reliable — activity URN ≠ share URN)
  if (textSnippet) {
    const snippet = textSnippet.slice(0, 80).toLowerCase().replace(/\s+/g, ' ').trim();
    post = queue
      .filter(p => p.status === 'posted' && p.text)
      .find(p => {
        const t = (p.text || '').slice(0, 80).toLowerCase().replace(/\s+/g, ' ').trim();
        return t.startsWith(snippet.slice(0, 55)) || snippet.startsWith(t.slice(0, 55));
      });
  }

  const htmlPage = (ok, msg, score) => `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Gritnord</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    background:${ok ? '#0a1a0a' : '#1a0a0a'};color:#fff;
    display:flex;align-items:center;justify-content:center;
    height:100vh;text-align:center;padding:24px;}
  .icon{font-size:36px;margin-bottom:12px;}
  .title{font-size:16px;font-weight:700;margin-bottom:6px;color:${ok ? '#4ade80' : '#f87171'};}
  .sub{font-size:13px;color:#888;line-height:1.5;}
  .score{font-size:28px;font-weight:800;color:${ok ? '#4ade80' : '#f87171'};margin:8px 0;}
</style>
</head>
<body>
<div>
  <div class="icon">${ok ? '✅' : '❌'}</div>
  <div class="title">${ok ? 'Gritnord synced' : 'Not found'}</div>
  ${ok && score ? `<div class="score">${score}/10</div>` : ''}
  <div class="sub">${msg}</div>
  <div class="sub" style="margin-top:12px;color:#555;font-size:11px;">This window closes automatically…</div>
</div>
<script>setTimeout(function(){window.close();},3500);</script>
</body></html>`;

  if (!post) {
    return res.send(htmlPage(false, 'Post not found in Gritnord queue.<br>Make sure it was posted via Gritnord and is at least 48h old.', null));
  }

  const metrics = {
    likes:       +likes,
    comments:    +comments,
    shares:      +shares,
    impressions: impressions ? +impressions : null,
    clicks:      null,
  };
  const score = engagementToScore(metrics);

  recordScore('linkedin', score);
  updateLinkedInPost(post.id, {
    engagement:         metrics,
    engagementScore:    score,
    engagementScoredAt: new Date().toISOString(),
    engagementBlocked:  false,
  });

  console.log(`[bookmarklet] ${post.id}: likes=${likes} comments=${comments} shares=${shares} impressions=${impressions||'?'} → score=${score}`);

  const impText = metrics.impressions ? ` · ${(+impressions).toLocaleString()} impressions` : '';
  res.send(htmlPage(true,
    `${+likes} reactions · ${+comments} comments · ${+shares} reposts${impText}`,
    score
  ));
});

// LinkedIn PostAnalytics XLSX parser
// Format: vertical — col A = label, col B = value (e.g. ['Impressions', '45377'])
function parseLinkedInXlsx(buffer) {
  const wb   = XLSX.read(buffer, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Build label → value map from all rows
  const map = {};
  for (const row of rows) {
    const label = String(row[0] || '').toLowerCase().trim();
    const val   = String(row[1] || '').replace(/,/g, '').trim();
    if (label) map[label] = parseInt(val, 10) || 0;
  }

  const get = (...keys) => {
    for (const k of keys) {
      const hit = Object.keys(map).find(l => l.includes(k));
      if (hit !== undefined) return map[hit];
    }
    return 0;
  };

  return {
    impressions: get('impression'),
    likes:       get('reaction'),
    comments:    get('comment'),
    shares:      get('repost'),
    followers:   get('followers gained'),
  };
}

// POST /api/linkedin/engagement/xlsx — parse LinkedIn PostAnalytics export file
// LinkedIn export filename: PostAnalytics_RainVaana_{shareId}.xlsx
// The share ID in the filename matches our linkedInId field exactly
app.post('/api/linkedin/engagement/xlsx', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const { impressions, likes, comments, shares, followers } = parseLinkedInXlsx(req.file.buffer);
    const numMatch = (req.file.originalname || '').match(/(\d{15,})/);
    const shareNum = numMatch?.[1];

    const queue = getLinkedInQueue();
    const post  = shareNum
      ? queue.find(p => (p.linkedInId || '').replace(/urn:li:(share|ugcPost|activity):/i, '') === shareNum)
      : null;

    if (!post) return res.status(404).json({ error: `Post not found (share ID: ${shareNum || 'unknown'})` });

    const metrics = { likes, comments, shares, impressions, followers, clicks: null };
    const score   = engagementToScore(metrics);

    recordScore('linkedin', score);
    updateLinkedInPost(post.id, {
      engagement: metrics, engagementScore: score,
      engagementScoredAt: new Date().toISOString(), engagementBlocked: false,
    });

    console.log(`[xlsx-import] ${post.id}: impressions=${impressions} likes=${likes} comments=${comments} shares=${shares} followers=${followers} → score=${score}`);
    res.json({ success: true, score, metrics, postId: post.id });
  } catch (err) {
    console.error('[xlsx-import]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/linkedin/engagement/enter — receive engagement data from bookmarklet or UI
// Body: { id?, linkedInId?, likes, comments, shares, impressions?, clicks? }
// Accepts either our internal id OR the LinkedIn URN (linkedInId) — bookmarklet uses linkedInId
app.post('/api/linkedin/engagement/enter', (req, res) => {
  // Allow bookmarklet calls from linkedin.com (same machine, different origin)
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  const { id, linkedInId, textSnippet, urlUrn, likes = 0, comments = 0, shares = 0, impressions = null, clicks = null } = req.body;
  if (!id && !linkedInId && !textSnippet) return res.status(400).json({ error: 'id, linkedInId, or textSnippet required' });

  const queue = getLinkedInQueue();
  let post;

  if (id) {
    post = queue.find(p => p.id === id);
  } else if (linkedInId) {
    // Match by LinkedIn URN — strip prefix, compare numeric ID only
    const numId = linkedInId.replace(/urn:li:(share|ugcPost|activity):/i, '');
    post = queue.find(p => {
      const pNum = (p.linkedInId || '').replace(/urn:li:(share|ugcPost|activity):/i, '');
      return pNum === numId && pNum !== '';
    });
  }

  // Bookmarklet sends textSnippet + urlUrn — match by text (most reliable across URN type changes)
  if (!post && textSnippet) {
    const snippet = textSnippet.slice(0, 80).toLowerCase().replace(/\s+/g, ' ').trim();
    post = queue
      .filter(p => p.status === 'posted' && p.text)
      .find(p => {
        const t = (p.text || '').slice(0, 80).toLowerCase().replace(/\s+/g, ' ').trim();
        // Match if 70%+ of snippet aligns with stored text start
        return t.startsWith(snippet.slice(0, 60)) || snippet.startsWith(t.slice(0, 60));
      });
  }

  if (!post) return res.status(404).json({ error: 'Post not found — make sure it was posted via Gritnord' });

  const metrics = { likes: +likes, comments: +comments, shares: +shares, impressions, clicks };
  const score = engagementToScore(metrics);

  recordScore('linkedin', score);
  updateLinkedInPost(post.id, {   // fix: always use post.id, not req.body.id
    engagement:          metrics,
    engagementScore:     score,
    engagementScoredAt:  new Date().toISOString(),
    engagementBlocked:   false,
  });

  console.log(`[engagement/enter] ${post.id}: likes=${likes} comments=${comments} shares=${shares} impressions=${impressions||'?'} → score=${score}`);
  res.json({ success: true, score, metrics });
});

// GET /api/linkedin/analytics — learning state + all scored posts for performance tab
app.get('/api/linkedin/analytics', (req, res) => {
  const weights  = getLearningState();
  const li       = weights.find(w => w.channel === 'linkedin') || {};
  const queue    = getLinkedInQueue();

  // All posts that have been scored (have real engagement data)
  const scored = queue
    .filter(p => p.status === 'posted' && p.engagementScoredAt)
    .map(p => ({
      id:              p.id,
      text:            (p.text || '').slice(0, 120) + ((p.text || '').length > 120 ? '…' : ''),
      postedAt:        p.postedAt,
      scoredAt:        p.engagementScoredAt,
      likes:           p.engagement?.likes       ?? 0,
      comments:        p.engagement?.comments   ?? 0,
      shares:          p.engagement?.shares     ?? 0,
      impressions:     p.engagement?.impressions ?? null,
      clicks:          p.engagement?.clicks      ?? null,
      score:           p.engagementScore         ?? null,
      linkedInUrl:     p.linkedInUrl             || null,
      source:          p.article?.source         || null,
      topic:           p.article?.topic          || null,
    }))
    .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));

  // All posted (including unscored) — to show pending engagement pulls
  const posted = queue
    .filter(p => p.status === 'posted' && !p.engagementScoredAt)
    .map(p => ({
      id:              p.id,
      text:            (p.text || '').slice(0, 120) + ((p.text || '').length > 120 ? '…' : ''),
      postedAt:        p.postedAt,
      source:          p.article?.source  || null,
      topic:           p.article?.topic   || null,
      linkedInUrl:     p.linkedInUrl      || null,
      apiBlocked:      p.engagementBlocked ?? false,
    }));

  res.json({
    learner: {
      avgScore:    li.avgScore    ?? null,
      successRate: li.successRate ?? null,
      priority:    li.priority    ?? null,
    },
    scored,
    pending: posted,
    totalScored:  scored.length,
    totalPosted:  scored.length + posted.length,
  });
});


// Save pre-written text directly to LinkedIn queue (from Content OS)
app.post('/api/linkedin/queue/save', (req, res) => {
  const { text, article } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  const draft = {
    id: newId(),
    text,
    article: article || {},
    imageUrl: article?.image || null,
    status: 'draft',
    topic: article?.topic || 'gtm',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveLinkedInDraft(draft);
  res.json(draft);
});

// DELETE /api/linkedin/queue/:id — discard draft
app.delete('/api/linkedin/queue/:id', (req, res) => {
  deleteLinkedInPost(req.params.id);
  res.json({ success: true });
});

// ─── UC Acquisition Routes ───────────────────────────────────────────────────

// Serve generated media files (videos, voice notes)
app.use('/media', express.static(path.join(__dirname, 'data', 'media')));

// GET /api/uc/candidates
app.get('/api/uc/candidates', (req, res) => {
  const candidates = getUCCandidates();
  const sequences = getUCSequences();
  const enriched = candidates.map(c => ({
    ...c,
    sequence: sequences.find(s => s.candidateId === c.id) || null,
  }));
  res.json({ candidates: enriched, total: enriched.length });
});

// POST /api/uc/candidates — add single candidate manually
app.post('/api/uc/candidates', (req, res) => {
  const id = Math.random().toString(36).slice(2, 14);
  const candidate = {
    id,
    ...req.body,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveUCCandidate(candidate);
  res.json({ success: true, candidate });
});

// POST /api/uc/research/:id — run Claude research on one candidate
app.post('/api/uc/research/:id', async (req, res) => {
  const candidates = getUCCandidates();
  const candidate = candidates.find(c => c.id === req.params.id);
  if (!candidate) return res.status(404).json({ error: 'Not found' });

  try {
    const dossier = await researchUCCandidate(candidate);
    const updated = updateUCCandidate(candidate.id, { dossier, status: 'researched' });
    // Auto-sync to LinkedIn Matched Audience (non-blocking)
    syncCandidateToAudience({ ...candidate, dossier })
      .then(r => console.log('[li-audience] Sync result:', JSON.stringify(r)))
      .catch(e => console.error('[li-audience] Sync error:', e.message));
    res.json({ success: true, dossier });
  } catch (err) {
    console.error('[uc/research]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/uc/research-batch — research all pending candidates
app.post('/api/uc/research-batch', async (req, res) => {
  const pending = getUCCandidates().filter(c => c.status === 'pending' || c.status === 'needs-research');
  if (!pending.length) return res.json({ success: true, processed: 0, message: 'No pending candidates' });

  res.json({ success: true, queued: pending.length, message: `Researching ${pending.length} candidates in background` });

  batchResearchUCCandidates(pending, {
    onProgress: (done, total, contact) => {
      console.log(`[uc/research-batch] ${done}/${total}: ${contact.firstName} ${contact.lastName}`);
    },
  }).then(results => {
    const emails = [];
    results.forEach(({ contact, dossier, error }) => {
      if (dossier) {
        updateUCCandidate(contact.id, { dossier, status: 'researched' });
        if (contact.email) emails.push(contact.email);
      } else {
        updateUCCandidate(contact.id, { status: 'research-failed', researchError: error });
      }
    });
    const succeeded = results.filter(r => r.dossier).length;
    console.log(`[uc/research-batch] Complete: ${succeeded} succeeded`);
    if (emails.length) {
      syncEmailsToLinkedInAudience(emails)
        .then(r => console.log(`[li-audience] Batch sync: ${JSON.stringify(r)}`))
        .catch(e => console.error('[li-audience] Batch sync error:', e.message));
    }
  });
});

// POST /api/uc/video/:id — generate kinetic video for one candidate
app.post('/api/uc/video/:id', async (req, res) => {
  const candidates = getUCCandidates();
  const candidate = candidates.find(c => c.id === req.params.id);
  if (!candidate) return res.status(404).json({ error: 'Not found' });
  if (!candidate.dossier) return res.status(400).json({ error: 'Research dossier missing — run research first' });
  if (!process.env.ELEVENLABS_API_KEY) return res.status(400).json({ error: 'ELEVENLABS_API_KEY not set' });

  try {
    const langCode = candidate.dossier.language?.elevenlabs || 'en';
    const result = await generateKineticVideo(candidate.dossier.videoScript, candidate.id, langCode);
    updateUCCandidate(candidate.id, { videoUrl: `http://localhost:3000${result.url}`, videoType: result.type, status: 'video-ready' });
    res.json({ success: true, url: result.url, type: result.type });
  } catch (err) {
    console.error('[uc/video]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/uc/sequence/start/:id — start sequence for one candidate
app.post('/api/uc/sequence/start/:id', (req, res) => {
  const candidates = getUCCandidates();
  const candidate = candidates.find(c => c.id === req.params.id);
  if (!candidate) return res.status(404).json({ error: 'Not found' });
  if (!candidate.dossier) return res.status(400).json({ error: 'Research dossier missing' });

  const existing = getUCSequenceByCandidateId(candidate.id);
  if (existing?.status === 'active') return res.status(400).json({ error: 'Sequence already active' });

  const seq = startUCSequence({ candidate, dossier: candidate.dossier });
  updateUCCandidate(candidate.id, { status: 'in-sequence' });
  res.json({ success: true, sequence: seq });
});

// PATCH /api/uc/candidates/:id — update candidate (status, outcome, notes)
app.patch('/api/uc/candidates/:id', (req, res) => {
  const updated = updateUCCandidate(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true, candidate: updated });
});

// POST /api/uc/sequence/test/:id — run all steps immediately, no delays, log everything
// Use this to review the full sequence output without waiting 14 days
app.post('/api/uc/sequence/test/:id', async (req, res) => {
  const candidates = getUCCandidates();
  const candidate = candidates.find(c => c.id === req.params.id);
  if (!candidate) return res.status(404).json({ error: 'Not found' });
  if (!candidate.dossier) return res.status(400).json({ error: 'Research dossier missing — run research first' });

  const dossier = candidate.dossier;
  const calLink = 'https://cal.com/rain-gritnord';
  const results = [];

  const steps = [
    {
      day: 1, label: 'LinkedIn DM + Video link',
      channel: 'linkedin-dm',
      output: dossier.linkedInDM?.replace('[CAL_LINK]', calLink) +
        (candidate.videoUrl ? `\n\nVideo: ${candidate.videoUrl}` : '\n\n[Video URL — generate video first]'),
    },
    {
      day: 2, label: 'LinkedIn voice message',
      channel: 'linkedin-voice',
      output: dossier.voiceNoteScript,
      note: 'Record in LinkedIn app or via Expandi. Same DM thread as Day 1.',
    },
    {
      day: 3, label: 'WhatsApp voice note',
      channel: 'whatsapp-voice',
      output: dossier.voiceNoteScript,
      note: `Send to: ${candidate.phone || '(no phone set)'}`,
    },
    {
      day: 7, label: 'Case study email',
      channel: 'email',
      subject: dossier.day7EmailSubject,
      output: `To: ${candidate.email}\nSubject: ${dossier.day7EmailSubject}\n\n${candidate.firstName},\n\nWe're running this for a ${dossier.caseStudyVertical || 'B2B'} founder right now. Last batch: 19 meetings booked in 30 days. Charged on meetings held — no retainer until results.\n\nI sent you a video last week showing exactly how it works. Worth a 15-minute call to see if it fits ${candidate.company}?\n\n${calLink}\n\nRain\nGritnord`,
    },
    {
      day: 10, label: 'LinkedIn follow-up DM',
      channel: 'linkedin-dm',
      output: `${candidate.firstName}, I sent you a video and a voice message about how we book meetings for B2B founders.\n\nStill relevant? ${calLink} — 15 minutes.`,
    },
    {
      day: 14, label: 'Final email — closing the loop',
      channel: 'email',
      subject: `Closing the loop, ${candidate.firstName}`,
      output: `To: ${candidate.email}\nSubject: Closing the loop, ${candidate.firstName}\n\n${candidate.firstName},\n\nI reached out a couple of weeks ago about booking qualified meetings for ${candidate.company}.\n\nIf the timing was off, no problem. If you're still looking to build a more reliable outbound motion — we're booking 15–25 meetings per month for founders like you right now.\n\n15 minutes: ${calLink}\n\nRain`,
    },
  ];

  for (const step of steps) {
    results.push(step);
    console.log(`[uc/test] Day ${step.day} — ${step.label}`);
    console.log(step.output);
    console.log('---');
  }

  res.json({ success: true, candidate: { id: candidate.id, name: `${candidate.firstName} ${candidate.lastName}`, language: dossier.language?.name || 'English' }, steps: results });
});

// POST /api/uc/sequence/fire/:id/:day — fire a single step immediately, bypassing day timer
app.post('/api/uc/sequence/fire/:id/:day', async (req, res) => {
  const candidates = getUCCandidates();
  const candidate = candidates.find(c => c.id === req.params.id);
  if (!candidate) return res.status(404).json({ error: 'Not found' });
  if (!candidate.dossier) return res.status(400).json({ error: 'Research dossier missing' });
  const day = parseInt(req.params.day);
  if (![1, 2, 3, 7, 10, 14].includes(day)) return res.status(400).json({ error: `Unknown day: ${day}` });
  try {
    const result = await fireSequenceStep(candidate, candidate.dossier, day);
    console.log(`[uc/fire] Day ${day} fired for ${candidate.firstName} ${candidate.lastName}`);
    res.json({ success: true, day, result });
  } catch (err) {
    console.error(`[uc/fire] Day ${day} error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/uc/candidates/:id
app.delete('/api/uc/candidates/:id', (req, res) => {
  deleteUCCandidate(req.params.id);
  res.json({ success: true });
});

// POST /api/uc/audience/sync — manually sync all researched candidates to LinkedIn Matched Audience
app.post('/api/uc/audience/sync', async (req, res) => {
  const candidates = getUCCandidates().filter(c => c.email && c.status !== 'pending');
  const emails = candidates.map(c => c.email).filter(Boolean);
  if (!emails.length) return res.json({ success: true, synced: 0, message: 'No candidates with email' });
  try {
    const result = await syncEmailsToLinkedInAudience(emails);
    res.json({ success: true, synced: emails.length, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/uc/stats
app.get('/api/uc/stats', (req, res) => {
  const candidates = getUCCandidates();
  const sequences = getUCSequences();
  res.json({
    total: candidates.length,
    byStatus: candidates.reduce((acc, c) => { acc[c.status] = (acc[c.status] || 0) + 1; return acc; }, {}),
    activeSequences: sequences.filter(s => s.status === 'active').length,
    completedSequences: sequences.filter(s => s.status === 'completed').length,
    converted: candidates.filter(c => c.status === 'converted').length,
    meetings: candidates.filter(c => c.status === 'meeting-booked').length,
  });
});

// ─── Twitter Routes ──────────────────────────────────────────────────────────

app.get('/api/twitter/status', (req, res) => {
  res.json({ connected: isTwitterConnected() });
});

app.get('/api/twitter/queue', (req, res) => {
  const queue = getTwitterQueue();
  res.json({ posts: queue, total: queue.length });
});

app.post('/api/twitter/generate', async (req, res) => {
  try {
    const articles = await curateArticles({ count: 3 });
    const drafts = [];
    const formats = ['single', 'thread', 'single']; // mix of formats

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const format = formats[i] || 'single';
      const generated = await generateTweet({ article, format });
      const draft = {
        id: newId(),
        text: generated.text,
        tweets: generated.tweets,
        format: generated.format,
        article,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveTwitterDraft(draft);
      drafts.push(draft);
    }

    res.json({ success: true, drafts, total: drafts.length });
  } catch (err) {
    console.error('[twitter/generate]', err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/twitter/queue/:id', (req, res) => {
  const { text, tweets } = req.body;
  const updates = { text };
  if (tweets) updates.tweets = tweets;
  const updated = updateTwitterPost(req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true, post: updated });
});

app.post('/api/twitter/approve/:id', async (req, res) => {
  const queue = getTwitterQueue();
  const post = queue.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  if (!isTwitterConnected()) return res.status(400).json({ error: 'Twitter credentials not configured' });

  try {
    updateTwitterPost(post.id, { status: 'posting' });
    let result;
    if (post.format === 'thread' && post.tweets?.length > 1) {
      result = await postThread(post.tweets);
    } else {
      result = await postTweet(post.text);
    }
    updateTwitterPost(post.id, { status: 'posted', twitterId: result.id, twitterUrl: result.url, postedAt: new Date().toISOString() });
    res.json({ success: true, url: result.url });
  } catch (err) {
    updateTwitterPost(post.id, { status: 'draft' });
    console.error('[twitter/approve]', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/twitter/queue/:id', (req, res) => {
  deleteTwitterPost(req.params.id);
  res.json({ success: true });
});

// ─── Content Marketing OS ─────────────────────────────────────────────────────

// List all generated content pieces
app.get('/api/cm/pieces', (req, res) => {
  try {
    const pieces = getCMPieces();
    res.json(pieces);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate all formats for an article
app.post('/api/cm/generate', async (req, res) => {
  const { article, formats } = req.body;
  if (!article?.title) return res.status(400).json({ error: 'article.title required' });

  try {
    const result = await generateAllFormats({
      article,
      formats: formats || ['linkedin', 'blog', 'newsletter', 'thread', 'aeo'],
    });
    res.json(result);
  } catch (err) {
    console.error('[cm] generate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Update a content piece (e.g. mark format as approved/published)
app.patch('/api/cm/pieces/:id', (req, res) => {
  const updated = updateCMPiece(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

// Get articles ready for content generation — uses already-curated LinkedIn queue (fast, no RSS fetch)
// Falls back to live fetch only if queue is empty
app.get('/api/cm/queue', async (req, res) => {
  try {
    // Use already-scored articles from the LinkedIn queue (instant, cached)
    const liQueue = getLinkedInQueue();
    const alreadyGenerated = new Set(getCMPieces().map(p => p.article?.link).filter(Boolean));

    // Pull articles from queue items that have an article attached and relevance >= 4
    const fromQueue = liQueue
      .filter(p => p.article?.title && (p.article.relevanceScore || 0) >= 4 && !alreadyGenerated.has(p.article?.link))
      .map(p => p.article)
      .filter((a, i, arr) => arr.findIndex(b => b.link === a.link) === i) // dedupe
      .slice(0, 15);

    if (fromQueue.length > 0) {
      return res.json(fromQueue);
    }

    // Fallback: live fetch if queue is empty (with timeout protection)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const articles = await curateArticles({ count: 10 });
      clearTimeout(timeout);
      const filtered = articles.filter(a => (a.relevanceScore || 0) >= 4 && !alreadyGenerated.has(a.link));
      res.json(filtered);
    } catch (fetchErr) {
      clearTimeout(timeout);
      res.json([]); // Return empty rather than error — UI handles this gracefully
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List newsletters
app.get('/api/cm/newsletter', (req, res) => {
  res.json(getCMNewsletter());
});

// Compile weekly newsletter from the week's generated pieces
app.post('/api/cm/newsletter/compile', async (req, res) => {
  try {
    const pieces = getCMPieces().filter(p => {
      if (!p.createdAt) return false;
      const age = Date.now() - new Date(p.createdAt).getTime();
      return age < 7 * 24 * 60 * 60 * 1000; // last 7 days
    });

    // Find top LinkedIn post this week
    const liQueue = getLinkedInQueue();
    const thisWeekPosts = liQueue.filter(p => {
      if (!p.publishedAt) return false;
      const age = Date.now() - new Date(p.publishedAt).getTime();
      return age < 7 * 24 * 60 * 60 * 1000;
    });
    const topPost = thisWeekPosts.sort((a, b) =>
      (b.engagementScore || 0) - (a.engagementScore || 0)
    )[0] || null;

    const nl = await compileWeeklyNewsletter({ pieces, topLinkedInPost: topPost });
    res.json(nl);
  } catch (err) {
    console.error('[cm] newsletter compile error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Update newsletter (e.g. select subject, edit body)
app.patch('/api/cm/newsletter/:id', (req, res) => {
  try {
    const db = getCMNewsletter();
    const idx = db.findIndex(n => n.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    // We use saveNewsletter which prepends — just return updated
    res.json({ ...db[idx], ...req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Preview newsletter as HTML
app.get('/api/cm/newsletter/:id/preview', (req, res) => {
  try {
    const html = previewNewsletterHtml(req.params.id === 'latest' ? undefined : req.params.id);
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send test newsletter (to rain@gritnord.com)
app.post('/api/cm/newsletter/:id/test', async (req, res) => {
  try {
    const result = await sendTestNewsletter({
      newsletterId: req.params.id === 'latest' ? undefined : req.params.id,
      email: req.body.email || 'rain@gritnord.com',
    });
    res.json(result);
  } catch (err) {
    console.error('[cm] test send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Send newsletter to all subscribers
app.post('/api/cm/newsletter/:id/send', async (req, res) => {
  try {
    const result = await sendNewsletter({
      newsletterId: req.params.id === 'latest' ? undefined : req.params.id,
      subjectOverride: req.body.subject,
    });
    res.json(result);
  } catch (err) {
    console.error('[cm] send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Subscribers
app.get('/api/cm/subscribers', (req, res) => {
  res.json(getCMSubscribers());
});

app.post('/api/cm/subscribers', (req, res) => {
  const { email, firstName } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  const subs = addSubscriber(email, firstName || '');
  res.json(subs);
});

// ─── Cron Jobs ───────────────────────────────────────────────────────────────

async function runScheduledCycle(label) {
  console.log(`[cron] ${label} — starting scheduled cycle`);
  const results = [];

  for (const channel of CHANNELS) {
    try {
      const result = await generateContent({ channel });
      const item = {
        id:        newId(),
        ...result,
        cycleId:   `cron-${label}-${newId()}`,
        status:    'draft',
        score:     null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveContent(item);
      results.push({ channel, id: item.id });
      console.log(`[cron] ${label} — generated ${channel}`);
    } catch (err) {
      console.error(`[cron] ${label} — error on ${channel}:`, err.message);
    }
  }

  saveCycle({
    id:        `cron-${newId()}`,
    startedAt: new Date().toISOString(),
    endedAt:   new Date().toISOString(),
    topic:     'auto (scheduled)',
    channels:  CHANNELS,
    generated: results.length,
    errors:    CHANNELS.length - results.length,
    source:    label,
  });

  console.log(`[cron] ${label} — cycle complete (${results.length}/${CHANNELS.length})`);
}

// Twitter: Tue/Thu/Sat at 09:00 UTC — curate + generate 3 drafts for approval
cron.schedule('0 9 * * 2,4,6', async () => {
  console.log('[cron] twitter-drafts — generating');
  try {
    const articles = await curateArticles({ count: 3 });
    const formats = ['single', 'thread', 'single'];
    for (let i = 0; i < articles.length; i++) {
      const generated = await generateTweet({ article: articles[i], format: formats[i] || 'single' });
      saveTwitterDraft({
        id: newId(),
        text: generated.text,
        tweets: generated.tweets,
        format: generated.format,
        article: articles[i],
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      console.log(`[cron] twitter-drafts — draft ready: "${articles[i].title}"`);
    }
  } catch (err) {
    console.error('[cron] twitter-drafts — error:', err.message);
  }
});

// LinkedIn engagement learning — every 6h, score posts that are 48–72h old
cron.schedule('0 */6 * * *', async () => {
  console.log('[cron] linkedin-engagement — checking for posts ready to score');
  try {
    const results = await fetchAndLearnFromEngagement();
    if (results.length > 0) {
      console.log(`[cron] linkedin-engagement — scored ${results.length} post(s), weights updated`);
    }
  } catch (err) {
    console.error('[cron] linkedin-engagement — error:', err.message);
  }
});

// LinkedIn: Mon/Wed/Fri at 08:00 UTC — curate + generate 3 drafts (1 AI + 2 GTM)
cron.schedule('0 8 * * 1,3,5', async () => {
  console.log('[cron] linkedin-drafts — generating (1 AI + 2 GTM mix)');
  try {
    const existingQueue = getLinkedInQueue();
    const usedLinks = existingQueue.map(p => p.article?.link).filter(Boolean);
    const articles = await curateArticles({ count: 3, usedLinks });
    for (const article of articles) {
      const topicHint = article.topic === 'gtm'
        ? 'Focus on the GTM, sales, pipeline, or customer acquisition angle. Avoid making this about AI as a trend — make it about getting customers and growing revenue.'
        : 'This is the weekly AI-related post. Tie the AI angle back to practical B2B sales impact.';
      const text = await generateLinkedInPost({ article, postType: 'reshare', additionalContext: topicHint });
      saveLinkedInDraft({
        id: newId(),
        text,
        article,
        imageUrl: article.image || null,
        status: 'draft',
        topic: article.topic,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      console.log(`[cron] linkedin-drafts — draft ready: "${article.title}"`);
    }
  } catch (err) {
    console.error('[cron] linkedin-drafts — error:', err.message);
  }
});

// SEO blog auto-publish: every 2 days at 10:00 UTC (Mon/Wed/Fri/Sun)
// Generate → score → publish to Supabase automatically
cron.schedule('0 10 * * 1,3,5,0', async () => {
  console.log('[cron] seo-blog — starting');
  try {
    const result = await generateContent({ channel: 'seo_blog' });
    const item = {
      id:        newId(),
      ...result,
      cycleId:   `cron-seo-blog-${newId()}`,
      status:    'draft',
      score:     null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveContent(item);
    console.log(`[cron] seo-blog — generated: ${item.topic}`);

    const { score, reasoning } = await scoreContent({ channel: 'seo_blog', content: item.content });
    updateContent(item.id, { score, scoreReasoning: reasoning, status: 'scored' });
    recordScore('seo_blog', score);
    item.score = score;
    console.log(`[cron] seo-blog — scored: ${score}/10`);

    const post = await publishToSupabase({ ...item, score });
    updateContent(item.id, { status: 'published', supabaseId: post.id });
    console.log(`[cron] seo-blog — live: "${post.title}" → /blog/${post.slug}`);
  } catch (err) {
    console.error('[cron] seo-blog — error:', err.message);
  }
});

// UC sequence tick: every hour — checks all active sequences for due steps
cron.schedule('0 * * * *', async () => {
  try {
    const ticked = await tickSequences();
    if (ticked > 0) console.log(`[cron] uc-sequences — ${ticked} steps executed`);
  } catch (err) {
    console.error('[cron] uc-sequences — error:', err.message);
  }
});

// Morning cycle: 06:00 UTC
cron.schedule('0 6 * * *', () => runScheduledCycle('morning'));

// Evening cycle: 18:00 UTC
cron.schedule('0 18 * * *', () => runScheduledCycle('evening'));

// Daily AI search auto-publish: 08:00 UTC
// Full pipeline: generate → score → image → publish. No manual steps.
cron.schedule('0 8 * * *', async () => {
  console.log('[cron] daily-publish — starting');
  try {
    // 1. Generate
    const result = await generateContent({ channel: 'ai_search' });
    const item = {
      id:        newId(),
      ...result,
      cycleId:   `cron-daily-publish-${newId()}`,
      status:    'draft',
      score:     null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveContent(item);
    console.log(`[cron] daily-publish — generated: ${item.topic}`);

    // 2. Score
    const { score, reasoning } = await scoreContent({ channel: 'ai_search', content: item.content });
    updateContent(item.id, { score, scoreReasoning: reasoning, status: 'scored' });
    recordScore('ai_search', score);
    item.score = score;
    console.log(`[cron] daily-publish — scored: ${score}/10`);

    // 3. Publish with auto-generated cover image (always publish — no threshold)
    const post = await publishToSupabase({ ...item, score });
    updateContent(item.id, { status: 'published', supabaseId: post.id });
    console.log(`[cron] daily-publish — live: "${post.title}" → /blog/${post.slug}`);
    console.log(`[cron] daily-publish — image: ${post.cover_image_url}`);
  } catch (err) {
    console.error('[cron] daily-publish — error:', err.message);
  }
});

// ─── XLSX Drop Folder Watcher ────────────────────────────────────────────────
// Rain drops a LinkedIn PostAnalytics_*.xlsx into data/analytics-drop/
// The watcher picks it up, imports the metrics, and moves it to analytics-processed/

const DROP_DIR       = path.join(__dirname, 'data', 'analytics-drop');
const PROCESSED_DIR  = path.join(__dirname, 'data', 'analytics-processed');
if (!fsExistsSync(DROP_DIR))      fsMkdirSync(DROP_DIR,      { recursive: true });
if (!fsExistsSync(PROCESSED_DIR)) fsMkdirSync(PROCESSED_DIR, { recursive: true });

function processDroppedXlsx(filename) {
  const fullPath = path.join(DROP_DIR, filename);
  try {
    const { impressions, likes, comments, shares, followers } = parseLinkedInXlsx(readFileSync(fullPath));

    const numMatch = filename.match(/(\d{15,})/);
    const shareNum = numMatch?.[1];

    const queue = getLinkedInQueue();
    const post  = shareNum
      ? queue.find(p => (p.linkedInId || '').replace(/urn:li:(share|ugcPost|activity):/i, '') === shareNum)
      : null;

    if (!post) {
      // Move to processed with error marker so it's not retried
      const dest = path.join(PROCESSED_DIR, `UNMATCHED_${filename}`);
      renameSync(fullPath, dest);
      console.log(`[drop-watcher] ${filename}: no matching post found (shareId=${shareNum || 'unknown'})`);
      return;
    }

    const metrics = { likes, comments, shares, impressions, followers, clicks: null };
    const score   = engagementToScore(metrics);

    recordScore('linkedin', score);
    updateLinkedInPost(post.id, {
      engagement:          metrics,
      engagementScore:     score,
      engagementScoredAt:  new Date().toISOString(),
      engagementBlocked:   false,
    });

    const dest = path.join(PROCESSED_DIR, filename);
    renameSync(fullPath, dest);

    console.log(`[drop-watcher] ${filename}: impressions=${impressions} likes=${likes} comments=${comments} shares=${shares} → score=${score}`);
  } catch (err) {
    console.error(`[drop-watcher] ${filename} error:`, err.message);
  }
}

// Scan drop folder on startup (catches files dropped while server was off)
try {
  const existing = readdirSync(DROP_DIR).filter(f => f.toLowerCase().endsWith('.xlsx'));
  for (const f of existing) processDroppedXlsx(f);
} catch {}

// Poll every 30s for new files
setInterval(() => {
  try {
    const files = readdirSync(DROP_DIR).filter(f => f.toLowerCase().endsWith('.xlsx'));
    for (const f of files) processDroppedXlsx(f);
  } catch {}
}, 30_000);

// GET /api/linkedin/engagement/drop-status — what's in the drop folder right now
app.get('/api/linkedin/engagement/drop-status', (req, res) => {
  try {
    const pending   = readdirSync(DROP_DIR).filter(f => f.toLowerCase().endsWith('.xlsx'));
    const processed = readdirSync(PROCESSED_DIR).filter(f => f.toLowerCase().endsWith('.xlsx'));
    res.json({ pending, processed: processed.slice(-20) });
  } catch {
    res.json({ pending: [], processed: [] });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║     GRITNORD CONTENT ENGINE  v1.0          ║
╠════════════════════════════════════════════╣
║  Server:  http://localhost:${PORT}            ║
║  Dashboard: http://localhost:${PORT}/dashboard.html ║
║  Cron:    06:00 UTC + 18:00 UTC            ║
╚════════════════════════════════════════════╝
`);
});
