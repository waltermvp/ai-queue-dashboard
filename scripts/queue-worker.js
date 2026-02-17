#!/usr/bin/env node

// AI Queue Worker for Ollama Integration
// SQLite as single source of truth, config-driven routing

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { spawn } = require('child_process');
const db = require('./db');

const PIPELINES_DIR = path.join(__dirname, 'pipelines');
const PROMPTS_DIR = path.join(__dirname, '..', 'prompts');
const ARTIFACTS_DIR = path.join(__dirname, '..', 'artifacts');
const LOCK_FILE = path.join(__dirname, '..', 'queue-worker.lock');
const PID_FILE = path.join(__dirname, '..', 'pipeline.pid');
const LOG_FILE = path.join(__dirname, '..', 'queue-worker.log');
const CONFIG_FILE = path.join(__dirname, '..', 'routing.config.json');

// Error class mapping from pipeline exit codes
const ERROR_CLASSES = { 1: 'build', 2: 'test', 3: 'infra', 4: 'agent' };

// Load routing config
let config;
function loadConfig() {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {
    console.warn('⚠️ Could not load routing.config.json, using defaults');
    config = {
      defaults: { pipeline: 'implement', model: 'qwen2.5-coder:32b', ollamaUrl: 'http://localhost:11434/api/generate', maxRuntimeSeconds: 1800 },
      pipelines: {
        implement: { script: 'scripts/pipelines/implement.sh', prompt: 'prompts/implement.md', model: 'qwen2.5-coder:32b' },
        test: { script: 'scripts/pipelines/test.sh', prompt: 'prompts/test.md', model: 'codestral:22b' },
        generate: { script: 'scripts/pipelines/generate.sh', prompt: 'prompts/generate.md', model: 'llama3.1:70b' }
      },
      routing: { 'e2e': 'test', 'content': 'generate', 'coding': 'implement', '*': 'implement' }
    };
  }
}

// Lock file for concurrency control
function acquireLock() {
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10);
      if (!isNaN(pid)) {
        process.kill(pid, 0);
        return false;
      }
    } catch {}
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid));
  return true;
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10);
      if (pid === process.pid) fs.unlinkSync(LOCK_FILE);
    }
  } catch {}
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// Detect issue type from labels using routing config
function detectIssueType(item) {
  const labels = db.parseLabels(item.labels).map(l => (typeof l === 'string' ? l : l.name || '').toLowerCase());
  for (const label of labels) {
    if (config.routing[label]) return config.routing[label];
  }
  return config.routing['*'] || config.defaults.pipeline;
}

// Load prompt file for a given issue type
function loadPrompt(type) {
  const pipelineCfg = config.pipelines[type];
  const promptPath = pipelineCfg
    ? path.join(__dirname, '..', pipelineCfg.prompt)
    : path.join(PROMPTS_DIR, `${type}.md`);
  if (!fs.existsSync(promptPath)) {
    console.warn(`⚠️ Prompt file not found: ${promptPath}, falling back to implement`);
    return fs.readFileSync(path.join(PROMPTS_DIR, 'implement.md'), 'utf8');
  }
  return fs.readFileSync(promptPath, 'utf8');
}

// Load coding standards
function loadCodingStandards() {
  const stdPath = path.join(PROMPTS_DIR, 'react-native-coding-standards.md');
  if (fs.existsSync(stdPath)) return '\n\n' + fs.readFileSync(stdPath, 'utf8');
  return '';
}

// Collect artifacts for an issue
function collectArtifacts(issueId) {
  const artifactDir = path.join(ARTIFACTS_DIR, String(issueId));
  if (!fs.existsSync(artifactDir)) return null;
  const files = fs.readdirSync(artifactDir);
  const recordings = files.filter(f => f.endsWith('.mp4'));
  const logs = files.filter(f => f.endsWith('.log') || f.endsWith('.json') || f.endsWith('.md') || f.endsWith('.txt') || f.endsWith('.patch'));
  if (recordings.length === 0 && logs.length === 0) return null;
  return { dir: `artifacts/${issueId}`, recordings, logs };
}

