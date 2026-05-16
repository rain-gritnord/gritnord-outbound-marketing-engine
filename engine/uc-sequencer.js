// UC acquisition sequence engine
// Day 1:  LinkedIn DM + video link (Lemlist or manual)
// Day 2:  LinkedIn follow-up DM with ElevenLabs video link (Lemlist or manual)
// Day 3:  WhatsApp voice note (ElevenLabs → Twilio)
// Day 7:  Case study email (Lemlist — campaign with {{emailBody}} variable)
// Day 10: LinkedIn follow-up DM (Lemlist or manual)
// Day 14: Final email (Lemlist — campaign with {{emailBody}} variable)

import Anthropic from '@anthropic-ai/sdk';
import { getUCSequences, saveUCSequence, updateUCSequence } from './db.js';
import { generateVoiceNoteOnly, generateKineticVideo } from './video-generator.js';
import { getLanguageInstruction } from './language-map.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const LEMLIST_API_KEY        = process.env.LEMLIST_API_KEY;
const LEMLIST_CAMPAIGN_D7    = process.env.LEMLIST_CAMPAIGN_D7;   // campaign ID for D7 case study email
const LEMLIST_CAMPAIGN_D14   = process.env.LEMLIST_CAMPAIGN_D14;  // campaign ID for D14 final email
const LEMLIST_CAMPAIGN_LI    = process.env.LEMLIST_CAMPAIGN_LI;   // optional: campaign ID for LinkedIn steps
const ELEVENLABS_API_KEY     = process.env.ELEVENLABS_API_KEY;
const TWILIO_ACCOUNT_SID     = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN      = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_FROM   = process.env.TWILIO_WHATSAPP_FROM;  // e.g. whatsapp:+14155238886
const MEDIA_BASE_URL         = process.env.MEDIA_BASE_URL || 'http://localhost:3000';
const CAL_LINK               = 'https://cal.com/rain-gritnord';

// ─── Email (Lemlist) ──────────────────────────────────────────────────────────
// Setup: create a campaign in Lemlist with a single email step.
// In the email body, put only: {{emailBody}}
// In the subject line, put: {{emailSubject}}
// Lemlist API docs: https://developer.lemlist.com
// Required env vars: LEMLIST_API_KEY, LEMLIST_CAMPAIGN_D7, LEMLIST_CAMPAIGN_D14

async function sendViaLemlist({ campaignId, email, firstName, lastName, company, emailSubject, emailBody }) {
  if (!LEMLIST_API_KEY || !campaignId) {
    console.log(`[uc-seq] LEMLIST SKIPPED (no LEMLIST_API_KEY or campaign ID)`);
    return { skipped: true, reason: !LEMLIST_API_KEY ? 'LEMLIST_API_KEY not set' : 'Campaign ID not set', to: email, subject: emailSubject, html: emailBody };
  }

  // Lemlist auth: Basic with empty username and API key as password
  const auth = Buffer.from(`:${LEMLIST_API_KEY}`).toString('base64');

  const res = await fetch(`https://api.lemlist.com/api/campaigns/${campaignId}/leads/${encodeURIComponent(email)}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName,
      lastName,
      companyName: company,
      emailSubject,  // maps to {{emailSubject}} in your Lemlist template
      emailBody,     // maps to {{emailBody}} in your Lemlist template
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[uc-seq] Lemlist error (${res.status}): ${body}`);
    throw new Error(`Lemlist error ${res.status}: ${body}`);
  }
  const data = await res.json();
  console.log(`[uc-seq] Lemlist lead enrolled: ${email} → campaign ${campaignId}`);
  return { lemlistId: data._id, to: email, subject: emailSubject, campaignId };
}

// ─── LinkedIn DM (Lemlist or manual) ─────────────────────────────────────────
// Lemlist can send LinkedIn messages if you connect your LinkedIn account in Lemlist
// and create a campaign with LinkedIn steps. Set LEMLIST_CAMPAIGN_LI to enable.
// Without it: returns the message text for manual copy-paste.

