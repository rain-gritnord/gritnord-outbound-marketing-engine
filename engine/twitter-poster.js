// Twitter/X API v2 posting engine — OAuth 1.0a

import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const API_KEY        = () => process.env.TWITTER_API_KEY;
const API_SECRET     = () => process.env.TWITTER_API_SECRET;
const ACCESS_TOKEN   = () => process.env.TWITTER_ACCESS_TOKEN;
const ACCESS_SECRET  = () => process.env.TWITTER_ACCESS_SECRET;

export function isConnected() {
  return !!(process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET &&
            process.env.TWITTER_ACCESS_TOKEN && process.env.TWITTER_ACCESS_SECRET);
}

// ─── OAuth 1.0a signing ──────────────────────────────────────────────────────

function oauthSign(method, url, params, consumerKey, consumerSecret, tokenKey, tokenSecret) {
  const oauthParams = {
    oauth_consumer_key:     consumerKey,
    oauth_nonce:            crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_token:            tokenKey,
    oauth_version:          '1.0',
  };

  const allParams = { ...params, ...oauthParams };
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join('&');

  const baseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(paramString),
  ].join('&');

  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauthParams.oauth_signature = signature;

  const authHeader = 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ');

  return authHeader;
}

// ─── Post tweet ──────────────────────────────────────────────────────────────

export async function postTweet(text) {
  if (!isConnected()) throw new Error('Twitter credentials not configured');

  const url = 'https://api.twitter.com/2/tweets';
  const body = JSON.stringify({ text });

  const auth = oauthSign(
    'POST', url, {},
    API_KEY(), API_SECRET(), ACCESS_TOKEN(), ACCESS_SECRET()
  );

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': auth,
      'Content-Type': 'application/json',
    },
    body,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.title === 'CreditsDepleted'
      ? 'Twitter API credits depleted — add credits at developer.twitter.com → Billing'
      : `Twitter API error ${res.status}: ${err.detail || err.title || JSON.stringify(err)}`;
    throw new Error(msg);
  }
  const data = await res.json();
  return {
    id: data.data.id,
    url: `https://twitter.com/${process.env.TWITTER_HANDLE || 'rain_vaana'}/status/${data.data.id}`,
  };
}

// ─── Post thread ─────────────────────────────────────────────────────────────

export async function postThread(tweets) {
  if (!isConnected()) throw new Error('Twitter credentials not configured');

  let replyToId = null;
  const posted = [];

  for (const text of tweets) {
    const url = 'https://api.twitter.com/2/tweets';
    const bodyObj = replyToId
      ? { text, reply: { in_reply_to_tweet_id: replyToId } }
      : { text };

    const auth = oauthSign(
      'POST', url, {},
      API_KEY(), API_SECRET(), ACCESS_TOKEN(), ACCESS_SECRET()
    );

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyObj),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.title === 'CreditsDepleted'
        ? 'Twitter API credits depleted — add credits at developer.twitter.com → Billing'
        : `Twitter API error ${res.status}: ${err.detail || err.title || JSON.stringify(err)}`;
      throw new Error(msg);
    }
    const data = await res.json();
    replyToId = data.data.id;
    posted.push(data.data.id);
  }

  return {
    id: posted[0],
    url: `https://twitter.com/${process.env.TWITTER_HANDLE || 'rain_vaana'}/status/${posted[0]}`,
  };
}

// ─── Generate tweet content ──────────────────────────────────────────────────

const RAIN_CONTEXT = `
You are writing Twitter/X posts for Rain (@rain_vaana), founder of Gritnord — a B2B lead generation and GTM platform.
His audience: B2B founders, VP Sales, SDRs, revenue operators. Direct, sharp, no fluff.
`;

const TWEET_STYLE = `
STYLE RULES for Twitter/X:
- First tweet must hook in the first 8 words. No "I" to start. No "Thread:".
- Single tweets: sharp insight, stat, or hot take under 250 chars. Leave room for URL.
- Threads: 3-5 tweets. Tweet 1 = hook. Tweets 2-4 = substance. Tweet 5 = question or CTA.
- No hashtags unless essential. Max 1.
- No emojis as bullets. Max 1 emoji total if used at all.
- Sound like the sharpest person in the room, not a content creator.
- Short sentences. One idea per tweet.
- Threads: number each tweet (1/ 2/ 3/ etc.)
`;

export async function generateTweet({ article, format = 'single' }) {
  let prompt = '';

  if (format === 'thread') {
    prompt = `${RAIN_CONTEXT}

Write a Twitter thread (3-5 tweets) sharing this article with Rain's take:

Title: ${article.title}
Source: ${article.source}
URL: ${article.link}
Summary: ${article.description}

${TWEET_STYLE}

Write a thread where:
- Tweet 1: hook — the most counterintuitive or surprising angle from this article (under 240 chars)
- Tweets 2-3: Rain's real-world insight or pushback on the article's point
- Last tweet: sharp question for the audience + article URL

Number each tweet (1/ 2/ etc.). Separate with a blank line.
Output only the tweets. No intro, no meta.`;
  } else {
    prompt = `${RAIN_CONTEXT}

Write a single tweet sharing this article with Rain's angle:

Title: ${article.title}
Source: ${article.source}
URL: ${article.link}
Summary: ${article.description}

${TWEET_STYLE}

Under 240 chars (leave room for URL). Sharp insight or hot take. End naturally — the URL will be appended.
Output only the tweet text. No intro.`;
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.find(b => b.type === 'text')?.text?.trim() ?? '';

  if (format === 'single') {
    return {
      format: 'single',
      text: `${text}\n\n${article.link}`,
      tweets: null,
    };
  }

  // Parse thread tweets
  const tweets = text
    .split(/\n\s*\n/)
    .map(t => t.trim())
    .filter(t => t.length > 0);

  // Append URL to last tweet
  if (tweets.length > 0) {
    tweets[tweets.length - 1] += `\n\n${article.link}`;
  }

  return { format: 'thread', text: tweets.join('\n\n---\n\n'), tweets };
}