// Process single item with Ollama
async function processWithOllama(item, issueType) {
  const pipelineCfg = config.pipelines[issueType] || {};
  const model = pipelineCfg.model || config.defaults.model;
  const ollamaUrl = config.defaults.ollamaUrl;

  log(`🤖 Processing [${issueType}]: ${item.title}`);

  let systemPrompt = loadPrompt(issueType);
  if (issueType === 'implement' || issueType === 'test' || issueType === 'coding' || issueType === 'e2e') {
    systemPrompt += loadCodingStandards();
  }

  const labels = db.parseLabels(item.labels);
  const prompt = `${systemPrompt}

---

## Issue Context

Task: ${item.title}
ID: ${item.issue_number}
Priority: ${item.priority}
Description: ${item.body || 'No description provided'}
Repository: ${item.repo || 'epiphanyapps/MapYourHealth'}
Labels: ${labels.join(', ') || 'none'}`;

  // Save prompt to artifacts (audit trail)
  const artifactsDir = path.join(ARTIFACTS_DIR, String(item.issue_number));
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(path.join(artifactsDir, 'prompt-sent.md'), prompt);

  try {
    const response = await axios.post(ollamaUrl, {
      model: model,
      prompt: prompt,
      stream: false
    });

    // Save run metadata (audit trail)
    fs.writeFileSync(path.join(artifactsDir, 'run-metadata.json'), JSON.stringify({
      model, issueType, startedAt: new Date().toISOString(),
      config: pipelineCfg, ollamaUrl
    }, null, 2));

    return { success: true, solution: response.data.response, model, processed_at: new Date().toISOString() };
  } catch (error) {
    console.error('❌ Ollama processing error:', error.message);
    return { success: false, error: error.message, model, processed_at: new Date().toISOString() };
  }
}

