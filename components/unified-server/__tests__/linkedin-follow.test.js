'use strict';

const Database = require('better-sqlite3');

// Use an in-memory DB for every test run.
function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE linkedin_follows (
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
  return db;
}

// Re-require the module fresh for each test so module-level state is clean.
function loadModule() {
  jest.resetModules();
  return require('../linkedin-follow');
}

// ─── Endpoint unit tests (without HTTP) ──────────────────────────────────────

describe('followHandler', () => {
  let mod, db;

  beforeEach(() => {
    mod = loadModule();
    db = makeDb();
    mod._setDb(db);
  });

  function makeReqRes(body) {
    const res = { statusCode: 200, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (obj) => { res.body = obj; return res; };
    return { req: { body }, res };
  }

  test('returns 400 for missing linkedinUrl', () => {
    const { req, res } = makeReqRes({});
    mod.followHandler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  test('returns 400 for a non-linkedin URL', () => {
    const { req, res } = makeReqRes({ linkedinUrl: 'https://example.com/in/person' });
    mod.followHandler(req, res);
    expect(res.statusCode).toBe(400);
  });

  test('returns 400 for a company page (not /in/)', () => {
    const { req, res } = makeReqRes({ linkedinUrl: 'https://linkedin.com/company/acme' });
    mod.followHandler(req, res);
    expect(res.statusCode).toBe(400);
  });

  test('queues a valid follow and returns status queued', () => {
    const { req, res } = makeReqRes({
      linkedinUrl: 'https://linkedin.com/in/janedoe',
      personName: 'Jane Doe',
      company: 'Acme',
      source: 'sf-funding-report',
    });
    mod.followHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('queued');

    const row = db.prepare('SELECT * FROM linkedin_follows WHERE linkedin_url = ?').get('https://linkedin.com/in/janedoe');
    expect(row.status).toBe('pending');
    expect(row.person_name).toBe('Jane Doe');
  });

  test('returns already_following on duplicate submission without re-queueing', () => {
    const url = 'https://linkedin.com/in/janedoe';
    db.prepare(`INSERT INTO linkedin_follows (linkedin_url, status, requested_at) VALUES (?, 'success', ?)`).run(url, new Date().toISOString());

    const { req, res } = makeReqRes({ linkedinUrl: url });
    mod.followHandler(req, res);
    expect(res.body.status).toBe('already_following');

    // Must not insert a second row.
    const count = db.prepare('SELECT COUNT(*) AS n FROM linkedin_follows WHERE linkedin_url = ?').get(url).n;
    expect(count).toBe(1);
  });
});

// ─── Worker: daily cap ────────────────────────────────────────────────────────

describe('worker daily cap', () => {
  let mod, db;

  beforeEach(() => {
    mod = loadModule();
    db = makeDb();
    mod._setDb(db);
  });

  test('excess items beyond DAILY_CAP stay pending after processOne runs', async () => {
    const cap = mod.DAILY_CAP; // default 20 unless env overridden

    // Queue cap+5 items.
    const total = cap + 5;
    for (let i = 0; i < total; i++) {
      db.prepare(`INSERT INTO linkedin_follows (linkedin_url, status, requested_at) VALUES (?, 'pending', ?)`).run(
        `https://linkedin.com/in/person${i}`,
        new Date(Date.now() + i).toISOString()
      );
    }

    // Simulate processing cap items (mark them success with today's completed_at).
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const rows = db.prepare("SELECT id FROM linkedin_follows WHERE status = 'pending' ORDER BY requested_at ASC").all().slice(0, cap);
    for (const row of rows) {
      db.prepare("UPDATE linkedin_follows SET status = 'success', completed_at = ? WHERE id = ?").run(
        `${todayPrefix}T12:00:00.000Z`, row.id
      );
    }

    // processOne should now refuse to process (cap hit) and return false.
    const processed = await mod.processOne(db);
    expect(processed).toBe(false);

    const stillPending = db.prepare("SELECT COUNT(*) AS n FROM linkedin_follows WHERE status = 'pending'").get().n;
    expect(stillPending).toBe(5);
  });
});

// ─── Worker: min delay ────────────────────────────────────────────────────────

describe('worker min delay', () => {
  test('MIN_DELAY_MS reflects LINKEDIN_FOLLOW_MIN_DELAY_SECONDS env var', () => {
    process.env.LINKEDIN_FOLLOW_MIN_DELAY_SECONDS = '45';
    jest.resetModules();
    const mod2 = require('../linkedin-follow');
    expect(mod2.MIN_DELAY_MS).toBe(45_000);
    delete process.env.LINKEDIN_FOLLOW_MIN_DELAY_SECONDS;
  });
});
