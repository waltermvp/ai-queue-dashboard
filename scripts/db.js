const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'queue-history.db');
const QUEUE_STATE_FILE = path.join(__dirname, '..', 'queue-state.json');
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
      error_class TEXT,
      retry_count INTEGER DEFAULT 0,
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
    CREATE TABLE IF NOT EXISTS queue_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_number INTEGER NOT NULL,
      repo TEXT,
      title TEXT NOT NULL,
      body TEXT,
      labels TEXT,
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'queued',
      added_at TEXT DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT,
      error TEXT,
      error_class TEXT,
      retry_count INTEGER DEFAULT 0,
      url TEXT
    );
  `);

  // Add composite unique index (repo, issue_number) — replaces old UNIQUE on issue_number alone
  try { d.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_repo_issue ON queue_items(repo, issue_number)'); } catch {}

  // Drop old unique index on issue_number alone if it exists (SQLite: recreate table or just ignore)
  // The CREATE TABLE no longer has UNIQUE on issue_number, so new DBs are fine.
  // Existing DBs: the composite index takes priority for INSERT OR IGNORE via the new index.

  // Add columns to queue_items if missing (for existing DBs)
  try { d.exec('ALTER TABLE queue_items ADD COLUMN pr_number INTEGER'); } catch {}
  try { d.exec('ALTER TABLE queue_items ADD COLUMN pr_url TEXT'); } catch {}

  // Add columns to runs if missing (for existing DBs)
  try { d.exec('ALTER TABLE runs ADD COLUMN error_class TEXT'); } catch {}
  try { d.exec('ALTER TABLE runs ADD COLUMN retry_count INTEGER DEFAULT 0'); } catch {}

  return d;
}

// ========== Queue Operations ==========

function enqueue({ issue_number, repo, title, body, labels, priority, url }) {
  const d = getDB();
  const stmt = d.prepare(`
    INSERT OR IGNORE INTO queue_items (issue_number, repo, title, body, labels, priority, url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    issue_number, repo || null, title,
    body || null, typeof labels === 'string' ? labels : JSON.stringify(labels || []),
    priority || 'medium', url || null
  );
  return result.changes > 0;
}

function dequeueNext() {
  const d = getDB();
  // BEGIN IMMEDIATE prevents race conditions
  return d.transaction(() => {
    const item = d.prepare(`
      SELECT * FROM queue_items WHERE status = 'queued'
      ORDER BY
        CASE priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC,
        added_at ASC
      LIMIT 1
    `).get();
    if (item) {
      d.prepare(`
        UPDATE queue_items SET status = 'processing', started_at = datetime('now')
        WHERE id = ?
      `).run(item.id);
      item.status = 'processing';
      item.started_at = new Date().toISOString();
    }
    return item || null;
  })();
}

function completeItem(issueNumber) {
  const d = getDB();
  d.prepare(`
    UPDATE queue_items SET status = 'completed', completed_at = datetime('now')
    WHERE issue_number = ?
  `).run(issueNumber);
}

function prOpenItem(issueNumber, { prUrl, prNumber } = {}) {
  const d = getDB();
  d.prepare(`
    UPDATE queue_items SET status = 'pr_open', completed_at = datetime('now'), pr_url = ?, pr_number = ?
    WHERE issue_number = ?
  `).run(prUrl || null, prNumber || null, issueNumber);
}

function mergeItem(issueNumber) {
  const d = getDB();
  d.prepare(`
    UPDATE queue_items SET status = 'merged', completed_at = datetime('now')
    WHERE issue_number = ?
  `).run(issueNumber);
}

function failItem(issueNumber, { error, errorClass } = {}) {
  const d = getDB();
  d.prepare(`
    UPDATE queue_items SET status = 'failed', completed_at = datetime('now'), error = ?, error_class = ?
    WHERE issue_number = ?
  `).run(error || null, errorClass || null, issueNumber);
}