async function sendLinkedInDM({ toLinkedInUrl, message, firstName, lastName, email }) {
  if (LEMLIST_API_KEY && LEMLIST_CAMPAIGN_LI && email) {
    const auth = Buffer.from(`:${LEMLIST_API_KEY}`).toString('base64');
    const res = await fetch(`https://api.lemlist.com/api/campaigns/${LEMLIST_CAMPAIGN_LI}/leads/${encodeURIComponent(email)}`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, linkedinUrl: toLinkedInUrl, customMessage: message }),
    });
    const body = await res.text();
    if (res.ok || body.includes('already in the campaign')) {
      console.log(`[uc-seq] Lemlist LinkedIn DM queued: ${email} (${res.ok ? 'new' : 'already enrolled'})`);
      let data = {}; try { data = JSON.parse(body); } catch {}
      return { channel: 'linkedin-dm', lemlistId: data._id, enrolled: true, message, linkedInUrl: toLinkedInUrl };
    }
    console.error(`[uc-seq] Lemlist LinkedIn error: ${res.status} ${body} — falling back to manual`);
  }

  // Fallback: log + return for manual send / Fire modal copy
  console.log(`[uc-seq] LINKEDIN DM (manual) → ${toLinkedInUrl}\n${message}`);
  return { channel: 'linkedin-dm', skipped: true, reason: 'LEMLIST_CAMPAIGN_LI not set — copy message manually', message, linkedInUrl: toLinkedInUrl };
}

// ─── WhatsApp voice note (Twilio) ────────────────────────────────────────────
// Sends a media message (audio file) via Twilio WhatsApp Business API
// Required env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, MEDIA_BASE_URL

async function sendWhatsAppVoiceNote({ phone, audioPath, audioUrl, script }) {
  if (!phone) {
    console.log('[uc-seq] WHATSAPP SKIPPED — no phone number on candidate');
    return { skipped: true, reason: 'No phone number on candidate', script };
  }
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    console.log(`[uc-seq] WHATSAPP SKIPPED (Twilio not configured)`);
    console.log(`[uc-seq] Voice note: ${audioUrl || audioPath}`);
    return { skipped: true, reason: 'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM not set', audioUrl, script };
  }

  const publicMediaUrl = audioUrl || `${MEDIA_BASE_URL}${audioPath?.replace(/^.*\/data\/media/, '/media')}`;
  const to = phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`;

  const params = new URLSearchParams({
    From: TWILIO_WHATSAPP_FROM,
    To: to,
    MediaUrl: publicMediaUrl,
  });

  const twilioRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );

  if (!twilioRes.ok) {
    const body = await twilioRes.text();
    console.error(`[uc-seq] Twilio error (${twilioRes.status}): ${body}`);
    return { twilio_error: body, status: twilioRes.status, audioUrl: publicMediaUrl };
  }
  const result = await twilioRes.json();
  console.log(`[uc-seq] WhatsApp sent: SID=${result.sid} to=${to}`);
  return { sid: result.sid, to, audioUrl: publicMediaUrl };
}

// ─── Sequence step executors ──────────────────────────────────────────────────

async function executeDay1(candidate, dossier) {
  if (!candidate.videoUrl) {
    // Block D1 if no video — the message would contain a placeholder which gets sent to the prospect
    console.log(`[uc-seq] DAY 1 BLOCKED — no video URL on candidate ${candidate.id}. Generate the video first.`);
    return {
      channel: 'linkedin-dm',
      skipped: true,
      reason: 'No video URL — generate the video first (Video tab on the candidate card), then fire D1 again.',
      message: (dossier.linkedInDM || '').replace('[CAL_LINK]', CAL_LINK),
      linkedInUrl: candidate.linkedInUrl,
    };
  }
  const message = (dossier.linkedInDM || '').replace('[CAL_LINK]', CAL_LINK) +
    `\n\nVideo: ${candidate.videoUrl}`;
  return sendLinkedInDM({
    toLinkedInUrl: candidate.linkedInUrl,
    email: candidate.email,
    message,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
  });
}

async function executeDay2(candidate, dossier) {
  // Generate a short follow-up video using the voice note script if no video yet,
  // otherwise send a brief LinkedIn DM referencing the Day 1 video
  if (!ELEVENLABS_API_KEY) {
    console.log(`[uc-seq] DAY 2 VIDEO SKIPPED (no ELEVENLABS_API_KEY)`);
    const fallbackMsg = `${candidate.firstName}, sent you a short video yesterday about how we book meetings autonomously. Worth a look? ${CAL_LINK}`;
    return sendLinkedInDM({ toLinkedInUrl: candidate.linkedInUrl, email: candidate.email, message: fallbackMsg, firstName: candidate.firstName, lastName: candidate.lastName });
  }

  const langCode = dossier.language?.elevenlabs || 'en';
  let videoUrl = candidate.videoUrl;

  if (!videoUrl) {
    try {
      const videoResult = await generateKineticVideo(dossier.videoScript, `${candidate.id}-d2`, langCode);
      videoUrl = videoResult.url;
      console.log(`[uc-seq] Day 2 video generated: ${videoUrl}`);
    } catch (err) {
      console.error(`[uc-seq] Day 2 video generation failed: ${err.message}`);
    }
  }

  const message = videoUrl
    ? `${candidate.firstName}, recorded this specifically for you — 25 seconds.\n\n${videoUrl}\n\n${CAL_LINK} if it resonates.`
    : `${candidate.firstName}, wanted to follow up on yesterday's video. Worth a quick chat? ${CAL_LINK}`;

  return sendLinkedInDM({ toLinkedInUrl: candidate.linkedInUrl, email: candidate.email, message, firstName: candidate.firstName, lastName: candidate.lastName });
}

