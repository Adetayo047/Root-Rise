const express = require('express');
const crypto = require('crypto');
const store = require('../lib/store');
const { verifyTransaction } = require('../lib/paystack');
const { notifyNewPaidApplication } = require('../lib/mailer');

const router = express.Router();

function isValidSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const signatureBuffer = Buffer.from(signatureHeader, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  // Lengths must match before timingSafeEqual — it throws on mismatched buffer sizes.
  return signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

// Paystack calls this directly, server-to-server, whenever a payment event
// happens — independent of whether the candidate's browser is still open.
// This is what makes payment confirmation reliable: the browser-driven
// verify call in routes/applications.js handles the common case (candidate
// stays on the page), and this webhook catches everything else (closed tab,
// crashed browser, flaky connection right after paying).
//
// Needs express.raw() (not express.json()) because Paystack's signature is
// computed over the exact raw request bytes — parsing to an object first
// and re-serializing would not reliably reproduce the same bytes.
router.post('/paystack', express.raw({ type: 'application/json' }), async (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error('Paystack webhook received but PAYSTACK_SECRET_KEY is not set — cannot verify signature.');
    return res.sendStatus(500);
  }

  const signature = req.headers['x-paystack-signature'];
  if (!isValidSignature(req.body, signature, secret)) {
    console.warn('Paystack webhook: signature mismatch — ignoring request (not from Paystack, or PAYSTACK_SECRET_KEY is wrong).');
    return res.sendStatus(401);
  }

  // Acknowledge receipt immediately. Paystack retries on anything but a
  // fast 2xx, and our own follow-up verification can safely happen after
  // we've responded.
  res.sendStatus(200);

  let event;
  try {
    event = JSON.parse(req.body.toString('utf-8'));
  } catch (err) {
    console.error('Paystack webhook: payload was not valid JSON.', err.message);
    return;
  }

  if (event.event !== 'charge.success') return;

  const reference = event.data && event.data.reference;
  if (!reference) return;

  const application = store.findByReference(reference);
  if (!application) {
    console.warn(`Paystack webhook: charge.success for unrecognized reference "${reference}".`);
    return;
  }
  if (application.status === 'paid') return; // Already confirmed, likely via the browser's own verify call.

  try {
    // Re-verify with Paystack's API rather than trusting the webhook body's
    // amount/status fields alone — same defense-in-depth as the browser path.
    const transaction = await verifyTransaction(reference);
    const isSuccessful =
      transaction.status === 'success' &&
      transaction.currency === 'NGN' &&
      transaction.amount === application.amountKobo;

    const updated = store.updateByReference(reference, {
      status: isSuccessful ? 'paid' : 'failed',
      paystackStatus: transaction.status,
      paidAt: isSuccessful ? transaction.paid_at || new Date().toISOString() : application.paidAt,
      channel: transaction.channel,
      verifiedAt: new Date().toISOString(),
      verifiedVia: 'webhook',
    });

    if (isSuccessful) {
      console.log(`Paystack webhook: confirmed payment for ${reference} (${application.email}).`);
      if (store.claimNotification(reference)) {
        notifyNewPaidApplication(updated).catch((err) => {
          console.error(`Failed to send notification email for ${reference}:`, err.message);
        });
      }
    }
  } catch (err) {
    console.error(`Paystack webhook: verification lookup failed for ${reference}:`, err.message);
  }
});

module.exports = router;
