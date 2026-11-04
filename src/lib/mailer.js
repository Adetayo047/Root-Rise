import { CRAFT_LABELS } from '../config.js';

// Sends through Resend's HTTP API (https://resend.com). Workers can't open
// the SMTP connection Gmail needs, but they can make plain HTTPS requests.
const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Root & Rise Institute — Admissions <onboarding@resend.dev>';

/**
 * Notifies the admissions team by email that a candidate has paid and
 * completed their application. Call this once, right after an application
 * transitions to status "paid" — never on every webhook retry or duplicate
 * verify call (callers are responsible for that guard).
 */
export async function notifyNewPaidApplication(env, application) {
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY is not set — skipping application notification email.');
    return;
  }
  const to = (env.ADMISSIONS_NOTIFY_EMAIL || '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);
  if (!to.length) {
    console.warn('No ADMISSIONS_NOTIFY_EMAIL configured — skipping application notification email.');
    return;
  }

  const craftLabel = CRAFT_LABELS[application.craft] || application.craft;
  const amountNaira = (application.amountKobo / 100).toLocaleString('en-NG');

  const text = [
    `A new candidate has paid the registration fee and completed their application.`,
    ``,
    `Name: ${application.name}`,
    `Email: ${application.email}`,
    `Phone: ${application.phone}`,
    `Age: ${application.age}`,
    `Craft Discipline: ${craftLabel}`,
    `Scholarship Evaluation Requested: ${application.scholarshipOptIn ? 'Yes' : 'No'}`,
    ``,
    `Statement of Intent:`,
    application.statement,
    ``,
    `--- Payment ---`,
    `Amount: ₦${amountNaira}`,
    `Reference: ${application.reference}`,
    `Paid At: ${application.paidAt || 'n/a'}`,
    `Channel: ${application.channel || 'n/a'}`,
  ].join('\n');

  const html = `
    <h2 style="font-family:sans-serif;color:#011e0f;">New Paid Application — ${escapeHtml(application.name)}</h2>
    <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;">
      <tr><td style="padding:4px 12px 4px 0;color:#555;">Name</td><td>${escapeHtml(application.name)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#555;">Email</td><td>${escapeHtml(application.email)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#555;">Phone</td><td>${escapeHtml(application.phone)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#555;">Age</td><td>${application.age}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#555;">Craft Discipline</td><td>${escapeHtml(craftLabel)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#555;">Scholarship Evaluation</td><td>${application.scholarshipOptIn ? 'Yes' : 'No'}</td></tr>
    </table>
    <p style="font-family:sans-serif;font-size:14px;"><strong>Statement of Intent:</strong><br/>${escapeHtml(application.statement).replace(/\n/g, '<br/>')}</p>
    <hr/>
    <table style="font-family:sans-serif;font-size:13px;color:#555;border-collapse:collapse;">
      <tr><td style="padding:2px 12px 2px 0;">Amount</td><td>₦${amountNaira}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;">Reference</td><td>${escapeHtml(application.reference)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;">Paid At</td><td>${escapeHtml(application.paidAt || 'n/a')}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;">Channel</td><td>${escapeHtml(application.channel || 'n/a')}</td></tr>
    </table>
  `;

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.MAIL_FROM || DEFAULT_FROM,
      to,
      subject: `New Paid Application — ${application.name} (${craftLabel})`,
      text,
      html,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend returned ${res.status}: ${await res.text()}`);
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
