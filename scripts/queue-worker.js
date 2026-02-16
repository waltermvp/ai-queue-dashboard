#!/usr/bin/env node

// AI Queue Worker for Ollama Integration
// Processes queue items using local Llama model

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { spawn } = require('child_process');
const db = require('./db');

const PIPELINES_DIR = path.join(__dirname, 'pipelines');

const QUEUE_STATE_FILE = path.join(__dirname, '..', 'queue-state.json');
const PROMPTS_DIR = path.join(__dirname, '..', 'prompts');
const ARTIFACTS_DIR = path.join(__dirname, '..', 'artifacts');
const OLLAMA_URL = 'http://localhost:11434/api/generate';
const LOG_FILE = path.join(__dirname, '..', 'queue-worker.log');

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

// Collect artifacts for an issue
function collectArtifacts(issueId) {
    const artifactDir = path.join(ARTIFACTS_DIR, issueId);
    if (!fs.existsSync(artifactDir)) return null;

    const files = fs.readdirSync(artifactDir);
    const recordings = files.filter(f => f.endsWith('.mp4'));
    const logs = files.filter(f => f.endsWith('.log'));

    if (recordings.length === 0 && logs.length === 0) return null;

    return {
        dir: `artifacts/${issueId}`,
        recordings,
        logs
    };
}

// Detect issue type from labels
function detectIssueType(item) {
    const labels = (item.labels || []).map(l => (typeof l === 'string' ? l : l.name || '').toLowerCase());
    if (labels.includes('e2e')) return 'e2e';
    if (labels.includes('content')) return 'content';
    return 'coding';
}

// Load prompt file for a given issue type
function loadPrompt(type) {
    const promptPath = path.join(PROMPTS_DIR, `${type}.md`);
    if (!fs.existsSync(promptPath)) {
        console.warn(`⚠️  Prompt file not found: ${promptPath}, falling back to coding`);
        return fs.readFileSync(path.join(PROMPTS_DIR, 'coding.md'), 'utf8');
    }
    return fs.readFileSync(promptPath, 'utf8');
}

// Load coding standards (used for coding and e2e types)
function loadCodingStandards() {
    const stdPath = path.join(PROMPTS_DIR, 'react-native-coding-standards.md');
    if (fs.existsSync(stdPath)) {
        return '\n\n' + fs.readFileSync(stdPath, 'utf8');
    }
    return '';
}

// Initialize queue state if it doesn't exist
function initializeQueueState() {
    const defaultState = {
        queue: [
            { id: 'demo-1', title: 'Sample Task 1', priority: 'high', created_at: new Date().toISOString() },
            { id: 'demo-2', title: 'Sample Task 2', priority: 'medium', created_at: new Date().toISOString() },
            { id: 'demo-3', title: 'Sample Task 3', priority: 'low', created_at: new Date().toISOString() }
        ],
        processing: null,
        completed: [],
        failed: []
    };
    
    if (!fs.existsSync(QUEUE_STATE_FILE)) {
        fs.writeFileSync(QUEUE_STATE_FILE, JSON.stringify(defaultState, null, 2));
        log('✅ Initialized queue state with sample data');
    }
}

// Load queue state
function loadQueueState() {
    if (!fs.existsSync(QUEUE_STATE_FILE)) {
        initializeQueueState();
    }
    return JSON.parse(fs.readFileSync(QUEUE_STATE_FILE, 'utf8'));
}

// Save queue state (atomic write via temp file + rename)
function saveQueueState(state) {
    const tmpFile = QUEUE_STATE_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2));
    fs.renameSync(tmpFile, QUEUE_STATE_FILE);
}

