#!/usr/bin/env node

/**
 * Enhanced Queue Worker with Label-Based Routing
 * Supports three-pillar AI system (Feature, Content, E2E)
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { execSync, spawn } = require('child_process');

// Configuration
const CONFIG = {
  QUEUE_STATE_FILE: path.join(__dirname, '..', 'enhanced-queue-state.json'),
  OLLAMA_URL: 'http://localhost:11434/api/generate',
  GITHUB_API_URL: 'https://api.github.com',
  MODELS: {
    feature: {
      primary: 'qwen2.5-coder:32b',
      fallback: 'llama-3.3-70b-instruct',
      temperature: 0.1,
      maxTokens: 8192
    },
    content: {
      primary: 'qwen2.5-coder:32b', 
      fallback: 'llama-3.3-70b-instruct',
      temperature: 0.15,
      maxTokens: 4096
    },
    e2e: {
      primary: 'qwen2.5-coder:32b',
      fallback: 'deepseek-coder:6.7b',
      temperature: 0.05,
      maxTokens: 8192
    }
  },
  REPOS_TO_WATCH: [
    'waltermvp/ai-queue-dashboard',
    'waltermvp/MapYourHealth',
    'waltermvp/GlanceMenu'
  ]
};

/**
 * Issue Type Detection and Routing Logic
 */
class LabelRouter {
  static LABEL_MAPPING = {
    'ai-queue-feature': 'feature',
    'ai-queue-content': 'content', 
    'ai-queue-e2e': 'e2e'
  };

  static COMPLEXITY_LABELS = {
    'complexity-simple': 'simple',
    'complexity-moderate': 'moderate',
    'complexity-complex': 'complex'
  };

  static PRIORITY_LABELS = {
    'priority-high': 'high',
    'priority-medium': 'medium',
    'priority-low': 'low'
  };

  static FEATURE_PATTERNS = [
    /\[FEATURE\]/i, /implement/i, /add.*functionality/i, /create.*api/i,
    /build.*component/i, /integrate.*with/i, /new.*feature/i, /enhancement/i
  ];

  static CONTENT_PATTERNS = [
    /\[CONTENT\]/i, /documentation/i, /readme/i, /guide/i, /tutorial/i,
    /write.*docs/i, /update.*docs/i, /help.*text/i, /marketing/i
  ];

  static E2E_PATTERNS = [
    /\[E2E\]/i, /test/i, /testing/i, /qa/i, /validation/i,
    /end.*to.*end/i, /e2e/i, /quality.*assurance/i
  ];

  static detectIssueType(labels) {
    // Check explicit labels first
    for (const label of labels) {
      if (label.name in this.LABEL_MAPPING) {
        return this.LABEL_MAPPING[label.name];
      }
    }
    return null;
  }

  static detectTypeFromContent(title, body) {
    const text = `${title} ${body}`.toLowerCase();
    
    const featureMatches = this.FEATURE_PATTERNS.filter(p => p.test(text)).length;
    const contentMatches = this.CONTENT_PATTERNS.filter(p => p.test(text)).length;
    const e2eMatches = this.E2E_PATTERNS.filter(p => p.test(text)).length;
    
    const maxMatches = Math.max(featureMatches, contentMatches, e2eMatches);
    if (maxMatches === 0) return null;
    
    if (featureMatches === maxMatches) return 'feature';
    if (contentMatches === maxMatches) return 'content';
    if (e2eMatches === maxMatches) return 'e2e';
    
    return null;
  }

  static getComplexity(labels, title, body) {
    // Check explicit labels
    for (const label of labels) {
      if (label.name in this.COMPLEXITY_LABELS) {
        return this.COMPLEXITY_LABELS[label.name];
      }
    }

    // Content analysis
    const content = `${title} ${body}`.toLowerCase();
    let score = 0;

    if (body.length > 2000) score += 2;
    else if (body.length > 500) score += 1;

    if (/database|schema|migration|api|integration/i.test(content)) score += 2;
    if (/multiple.*files?|authentication|security/i.test(content)) score += 1;
    if (/critical|urgent|architecture|system.*design/i.test(content)) score += 2;

    if (score >= 4) return 'complex';
    if (score >= 2) return 'moderate';
    return 'simple';
  }

