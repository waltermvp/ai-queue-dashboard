#!/usr/bin/env node

// AI Queue Worker for Ollama Integration
// Processes queue items using local Llama model

const fs = require('fs');
const path = require('path');
const axios = require('axios');

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

// Save queue state
function saveQueueState(state) {
    fs.writeFileSync(QUEUE_STATE_FILE, JSON.stringify(state, null, 2));
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
ID: ${item.id}
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

// Process next item in queue
async function processNext() {
    const state = loadQueueState();
    
    if (state.processing) {
        log('⏳ Already processing an item');
        return;
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
    
    // Mark as processing
    state.processing = {
        ...item,
        started_at: new Date().toISOString()
    };
    state.queue = state.queue.filter(q => q.id !== item.id);
    saveQueueState(state);
    
    log(`▶️  Started processing: ${item.title}`);
    
    // Process with Ollama
    const result = await processWithOllama(item);
    
    // Update state with result
    const updatedState = loadQueueState();
    updatedState.processing = null;
    
    if (result.success) {
        const completedItem = {
            ...item,
            solution: result.solution,
            model: result.model,
            completed_at: result.processed_at,
            processing_time: Date.now() - new Date(state.processing.started_at).getTime()
        };

        // Collect artifacts for e2e items
        const issueType = detectIssueType(item);
        if (issueType === 'e2e') {
            const artifacts = collectArtifacts(item.id);
            if (artifacts) {
                completedItem.artifacts = artifacts;
                log(`📹 Artifacts collected for ${item.id}: ${artifacts.recordings.length} recordings, ${artifacts.logs.length} logs`);
            }
        }

        updatedState.completed.push(completedItem);
        log(`✅ Completed: ${item.title}`);
    } else {
        updatedState.failed.push({
            ...item,
            error: result.error,
            failed_at: result.processed_at
        });
        log(`❌ Failed: ${item.title} - ${result.error}`);
    }
    
    saveQueueState(updatedState);
}

// Add demo items to queue
function addDemoItems() {
    const state = loadQueueState();
    const demoItems = [
        { id: `demo-${Date.now()}-1`, title: 'Optimize API Performance', priority: 'high', created_at: new Date().toISOString() },
        { id: `demo-${Date.now()}-2`, title: 'Fix UI Bug in Dashboard', priority: 'medium', created_at: new Date().toISOString() },
        { id: `demo-${Date.now()}-3`, title: 'Update Documentation', priority: 'low', created_at: new Date().toISOString() }
    ];
    
    demoItems.forEach(item => {
        if (!state.queue.find(q => q.title === item.title)) {
            state.queue.push(item);
        }
    });
    
    saveQueueState(state);
    log('➕ Added demo items to queue');
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
                addDemoItems();
                break;
            case 'cleanup':
                cleanup();
                break;
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
                log('Actions: process | watch [intervalMs] | add-demo | cleanup | status');
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}