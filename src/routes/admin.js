import * as store from '../lib/store.js';
import { passwordMatches, createSessionCookie, clearSessionCookie, isAuthenticated } from '../lib/auth.js';
import { json, readJson } from '../lib/http.js';
import { ADMISSION_STAGES, CRAFT_LABELS } from '../config.js';

// Applicant data must never be cached by the browser or Cloudflare.
const NO_STORE = { 'Cache-Control': 'no-store' };
const APPLICATION_PATH = /^\/api\/admin\/applications\/([^/]+)$/;
const MAX_NOTES_LENGTH = 5000;

export async function handleAdmin(request, env, pathname) {
  const { method } = request;

  if (pathname === '/api/admin/login' && method === 'POST') return login(request, env);
  if (pathname === '/api/admin/logout' && method === 'POST') {
    return json({ ok: true }, 200, { ...NO_STORE, 'Set-Cookie': clearSessionCookie() });
  }

  // Everything below requires a signed-in admin.
  if (!(await isAuthenticated(request, env))) {
    return json({ ok: false, error: 'Please sign in.' }, 401, NO_STORE);
  }

  const url = new URL(request.url);
  if (pathname === '/api/admin/applications' && method === 'GET') return listApplications(env, url);
  if (pathname === '/api/admin/applications.csv' && method === 'GET') return exportCsv(env, url);

  const match = pathname.match(APPLICATION_PATH);
  if (match) {
    const reference = decodeURIComponent(match[1]);
    if (method === 'GET') return getApplication(env, reference);
    if (method === 'PATCH') return updateApplication(request, env, reference);
  }

  return json({ ok: false, error: 'Not found.' }, 404, NO_STORE);
}

async function login(request, env) {
  if (!env.ADMIN_PASSWORD) {
    return json({ ok: false, error: 'Admin access is not set up yet — add an ADMIN_PASSWORD secret on the Worker.' }, 503, NO_STORE);
  }
  const { password } = await readJson(request);
  if (!(await passwordMatches(env, password))) {
    // Slows down anyone trying to guess the password.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return json({ ok: false, error: 'Incorrect password.' }, 401, NO_STORE);
  }
  return json({ ok: true }, 200, { ...NO_STORE, 'Set-Cookie': await createSessionCookie(env) });
}

function readFilters(url) {
  const params = url.searchParams;
  return {
    status: params.get('status') || 'paid',
    stage: Object.hasOwn(ADMISSION_STAGES, params.get('stage')) ? params.get('stage') : '',
    craft: Object.hasOwn(CRAFT_LABELS, params.get('craft')) ? params.get('craft') : '',
    q: (params.get('q') || '').trim(),
  };
}

async function listApplications(env, url) {
  const [applications, summary] = await Promise.all([
    store.listApplications(env.DB, readFilters(url)),
    store.getSummary(env.DB),
  ]);
  return json({ ok: true, applications, summary }, 200, NO_STORE);
}

async function getApplication(env, reference) {
  const application = await store.findByReference(env.DB, reference);
  if (!application) return json({ ok: false, error: 'Application not found.' }, 404, NO_STORE);
  return json({ ok: true, application }, 200, NO_STORE);
}

async function updateApplication(request, env, reference) {
  const application = await store.findByReference(env.DB, reference);
  if (!application) return json({ ok: false, error: 'Application not found.' }, 404, NO_STORE);

  const { admissionStage, adminNotes } = await readJson(request);
  const updates = {};

  if (admissionStage !== undefined) {
    if (!Object.hasOwn(ADMISSION_STAGES, admissionStage)) {
      return json({ ok: false, error: 'Unknown admission stage.' }, 400, NO_STORE);
    }
    if (admissionStage !== application.admissionStage) {
      updates.admissionStage = admissionStage;
      updates.stageUpdatedAt = new Date().toISOString();
    }
  }
  if (adminNotes !== undefined) {
    if (typeof adminNotes !== 'string' || adminNotes.length > MAX_NOTES_LENGTH) {
      return json({ ok: false, error: `Notes must be text under ${MAX_NOTES_LENGTH} characters.` }, 400, NO_STORE);
    }
    updates.adminNotes = adminNotes.trim();
  }

  if (!Object.keys(updates).length) return json({ ok: true, application }, 200, NO_STORE);

  const updated = await store.updateByReference(env.DB, reference, updates);
  return json({ ok: true, application: updated }, 200, NO_STORE);
}

// Spreadsheet apps run cells starting with these characters as formulas,
// so a candidate could type "=HYPERLINK(...)" into the form. Prefixing an
// apostrophe makes the cell plain text.
function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

async function exportCsv(env, url) {
  const applications = await store.listApplications(env.DB, readFilters(url));
  const header = [
    'Reference', 'Submitted', 'Name', 'Email', 'Phone', 'Age', 'Craft', 'Scholarship',
    'Payment Status', 'Amount (NGN)', 'Paid At', 'Channel', 'Admission Stage', 'Notes', 'Statement',
  ];
  const rows = applications.map((a) => [
    a.reference,
    a.createdAt,
    a.name,
    a.email,
    a.phone,
    a.age,
    CRAFT_LABELS[a.craft] || a.craft,
    a.scholarshipOptIn ? 'Yes' : 'No',
    a.status,
    a.amountKobo / 100,
    a.paidAt,
    a.channel,
    ADMISSION_STAGES[a.admissionStage] || a.admissionStage,
    a.adminNotes,
    a.statement,
  ]);
  // Leading BOM so Excel opens the ₦ sign and accented names correctly.
  const csv = '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      ...NO_STORE,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="rootandrise-applications-${date}.csv"`,
    },
  });
}