async function executeDay3(candidate, dossier) {
  if (!ELEVENLABS_API_KEY) {
    console.log(`[uc-seq] DAY 3 VOICE SKIPPED (no ELEVENLABS_API_KEY) for ${candidate.id}`);
    return { channel: 'whatsapp-voice', skipped: true, reason: 'ELEVENLABS_API_KEY not set', script: dossier.voiceNoteScript };
  }

  const langCode = dossier.language?.elevenlabs || 'en';
  const voiceResult = await generateVoiceNoteOnly(dossier.voiceNoteScript, `${candidate.id}-d3`, langCode);
  console.log(`[uc-seq] Voice note generated: ${voiceResult.url}`);

  const waResult = await sendWhatsAppVoiceNote({
    phone: candidate.phone,
    audioPath: voiceResult.path,
    audioUrl: voiceResult.url,
    script: dossier.voiceNoteScript,
  });

  return {
    ...waResult,
    channel: 'whatsapp-voice',
    voiceNoteUrl: voiceResult.url,
    script: dossier.voiceNoteScript,
    phone: candidate.phone,
  };
}

async function buildLocalizedEmail(candidate, dossier, type) {
  const lang = dossier.language || { code: 'en', name: 'English' };
  const langInstruction = getLanguageInstruction(lang);
  const vertical = dossier.caseStudyVertical || 'B2B';

  const prompts = {
    day7: `Write a short case study follow-up email from Rain (Gritnord founder) to ${candidate.firstName} ${candidate.lastName}, ${candidate.title} at ${candidate.company}.

Context: Rain sent a short personalised video last week. This is a Day 7 follow-up email sharing a case study result.

Key facts to include:
- Gritnord booked 19 meetings in 30 days for a ${vertical} founder
- Payment model: charged per meeting held, no retainer until results
- Ask: 15-minute call to see if it fits ${candidate.company}
- Calendar link: ${CAL_LINK}
- Sign off with exactly: <p>Rain<br>Gritnord</p>

${langInstruction}

Output only the plain email body as HTML paragraphs (<p> tags). No subject line. No markdown. Just the HTML body. The sign-off must be a separate final <p> tag.`,

    day14: `Write a short closing-the-loop email from Rain (Gritnord founder) to ${candidate.firstName} ${candidate.lastName}, ${candidate.title} at ${candidate.company}.

Context: Rain sent a video and a case study email over the past two weeks. No reply. This is the final touch — brief, no pressure, leave the door open.

Key points:
- Acknowledge reaching out a couple of weeks ago about booking meetings for ${candidate.company}
- No pressure if timing is off
- If still looking for reliable outbound: booking 15–25 meetings/month for founders like them right now
- Calendar link: ${CAL_LINK}
- Sign off with exactly: <p>Rain</p>

${langInstruction}

Output only the plain email body as HTML paragraphs (<p> tags). No subject line. No markdown. Just the HTML body. The sign-off must be a separate final <p> tag.`,
  };

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompts[type] }],
  });

  return response.content.find(b => b.type === 'text')?.text?.trim() ?? '';
}

async function executeDay7(candidate, dossier) {
  const html = await buildLocalizedEmail(candidate, dossier, 'day7');
  const subject = dossier.day7EmailSubject;
  const result = await sendViaLemlist({
    campaignId: LEMLIST_CAMPAIGN_D7,
    email: candidate.email,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    company: candidate.company,
    emailSubject: subject,
    emailBody: html,
  });
  return { ...result, html, subject, channel: 'email' };
}