// Process single item with Ollama
async function processWithOllama(item) {
    const issueType = detectIssueType(item);
    log(`🤖 Processing [${issueType}]: ${item.title}`);
    
    // Load the type-specific prompt
    let systemPrompt = loadPrompt(issueType);
    
    // Append coding standards for coding and e2e types
    if (issueType === 'coding' || issueType === 'e2e') {
        systemPrompt += loadCodingStandards();
    }

    const prompt = `${systemPrompt}

---

## Issue Context

Task: ${item.title}
ID: ${item.issueNumber}
Priority: ${item.priority}
Description: ${item.body || item.description || 'No description provided'}
Repository: MapYourHealth (React Native + Expo)
Labels: ${(item.labels || []).join(', ') || 'none'}`;

    try {
        const response = await axios.post(OLLAMA_URL, {
            model: 'qwen2.5-coder:32b',
            prompt: prompt,
            stream: false
        });

        return {
            success: true,
            solution: response.data.response,
            model: 'qwen2.5-coder:32b',
            processed_at: new Date().toISOString()
        };
    } catch (error) {
        console.error('❌ Ollama processing error:', error.message);
        return {
            success: false,
            error: error.message,
            processed_at: new Date().toISOString()
        };
    }
}

// Execute type-specific pipeline after Qwen analysis
async function executePipeline(type, issueId, solutionText) {
  const pipelineScript = path.join(PIPELINES_DIR, `${type}.sh`);
  
  if (!fs.existsSync(pipelineScript)) {
    log(`⚠️ No pipeline script found for type: ${type}`);
    return { executed: false, reason: 'no_pipeline_script' };
  }

  log(`🔧 Executing ${type} pipeline for issue #${issueId}...`);
  
  const artifactsDir = path.join(__dirname, '..', 'artifacts', String(issueId));
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }
  const solutionFile = path.join(artifactsDir, 'qwen-solution.md');
  fs.writeFileSync(solutionFile, solutionText);
  
  // For e2e issues, extract YAML flow blocks from Qwen's solution
  let flowsDir = null;
  if (type === 'e2e' && solutionText) {
    flowsDir = path.join(artifactsDir, 'flows');
    fs.mkdirSync(flowsDir, { recursive: true });
    
    // Extract YAML blocks from markdown code fences
    const yamlBlockRegex = /```ya?ml\s*\n([\s\S]*?)```/gi;
    let match;
    let flowIndex = 0;
    while ((match = yamlBlockRegex.exec(solutionText)) !== null) {
      const yamlContent = match[1].trim();
      // Only save blocks that look like Maestro flows (contain appId or maestro commands)
      if (yamlContent.includes('appId') || yamlContent.includes('launchApp') || 
          yamlContent.includes('tapOn') || yamlContent.includes('assertVisible') ||
          yamlContent.includes('scrollUntilVisible') || yamlContent.includes('takeScreenshot')) {
        flowIndex++;
        const flowFile = path.join(flowsDir, `qwen-flow-${flowIndex}.yaml`);
        fs.writeFileSync(flowFile, yamlContent);
        log(`📝 Extracted Qwen flow ${flowIndex}: qwen-flow-${flowIndex}.yaml`);
      }
    }
    
    if (flowIndex === 0) {
      log(`ℹ️ No Maestro flows found in Qwen's solution, will use default basic flow`);
      flowsDir = null; // Signal to e2e.sh to use default
    } else {
      log(`📋 Extracted ${flowIndex} Maestro flow(s) from Qwen's solution`);
    }
  }

  return new Promise((resolve) => {
    const args = [String(issueId)];
    if (type === 'coding') {
      args.push('epiphanyapps/MapYourHealth', solutionFile);
    } else if (type === 'content') {
      args.push(solutionFile);
    } else if (type === 'e2e' && flowsDir) {
      args.push(flowsDir);
    }
    
    const proc = spawn('bash', [pipelineScript, ...args], {
      env: { ...process.env, PATH: process.env.PATH + ':' + process.env.HOME + '/.maestro/bin' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      const line = data.toString();
      stdout += line;
      log(`[pipeline] ${line.trim()}`);
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        log(`✅ Pipeline ${type} completed successfully for issue #${issueId}`);
        resolve({ executed: true, success: true, stdout, stderr });
      } else {
        log(`❌ Pipeline ${type} failed for issue #${issueId} (exit code: ${code})`);
        resolve({ executed: true, success: false, exitCode: code, stdout, stderr });
      }
    });
    
    proc.on('error', (err) => {
      log(`❌ Pipeline ${type} error: ${err.message}`);
      resolve({ executed: true, success: false, error: err.message });
    });
  });
}

