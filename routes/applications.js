const express = require('express');
const crypto = require('crypto');
const store = require('../lib/store');
const { verifyTransaction } = require('../lib/paystack');
const { notifyNewPaidApplication } = require('../lib/mailer');

const router = express.Router();

const REGISTRATION_FEE_NAIRA = 20000;
const REGISTRATION_FEE_KOBO = REGISTRATION_FEE_NAIRA * 100;
const VALID_CRAFTS = new Set([
  'fashion',
  'leather',
  'furniture',
  'decorative',
  'jewellery',
  'arts',
  'culinary',
  'beauty',
]);

function generateReference() {
  return `RR-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Step 1: candidate submits the form. We validate, generate a payment
// reference, and record a "pending" application before handing the
// reference to the browser to open the Paystack popup with.
router.post('/', express.json(), (req, res) => {
  const { name, email, phone, age, craft, scholarshipOptIn, statement } = req.body || {};

  const errors = [];
  if (!name || typeof name !== 'string' || !name.trim()) errors.push('Full legal name is required.');
  if (!isValidEmail(email)) errors.push('A valid email address is required.');
  if (!phone || typeof phone !== 'string' || !phone.trim()) errors.push('A WhatsApp phone number is required.');
  const ageNum = Number(age);
  if (!Number.isInteger(ageNum) || ageNum < 16 || ageNum > 30) errors.push('Candidate age must be between 16 and 30.');
  if (!VALID_CRAFTS.has(craft)) errors.push('Please select a valid craft discipline.');
  if (!statement || typeof statement !== 'string' || !statement.trim()) errors.push('A brief statement of intent is required.');

  if (errors.length) {
    return res.status(400).json({ ok: false, errors });
  }

  const reference = generateReference();

  store.createApplication({
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

  res.json({
    ok: true,
    reference,
    email: email.trim().toLowerCase(),
    amountKobo: REGISTRATION_FEE_KOBO,
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
  });
});

// Step 2: after the Paystack popup reports success, the browser calls this
// endpoint. We independently re-verify the transaction with Paystack's
// servers (never trusting the popup callback alone) before marking the
// application paid.
router.post('/:reference/verify', express.json(), async (req, res) => {
  const { reference } = req.params;
  const application = store.findByReference(reference);

  if (!application) {
    return res.status(404).json({ ok: false, error: 'No application found for this reference.' });
  }

  if (application.status === 'paid') {
    return res.json({ ok: true, alreadyVerified: true });
  }

  try {
    const transaction = await verifyTransaction(reference);

    const isSuccessful =
      transaction.status === 'success' &&
      transaction.currency === 'NGN' &&
      transaction.amount === application.amountKobo;

    if (!isSuccessful) {
      store.updateByReference(reference, {
        status: 'failed',
        paystackStatus: transaction.status,
        verifiedAt: new Date().toISOString(),
      });
      return res.status(402).json({ ok: false, error: 'Payment could not be verified as successful.' });
    }

    const paidApplication = store.updateByReference(reference, {
      status: 'paid',
      paystackStatus: transaction.status,
      paidAt: transaction.paid_at || new Date().toISOString(),
      channel: transaction.channel,
      verifiedAt: new Date().toISOString(),
    });

    if (store.claimNotification(reference)) {
      notifyNewPaidApplication(paidApplication).catch((err) => {
        console.error(`Failed to send notification email for ${reference}:`, err.message);
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Paystack verification error:', err.message);
    res.status(502).json({ ok: false, error: 'Could not reach Paystack to verify payment. Please try again.' });
  }
});

module.exports = router;
