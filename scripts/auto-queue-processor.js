#!/usr/bin/env node

// Auto Queue Processor - Fixes "1 queued, 0 processing" issue
// Automatically starts processing when items are queued but nothing is running

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const QUEUE_STATE_FILE = path.join(__dirname, '..', 'queue-state.json');
const CHECK_INTERVAL = 10000; // Check every 10 seconds

function loadQueueState() {
    if (!fs.existsSync(QUEUE_STATE_FILE)) {
        return { queue: [], processing: null, completed: [], failed: [] };
    }
    return JSON.parse(fs.readFileSync(QUEUE_STATE_FILE, 'utf8'));
}

function startProcessing() {
    console.log('🚀 Auto-starting queue processing...');
    exec('node ' + path.join(__dirname, 'queue-worker.js') + ' process', (error, stdout, stderr) => {
        if (error) {
            console.error('❌ Auto-process error:', error.message);
        } else {
            console.log('✅ Auto-process completed:', stdout);
        }
    });
}

function checkAndProcess() {
    try {
        const state = loadQueueState();
        const hasQueuedItems = state.queue && state.queue.length > 0;
        const isProcessing = state.processing !== null && state.processing !== undefined;
        
        if (hasQueuedItems && !isProcessing) {
            console.log(`📋 Found ${state.queue.length} queued items, 0 processing - starting auto-process`);
            startProcessing();
        } else if (hasQueuedItems && isProcessing) {
            console.log(`⏳ ${state.queue.length} queued, 1 processing - waiting...`);
        } else if (!hasQueuedItems) {
            console.log('📭 Queue empty - waiting for items...');
        }
        
    } catch (error) {
        console.error('❌ Queue check error:', error.message);
    }
}

// Main loop
console.log('🎯 Auto Queue Processor started');
console.log('Monitoring queue state every 10 seconds...');
console.log('Will auto-start processing when items are queued but nothing is running');
console.log('Press Ctrl+C to stop');

setInterval(checkAndProcess, CHECK_INTERVAL);

// Initial check
checkAndProcess();