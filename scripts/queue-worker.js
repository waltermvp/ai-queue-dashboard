#!/usr/bin/env node

// AI Queue Worker for Ollama Integration
// Processes queue items using local Llama model

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const QUEUE_STATE_FILE = path.join(__dirname, '..', 'queue-state.json');
const OLLAMA_URL = 'http://localhost:11434/api/generate';

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
        console.log('✅ Initialized queue state with sample data');
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
    console.log(`🤖 Processing: ${item.title}`);
    
    const prompt = `Analyze this task and provide a solution:

Task: ${item.title}
ID: ${item.id}
Priority: ${item.priority}

Please provide:
1. Analysis of the task
2. Recommended approach 
3. Implementation steps
4. Potential challenges

Keep response concise but thorough.`;

    try {
        const response = await axios.post(OLLAMA_URL, {
            model: 'llama3.1:70b',
            prompt: prompt,
            stream: false
        });

        return {
            success: true,
            solution: response.data.response,
            model: 'llama3.1:70b',
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
        console.log('⏳ Already processing an item');
        return;
    }
    
    if (state.queue.length === 0) {
        console.log('📭 Queue is empty');
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
    
    console.log(`▶️  Started processing: ${item.title}`);
    
    // Process with Ollama
    const result = await processWithOllama(item);
    
    // Update state with result
    const updatedState = loadQueueState();
    updatedState.processing = null;
    
    if (result.success) {
        updatedState.completed.push({
            ...item,
            solution: result.solution,
            model: result.model,
            completed_at: result.processed_at,
            processing_time: Date.now() - new Date(state.processing.started_at).getTime()
        });
        console.log(`✅ Completed: ${item.title}`);
    } else {
        updatedState.failed.push({
            ...item,
            error: result.error,
            failed_at: result.processed_at
        });
        console.log(`❌ Failed: ${item.title} - ${result.error}`);
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
    console.log('➕ Added demo items to queue');
}

// Clear completed items
function cleanup() {
    const state = loadQueueState();
    const completedCount = state.completed.length;
    state.completed = [];
    saveQueueState(state);
    console.log(`🧹 Cleared ${completedCount} completed items`);
}

// Main command handler
async function main() {
    const action = process.argv[2];
    
    try {
        switch (action) {
            case 'process':
                await processNext();
                break;
            case 'add-demo':
                addDemoItems();
                break;
            case 'cleanup':
                cleanup();
                break;
            case 'status':
                const state = loadQueueState();
                console.log('📊 Queue Status:');
                console.log(`  Queued: ${state.queue.length}`);
                console.log(`  Processing: ${state.processing ? 1 : 0}`);
                console.log(`  Completed: ${state.completed.length}`);
                console.log(`  Failed: ${state.failed.length}`);
                break;
            default:
                console.log('Usage: node queue-worker.js <action>');
                console.log('Actions: process | add-demo | cleanup | status');
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}