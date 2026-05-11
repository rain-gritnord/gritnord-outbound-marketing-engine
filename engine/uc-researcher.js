// UC candidate research pipeline
// Input: enriched contact from HubSpot/Clay
// Output: dossier with pain angle, video script, DM copy, voice note script

import Anthropic from '@anthropic-ai/sdk';
import { detectLanguage, getLanguageInstruction } from './language-map.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const GRITNORD_CONTEXT = `
Gritnord is an autonomous B2B matchmaking platform. It books qualified meetings for B2B founders and sales leaders using a 6-layer AI engine: ICP → company discovery → contact enrichment → Claude scoring → 8-channel 30-day sequence → meetings booked, billed at €500/meeting held.

Rain is the founder. He is direct, experienced, has operated in B2B sales for years. He is reaching out to potential UC (User Customer) candidates — B2B founders or VP Sales who need more meetings and would pay for a system that runs their outbound autonomously.

The tone is never salesy. It is specific, direct, and grounded in the candidate's own situation.
`;

const UC_ICP = `
Perfect UC fit:
- B2B founder, VP Sales, or RevOps lead
- 5–100 person company
- Selling €10K+ deals
- Currently doing outbound manually or with weak results
- Active LinkedIn presence
- EN, Nordic, or EU market
- Has budget for tools (€2–5K/mo)
`;

export async function researchUCCandidate(contact) {
  const {
    firstName, lastName, title, company, industry, companySize,
    location, linkedInUrl, recentActivity, techStack, hiringSignals,
  } = contact;

  const lang = detectLanguage(location);
  const langInstruction = getLanguageInstruction(lang);

  const prompt = `${GRITNORD_CONTEXT}

${UC_ICP}

You are researching this UC candidate for Rain to reach out to:

Name: ${firstName} ${lastName}
Title: ${title}
Company: ${company}
Industry: ${industry || 'unknown'}
Company size: ${companySize || 'unknown'}
Location: ${location || 'unknown'}
LinkedIn: ${linkedInUrl || 'not available'}
Recent LinkedIn activity: ${recentActivity || 'not available'}
Tech stack signals: ${techStack || 'not available'}
Hiring signals: ${hiringSignals || 'not available'}

LANGUAGE INSTRUCTION: ${langInstruction}

Produce a JSON object with exactly these fields:

{
  "painAngle": "1-2 sentences. The most specific pain this person likely has right now based on their role, company stage, and signals. Not generic. Should feel like Rain did research on them specifically.",
  "videoScript": "Exactly 60-70 words. Kinetic text video script — Rain's voice reads this. Starts with their first name. References their company or situation specifically. Names the pain. States one result Gritnord got for someone similar. Ends with a single low-friction ask: book a 15-min call. No filler words. Every word earns its place.",
  "linkedInDM": "2-3 sentences max. References something specific about them (role, company, industry, or a signal). Introduces the video naturally. Ends with the Calendly link placeholder [CAL_LINK]. Never starts with 'Hi' or 'I hope this finds you well'.",
  "voiceNoteScript": "Exactly 40-50 words. This is used for BOTH LinkedIn voice message (Day 2) and WhatsApp voice note (Day 3) — same script, two channels. Rain records this. Casual, direct, sounds human not scripted. Says their name. References the video. One result for a similar company. One low-friction ask.",
  "caseStudyVertical": "One word or short phrase — the industry vertical this person best matches for case study selection. E.g. 'SaaS', 'fintech', 'manufacturing', 'consulting', 'staffing'.",
  "day7EmailSubject": "Email subject line for Day 7 case study email. Specific to their situation. Under 8 words. No clickbait. In their language.",
  "day14EmailSubject": "Email subject line for Day 14 closing email. Brief, no pressure. Under 8 words. In their language.",
  "fitScore": "Integer 1-10. How well this contact matches the UC ICP. 10 = perfect fit.",
  "fitReason": "One sentence explaining the fit score."
}

Output only valid JSON. No markdown, no explanation.`;

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.content.find(b => b.type === 'text')?.text?.trim() ?? '{}';
  // Attach language metadata to dossier
  try {
    const parsed = JSON.parse(raw);
    return { ...parsed, language: lang };
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return { ...JSON.parse(match[0]), language: lang };
    throw new Error('Research output was not valid JSON');
  }
}

export async function batchResearchUCCandidates(contacts, { onProgress } = {}) {
  const results = [];
  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    try {
      const dossier = await researchUCCandidate(contact);
      results.push({ contact, dossier, error: null });
    } catch (err) {
      results.push({ contact, dossier: null, error: err.message });
    }
    if (onProgress) onProgress(i + 1, contacts.length, contact);
    // Rate limit: ~40 req/min on claude-opus-4-7
    if (i < contacts.length - 1) await new Promise(r => setTimeout(r, 1500));
  }
  return results;
}