  static getPriority(labels) {
    for (const label of labels) {
      if (label.name in this.PRIORITY_LABELS) {
        return this.PRIORITY_LABELS[label.name];
      }
    }
    return 'medium';
  }

  static isReady(labels) {
    return labels.some(label => label.name === 'ai-queue-ready');
  }

  static isBlocked(labels) {
    return labels.some(label => label.name === 'blocked');
  }
}

/**
 * Queue State Management
 */
class QueueState {
  constructor() {
    this.initializeState();
  }

  initializeState() {
    const defaultState = {
      queues: {
        feature: [],
        content: [],
        e2e: []
      },
      processing: {
        feature: null,
        content: null,
        e2e: null
      },
      completed: [],
      failed: [],
      blocked: [],
      needsClarification: [],
      lastUpdated: new Date().toISOString(),
      stats: {
        feature: { total: 0, ready: 0, processing: 0, completed: 0, failed: 0 },
        content: { total: 0, ready: 0, processing: 0, completed: 0, failed: 0 },
        e2e: { total: 0, ready: 0, processing: 0, completed: 0, failed: 0 }
      }
    };

    if (!fs.existsSync(CONFIG.QUEUE_STATE_FILE)) {
      this.saveState(defaultState);
      console.log('✅ Initialized enhanced queue state');
    }
  }

  loadState() {
    if (!fs.existsSync(CONFIG.QUEUE_STATE_FILE)) {
      this.initializeState();
    }
    return JSON.parse(fs.readFileSync(CONFIG.QUEUE_STATE_FILE, 'utf8'));
  }

  saveState(state) {
    state.lastUpdated = new Date().toISOString();
    state.stats = this.calculateStats(state);
    fs.writeFileSync(CONFIG.QUEUE_STATE_FILE, JSON.stringify(state, null, 2));
  }

  calculateStats(state) {
    const stats = {
      feature: { total: 0, ready: 0, processing: 0, completed: 0, failed: 0 },
      content: { total: 0, ready: 0, processing: 0, completed: 0, failed: 0 },
      e2e: { total: 0, ready: 0, processing: 0, completed: 0, failed: 0 }
    };

    // Count queued items
    for (const [queueType, queue] of Object.entries(state.queues)) {
      stats[queueType].total = queue.length;
      stats[queueType].ready = queue.filter(item => item.isReady).length;
    }

    // Count processing
    for (const [queueType, processing] of Object.entries(state.processing)) {
      if (processing) {
        stats[queueType].processing = 1;
      }
    }

    // Count completed/failed by original queue type
    for (const item of state.completed) {
      if (stats[item.queueType]) {
        stats[item.queueType].completed++;
      }
    }

    for (const item of state.failed) {
      if (stats[item.queueType]) {
        stats[item.queueType].failed++;
      }
    }

    return stats;
  }
}

/**
 * AI Processing Engine
 */
class AIProcessor {
  static async processIssue(issue, queueType) {
    console.log(`🤖 Processing ${queueType} issue: ${issue.title}`);
    
    const modelConfig = CONFIG.MODELS[queueType];
    const prompt = this.buildPrompt(issue, queueType);

    try {
      // Try primary model first
      const result = await this.callModel(modelConfig.primary, prompt, modelConfig);
      return {
        success: true,
        solution: result.response,
        modelUsed: modelConfig.primary,
        tokensUsed: result.tokensUsed || 0
      };
    } catch (error) {
      console.warn(`⚠️  Primary model failed: ${error.message}`);
      
      // Fallback to secondary model
      if (modelConfig.fallback) {
        try {
          const result = await this.callModel(modelConfig.fallback, prompt, modelConfig);
          return {
            success: true,
            solution: result.response,
            modelUsed: modelConfig.fallback,
            tokensUsed: result.tokensUsed || 0
          };
        } catch (fallbackError) {
          console.error(`❌ Fallback model failed: ${fallbackError.message}`);
        }
      }

      return {
        success: false,
        error: error.message,
        modelUsed: modelConfig.primary
      };
    }
  }