// Process next item in queue
async function processNext() {
    const state = loadQueueState();
    
    if (state.processing) {
        const startedMs = new Date(state.processing.started_at).getTime();
        const staleMinutes = Math.round((Date.now() - startedMs) / 60000);
        if (staleMinutes >= 30) {
            log(`⚠️ Recovering stale processing item #${state.processing.issueNumber} (started ${staleMinutes} min ago)`);
            const failedItem = {
                ...state.processing,
                error: `Worker timeout/crash recovery (stale for ${staleMinutes} min)`,
                failed_at: new Date().toISOString()
            };
            state.failed.push(failedItem);
            // Record failure in SQLite
            try {
                const runId = db.recordRun({
                    issue_id: state.processing.issueNumber,
                    title: state.processing.title,
                    repo: state.processing.repo,
                    type: detectIssueType(state.processing),
                    labels: JSON.stringify(state.processing.labels || []),
                    priority: state.processing.priority,
                    status: 'failed',
                    started_at: state.processing.started_at
                });
                if (runId) db.failRun(runId, { error: failedItem.error });
            } catch (e) {
                log(`⚠️ DB stale recovery record failed: ${e.message}`);
            }
            state.processing = null;
            saveQueueState(state);
        } else {
            log('⏳ Already processing an item');
            return;
        }
    }
    
    if (state.queue.length === 0) {
        log('📭 Queue is empty');
        return;
    }
    
    // Get next item (priority: high -> medium -> low)
    const sortedQueue = state.queue.sort((a, b) => {
        const priorities = { high: 3, medium: 2, low: 1 };
        return priorities[b.priority] - priorities[a.priority];
    });
    
    const item = sortedQueue[0];
    const issueType = detectIssueType(item);
    const startedAt = new Date().toISOString();
    
    // Mark as processing
    state.processing = {
        ...item,
        started_at: startedAt
    };
    state.queue = state.queue.filter(q => q.issueNumber !== item.issueNumber);
    saveQueueState(state);
    
    // Record in DB
    let runId;
    try {
        runId = db.recordRun({
            issue_id: item.issueNumber,
            title: item.title,
            repo: item.repo,
            type: issueType,
            labels: JSON.stringify(item.labels || []),
            priority: item.priority,
            status: 'processing',
            started_at: startedAt,
            github_url: item.url
        });
    } catch (e) {
        log(`⚠️ DB recordRun failed: ${e.message}`);
    }
    
    log(`▶️  Started processing: ${item.title}`);
    
    // Process with Ollama
    const result = await processWithOllama(item);
    
    // Update state with result
    const updatedState = loadQueueState();
    updatedState.processing = null;
    const processingTimeMs = Date.now() - new Date(startedAt).getTime();
    
    if (result.success) {
        // Execute the type-specific pipeline
        const pipelineResult = await executePipeline(issueType, item.issueNumber, result.solution);
        if (pipelineResult.executed) {
            result.pipelineExecuted = true;
            result.pipelineSuccess = pipelineResult.success;
            if (!pipelineResult.success) {
                log(`❌ Pipeline failed for ${issueType} issue #${item.issueNumber}`);
                // For e2e issues, pipeline failure = issue failure
                if (issueType === 'e2e') {
                    result.success = false;
                    result.error = `E2E pipeline failed (exit code: ${pipelineResult.exitCode || 'unknown'}). Check artifacts/${item.issueNumber}/pipeline.log`;
                    log(`❌ Marking e2e issue #${item.issueNumber} as FAILED`);
                }
            }
        }

        const completedItem = {
            ...item,
            solution: result.solution,
            model: result.model,
            completed_at: result.processed_at,
            processing_time: processingTimeMs,
            pipelineExecuted: result.pipelineExecuted || false,
            pipelineSuccess: result.pipelineSuccess || false
        };

        // Collect artifacts for e2e items
        if (issueType === 'e2e') {
            const artifacts = collectArtifacts(String(item.issueNumber));
            if (artifacts) {
                completedItem.artifacts = artifacts;
                log(`📹 Artifacts collected for ${item.issueNumber}: ${artifacts.recordings.length} recordings, ${artifacts.logs.length} logs`);
                
                // Record artifacts in DB
                if (runId) {
                    const artifactDir = path.join(ARTIFACTS_DIR, String(item.issueNumber));
                    [...artifacts.recordings, ...artifacts.logs].forEach(filename => {
                        try {
                            const filePath = path.join(artifactDir, filename);
                            const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
                            db.addArtifact(runId, {
                                filename,
                                type: filename.endsWith('.mp4') ? 'recording' : 'log',
                                path: filePath,
                                size_bytes: stats ? stats.size : null
                            });
                        } catch (e) {
                            log(`⚠️ DB addArtifact failed: ${e.message}`);
                        }
                    });
                }
            }
        }

        // Check if result was marked as failed during pipeline execution (e.g. e2e failure)
        if (result.success) {
            updatedState.completed.push(completedItem);
            log(`✅ Completed: ${item.title}`);
            
            // Update DB
            if (runId) {
                try {
                    db.completeRun(runId, { solution: result.solution, model: result.model, processing_time_ms: processingTimeMs });
                } catch (e) {
                    log(`⚠️ DB completeRun failed: ${e.message}`);
                }
            }
        } else {
            // Pipeline failed (e.g. e2e) — route to failed
            updatedState.failed.push({
                ...completedItem,
                error: result.error || 'Pipeline failed',
                failed_at: result.processed_at
            });
            log(`❌ Failed (pipeline): ${item.title} - ${result.error}`);
            
            if (runId) {
                try {
                    db.failRun(runId, { error: result.error || 'Pipeline failed' });
                } catch (e) {
                    log(`⚠️ DB failRun failed: ${e.message}`);
                }
            }
        }
    } else {
        updatedState.failed.push({
            ...item,
            error: result.error,
            failed_at: result.processed_at
        });
        log(`❌ Failed: ${item.title} - ${result.error}`);
        
        // Update DB
        if (runId) {
            try {
                db.failRun(runId, { error: result.error });
            } catch (e) {
                log(`⚠️ DB failRun failed: ${e.message}`);
            }
        }
    }
    
    saveQueueState(updatedState);
}

