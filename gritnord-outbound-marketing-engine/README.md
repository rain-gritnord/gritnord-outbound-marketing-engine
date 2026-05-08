# Gritnord Content Engine

Autonomous B2B content generation system with self-learning. Generates channel-optimised content every 12 hours, measures performance, and adjusts its strategy automatically.

---

## Architecture

```
gritnord-engine/
├── server.js              ← Express API + 12-hour cron scheduler
├── engine/
│   ├── generator.js       ← Content generation (Anthropic API)
│   ├── learner.js         ← Weight-based self-learning algorithm
│   └── db.js              ← JSON file persistence (swap for DB in prod)
├── public/
│   ├── dashboard.html     ← Management dashboard
│   └── embed/
│       └── widget.js      ← Embeddable script for gritnord.com
├── data/                  ← Auto-created. Stores content + weights.
│   ├── content.json
│   ├── state.json
│   └── cycles.json
└── package.json
```

---

## Quick Start

### 1. Install
```bash
npm install
```

### 2. Set API key
```bash
# Create .env file
echo "ANTHROPIC_API_KEY=your_key_here" > .env
```

### 3. Run
```bash
npm start
# Dashboard: http://localhost:3000/dashboard.html
# API:       http://localhost:3000/api/status
```

---

## Deployment (Railway — recommended)

1. Push to GitHub
2. Create new project on [railway.app](https://railway.app)
3. Connect your repo
4. Add environment variable: `ANTHROPIC_API_KEY`
5. Deploy — Railway auto-detects Node.js

Your engine will be live at `https://your-project.railway.app`

---

## gritnord.com Integration

### Option A — Embed widget (simplest)
Add to any page on gritnord.com:
```html
<!-- Internal tool page or admin area -->
<div id="gritnord-widget-mount"></div>
<script 
  src="https://your-engine.railway.app/embed/widget.js"
  data-theme="dark">
</script>
```

### Option B — iframe dashboard
```html
<iframe 
  src="https://your-engine.railway.app/dashboard.html" 
  width="100%" 
  height="900" 
  frameborder="0">
</iframe>
```

### Option C — API integration (full control)
Call the REST API from your existing gritnord.com frontend:
```javascript
// Generate content on demand
const response = await fetch("https://your-engine.railway.app/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    channel: "linkedin",     // linkedin | twitter | seo_blog | ai_search | newsletter | cold_outreach
    topic: "Your topic",
    angle: "Problem → Solution",  // optional
    tone: "Founder-authentic"     // optional
  })
});
const content = await response.json();
console.log(content.content); // Ready-to-publish content
```

---

## How the 12-Hour Learning Cycle Works

Every 12 hours (06:00 and 18:00 UTC), the engine runs automatically:

```
1. ANALYSE    → Read all scored content from last cycle
2. LEARN      → Update weights for channels, angles, tones, topic clusters
3. GENERATE   → Create a full batch of content (8 channels × best-performing params)
4. SAVE       → Store in content library, log cycle report
5. REPORT     → Insights visible in dashboard
```

### Scoring Content
Feed engagement data back via the dashboard or API to train the engine:
```bash
curl -X POST https://your-engine.railway.app/api/score/CONTENT_ID \
  -H "Content-Type: application/json" \
  -d '{
    "engagementData": {
      "impressions": 4200,
      "likes": 87,
      "comments": 23,
      "shares": 14
    }
  }'
```

Or use manual scores (0–100) for quick feedback:
```bash
curl -X POST https://your-engine.railway.app/api/score/CONTENT_ID \
  -H "Content-Type: application/json" \
  -d '{ "manualScore": 78 }'
```

### Learning Algorithm
- Each content dimension (channel, angle, tone, topic cluster) gets a weight (0.3 → 3.5)
- High-performing content → raises weights for its parameters
- Low-performing content → lowers weights
- Exploration rate (12%) randomly boosts underweighted options to prevent stagnation
- Minimum 3 scored items required before weights shift

---

## REST API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Engine health, stats, current weights |
| GET | `/api/content` | List content (`?channel=linkedin&status=pending`) |
| POST | `/api/generate` | Generate single content item |
| POST | `/api/score/:id` | Submit engagement data / manual score |
| PATCH | `/api/content/:id` | Update status (draft/approved/published) |
| POST | `/api/cycle/run` | Trigger learning cycle manually |
| GET | `/api/cycles` | History of learning cycles |
| GET | `/api/channels` | Available channels |
| GET | `/api/options` | Angles and tones |

---

## Scaling Up

When ready to scale beyond the JSON file store:
1. Replace `engine/db.js` with a Postgres/Supabase adapter
2. Add LinkedIn/Twitter API webhooks to auto-feed engagement data
3. Add Slack notifications for new content batches
4. Add approval workflow before publishing

---

## Channels Covered

| Channel | Format | Optimised For |
|---------|--------|---------------|
| LinkedIn Post | 1300 char hook post | Algorithm reach |
| X Thread | 5-tweet thread | Virality |
| SEO Blog | Full structure + meta | Search ranking |
| AI Search Brief | GEO-optimised | Perplexity/ChatGPT citations |
| Newsletter | Subject + preview + body | Open rates |
| Cold Outreach | 3-email sequence | Meeting conversions |
| Press Release | Wire format | Media pickup |
| Partnership Pitch | Outreach email | Partner acquisition |