  static buildPrompt(issue, queueType) {
    const basePrompts = {
      feature: `# Feature Development Task

You are an expert software developer working on a feature implementation.

## Issue Details
**Title**: ${issue.title}
**Repository**: ${issue.repository}
**Priority**: ${issue.priority}
**Complexity**: ${issue.complexity}

**Description**:
${issue.body}

## Your Task
Provide a comprehensive solution including:
1. **Analysis**: Understanding of requirements and approach
2. **Implementation**: Complete, production-ready code 
3. **Testing**: Unit tests and validation approach
4. **Documentation**: Code comments and usage examples

Use modern best practices, proper error handling, and follow the project's coding standards.
Focus on clean, maintainable, and scalable code.`,

      content: `# Content Creation Task

You are an expert technical writer and content creator.

## Content Request
**Title**: ${issue.title}
**Repository**: ${issue.repository}
**Priority**: ${issue.priority}

**Requirements**:
${issue.body}

## Your Task
Create high-quality content that:
1. **Addresses the requirements** clearly and completely
2. **Uses appropriate tone** for the target audience
3. **Follows best practices** for the content type
4. **Is well-structured** with proper formatting
5. **Includes examples** where relevant

Ensure accuracy, clarity, and professional presentation.`,

      e2e: `# E2E Testing Task

You are an expert QA engineer specializing in end-to-end testing.

## Testing Requirements
**Title**: ${issue.title}
**Repository**: ${issue.repository}
**Priority**: ${issue.priority}
**Complexity**: ${issue.complexity}

**Test Scope**:
${issue.body}

## Your Task
Create comprehensive E2E tests including:
1. **Test Plan**: Scenarios and coverage strategy
2. **Test Implementation**: Complete test code with proper assertions
3. **Test Data**: Mock data and fixtures needed
4. **Validation**: Expected outcomes and error conditions
5. **CI Integration**: How tests fit into the pipeline

Focus on reliable, maintainable tests that catch real issues.`
    };

    return basePrompts[queueType] || basePrompts.feature;
  }

  static async callModel(modelName, prompt, config) {
    const payload = {
      model: modelName,
      prompt: prompt,
      stream: false,
      options: {
        temperature: config.temperature,
        num_predict: config.maxTokens
      }
    };

    const response = await axios.post(CONFIG.OLLAMA_URL, payload, {
      timeout: 300000 // 5 minute timeout
    });

    return {
      response: response.data.response,
      tokensUsed: response.data.eval_count || 0
    };
  }
}

/**
 * GitHub Integration
 */
