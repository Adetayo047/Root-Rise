const PAYSTACK_BASE_URL = 'https://api.paystack.co';

/**
 * Verifies a transaction reference directly with Paystack's servers.
 * Never trust a client-reported "payment succeeded" without this check —
 * it's the only way to confirm money actually moved.
 */
export async function verifyTransaction(env, reference) {
  if (!env.PAYSTACK_SECRET_KEY) {
    throw new Error('PAYSTACK_SECRET_KEY is not set. Add it as a secret on the Worker.');
  }

  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
    },
  });

  const body = await res.json();

  if (!res.ok) {
    const message = body && body.message ? body.message : `Paystack verify failed with status ${res.status}`;
    throw new Error(message);
  }

  return body.data; // { status, amount, currency, reference, customer, paid_at, channel, ... }
}

/**
 * True only when Paystack says the charge succeeded for exactly the amount
 * and currency this application was created with.
 */
export function isSuccessfulPayment(transaction, application) {
  return (
    transaction.status === 'success' &&
    transaction.currency === 'NGN' &&
    transaction.amount === application.amountKobo
  );
}