async function executeDay10(candidate, dossier) {
  const lang = dossier.language || { code: 'en' };
  const message = lang.code === 'en'
    ? `${candidate.firstName}, I sent you a short video and a voice message about how we build outbound meeting flow for B2B founders.\n\nStill worth a look? ${CAL_LINK} — 15 minutes.`
    : `${candidate.firstName}, saatsin sulle eelmisel nädalal lühivideo ja häälsõnumi sellest, kuidas me B2B asutajatele müügikoosolekuid broneerime.\n\nKas on hetk? ${CAL_LINK} — 15 minutit.`;
  return sendLinkedInDM({ toLinkedInUrl: candidate.linkedInUrl, email: candidate.email, message, firstName: candidate.firstName, lastName: candidate.lastName });
}

async function executeDay14(candidate, dossier) {
  const lang = dossier.language || { code: 'en', name: 'English' };
  const subject = lang.code === 'en'
    ? `Closing the loop, ${candidate.firstName}`
    : dossier.day14EmailSubject || `Closing the loop, ${candidate.firstName}`;
  const html = await buildLocalizedEmail(candidate, dossier, 'day14');
  const result = await sendViaLemlist({
    campaignId: LEMLIST_CAMPAIGN_D14,
    email: candidate.email,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    company: candidate.company,
    emailSubject: subject,
    emailBody: html,
  });
  return { ...result, html, subject, channel: 'email' };
}

// ─── Main sequence runner ─────────────────────────────────────────────────────

const SEQUENCE_DAYS = [1, 2, 3, 7, 10, 14];

export async function tickSequences() {
  const sequences = getUCSequences().filter(s => s.status === 'active');
  const now = Date.now();
  let ticked = 0;

  for (const seq of sequences) {
    const startedAt = new Date(seq.startedAt).getTime();
    const daysSinceStart = Math.floor((now - startedAt) / (1000 * 60 * 60 * 24));

    for (const day of SEQUENCE_DAYS) {
      if (seq.completedSteps?.includes(day)) continue;
      if (daysSinceStart < day) continue;

      const candidate = seq.candidate;
      const dossier = seq.dossier;

      try {
        let result;
        if (day === 1)  result = await executeDay1(candidate, dossier);
        if (day === 2)  result = await executeDay2(candidate, dossier);
        if (day === 3)  result = await executeDay3(candidate, dossier);
        if (day === 7)  result = await executeDay7(candidate, dossier);
        if (day === 10) result = await executeDay10(candidate, dossier);
        if (day === 14) result = await executeDay14(candidate, dossier);

        const completedSteps = [...(seq.completedSteps || []), day];
        const isComplete = completedSteps.length >= SEQUENCE_DAYS.length;

        updateUCSequence(seq.candidateId, {
          completedSteps,
          status: isComplete ? 'completed' : 'active',
          lastStepAt: new Date().toISOString(),
          [`step${day}Result`]: result,
        });

        console.log(`[uc-seq] Day ${day} executed for ${candidate.firstName} ${candidate.lastName} (${candidate.company})`);
        ticked++;
      } catch (err) {
        console.error(`[uc-seq] Day ${day} failed for ${candidate.id}:`, err.message);
        updateUCSequence(seq.candidateId, { [`step${day}Error`]: err.message });
      }
    }
  }

  return ticked;
}

export async function fireSequenceStep(candidate, dossier, day) {
  if (day === 1)  return executeDay1(candidate, dossier);
  if (day === 2)  return executeDay2(candidate, dossier);
  if (day === 3)  return executeDay3(candidate, dossier);
  if (day === 7)  return executeDay7(candidate, dossier);
  if (day === 10) return executeDay10(candidate, dossier);
  if (day === 14) return executeDay14(candidate, dossier);
  throw new Error(`Unknown day: ${day}`);
}

export function startUCSequence({ candidate, dossier, calLink = CAL_LINK }) {
  return saveUCSequence({
    candidateId: candidate.id,
    candidate,
    dossier,
    calLink,
    status: 'active',
    startedAt: new Date().toISOString(),
    completedSteps: [],
    updatedAt: new Date().toISOString(),
  });
}
