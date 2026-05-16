// Newsletter sender — Resend API
// Free tier: 3,000 emails/month, 100/day
// Owned audience: most AI-proof channel (no algorithm, no AI kills it)

import { getCMSubscribers, getCMNewsletter, updateCMPiece } from './content-engine.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL     = process.env.NEWSLETTER_FROM || 'Rain from Gritnord <rain@gritnord.com>';
const REPLY_TO       = 'rain@gritnord.com';

// ── Send one email via Resend ─────────────────────────────────────────────────

async function sendEmail({ to, subject, html, text }) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:     FROM_EMAIL,
      to:       Array.isArray(to) ? to : [to],
      reply_to: REPLY_TO,
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error ${res.status}: ${err}`);
  }

  return res.json();
}

// ── Convert markdown newsletter body to clean HTML ────────────────────────────

function markdownToHtml(markdown) {
  let html = markdown
    // Remove SUBJECT OPTIONS block (already parsed)
    .replace(/SUBJECT OPTIONS:[\s\S]*?(?=\n\nHey |\nHey )/i, '')
    .trim();

  // Basic markdown → HTML
  html = html
    // H3 → section headers
    .replace(/^### (.+)$/gm, '<h3 style="color:#1a1a1a;font-size:16px;font-weight:700;margin:28px 0 8px;">$1</h3>')
    // H2 → section headers
    .replace(/^## (.+)$/gm, '<h2 style="color:#1a1a1a;font-size:18px;font-weight:700;margin:32px 0 12px;">$1</h2>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // 🎯 takeaway lines — highlight
    .replace(/🎯 The move: (.+)/g, '<div style="background:#f5f0ff;border-left:3px solid #a78bfa;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0;"><strong>🎯 The move:</strong> $1</div>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0;">')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" style="color:#a78bfa;text-decoration:none;">$1</a>')
    // Bare URLs
    .replace(/(https?:\/\/[^\s<>"]+)/g, '<a href="$1" style="color:#a78bfa;text-decoration:none;">$1</a>')
    // Paragraphs — double newline
    .replace(/\n\n/g, '</p><p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 16px;">')
    // Single newlines in paragraphs
    .replace(/\n/g, '<br>');

  return `<p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 16px;">${html}</p>`;
}

// ── Build full HTML email ─────────────────────────────────────────────────────

function buildHtmlEmail({ subject, body, firstName = '' }) {
  const greeting = firstName ? `Hey ${firstName},` : 'Hey,';
  const htmlBody  = markdownToHtml(body);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#0d0d0d;padding:24px 32px;">
              <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.5px;">Gritnord</span>
              <span style="color:#a78bfa;font-size:13px;margin-left:8px;">GTM Intelligence</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${htmlBody}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f5f5f5;padding:24px 32px;border-top:1px solid #e5e5e5;">
              <p style="color:#6b7280;font-size:12px;margin:0 0 8px;">
                You're getting this because you subscribed to Gritnord GTM Intelligence.
              </p>
              <p style="color:#6b7280;font-size:12px;margin:0;">
                Gritnord · Building B2B pipeline in the Nordics and EU ·
                <a href="https://gritnord.com" style="color:#a78bfa;text-decoration:none;">gritnord.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Send newsletter to all subscribers ───────────────────────────────────────

export async function sendNewsletter({ newsletterId, subjectOverride } = {}) {
  const newsletters = getCMNewsletter();
  const nl = newsletterId
    ? newsletters.find(n => n.id === newsletterId)
    : newsletters[0]; // most recent

  if (!nl) throw new Error('Newsletter not found');

  const subscribers = getCMSubscribers();
  if (!subscribers.length) throw new Error('No subscribers');

  const subject = subjectOverride || nl.selectedSubject || nl.subjects?.[0] || 'GTM intel this week';

  let sent = 0;
  let errors = 0;
  const log = [];

  for (const sub of subscribers) {
    try {
      const html = buildHtmlEmail({
        subject,
        body: nl.body,
        firstName: sub.firstName || '',
      });

      // Plain text fallback (strip HTML roughly)
      const text = nl.body.replace(/<[^>]+>/g, '').replace(/\n\n+/g, '\n\n').trim();

      await sendEmail({ to: sub.email, subject, html, text });
      sent++;
      log.push({ email: sub.email, status: 'sent' });
      console.log(`[newsletter] sent → ${sub.email}`);

      // Rate limit: Resend free = 2/sec
      await new Promise(r => setTimeout(r, 600));
    } catch (err) {
      errors++;
      log.push({ email: sub.email, status: 'error', error: err.message });
      console.error(`[newsletter] failed → ${sub.email}:`, err.message);
    }
  }

  return { newsletterId: nl.id, subject, sent, errors, total: subscribers.length, log };
}

// ── Send a test email (to Rain only) ─────────────────────────────────────────

export async function sendTestNewsletter({ newsletterId, email = 'rain@gritnord.com' } = {}) {
  const newsletters = getCMNewsletter();
  const nl = newsletterId
    ? newsletters.find(n => n.id === newsletterId)
    : newsletters[0];

  if (!nl) throw new Error('Newsletter not found');

  const subject = `[TEST] ${nl.selectedSubject || nl.subjects?.[0] || 'GTM intel this week'}`;
  const html = buildHtmlEmail({ subject, body: nl.body, firstName: 'Rain' });
  const text = nl.body.replace(/<[^>]+>/g, '').trim();

  const result = await sendEmail({ to: email, subject, html, text });
  console.log(`[newsletter] test sent to ${email}`);
  return result;
}

// ── Export HTML preview (no sending) ─────────────────────────────────────────

export function previewNewsletterHtml(newsletterId) {
  const newsletters = getCMNewsletter();
  const nl = newsletterId
    ? newsletters.find(n => n.id === newsletterId)
    : newsletters[0];

  if (!nl) throw new Error('Newsletter not found');
  const subject = nl.selectedSubject || nl.subjects?.[0] || 'GTM Intel';
  return buildHtmlEmail({ subject, body: nl.body, firstName: 'Rain' });
}