class GitHubIntegration {
  static async fetchAssignedIssues(repo) {
    // Mock implementation - replace with actual GitHub API calls
    console.log(`🔄 Fetching issues from ${repo}`);
    
    // For demo purposes, return mock issues
    return [
      {
        id: `${repo}-issue-1`,
        number: 1,
        title: '[FEATURE] Implement user authentication system',
        body: 'Need to add JWT-based authentication with login/logout functionality...',
        labels: [
          { name: 'ai-queue-feature' },
          { name: 'ai-queue-ready' },
          { name: 'priority-high' },
          { name: 'complexity-moderate' }
        ],
        repository: repo,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: `${repo}-issue-2`,
        number: 2,
        title: '[CONTENT] Update API documentation',
        body: 'Documentation needs to be updated for new authentication endpoints...',
        labels: [
          { name: 'ai-queue-content' },
          { name: 'ai-queue-ready' },
          { name: 'priority-medium' }
        ],
        repository: repo,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
  }

  static async postComment(repo, issueNumber, comment) {
    console.log(`💬 Would post comment to ${repo}#${issueNumber}`);
    console.log(`Comment: ${comment.substring(0, 100)}...`);
  }
}

/**
 * Main Worker Class
 */
class EnhancedQueueWorker {
  constructor() {
    this.queueState = new QueueState();
    this.isProcessing = false;
  }

  async populateQueue() {
    console.log('📥 Loading issues from GitHub...');
    
    const state = this.queueState.loadState();
    let addedCount = 0;

    for (const repo of CONFIG.REPOS_TO_WATCH) {
      try {
        const issues = await GitHubIntegration.fetchAssignedIssues(repo);
        
        for (const issue of issues) {
          const queuedIssue = this.processIssueForQueue(issue);
          if (queuedIssue && this.addToQueue(state, queuedIssue)) {
            addedCount++;
          }
        }
      } catch (error) {
        console.error(`❌ Failed to fetch issues from ${repo}: ${error.message}`);
      }
    }

    this.queueState.saveState(state);
    console.log(`✅ Added ${addedCount} new issues to queues`);
  }

  processIssueForQueue(issue) {
    // Detect issue type
    let issueType = LabelRouter.detectIssueType(issue.labels);
    if (!issueType) {
      issueType = LabelRouter.detectTypeFromContent(issue.title, issue.body);
    }

    if (!issueType) {
      console.log(`⚠️  Skipping issue ${issue.id}: no type detected`);
      return null;
    }

    // Check readiness
    if (!LabelRouter.isReady(issue.labels)) {
      console.log(`⚠️  Skipping issue ${issue.id}: not ready`);
      return null;
    }

    if (LabelRouter.isBlocked(issue.labels)) {
      console.log(`⚠️  Issue ${issue.id} is blocked`);
      return null;
    }

    return {
      ...issue,
      queueType: issueType,
      complexity: LabelRouter.getComplexity(issue.labels, issue.title, issue.body),
      priority: LabelRouter.getPriority(issue.labels),
      isReady: true,
      queuedAt: new Date().toISOString()
    };
  }

  addToQueue(state, queuedIssue) {
    const queue = state.queues[queuedIssue.queueType];
    
    // Check if already exists
    if (queue.find(item => item.id === queuedIssue.id)) {
      return false;
    }

    queue.push(queuedIssue);
    this.sortQueue(queue);
    return true;
  }

  sortQueue(queue) {
    queue.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const aPriority = priorityOrder[a.priority];
      const bPriority = priorityOrder[b.priority];
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      
      return new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime();
    });
  }

  async processNext() {
    if (this.isProcessing) {
      console.log('⏳ Already processing an item');
      return;
    }

    const state = this.queueState.loadState();
    const nextIssue = this.getNextIssue(state);
    
    if (!nextIssue) {
      console.log('📭 No issues ready for processing');
      return;
    }

    this.isProcessing = true;

    try {
      // Mark as processing
      this.startProcessing(state, nextIssue);
      
      console.log(`▶️  Processing ${nextIssue.queueType} issue: ${nextIssue.title}`);

      // Process with AI
      const result = await AIProcessor.processIssue(nextIssue, nextIssue.queueType);
      
      // Update state with result
      const updatedState = this.queueState.loadState();
      if (result.success) {
        this.markCompleted(updatedState, nextIssue, result);
        console.log(`✅ Completed: ${nextIssue.title}`);
      } else {
        this.markFailed(updatedState, nextIssue, result);
        console.log(`❌ Failed: ${nextIssue.title} - ${result.error}`);
      }

      this.queueState.saveState(updatedState);

    } catch (error) {
      console.error(`❌ Processing error: ${error.message}`);
      const errorState = this.queueState.loadState();
      this.markFailed(errorState, nextIssue, { error: error.message });
      this.queueState.saveState(errorState);
    } finally {
      this.isProcessing = false;
    }
  }

  getNextIssue(state) {
    // Collect all ready issues from all queues
    const allReady = [];
    
    for (const [queueType, queue] of Object.entries(state.queues)) {
      const ready = queue.filter(issue => 
        issue.isReady && !state.processing[queueType]
      );
      allReady.push(...ready);
    }

    if (allReady.length === 0) return null;

    // Sort by priority
    allReady.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    return allReady[0];
  }

