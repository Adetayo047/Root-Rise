import * as store from '../lib/store.js';
import { verifyTransaction, isSuccessfulPayment } from '../lib/paystack.js';
import { notifyNewPaidApplication } from '../lib/mailer.js';

function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Paystack signs the raw body with HMAC-SHA512 using the secret key.
// crypto.subtle.verify does the comparison in constant time.
async function isValidSignature(rawBody, signatureHeader, secret) {
  const signature = hexToBytes(signatureHeader);
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['verify']
  );
  return crypto.subtle.verify('HMAC', key, signature, rawBody);
}

// Paystack calls this directly, server-to-server, whenever a payment event
// happens — independent of whether the candidate's browser is still open.
// This is what makes payment confirmation reliable: the browser-driven
// verify call in routes/applications.js handles the common case (candidate
// stays on the page), and this webhook catches everything else (closed tab,
// crashed browser, flaky connection right after paying).
//
// Reads the body as raw bytes (not JSON) because Paystack's signature is
// computed over the exact request bytes.
export async function handlePaystackWebhook(request, env, ctx) {
  if (request.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  const secret = env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error('Paystack webhook received but PAYSTACK_SECRET_KEY is not set — cannot verify signature.');
    return new Response(null, { status: 500 });
  }

  const rawBody = await request.arrayBuffer();
  const signature = request.headers.get('x-paystack-signature');
  if (!(await isValidSignature(rawBody, signature, secret))) {
    console.warn('Paystack webhook: signature mismatch — ignoring request (not from Paystack, or PAYSTACK_SECRET_KEY is wrong).');
    return new Response(null, { status: 401 });
  }

  // Acknowledge receipt immediately. Paystack retries on anything but a
  // fast 2xx, and waitUntil lets our own follow-up verification finish
  // after we've responded.
  ctx.waitUntil(processEvent(rawBody, env));
  return new Response(null, { status: 200 });
}

async function processEvent(rawBody, env) {
  let event;
  try {
    event = JSON.parse(new TextDecoder().decode(rawBody));
  } catch (err) {
    console.error('Paystack webhook: payload was not valid JSON.', err.message);
    return;
  }

  if (event.event !== 'charge.success') return;

  const reference = event.data && event.data.reference;
  if (!reference) return;

  try {
    const application = await store.findByReference(env.DB, reference);
    if (!application) {
      console.warn(`Paystack webhook: charge.success for unrecognized reference "${reference}".`);
      return;
    }
    if (application.status === 'paid') return; // Already confirmed, likely via the browser's own verify call.

    // Re-verify with Paystack's API rather than trusting the webhook body's
    // amount/status fields alone — same defense-in-depth as the browser path.
    const transaction = await verifyTransaction(env, reference);
    const isSuccessful = isSuccessfulPayment(transaction, application);

    const updated = await store.updateByReference(env.DB, reference, {
      status: isSuccessful ? 'paid' : 'failed',
      paystackStatus: transaction.status,
      paidAt: isSuccessful ? transaction.paid_at || new Date().toISOString() : application.paidAt,
      channel: transaction.channel,
      verifiedAt: new Date().toISOString(),
      verifiedVia: 'webhook',
    });

    if (isSuccessful) {
      console.log(`Paystack webhook: confirmed payment for ${reference} (${application.email}).`);
      if (await store.claimNotification(env.DB, reference)) {
        await notifyNewPaidApplication(env, updated).catch((err) => {
          console.error(`Failed to send notification email for ${reference}:`, err.message);
        });
      }
    }
  } catch (err) {
    console.error(`Paystack webhook: processing failed for ${reference}:`, err.message);
  }
}