function needsInputItem(issueNumber, { error, errorClass } = {}) {
  const d = getDB();
  d.prepare(`
    UPDATE queue_items SET status = 'needs-input', completed_at = datetime('now'), error = ?, error_class = ?
    WHERE issue_number = ?
  `).run(error || null, errorClass || null, issueNumber);
}

function requeueItem(issueNumber) {
  const d = getDB();
  d.prepare(`
    UPDATE queue_items SET status = 'queued', started_at = NULL, completed_at = NULL, error = NULL, error_class = NULL,
      retry_count = retry_count + 1
    WHERE issue_number = ?
  `).run(issueNumber);
}

function getRetryCount(issueNumber) {
  const d = getDB();
  const row = d.prepare('SELECT retry_count FROM queue_items WHERE issue_number = ?').get(issueNumber);
  return row ? row.retry_count : 0;
}

function getProcessingItem() {
  const d = getDB();
  return d.prepare("SELECT * FROM queue_items WHERE status = 'processing' LIMIT 1").get() || null;
}

function getQueuedItems() {
  const d = getDB();
  return d.prepare(`
    SELECT * FROM queue_items WHERE status = 'queued'
    ORDER BY CASE priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC, added_at ASC
  `).all();
}

function getItemsByStatus(status, limit = 50) {
  const d = getDB();
  return d.prepare(`SELECT * FROM queue_items WHERE status = ? ORDER BY completed_at DESC LIMIT ?`).all(status, limit);
}

function getItemByIssueNumber(issueNumber) {
  const d = getDB();
  return d.prepare('SELECT * FROM queue_items WHERE issue_number = ?').get(issueNumber) || null;
}

function removeItem(issueNumber) {
  const d = getDB();
  return d.prepare('DELETE FROM queue_items WHERE issue_number = ? AND status = ?').run(issueNumber, 'queued').changes > 0;
}

function clearQueue() {
  const d = getDB();
  return d.prepare("DELETE FROM queue_items WHERE status = 'queued'").run().changes;
}

function clearHistory() {
  const d = getDB();
  const completed = d.prepare("DELETE FROM queue_items WHERE status IN ('completed', 'failed', 'needs-input', 'merged')").run().changes;
  return completed;
}

function allIssueNumbers() {
  const d = getDB();
  return new Set(d.prepare('SELECT issue_number FROM queue_items').all().map(r => r.issue_number));
}

function parseLabels(labels) {
  if (!labels) return [];
  try { return JSON.parse(labels); } catch { return labels.split(',').map(s => s.trim()); }
}

// Generate queue-state.json cache from SQLite (keeps dashboard working)
function generateCacheFile() {
  const d = getDB();
  const processing = getProcessingItem();
  const queue = getQueuedItems();
  const completed = getItemsByStatus('completed', 50);
  const failed = getItemsByStatus('failed', 50);
  const prOpen = getItemsByStatus('pr_open', 50);
  const merged = getItemsByStatus('merged', 50);

  const toItem = (row) => ({
    issueNumber: row.issue_number,
    repo: row.repo || '',
    title: row.title,
    body: row.body || undefined,
    labels: parseLabels(row.labels),
    priority: row.priority || 'medium',
    addedAt: row.added_at,
    url: row.url || undefined,
  });

  const state = {
    current_issue: null,
    processing: processing ? { ...toItem(processing), started_at: processing.started_at } : null,
    queue: queue.map(toItem),
    completed: completed.map(r => ({
      ...toItem(r),
      completed_at: r.completed_at,
    })),
    failed: failed.map(r => ({
      ...toItem(r),
      error: r.error,
      error_class: r.error_class,
      failed_at: r.completed_at,
    })),
    pr_open: prOpen.map(r => ({
      ...toItem(r),
      completed_at: r.completed_at,
      pr_url: r.pr_url,
      pr_number: r.pr_number,
    })),
    merged: merged.map(r => ({
      ...toItem(r),
      completed_at: r.completed_at,
      pr_url: r.pr_url,
      pr_number: r.pr_number,
    })),
  };

  // Atomic write
  const tmpFile = QUEUE_STATE_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2));
  fs.renameSync(tmpFile, QUEUE_STATE_FILE);
  return state;
}