  startProcessing(state, issue) {
    // Remove from queue
    const queue = state.queues[issue.queueType];
    const index = queue.findIndex(item => item.id === issue.id);
    if (index >= 0) {
      queue.splice(index, 1);
    }

    // Mark as processing
    state.processing[issue.queueType] = {
      ...issue,
      startedAt: new Date().toISOString()
    };
    
    this.queueState.saveState(state);
  }

  markCompleted(state, issue, result) {
    state.processing[issue.queueType] = null;
    
    state.completed.unshift({
      ...issue,
      completedAt: new Date().toISOString(),
      solution: result.solution,
      modelUsed: result.modelUsed,
      tokensUsed: result.tokensUsed
    });

    // Limit history
    if (state.completed.length > 100) {
      state.completed = state.completed.slice(0, 100);
    }
  }

  markFailed(state, issue, result) {
    state.processing[issue.queueType] = null;
    
    state.failed.unshift({
      ...issue,
      failedAt: new Date().toISOString(),
      error: result.error,
      modelUsed: result.modelUsed
    });

    // Limit history
    if (state.failed.length > 50) {
      state.failed = state.failed.slice(0, 50);
    }
  }

  cleanup() {
    const state = this.queueState.loadState();
    const completedCount = state.completed.length;
    
    state.completed = [];
    state.failed = [];
    
    this.queueState.saveState(state);
    console.log(`🧹 Cleared ${completedCount} completed items`);
  }

  showStatus() {
    const state = this.queueState.loadState();
    console.log('📊 Enhanced Queue Status:');
    console.log('─────────────────────────');
    
    for (const [queueType, stats] of Object.entries(state.stats)) {
      console.log(`${queueType.toUpperCase().padEnd(8)} | Queued: ${stats.total.toString().padStart(2)} | Processing: ${stats.processing} | Completed: ${stats.completed.toString().padStart(2)} | Failed: ${stats.failed}`);
    }
    
    console.log('─────────────────────────');
    console.log(`Last Updated: ${new Date(state.lastUpdated).toLocaleString()}`);
  }

  async watch(intervalMs = 30000) {
    console.log(`🔄 Starting enhanced queue watcher (interval: ${intervalMs}ms)`);
    
    while (true) {
      try {
        // Check for new issues periodically
        if (Math.random() < 0.1) { // 10% chance each cycle
          await this.populateQueue();
        }
        
        // Process next item
        await this.processNext();
        
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      } catch (error) {
        console.error(`❌ Watcher error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }
  }
}

// CLI Interface
async function main() {
  const worker = new EnhancedQueueWorker();
  const action = process.argv[2];
  const param = process.argv[3];

  try {
    switch (action) {
      case 'populate':
        await worker.populateQueue();
        break;
      case 'process':
        await worker.processNext();
        break;
      case 'cleanup':
        worker.cleanup();
        break;
      case 'status':
        worker.showStatus();
        break;
      case 'watch':
        const interval = parseInt(param) || 30000;
        await worker.watch(interval);
        break;
      default:
        console.log('Enhanced AI Queue Worker - Three Pillar System');
        console.log('');
        console.log('Usage: node enhanced-queue-worker.js <action> [params]');
        console.log('');
        console.log('Actions:');
        console.log('  populate     - Load issues from GitHub repositories');  
        console.log('  process      - Process next issue from any queue');
        console.log('  cleanup      - Clear completed and failed items');
        console.log('  status       - Show current queue statistics');
        console.log('  watch [ms]   - Start continuous processing (default: 30000ms)');
        console.log('');
        console.log('Queue Types:');
        console.log('  🚀 feature   - Feature development (Qwen2.5-Coder + tools)');
        console.log('  📝 content   - Content creation (Qwen2.5-Coder + context)');
        console.log('  🧪 e2e       - E2E testing (Qwen2.5-Coder + test tools)');
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { EnhancedQueueWorker, LabelRouter, AIProcessor };