// Application records live in Cloudflare D1 (SQLite), bound to the Worker
// as env.DB in wrangler.jsonc.

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS applications (
    reference TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    age INTEGER NOT NULL,
    craft TEXT NOT NULL,
    scholarship_opt_in INTEGER NOT NULL DEFAULT 0,
    statement TEXT NOT NULL,
    amount_kobo INTEGER NOT NULL,
    status TEXT NOT NULL,
    paystack_status TEXT,
    paid_at TEXT,
    channel TEXT,
    verified_at TEXT,
    verified_via TEXT,
    notified_at TEXT,
    created_at TEXT NOT NULL
  )
`;

const COLUMNS = {
  reference: 'reference',
  name: 'name',
  email: 'email',
  phone: 'phone',
  age: 'age',
  craft: 'craft',
  scholarshipOptIn: 'scholarship_opt_in',
  statement: 'statement',
  amountKobo: 'amount_kobo',
  status: 'status',
  paystackStatus: 'paystack_status',
  paidAt: 'paid_at',
  channel: 'channel',
  verifiedAt: 'verified_at',
  verifiedVia: 'verified_via',
  notifiedAt: 'notified_at',
  createdAt: 'created_at',
};

// Creates the table the first time each Worker instance touches the
// database, so a fresh D1 database needs no manual setup step.
let schemaReady = null;
function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db.prepare(SCHEMA).run().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

function toColumnValue(key, value) {
  if (key === 'scholarshipOptIn') return value ? 1 : 0;
  return value === undefined ? null : value;
}

function fromRow(row) {
  if (!row) return null;
  const application = {};
  for (const [key, column] of Object.entries(COLUMNS)) {
    application[key] = row[column];
  }
  application.scholarshipOptIn = Boolean(row.scholarship_opt_in);
  return application;
}

export async function createApplication(db, record) {
  await ensureSchema(db);
  const keys = Object.keys(record);
  const columns = keys.map((key) => COLUMNS[key]);
  await db
    .prepare(`INSERT INTO applications (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .bind(...keys.map((key) => toColumnValue(key, record[key])))
    .run();
  return record;
}

export async function findByReference(db, reference) {
  await ensureSchema(db);
  const row = await db.prepare('SELECT * FROM applications WHERE reference = ?').bind(reference).first();
  return fromRow(row);
}

export async function updateByReference(db, reference, updates) {
  await ensureSchema(db);
  const keys = Object.keys(updates);
  const assignments = keys.map((key) => `${COLUMNS[key]} = ?`).join(', ');
  const row = await db
    .prepare(`UPDATE applications SET ${assignments} WHERE reference = ? RETURNING *`)
    .bind(...keys.map((key) => toColumnValue(key, updates[key])), reference)
    .first();
  return fromRow(row);
}

/**
 * Claims the right to send the "new paid application" notification for a
 * reference — at most one caller ever gets `true` back. The browser-driven
 * verify call and the Paystack webhook can both race to confirm the same
 * payment; without this, both could fire off a duplicate email. The single
 * conditional UPDATE is atomic in D1, so only one of them can flip
 * notified_at from NULL.
 */
export async function claimNotification(db, reference) {
  await ensureSchema(db);
  const result = await db
    .prepare('UPDATE applications SET notified_at = ? WHERE reference = ? AND notified_at IS NULL')
    .bind(new Date().toISOString(), reference)
    .run();
  return result.meta.changes === 1;
}