// Migrate existing queue-state.json into SQLite (run once on startup)
function migrateFromJSON() {
  if (!fs.existsSync(QUEUE_STATE_FILE)) return;
  const d = getDB();
  try {
    const data = JSON.parse(fs.readFileSync(QUEUE_STATE_FILE, 'utf8'));
    const existing = allIssueNumbers();

    // Migrate queued items
    for (const item of (data.queue || [])) {
      const num = item.issueNumber || item.issue_number;
      if (!num || existing.has(num)) continue;
      enqueue({
        issue_number: num, repo: item.repo, title: item.title || 'Unknown',
        body: item.body, labels: item.labels, priority: item.priority, url: item.url
      });
    }

    // Migrate processing item
    if (data.processing) {
      const num = data.processing.issueNumber || data.processing.issue_number;
      if (num && !existing.has(num)) {
        enqueue({
          issue_number: num, repo: data.processing.repo, title: data.processing.title || 'Unknown',
          body: data.processing.body, labels: data.processing.labels,
          priority: data.processing.priority, url: data.processing.url
        });
        // Mark as processing
        d.prepare("UPDATE queue_items SET status = 'processing', started_at = ? WHERE issue_number = ?")
          .run(data.processing.started_at || new Date().toISOString(), num);
      }
    }

    // Migrate completed
    for (const item of (data.completed || [])) {
      const num = item.issueNumber || item.issue_number;
      if (!num || existing.has(num)) continue;
      enqueue({
        issue_number: num, repo: item.repo, title: item.title || 'Unknown',
        body: item.body, labels: item.labels, priority: item.priority, url: item.url
      });
      d.prepare("UPDATE queue_items SET status = 'completed', completed_at = ? WHERE issue_number = ?")
        .run(item.completed_at || new Date().toISOString(), num);
    }

    // Migrate failed
    for (const item of (data.failed || [])) {
      const num = item.issueNumber || item.issue_number;
      if (!num || existing.has(num)) continue;
      enqueue({
        issue_number: num, repo: item.repo, title: item.title || 'Unknown',
        body: item.body, labels: item.labels, priority: item.priority, url: item.url
      });
      d.prepare("UPDATE queue_items SET status = 'failed', error = ?, completed_at = ? WHERE issue_number = ?")
        .run(item.error || null, item.failed_at || new Date().toISOString(), num);
    }
  } catch (e) {
    console.warn('⚠️ Migration from JSON failed:', e.message);
  }
}

// ========== Runs (historical) ==========

function recordRun({ issue_id, title, repo, type, labels, priority, status, started_at, github_url }) {
  const d = getDB();
  const stmt = d.prepare(`
    INSERT INTO runs (issue_id, title, repo, type, labels, priority, status, started_at, github_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(issue_id, title, repo || null, type || 'implement', labels || null, priority || 'medium', status || 'queued', started_at || null, github_url || null);
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

function failRun(id, { error, error_class }) {
  const d = getDB();
  d.prepare(`UPDATE runs SET status = 'failed', error = ?, error_class = ?, completed_at = datetime('now') WHERE id = ?`)
    .run(error || null, error_class || null, id);
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

module.exports = {
  initDB, getDB,
  // Queue operations
  enqueue, dequeueNext, completeItem, prOpenItem, mergeItem, failItem, needsInputItem, requeueItem,
  getRetryCount, getProcessingItem, getQueuedItems, getItemsByStatus,
  getItemByIssueNumber, removeItem, clearQueue, clearHistory, allIssueNumbers,
  generateCacheFile, migrateFromJSON, parseLabels,
  // Run operations
  recordRun, updateRun, completeRun, failRun,
  addArtifact, getRunHistory, getRunById, getArtifactsByRun, getStats
};
