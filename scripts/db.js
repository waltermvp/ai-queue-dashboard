const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'queue-history.db');
let db;

function getDB() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

function initDB() {
  const d = getDB();
  d.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id TEXT NOT NULL,
      title TEXT NOT NULL,
      repo TEXT,
      type TEXT DEFAULT 'coding',
      labels TEXT,
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'queued',
      started_at TEXT,
      completed_at TEXT,
      processing_time_ms INTEGER,
      model TEXT,
      solution TEXT,
      error TEXT,
      artifacts_path TEXT,
      github_url TEXT,
      pr_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      type TEXT DEFAULT 'log',
      path TEXT NOT NULL,
      size_bytes INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (run_id) REFERENCES runs(id)
    );
  `);
  return d;
}

function recordRun({ issue_id, title, repo, type, labels, priority, status, started_at, github_url }) {
  const d = getDB();
  const stmt = d.prepare(`
    INSERT INTO runs (issue_id, title, repo, type, labels, priority, status, started_at, github_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(issue_id, title, repo || null, type || 'coding', labels || null, priority || 'medium', status || 'queued', started_at || null, github_url || null);
  return result.lastInsertRowid;
}

function updateRun(id, data) {
  const d = getDB();
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const values = Object.values(data);
  d.prepare(`UPDATE runs SET ${fields} WHERE id = ?`).run(...values, id);
}

function completeRun(id, { solution, model, processing_time_ms }) {
  const d = getDB();
  d.prepare(`UPDATE runs SET status = 'completed', solution = ?, model = ?, processing_time_ms = ?, completed_at = datetime('now') WHERE id = ?`)
    .run(solution || null, model || null, processing_time_ms || null, id);
}

function failRun(id, { error }) {
  const d = getDB();
  d.prepare(`UPDATE runs SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?`)
    .run(error || null, id);
}

function addArtifact(runId, { filename, type, path: filePath, size_bytes }) {
  const d = getDB();
  d.prepare(`INSERT INTO artifacts (run_id, filename, type, path, size_bytes) VALUES (?, ?, ?, ?, ?)`)
    .run(runId, filename, type || 'log', filePath, size_bytes || null);
}

function getRunHistory({ limit = 50, offset = 0, type, status } = {}) {
  const d = getDB();
  let sql = 'SELECT * FROM runs WHERE 1=1';
  const params = [];
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return d.prepare(sql).all(...params);
}

function getRunById(id) {
  const d = getDB();
  const run = d.prepare('SELECT * FROM runs WHERE id = ?').get(id);
  if (run) run.artifacts = d.prepare('SELECT * FROM artifacts WHERE run_id = ?').all(id);
  return run;
}

function getArtifactsByRun(runId) {
  return getDB().prepare('SELECT * FROM artifacts WHERE run_id = ?').all(runId);
}

function getStats() {
  const d = getDB();
  const total = d.prepare('SELECT COUNT(*) as count FROM runs').get();
  const completed = d.prepare("SELECT COUNT(*) as count FROM runs WHERE status = 'completed'").get();
  const failed = d.prepare("SELECT COUNT(*) as count FROM runs WHERE status = 'failed'").get();
  const avg = d.prepare("SELECT AVG(processing_time_ms) as avg FROM runs WHERE status = 'completed' AND processing_time_ms IS NOT NULL").get();
  const byType = d.prepare("SELECT type, COUNT(*) as count FROM runs GROUP BY type").all();
  return {
    totalRuns: total.count,
    completed: completed.count,
    failed: failed.count,
    avgProcessingTime: Math.round(avg.avg || 0),
    byType: byType.reduce((acc, r) => { acc[r.type] = r.count; return acc; }, {})
  };
}

module.exports = { initDB, recordRun, updateRun, completeRun, failRun, addArtifact, getRunHistory, getRunById, getArtifactsByRun, getStats };
