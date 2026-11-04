import * as store from '../lib/store.js';
import { verifyTransaction, isSuccessfulPayment } from '../lib/paystack.js';
import { notifyNewPaidApplication } from '../lib/mailer.js';
import { json, readJson } from '../lib/http.js';
import { CRAFT_LABELS, REGISTRATION_FEE_KOBO } from '../config.js';

const VERIFY_PATH = /^\/api\/applications\/([^/]+)\/verify$/;

export async function handleApplications(request, env, ctx, pathname) {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed.' }, 405);
  }
  if (pathname === '/api/applications') {
    return createApplication(request, env);
  }
  const match = pathname.match(VERIFY_PATH);
  if (match) {
    return verifyApplication(decodeURIComponent(match[1]), env, ctx);
  }
  return json({ ok: false, error: 'Not found.' }, 404);
}

function generateReference() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `RR-${Date.now()}-${hex}`;
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Step 1: candidate submits the form. We validate, generate a payment
// reference, and record a "pending" application before handing the
// reference to the browser to open the Paystack popup with.
async function createApplication(request, env) {
  const { name, email, phone, age, craft, scholarshipOptIn, statement } = await readJson(request);

  const errors = [];
  if (!name || typeof name !== 'string' || !name.trim()) errors.push('Full legal name is required.');
  if (!isValidEmail(email)) errors.push('A valid email address is required.');
  if (!phone || typeof phone !== 'string' || !phone.trim()) errors.push('A WhatsApp phone number is required.');
  const ageNum = Number(age);
  if (!Number.isInteger(ageNum) || ageNum < 16 || ageNum > 30) errors.push('Candidate age must be between 16 and 30.');
  if (!Object.hasOwn(CRAFT_LABELS, craft)) errors.push('Please select a valid craft discipline.');
  if (!statement || typeof statement !== 'string' || !statement.trim()) errors.push('A brief statement of intent is required.');

  if (errors.length) {
    return json({ ok: false, errors }, 400);
  }

  const reference = generateReference();

  await store.createApplication(env.DB, {
    reference,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    age: ageNum,
    craft,
    scholarshipOptIn: Boolean(scholarshipOptIn),
    statement: statement.trim(),
    amountKobo: REGISTRATION_FEE_KOBO,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });

  return json({
    ok: true,
    reference,
    email: email.trim().toLowerCase(),
    amountKobo: REGISTRATION_FEE_KOBO,
    publicKey: env.PAYSTACK_PUBLIC_KEY || '',
  });
}

// Step 2: after the Paystack popup reports success, the browser calls this
// endpoint. We independently re-verify the transaction with Paystack's
// servers (never trusting the popup callback alone) before marking the
// application paid.
async function verifyApplication(reference, env, ctx) {
  const application = await store.findByReference(env.DB, reference);

  if (!application) {
    return json({ ok: false, error: 'No application found for this reference.' }, 404);
  }

  if (application.status === 'paid') {
    return json({ ok: true, alreadyVerified: true });
  }

  let transaction;
  try {
    transaction = await verifyTransaction(env, reference);
  } catch (err) {
    console.error('Paystack verification error:', err.message);
    return json({ ok: false, error: 'Could not reach Paystack to verify payment. Please try again.' }, 502);
  }

  if (!isSuccessfulPayment(transaction, application)) {
    await store.updateByReference(env.DB, reference, {
      status: 'failed',
      paystackStatus: transaction.status,
      verifiedAt: new Date().toISOString(),
    });
    return json({ ok: false, error: 'Payment could not be verified as successful.' }, 402);
  }

  const paidApplication = await store.updateByReference(env.DB, reference, {
    status: 'paid',
    paystackStatus: transaction.status,
    paidAt: transaction.paid_at || new Date().toISOString(),
    channel: transaction.channel,
    verifiedAt: new Date().toISOString(),
    verifiedVia: 'browser',
  });

  if (await store.claimNotification(env.DB, reference)) {
    // waitUntil keeps the Worker alive to finish sending after we've
    // already answered the browser.
    ctx.waitUntil(
      notifyNewPaidApplication(env, paidApplication).catch((err) => {
        console.error(`Failed to send notification email for ${reference}:`, err.message);
      })
    );
  }

  return json({ ok: true });
}
