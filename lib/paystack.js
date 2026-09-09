const PAYSTACK_BASE_URL = 'https://api.paystack.co';

function getSecretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new Error('PAYSTACK_SECRET_KEY is not set. Add it to your .env file.');
  }
  return key;
}

/**
 * Verifies a transaction reference directly with Paystack's servers.
 * Never trust a client-reported "payment succeeded" without this check —
 * it's the only way to confirm money actually moved.
 */
async function verifyTransaction(reference) {
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
    },
  });

  const body = await res.json();

  if (!res.ok) {
    const message = body && body.message ? body.message : `Paystack verify failed with status ${res.status}`;
    throw new Error(message);
  }

  return body.data; // { status, amount, currency, reference, customer, paid_at, channel, ... }
}

module.exports = { verifyTransaction };