// Load open issues from GitHub and add to queue
function loadFromGitHub() {
    const { execSync } = require('child_process');
    const REPO = 'epiphanyapps/MapYourHealth';
    const SUPPORTED_LABELS = ['e2e', 'coding', 'content'];

    // Fetch open issues via gh CLI
    let issues;
    try {
        const raw = execSync(
            `gh issue list --repo ${REPO} --state open --json number,title,labels,createdAt --limit 50`,
            { encoding: 'utf8' }
        );
        issues = JSON.parse(raw);
    } catch (err) {
        log(`❌ Failed to fetch issues from GitHub: ${err.message}`);
        return;
    }

    const state = loadQueueState();

    // Collect all existing issue numbers across all states
    const existingNumbers = new Set();
    state.queue.forEach(i => existingNumbers.add(i.issueNumber));
    if (state.processing) existingNumbers.add(state.processing.issueNumber);
    state.completed.forEach(i => existingNumbers.add(i.issueNumber));
    state.failed.forEach(i => existingNumbers.add(i.issueNumber));

    let added = 0;
    for (const issue of issues) {
        if (existingNumbers.has(issue.number)) continue;

        const labelNames = (issue.labels || []).map(l => typeof l === 'string' ? l : l.name || '');
        const lowerLabels = labelNames.map(l => l.toLowerCase());

        // Filter: only issues with at least one supported label, or include all if none have supported labels
        const hasSupported = lowerLabels.some(l => SUPPORTED_LABELS.includes(l));
        // Include all open issues — type detection happens in detectIssueType()
        // but skip if you only want labeled ones: if (!hasSupported) continue;

        const item = {
            issueNumber: issue.number,
            repo: REPO,
            title: issue.title,
            labels: labelNames,
            priority: 'medium',
            addedAt: new Date().toISOString(),
            url: `https://github.com/${REPO}/issues/${issue.number}`
        };

        state.queue.push(item);
        added++;
    }

    saveQueueState(state);
    log(`📥 Loaded ${added} new issue(s) from GitHub (${issues.length} total open, ${existingNumbers.size} already tracked)`);
}

