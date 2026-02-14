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
    
    // Load coding standards for React Native projects
    const codingStandards = `
CRITICAL: Follow React Native coding standards to pass CI:

1. NO INLINE STYLES - Always use StyleSheet.create()
   ❌ style={{ flex: 1, padding: 10 }}
   ✅ style={styles.container}

2. IMPORT ORDER - React first, then third-party, then local
   ❌ import { useQuery } from '@tanstack/react-query'; import React from 'react';
   ✅ import React from 'react'; import { useQuery } from '@tanstack/react-query';

3. PRETTIER FORMAT - Proper line breaks, trailing commas
4. HOOK DEPENDENCIES - Include all dependencies in useEffect arrays
5. NO UNUSED IMPORTS - Remove unused variables/imports
6. NO COLOR LITERALS - Use theme constants, not 'transparent' or '#fff'

ALWAYS format code properly and run mental lint check before responding.
`;

    const prompt = `${codingStandards}

Analyze this GitHub issue and provide a complete solution:

Task: ${item.title}
ID: ${item.id}
Priority: ${item.priority}
Repository: MapYourHealth (React Native + Expo)

Provide:
1. **Root Cause Analysis** - What's causing the issue?
2. **Code Solution** - Complete, properly formatted code following React Native standards
3. **Implementation Steps** - Exact steps to implement  
4. **Testing Strategy** - How to verify the fix works

Make sure all code follows the coding standards above to pass CI linting.`;

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