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
    created_at TEXT NOT NULL,
    admission_stage TEXT NOT NULL DEFAULT 'new',
    admin_notes TEXT,
    stage_updated_at TEXT
  )
`;

// Columns added after the table first shipped. A database created before
// they existed gets them added on first use (see ensureSchema).
const ADDED_COLUMNS = {
  admission_stage: "TEXT NOT NULL DEFAULT 'new'",
  admin_notes: 'TEXT',
  stage_updated_at: 'TEXT',
};

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
  admissionStage: 'admission_stage',
  adminNotes: 'admin_notes',
  stageUpdatedAt: 'stage_updated_at',
};

async function migrate(db) {
  await db.prepare(SCHEMA).run();
  const { results } = await db.prepare('PRAGMA table_info(applications)').all();
  const existing = new Set(results.map((column) => column.name));
  for (const [column, definition] of Object.entries(ADDED_COLUMNS)) {
    if (!existing.has(column)) {
      await db.prepare(`ALTER TABLE applications ADD COLUMN ${column} ${definition}`).run();
    }
  }
}

// Creates (or upgrades) the table the first time each Worker instance
// touches the database, so a fresh D1 database needs no manual setup step.
let schemaReady = null;
function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = migrate(db).catch((err) => {
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

/**
 * Applications for the admin dashboard, newest first. Every filter is
 * optional; `status: 'all'` (or none) includes unpaid ones too.
 */
export async function listApplications(db, { status, stage, craft, q } = {}) {
  await ensureSchema(db);
  const where = [];
  const params = [];
  if (status && status !== 'all') {
    where.push('status = ?');
    params.push(status);
  }
  if (stage) {
    where.push('admission_stage = ?');
    params.push(stage);
  }
  if (craft) {
    where.push('craft = ?');
    params.push(craft);
  }
  if (q) {
    where.push('(name LIKE ? OR email LIKE ? OR phone LIKE ? OR reference LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  const sql = `SELECT * FROM applications ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 2000`;
  const { results } = await db.prepare(sql).bind(...params).all();
  return results.map(fromRow);
}

export async function getSummary(db) {
  await ensureSchema(db);
  const totals = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(status = 'paid'), 0) AS paid,
         COALESCE(SUM(status = 'pending'), 0) AS pending,
         COALESCE(SUM(status = 'failed'), 0) AS failed,
         COALESCE(SUM(status = 'awaiting_confirmation'), 0) AS awaitingConfirmation,
         COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_kobo ELSE 0 END), 0) AS revenueKobo,
         COALESCE(SUM(status = 'paid' AND admission_stage = 'new'), 0) AS awaitingContact,
         COALESCE(SUM(status = 'paid' AND scholarship_opt_in = 1), 0) AS scholarshipRequests
       FROM applications`
    )
    .first();
  const { results } = await db
    .prepare(`SELECT admission_stage AS stage, COUNT(*) AS count FROM applications WHERE status = 'paid' GROUP BY admission_stage`)
    .all();
  return {
    ...totals,
    byStage: Object.fromEntries(results.map((row) => [row.stage, row.count])),
  };
}
