# Gritnord Engine — Claude Instructions

## Project
AI-powered B2B meeting engine. Node.js + Express backend, SQLite, Anthropic Claude API, LinkedIn OAuth. Running on localhost:3000.

---

## CRITICAL RULE — Platform Architecture Sync

**Any time the platform flow, phases, subpoints, revenue model, or module list changes — update BOTH files in the same commit:**

1. `data/product-data.json` — drives all pages (system-architecture, roadmap, product-brief, product-flow)
2. `docs/platform-architecture.md` — the human-readable single source of truth (75 numbered subpoints, all phases 0–9, self-learning layer, revenue model, 100M trajectory)

Never update one without the other. This is the authoritative record of what Gritnord is building.

---

## Key Files

| File | Purpose |
|------|---------|
| `server.js` | Main Express server, all API routes, auth |
| `engine/linkedin-poster.js` | Post generation — Claude, 7-mechanism prompt, single clean call |
| `engine/linkedin-curator.js` | RSS curation — requires 2+ numbers in article before sending to Claude |
| `engine/learner.js` | Engagement scoring, guidelines injection |
| `engine/db.js` | SQLite access layer |
| `data/product-data.json` | V8 platform data — modules, roadmap, flow, revenue, self-learning |
| `docs/platform-architecture.md` | Full 75-point platform scope — update with every flow change |
| `public/product-flow.html` | Business flow page (outcome language, no tech) |
| `public/system-architecture.html` | Internal engineering reference (28 modules, stack) |
| `public/roadmap.html` | 5-phase roadmap, rendered from product-data.json |
| `public/product-brief.html` | External-facing overview, rendered from product-data.json |

---

## Content Engine Rules

- One Claude call per article — no retry loops, no second trim call
- POST_PROMPT uses 7-mechanism structure — do not restructure it
- CANNOT_GENERATE = soft skip, not a hard error cascade
- Rule 1 and char count are logged as warnings — Rain reviews in approval queue
- Curator requires 2+ numbers in title+description before sending to Claude
- Source diversity not enforced — structure quality wins

---

## Terminology

- **UC** = Ultimate Customer (company paying Gritnord for the service)
- **DC** = Dream Customer (leads/prospects that UC wants to meet)
- **Lock and Load** = activation moment after onboarding checklist is complete
- **Flywheel** = DC→UC conversion loop — post-meeting nurture that turns DCs into new UCs
- **DC Loyal Network** = growing pool of DCs who've attended meetings and trust Gritnord

---

## Auth

Protected routes require JWT login. Public routes are in `AUTH_PUBLIC` set in server.js.
Tokens stored in `~/.gritnord/linkedin-tokens.json`.

---

## Git Commit Convention

End every commit message with:
```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
