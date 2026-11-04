import { toHex, hexToBytes } from './hex.js';

// Admin sign-in uses a single shared password (the ADMIN_PASSWORD secret).
// A successful sign-in gets a cookie holding "<expiry>.<signature>", where
// the signature is an HMAC of the expiry keyed by the password itself — so
// nothing needs storing server-side, and changing the password instantly
// signs everyone out.

const COOKIE_NAME = 'rr_admin';
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const encoder = new TextEncoder();

function importHmacKey(secret, usage) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

function sessionPayload(expires) {
  return encoder.encode(`admin-session.${expires}`);
}

/**
 * Compares in constant time so response timing can't leak how much of a
 * guess was right. Hashing first gives both sides the same length.
 */
export async function passwordMatches(env, attempt) {
  if (!env.ADMIN_PASSWORD || typeof attempt !== 'string') return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(attempt)),
    crypto.subtle.digest('SHA-256', encoder.encode(env.ADMIN_PASSWORD)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

export async function createSessionCookie(env) {
  const expires = Date.now() + SESSION_TTL_SECONDS * 1000;
  const key = await importHmacKey(env.ADMIN_PASSWORD, 'sign');
  const signature = toHex(await crypto.subtle.sign('HMAC', key, sessionPayload(expires)));
  return `${COOKIE_NAME}=${expires}.${signature}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

export async function isAuthenticated(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return false;

  const [expiresRaw, signatureHex] = token.split('.');
  const expires = Number(expiresRaw);
  const signature = hexToBytes(signatureHex);
  if (!Number.isFinite(expires) || expires < Date.now() || !signature) return false;

  const key = await importHmacKey(env.ADMIN_PASSWORD, 'verify');
  return crypto.subtle.verify('HMAC', key, signature, sessionPayload(expires));
}