// Clear completed items
function cleanup() {
    const state = loadQueueState();
    const completedCount = state.completed.length;
    state.completed = [];
    saveQueueState(state);
    log(`🧹 Cleared ${completedCount} completed items`);
}

// Watch mode - auto-process queue items
async function watch(intervalMs = 30000) {
    log(`👀 Watching queue (checking every ${intervalMs / 1000}s)...`);
    log('   Press Ctrl+C to stop\n');

    const tick = async () => {
        const state = loadQueueState();
        if (state.queue.length > 0 && !state.processing) {
            log(`\n📥 Found ${state.queue.length} item(s) in queue. Processing...`);
            await processNext();
            // After processing, immediately check for more
            const updated = loadQueueState();
            if (updated.queue.length > 0 && !updated.processing) {
                setImmediate(tick);
                return;
            }
        }
    };

    // Initial check
    await tick();
    // Then poll
    setInterval(tick, intervalMs);
}

// Main command handler
async function main() {
    const action = process.argv[2];
    
    // Initialize database
    try { db.initDB(); } catch (e) { console.warn('⚠️ DB init failed:', e.message); }
    
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
                cleanup();
                break;
            case 'remove': {
                const issueNum = parseInt(process.argv[3]);
                if (!issueNum) { log('❌ Usage: node queue-worker.js remove <issueNumber>'); process.exit(1); }
                const rs = loadQueueState();
                if (rs.processing && rs.processing.issueNumber === issueNum) {
                    log(`❌ Cannot remove issue #${issueNum} — currently processing`);
                    process.exit(1);
                }
                const before = rs.queue.length;
                rs.queue = rs.queue.filter(q => q.issueNumber !== issueNum);
                if (rs.queue.length === before) {
                    log(`⚠️ Issue #${issueNum} not found in queue`);
                } else {
                    saveQueueState(rs);
                    log(`🗑️ Removed issue #${issueNum} from queue`);
                }
                break;
            }
            case 'clear-all': {
                const cs = loadQueueState();
                const count = cs.queue.length;
                cs.queue = [];
                saveQueueState(cs);
                log(`🗑️ Cleared ${count} item(s) from queue`);
                break;
            }
            case 'clear-history': {
                const hs = loadQueueState();
                const cc = hs.completed.length;
                const fc = hs.failed.length;
                hs.completed = [];
                hs.failed = [];
                saveQueueState(hs);
                log(`🗑️ Cleared history: ${cc} completed, ${fc} failed`);
                break;
            }
            case 'status':
                const state = loadQueueState();
                log('📊 Queue Status:');
                log(`  Queued: ${state.queue.length}`);
                log(`  Processing: ${state.processing ? 1 : 0}`);
                log(`  Completed: ${state.completed.length}`);
                log(`  Failed: ${state.failed.length}`);
                break;
            default:
                log('Usage: node queue-worker.js <action>');
                log('Actions: process | watch [intervalMs] | load-github | add-demo | cleanup | status | remove <issueNumber> | clear-all | clear-history');
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}