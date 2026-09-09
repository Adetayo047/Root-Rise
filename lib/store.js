const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'applications.json');

function readAll() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function writeAll(applications) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(applications, null, 2));
}

function createApplication(record) {
  const applications = readAll();
  applications.push(record);
  writeAll(applications);
  return record;
}

function findByReference(reference) {
  return readAll().find((a) => a.reference === reference);
}

function updateByReference(reference, updates) {
  const applications = readAll();
  const index = applications.findIndex((a) => a.reference === reference);
  if (index === -1) return null;
  applications[index] = { ...applications[index], ...updates };
  writeAll(applications);
  return applications[index];
}

/**
 * Claims the right to send the "new paid application" notification for a
 * reference — at most one caller ever gets `true` back. The browser-driven
 * verify call and the Paystack webhook can both race to confirm the same
 * payment; without this, both could fire off a duplicate email. Safe
 * because this function does its read + write synchronously with no
 * `await` in between, so Node's single-threaded event loop can't interleave
 * another call into the middle of it.
 */
function claimNotification(reference) {
  const applications = readAll();
  const index = applications.findIndex((a) => a.reference === reference);
  if (index === -1) return false;
  if (applications[index].notifiedAt) return false;
  applications[index] = { ...applications[index], notifiedAt: new Date().toISOString() };
  writeAll(applications);
  return true;
}

module.exports = { createApplication, findByReference, updateByReference, claimNotification, readAll };
