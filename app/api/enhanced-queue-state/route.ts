import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const ENHANCED_QUEUE_STATE_FILE = path.join(process.cwd(), 'enhanced-queue-state.json');

// Default state structure for the three-pillar system
const getDefaultState = () => ({
  queues: {
    feature: [
      {
        id: 'demo-feature-1',
        number: 101,
        title: '[FEATURE] Implement user authentication with JWT tokens',
        body: 'Need to add secure authentication system with login/logout functionality, password reset, and session management...',
        repository: 'waltermvp/ai-queue-dashboard',
        queueType: 'feature',
        complexity: 'moderate',
        priority: 'high',
        isReady: true,
        queuedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        modelConfig: {
          primary: 'qwen2.5-coder:32b',
          fallback: 'llama-3.3-70b-instruct',
          temperature: 0.1,
          maxTokens: 8192
        }
      },
      {
        id: 'demo-feature-2', 
        number: 102,
        title: '[FEATURE] Add real-time notifications system',
        body: 'Implement WebSocket-based notification system for queue updates and processing status...',
        repository: 'waltermvp/MapYourHealth',
        queueType: 'feature',
        complexity: 'complex',
        priority: 'medium',
        isReady: true,
        queuedAt: new Date(Date.now() - 1800000).toISOString(), // 30 minutes ago
        modelConfig: {
          primary: 'qwen2.5-coder:32b',
          fallback: 'llama-3.3-70b-instruct',
          temperature: 0.1,
          maxTokens: 8192
        }
      }
    ],
    content: [
      {
        id: 'demo-content-1',
        number: 201,
        title: '[CONTENT] Update API documentation for new authentication endpoints',
        body: 'Documentation needs comprehensive update covering new JWT authentication system, rate limiting, and error codes...',
        repository: 'waltermvp/ai-queue-dashboard',
        queueType: 'content',
        complexity: 'simple',
        priority: 'medium',
        isReady: true,
        queuedAt: new Date(Date.now() - 2700000).toISOString(), // 45 minutes ago
        modelConfig: {
          primary: 'qwen2.5-coder:32b',
          fallback: 'llama-3.3-70b-instruct',
          temperature: 0.15,
          maxTokens: 4096
        }
      }
    ],
    e2e: [
      {
        id: 'demo-e2e-1',
        number: 301,
        title: '[E2E] Create comprehensive test suite for authentication flows',
        body: 'Need end-to-end tests covering login, logout, password reset, session timeout, and error scenarios across web and mobile...',
        repository: 'waltermvp/MapYourHealth',
        queueType: 'e2e',
        complexity: 'complex',
        priority: 'high',
        isReady: true,
        queuedAt: new Date(Date.now() - 900000).toISOString(), // 15 minutes ago
        modelConfig: {
          primary: 'qwen2.5-coder:32b',
          temperature: 0.05,
          maxTokens: 8192
        }
      }
    ]
  },
  processing: {
    feature: null,
    content: null,
    e2e: null
  },
  completed: [
    {
      issue: {
        id: 'completed-feature-1',
        number: 95,
        title: '[FEATURE] Implement label-based routing system',
        body: 'Core routing logic for three-pillar AI processing system...',
        repository: 'waltermvp/ai-queue-dashboard', 
        queueType: 'feature',
        complexity: 'complex',
        priority: 'high',
        isReady: true,
        queuedAt: new Date(Date.now() - 7200000).toISOString()
      },
      completedAt: new Date(Date.now() - 1800000).toISOString(), // 30 minutes ago
      solution: 'Implemented comprehensive label detection system with TypeScript interfaces, model routing logic, and queue management. Added support for automatic type detection, complexity assessment, and priority handling...',
      modelUsed: 'qwen2.5-coder:32b',
      tokensUsed: 5847
    },
    {
      issue: {
        id: 'completed-content-1',
        number: 96,
        title: '[CONTENT] Create setup guide for three-pillar system',
        body: 'Documentation for setting up and configuring the enhanced AI queue system...',
        repository: 'waltermvp/ai-queue-dashboard',
        queueType: 'content', 
        complexity: 'moderate',
        priority: 'medium',
        isReady: true,
        queuedAt: new Date(Date.now() - 5400000).toISOString()
      },
      completedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      solution: 'Created comprehensive setup guide with installation instructions, configuration examples, and troubleshooting tips. Includes model setup, queue configuration, and monitoring setup...',
      modelUsed: 'qwen2.5-coder:32b',
      tokensUsed: 3241
    }
  ],
  failed: [],
  blocked: [],
  needsClarification: [],
  lastUpdated: new Date().toISOString(),
  stats: {
    feature: { total: 2, ready: 2, processing: 0, blocked: 0, completed: 1, failed: 0 },
    content: { total: 1, ready: 1, processing: 0, blocked: 0, completed: 1, failed: 0 },
    e2e: { total: 1, ready: 1, processing: 0, blocked: 0, completed: 0, failed: 0 }
  }
});

