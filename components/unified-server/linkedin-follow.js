'use strict';

const crypto = require('crypto');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────

const DAILY_CAP = parseInt(process.env.LINKEDIN_FOLLOW_DAILY_CAP || '20', 10);
const MIN_DELAY_MS = parseInt(process.env.LINKEDIN_FOLLOW_MIN_DELAY_SECONDS || '60', 10) * 1000;
const PROVIDER = process.env.LINKEDIN_FOLLOW_PROVIDER || 'manual';

// ─── Database ─────────────────────────────────────────────────────────────────

let _db = null;

function getDb(dbPath) {
  if (_db) return _db;
  const Database = require('better-sqlite3');
  const resolvedPath = dbPath ||
    process.env.LINKEDIN_FOLLOW_DB_PATH ||
    path.resolve(__dirname, '..', '..', 'logs', 'linkedin-follows.db');
  _db = new Database(resolvedPath);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS linkedin_follows (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      linkedin_url  TEXT UNIQUE NOT NULL,
      person_name   TEXT,
      company       TEXT,
      source        TEXT,
      status        TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      requested_at  TEXT NOT NULL,
      completed_at  TEXT
    )
  `);
  return _db;
}

// Allow tests to inject a fresh in-memory DB instance.
function _setDb(instance) { _db = instance; }

// ─── Auth ─────────────────────────────────────────────────────────────────────

function requireFollowAuth(req, res, next) {
  const expected = process.env.UNIFIED_SERVER_TOKEN;
  // No token configured → open (consistent with most other routes on this server).
  if (!expected) return next();
  const presented = req.get('x-unified-token');
  if (!presented) return res.status(401).json({ error: 'unauthorized' });
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// ─── Endpoint ─────────────────────────────────────────────────────────────────

const LINKEDIN_URL_RE = /^https?:\/\/(www\.)?linkedin\.com\/in\/[^/?#\s]+\/?$/i;

function followHandler(req, res) {
  const { linkedinUrl, personName, company, source } = req.body || {};

  if (!linkedinUrl || !LINKEDIN_URL_RE.test(linkedinUrl)) {
    return res.status(400).json({
      status: 'failed',
      message: 'Invalid or missing linkedinUrl (must be linkedin.com/in/...)',
    });
  }

  const database = getDb();
  const existing = database.prepare(
    'SELECT status FROM linkedin_follows WHERE linkedin_url = ?'
  ).get(linkedinUrl);

  if (existing) {
    return res.json({
      status: 'already_following',
      message: `Already recorded with status: ${existing.status}`,
    });
  }

  database.prepare(`
    INSERT INTO linkedin_follows (linkedin_url, person_name, company, source, status, requested_at)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run(linkedinUrl, personName || null, company || null, source || null, new Date().toISOString());

  res.json({ status: 'queued', message: 'Follow queued for processing' });
}

// ─── Providers ────────────────────────────────────────────────────────────────

async function manualProvider(row) {
  // Intentionally no real action — logs intent only.
  console.log(
    `[linkedin-follow] MANUAL intent — ${row.person_name || 'unknown'} at ${row.company || 'unknown'}: ${row.linkedin_url}`
  );
  return { success: true };
}

async function executeFollow(row) {
  switch (PROVIDER) {
    case 'manual':
      return manualProvider(row);
    default:
      throw new Error(`Unknown LINKEDIN_FOLLOW_PROVIDER: "${PROVIDER}" — supported: manual`);
  }
}

// ─── Worker ───────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

function countCompletedToday(database) {
  const start = `${todayStr()}T00:00:00.000Z`;
  const end = `${todayStr()}T23:59:59.999Z`;
  const row = database.prepare(`
    SELECT COUNT(*) AS n FROM linkedin_follows
    WHERE status = 'success' AND completed_at >= ? AND completed_at <= ?
  `).get(start, end);
  return row.n;
}

async function processOne(database) {
  const row = database.prepare(
    "SELECT * FROM linkedin_follows WHERE status = 'pending' ORDER BY requested_at ASC LIMIT 1"
  ).get();

  if (!row) return false;

  const done = countCompletedToday(database);
  if (done >= DAILY_CAP) {
    console.log(`[linkedin-follow] Daily cap (${DAILY_CAP}) reached; deferring until tomorrow`);
    return false;
  }

  try {
    const result = await executeFollow(row);
    database.prepare(`
      UPDATE linkedin_follows SET status = ?, completed_at = ?, error_message = ? WHERE id = ?
    `).run(
      result.success ? 'success' : 'failed',
      new Date().toISOString(),
      result.error || null,
      row.id
    );
    console.log(`[linkedin-follow] ${result.success ? 'success' : 'failed'}: ${row.linkedin_url}`);
  } catch (err) {
    database.prepare(`
      UPDATE linkedin_follows SET status = 'failed', completed_at = ?, error_message = ? WHERE id = ?
    `).run(new Date().toISOString(), err.message, row.id);
    console.error(`[linkedin-follow] error: ${err.message}`);
  }

  return true;
}

let _workerTimer = null;

async function _workerTick() {
  const processed = await processOne(getDb());
  // If nothing was processed (empty queue or cap hit), poll again in 1 min.
  const delay = processed ? MIN_DELAY_MS : 60_000;
  _workerTimer = setTimeout(_workerTick, delay);
}

function startFollowWorker() {
  console.log(
    `[linkedin-follow] Worker started — provider: ${PROVIDER}, ` +
    `cap: ${DAILY_CAP}/day, min delay: ${MIN_DELAY_MS / 1000}s between actions`
  );
  _workerTick();
}

function stopFollowWorker() {
  if (_workerTimer) {
    clearTimeout(_workerTimer);
    _workerTimer = null;
  }
}

module.exports = {
  requireFollowAuth,
  followHandler,
  startFollowWorker,
  stopFollowWorker,
  // Exported for tests:
  getDb,
  _setDb,
  countCompletedToday,
  processOne,
  LINKEDIN_URL_RE,
  DAILY_CAP,
  MIN_DELAY_MS,
};