// Execute type-specific pipeline
async function executePipeline(type, issueId, solutionText, item) {
  const pipelineCfg = config.pipelines[type] || {};
  const pipelineScript = pipelineCfg.script
    ? path.join(__dirname, '..', pipelineCfg.script)
    : path.join(PIPELINES_DIR, `${type}.sh`);

  if (!fs.existsSync(pipelineScript)) {
    log(`⚠️ No pipeline script found for type: ${type}`);
    return { executed: false, reason: 'no_pipeline_script' };
  }

  log(`🔧 Executing ${type} pipeline for issue #${issueId}...`);

  const artifactsDir = path.join(__dirname, '..', 'artifacts', String(issueId));
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
  const solutionFile = path.join(artifactsDir, 'ai-solution.md');
  fs.writeFileSync(solutionFile, solutionText);

  // For test (e2e) issues, extract YAML flow blocks
  let flowsDir = null;
  if ((type === 'test' || type === 'e2e') && solutionText) {
    flowsDir = path.join(artifactsDir, 'flows');
    fs.mkdirSync(flowsDir, { recursive: true });
    const yamlBlockRegex = /```ya?ml\s*\n([\s\S]*?)```/gi;
    let match, flowIndex = 0;
    while ((match = yamlBlockRegex.exec(solutionText)) !== null) {
      const yamlContent = match[1].trim();
      if (yamlContent.includes('appId') || yamlContent.includes('launchApp') ||
          yamlContent.includes('tapOn') || yamlContent.includes('assertVisible') ||
          yamlContent.includes('scrollUntilVisible') || yamlContent.includes('takeScreenshot')) {
        flowIndex++;
        fs.writeFileSync(path.join(flowsDir, `ai-flow-${flowIndex}.yaml`), yamlContent);
        log(`📝 Extracted AI flow ${flowIndex}: ai-flow-${flowIndex}.yaml`);
      }
    }
    if (flowIndex === 0) { log(`ℹ️ No Maestro flows found, will use default`); flowsDir = null; }
    else { log(`📋 Extracted ${flowIndex} Maestro flow(s)`); }
  }

  return new Promise((resolve) => {
    const args = [String(issueId)];
    if (type === 'implement' || type === 'generate' || type === 'coding' || type === 'content') args.push(solutionFile);
    else if ((type === 'test' || type === 'e2e') && flowsDir) args.push(flowsDir);

    const timeout = (pipelineCfg.maxRuntimeSeconds || config.defaults.maxRuntimeSeconds || 1800);
    // Parse repo into owner/name for env vars
    const repoFull = item ? (item.repo || 'epiphanyapps/MapYourHealth') : 'epiphanyapps/MapYourHealth';
    const [repoOwner, repoName] = repoFull.includes('/') ? repoFull.split('/') : ['epiphanyapps', repoFull || 'MapYourHealth'];
    const worktreeBase = (config.defaults.worktreeBase || '~/Documents/worktrees').replace('~', process.env.HOME);
    const dashboardDir = path.join(__dirname, '..');

    const proc = spawn('bash', [pipelineScript, ...args], {
      env: {
        ...process.env,
        PATH: process.env.PATH + ':' + process.env.HOME + '/.maestro/bin:' + process.env.HOME + '/.local/bin',
        MINI_MODEL: pipelineCfg.model ? `ollama/${pipelineCfg.model}` : undefined,
        CODING_TIMEOUT: String(timeout),
        DASHBOARD_DIR: dashboardDir,
        REPO_OWNER: repoOwner,
        REPO_NAME: repoName,
        REPO_FULL: repoFull,
        REPO_ROOT: path.join(worktreeBase, repoOwner, repoName),
        WORKTREE_DIR: path.join(worktreeBase, repoOwner, repoName, `issue-${issueId}`),
        ARTIFACTS_DIR: path.join(dashboardDir, 'artifacts', repoOwner, repoName, String(issueId)),
        ISSUE_TYPE: type,
        MAIN_CLONE_DIR: process.env.HOME + '/Documents/' + repoName,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,  // Create process group for clean cancel
    });

    // Save child PID so cancel command can kill it
    fs.writeFileSync(PID_FILE, String(proc.pid));

    let stdout = '', stderr = '';
    proc.stdout.on('data', (data) => { const line = data.toString(); stdout += line; log(`[pipeline] ${line.trim()}`); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      try { fs.unlinkSync(PID_FILE); } catch {}
      if (code === 0) {
        log(`✅ Pipeline ${type} completed successfully for issue #${issueId}`);
        resolve({ executed: true, success: true, exitCode: 0, stdout, stderr });
      } else {
        log(`❌ Pipeline ${type} failed for issue #${issueId} (exit code: ${code})`);
        resolve({ executed: true, success: false, exitCode: code, stdout, stderr });
      }
    });

    proc.on('error', (err) => {
      log(`❌ Pipeline ${type} error: ${err.message}`);
      resolve({ executed: true, success: false, exitCode: 3, error: err.message });
    });
  });
}

// Process next item in queue
async function processNext() {
  if (!acquireLock()) {
    log('🔒 Another worker is already running (lock held). Skipping.');
    return;
  }
  try { await _processNext(); } finally { releaseLock(); }
}

async function _processNext() {
  // Check for stale processing items
  const staleItem = db.getProcessingItem();
  if (staleItem) {
    const startedMs = new Date(staleItem.started_at).getTime();
    const staleMinutes = Math.round((Date.now() - startedMs) / 60000);
    if (staleMinutes >= 30) {
      log(`⚠️ Recovering stale processing item #${staleItem.issue_number} (started ${staleMinutes} min ago)`);
      db.failItem(staleItem.issue_number, { error: `Worker timeout/crash recovery (stale for ${staleMinutes} min)`, errorClass: 'infra' });
      // Record in runs table too
      try {
        const runId = db.recordRun({
          issue_id: staleItem.issue_number, title: staleItem.title, repo: staleItem.repo,
          type: detectIssueType(staleItem), labels: staleItem.labels,
          priority: staleItem.priority, status: 'failed', started_at: staleItem.started_at
        });
        if (runId) db.failRun(runId, { error: 'Worker timeout/crash recovery', error_class: 'infra' });
      } catch (e) { log(`⚠️ DB stale recovery record failed: ${e.message}`); }
      db.generateCacheFile();
    } else {
      log('⏳ Already processing an item');
      return;
    }
  }

  // Dequeue next item
  const item = db.dequeueNext();
  if (!item) {
    log('📭 Queue is empty');
    return;
  }

  db.generateCacheFile();

  const issueType = detectIssueType(item);
  const pipelineCfg = config.pipelines[issueType] || {};
  const model = pipelineCfg.model || config.defaults.model;
  const startedAt = new Date().toISOString();

  // Record in runs table
  let runId;
  try {
    runId = db.recordRun({
      issue_id: item.issue_number, title: item.title, repo: item.repo,
      type: issueType, labels: item.labels, priority: item.priority,
      status: 'processing', started_at: startedAt, github_url: item.url
    });
  } catch (e) { log(`⚠️ DB recordRun failed: ${e.message}`); }

  log(`▶️  Started processing: ${item.title}`);

  // Process with Ollama
  const result = await processWithOllama(item, issueType);
  const processingTimeMs = Date.now() - new Date(startedAt).getTime();

  if (result.success) {
    // Execute pipeline
    const pipelineResult = await executePipeline(issueType, item.issue_number, result.solution, item);

    if (pipelineResult.executed && !pipelineResult.success) {
      const exitCode = pipelineResult.exitCode || 1;
      const errorClass = ERROR_CLASSES[exitCode] || 'unknown';
      const errorMsg = `Pipeline failed (exit code: ${exitCode}, class: ${errorClass}). Check artifacts/${item.issue_number}/pipeline.log`;

      log(`❌ Pipeline failed: ${errorClass} (exit ${exitCode})`);

      // Auto-retry once for infra failures
      if (errorClass === 'infra' && db.getRetryCount(item.issue_number) < 1) {
        log(`🔄 Auto-retrying infra failure for #${item.issue_number}`);
        db.requeueItem(item.issue_number);
        if (runId) { try { db.failRun(runId, { error: errorMsg + ' [auto-retrying]', error_class: errorClass }); } catch (e) {} }
      } else {
        db.failItem(item.issue_number, { error: errorMsg, errorClass });
        if (runId) { try { db.failRun(runId, { error: errorMsg, error_class: errorClass }); } catch (e) {} }
      }
    } else {
      // Success — check if implement type to set pr_open
      if (issueType === 'implement' || issueType === 'coding') {
        // Parse PR URL from pipeline stdout
        const prUrlMatch = (pipelineResult.stdout || '').match(/https:\/\/github\.com\/[^\s]+\/pull\/(\d+)/);
        if (prUrlMatch) {
          const prUrl = prUrlMatch[0];
          const prNumber = parseInt(prUrlMatch[1], 10);
          db.prOpenItem(item.issue_number, { prUrl, prNumber });
          log(`🔀 PR Open: ${item.title} → ${prUrl}`);
          if (runId) {
            try { db.updateRun(runId, { status: 'pr_open', pr_url: prUrl }); } catch (e) {}
            try { db.completeRun(runId, { solution: result.solution, model: result.model, processing_time_ms: processingTimeMs }); } catch (e) {}
          }
        } else {
          // No PR URL found — fall back to completed
          db.completeItem(item.issue_number);
          log(`✅ Completed (no PR detected): ${item.title}`);
          if (runId) {
            try { db.completeRun(runId, { solution: result.solution, model: result.model, processing_time_ms: processingTimeMs }); } catch (e) {}
          }
        }
      } else {
        // test/generate types → completed
        db.completeItem(item.issue_number);
        log(`✅ Completed: ${item.title}`);
        if (runId) {
          try { db.completeRun(runId, { solution: result.solution, model: result.model, processing_time_ms: processingTimeMs }); } catch (e) {}
        }
      }
    }

    // Collect and record artifacts
    if (runId) {
      const artifacts = collectArtifacts(String(item.issue_number));
      if (artifacts) {
        log(`📹 Artifacts: ${artifacts.recordings.length} recordings, ${artifacts.logs.length} logs`);
        const artifactDir = path.join(ARTIFACTS_DIR, String(item.issue_number));
        [...artifacts.recordings, ...artifacts.logs].forEach(filename => {
          try {
            const filePath = path.join(artifactDir, filename);
            const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
            db.addArtifact(runId, { filename, type: filename.endsWith('.mp4') ? 'recording' : 'log', path: filePath, size_bytes: stats ? stats.size : null });
          } catch (e) {}
        });
      }
    }
  } else {
    // Ollama call itself failed — infra failure
    db.failItem(item.issue_number, { error: result.error, errorClass: 'infra' });
    log(`❌ Failed: ${item.title} - ${result.error}`);
    if (runId) { try { db.failRun(runId, { error: result.error, error_class: 'infra' }); } catch (e) {} }
  }

  db.generateCacheFile();
}

// Load open issues from GitHub and enqueue
function loadFromGitHub() {
  const { execSync } = require('child_process');
  const REPO = 'epiphanyapps/MapYourHealth';

  let issues;
  try {
    const raw = execSync(
      `gh issue list --repo ${REPO} --state open --json number,title,body,labels,createdAt --limit 50`,
      { encoding: 'utf8' }
    );
    issues = JSON.parse(raw);
  } catch (err) {
    log(`❌ Failed to fetch issues from GitHub: ${err.message}`);
    return;
  }

  const existing = db.allIssueNumbers();
  let added = 0;

  for (const issue of issues) {
    if (existing.has(issue.number)) continue;
    const labelNames = (issue.labels || []).map(l => typeof l === 'string' ? l : l.name || '');
    db.enqueue({
      issue_number: issue.number,
      repo: REPO,
      title: issue.title,
      body: issue.body || '',
      labels: labelNames,
      priority: 'medium',
      url: `https://github.com/${REPO}/issues/${issue.number}`
    });
    added++;
  }

  db.generateCacheFile();
  log(`📥 Loaded ${added} new issue(s) from GitHub (${issues.length} total open, ${existing.size} already tracked)`);
}

// Check open PRs for merge status
async function checkPRs() {
  const { execSync } = require('child_process');
  const openPRs = db.getItemsByStatus('pr_open');
  if (openPRs.length === 0) return;
  log(`🔍 Checking ${openPRs.length} open PR(s) for merge status...`);
  for (const item of openPRs) {
    if (!item.pr_number || !item.repo) continue;
    try {
      const state = execSync(
        `gh pr view ${item.pr_number} --repo ${item.repo} --json state -q .state`,
        { encoding: 'utf8', timeout: 15000 }
      ).trim();
      if (state === 'MERGED') {
        db.mergeItem(item.issue_number);
        log(`🎉 PR #${item.pr_number} merged → issue #${item.issue_number} marked as merged`);
      } else if (state === 'CLOSED') {
        db.failItem(item.issue_number, { error: 'PR was closed without merging', errorClass: 'review' });
        log(`❌ PR #${item.pr_number} closed → issue #${item.issue_number} marked as failed`);
      }
    } catch (e) {
      log(`⚠️ Failed to check PR #${item.pr_number}: ${e.message}`);
    }
  }
  db.generateCacheFile();
}

// Watch mode
async function watch(intervalMs = 30000) {
  log(`👀 Watching queue (checking every ${intervalMs / 1000}s)...`);
  log('   Press Ctrl+C to stop\n');

  let tickCount = 0;
  const tick = async () => {
    tickCount++;
    // Every 10 ticks (~5 min at 30s interval), check PR merge status
    if (tickCount % 10 === 0) {
      try { await checkPRs(); } catch (e) { log(`⚠️ PR check error: ${e.message}`); }
    }
    const queued = db.getQueuedItems();
    const processing = db.getProcessingItem();
    if (queued.length > 0 && !processing) {
      log(`\n📥 Found ${queued.length} item(s) in queue. Processing...`);
      await processNext();
      const remaining = db.getQueuedItems();
      if (remaining.length > 0 && !db.getProcessingItem()) {
        setImmediate(tick);
        return;
      }
    }
  };

  await tick();
  setInterval(tick, intervalMs);
}

// Main command handler
async function main() {
  const action = process.argv[2];

  // Initialize
  try { db.initDB(); } catch (e) { console.warn('⚠️ DB init failed:', e.message); }
  loadConfig();

  // Migrate existing JSON data on first run
  try { db.migrateFromJSON(); } catch (e) { console.warn('⚠️ Migration failed:', e.message); }

  try {
    switch (action) {
      case 'process':
        await processNext();
        break;
      case 'watch':
        const interval = parseInt(process.argv[3]) || 30000;
        await watch(interval);
        break;
      case 'add-demo':
      case 'load-github':
        loadFromGitHub();
        break;
      case 'cleanup':
        const cleared = db.clearHistory();
        db.generateCacheFile();
        log(`🧹 Cleared ${cleared} completed/failed items`);
        break;
      case 'remove': {
        const issueNum = parseInt(process.argv[3]);
        if (!issueNum) { log('❌ Usage: node queue-worker.js remove <issueNumber>'); process.exit(1); }
        const processing = db.getProcessingItem();
        if (processing && processing.issue_number === issueNum) {
          log(`❌ Cannot remove issue #${issueNum} — currently processing`);
          process.exit(1);
        }
        if (db.removeItem(issueNum)) {
          db.generateCacheFile();
          log(`🗑️ Removed issue #${issueNum} from queue`);
        } else {
          log(`⚠️ Issue #${issueNum} not found in queue`);
        }
        break;
      }
      case 'clear-all': {
        const count = db.clearQueue();
        db.generateCacheFile();
        log(`🗑️ Cleared ${count} item(s) from queue`);
        break;
      }
      case 'clear-history': {
        const count = db.clearHistory();
        db.generateCacheFile();
        log(`🗑️ Cleared ${count} history items`);
        break;
      }
      case 'retry': {
        const retryNum = parseInt(process.argv[3]);
        if (!retryNum) { log('❌ Usage: node queue-worker.js retry <issueNumber>'); process.exit(1); }
        const item = db.getItemByIssueNumber(retryNum);
        if (!item || (item.status !== 'failed' && item.status !== 'needs-input')) {
          log(`⚠️ Issue #${retryNum} not found in failed/needs-input list`);
          process.exit(1);
        }
        db.requeueItem(retryNum);
        db.generateCacheFile();
        log(`🔄 Moved issue #${retryNum} back to queue`);
        break;
      }
      case 'check-prs':
        await checkPRs();
        break;
      case 'status': {
        const queued = db.getQueuedItems();
        const processing = db.getProcessingItem();
        const completed = db.getItemsByStatus('completed');
        const failed = db.getItemsByStatus('failed');
        const prOpen = db.getItemsByStatus('pr_open');
        const merged = db.getItemsByStatus('merged');
        log('📊 Queue Status:');
        log(`  Queued: ${queued.length}`);
        log(`  Processing: ${processing ? 1 : 0}`);
        log(`  PR Open: ${prOpen.length}`);
        log(`  Merged: ${merged.length}`);
        log(`  Completed: ${completed.length}`);
        log(`  Failed: ${failed.length}`);
        break;
      }
      case 'cancel': {
        const processing = db.getProcessingItem();
        if (!processing) { log('⚠️ Nothing is currently processing'); process.exit(0); }
        // Kill the pipeline child process
        let killed = false;
        try {
          const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
          if (!isNaN(pid)) {
            // Kill the process group (negative PID) to get all children
            try { process.kill(-pid, 'SIGTERM'); } catch { process.kill(pid, 'SIGTERM'); }
            killed = true;
            try { fs.unlinkSync(PID_FILE); } catch {}
          }
        } catch {}
        // Move processing item to failed
        db.failItem(processing.issue_number, { error: 'Cancelled by user' });
        db.generateCacheFile();
        releaseLock();
        log(`🛑 Cancelled issue #${processing.issue_number}: ${processing.title}${killed ? ' (process killed)' : ''}`);
        break;
      }
      case 'add-issue': {
        const issueNum = parseInt(process.argv[3]);
        if (!issueNum) { log('❌ Usage: node queue-worker.js add-issue <issueNumber> [repo]'); process.exit(1); }
        const existing = db.allIssueNumbers();
        if (existing.has(issueNum)) { log(`⚠️ Issue #${issueNum} is already tracked`); process.exit(0); }
        const { execSync: execS } = require('child_process');
        const REPO = process.argv[4] || 'epiphanyapps/MapYourHealth';
        try {
          const raw = execS(`gh issue view ${issueNum} --repo ${REPO} --json number,title,body,labels,createdAt`, { encoding: 'utf8' });
          const issue = JSON.parse(raw);
          const labelNames = (issue.labels || []).map(l => typeof l === 'string' ? l : l.name || '');
          db.enqueue({
            issue_number: issue.number,
            repo: REPO,
            title: issue.title,
            body: issue.body || '',
            labels: labelNames,
            priority: 'medium',
            url: `https://github.com/${REPO}/issues/${issue.number}`
          });
          db.generateCacheFile();
          log(`✅ Added issue #${issueNum} to queue: ${issue.title}`);
        } catch (err) {
          log(`❌ Failed to fetch issue #${issueNum}: ${err.message}`);
          process.exit(1);
        }
        break;
      }
      default:
        log('Usage: node queue-worker.js <action>');
        log('Actions: process | watch [intervalMs] | load-github | add-issue <num> | add-demo | cleanup | status | check-prs | remove <issueNumber> | retry <issueNumber> | clear-all | clear-history');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