export async function GET() {
  try {
    let queueState;
    
    try {
      // Try to read existing state file
      const fileContent = await fs.readFile(ENHANCED_QUEUE_STATE_FILE, 'utf8');
      queueState = JSON.parse(fileContent);
      
      // Update last accessed time
      queueState.lastUpdated = new Date().toISOString();
    } catch (error) {
      // File doesn't exist or is invalid, create default state
      console.log('Creating default enhanced queue state');
      queueState = getDefaultState();
      
      // Save default state to file
      await fs.writeFile(
        ENHANCED_QUEUE_STATE_FILE, 
        JSON.stringify(queueState, null, 2),
        'utf8'
      );
    }

    return NextResponse.json(queueState);
  } catch (error) {
    console.error('Failed to load enhanced queue state:', error);
    
    // Return default state even if file operations fail
    return NextResponse.json(getDefaultState());
  }
}

export async function POST(request: Request) {
  try {
    const updates = await request.json();
    
    // Read current state
    let queueState;
    try {
      const fileContent = await fs.readFile(ENHANCED_QUEUE_STATE_FILE, 'utf8');
      queueState = JSON.parse(fileContent);
    } catch {
      queueState = getDefaultState();
    }
    
    // Apply updates
    queueState = { ...queueState, ...updates, lastUpdated: new Date().toISOString() };
    
    // Recalculate stats
    queueState.stats = calculateStats(queueState);
    
    // Save updated state
    await fs.writeFile(
      ENHANCED_QUEUE_STATE_FILE,
      JSON.stringify(queueState, null, 2),
      'utf8'
    );

    return NextResponse.json({ success: true, state: queueState });
  } catch (error: any) {
    console.error('Failed to update enhanced queue state:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

function calculateStats(state: any) {
  const stats = {
    feature: { total: 0, ready: 0, processing: 0, blocked: 0, completed: 0, failed: 0 },
    content: { total: 0, ready: 0, processing: 0, blocked: 0, completed: 0, failed: 0 },
    e2e: { total: 0, ready: 0, processing: 0, blocked: 0, completed: 0, failed: 0 }
  };

  // Count queued items
  for (const [queueType, queue] of Object.entries(state.queues)) {
    if (Array.isArray(queue) && (queueType in stats)) {
      const queueStats = stats[queueType as keyof typeof stats];
      queueStats.total = queue.length;
      queueStats.ready = queue.filter((item: any) => item.isReady).length;
      queueStats.blocked = queue.filter((item: any) => !item.isReady).length;
    }
  }

  // Count processing
  for (const [queueType, processing] of Object.entries(state.processing)) {
    if (processing && (queueType in stats)) {
      const queueStats = stats[queueType as keyof typeof stats];
      queueStats.processing = 1;
    }
  }

  // Count completed by queue type
  if (Array.isArray(state.completed)) {
    for (const completed of state.completed) {
      const queueType = completed.issue?.queueType;
      if (queueType && (queueType in stats)) {
        const queueStats = stats[queueType as keyof typeof stats];
        queueStats.completed++;
      }
    }
  }

  // Count failed by queue type  
  if (Array.isArray(state.failed)) {
    for (const failed of state.failed) {
      const queueType = failed.issue?.queueType;
      if (queueType && (queueType in stats)) {
        const queueStats = stats[queueType as keyof typeof stats];
        queueStats.failed++;
      }
    }
  }

  return stats;
}