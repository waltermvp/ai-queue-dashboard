import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

const SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'enhanced-queue-worker.js');

export async function POST(request: Request) {
  try {
    const { action, queueType } = await request.json();
    
    let command: string;
    let description: string;

    switch (action) {
      case 'populate':
        command = `node "${SCRIPT_PATH}" populate`;
        description = 'Loading issues from GitHub repositories';
        break;
      
      case 'process':
        if (queueType) {
          // Process specific queue type
          command = `node "${SCRIPT_PATH}" process --queue=${queueType}`;
          description = `Processing next ${queueType} issue`;
        } else {
          // Process next from any queue
          command = `node "${SCRIPT_PATH}" process`;
          description = 'Processing next issue from any queue';
        }
        break;
      
      case 'cleanup':
        command = `node "${SCRIPT_PATH}" cleanup`;
        description = 'Cleaning up completed and failed items';
        break;
      
      case 'status':
        command = `node "${SCRIPT_PATH}" status`;
        description = 'Getting queue status';
        break;
      
      case 'retry':
        if (!queueType) {
          return NextResponse.json(
            { success: false, error: 'Issue ID required for retry' },
            { status: 400 }
          );
        }
        command = `node "${SCRIPT_PATH}" retry ${queueType}`;
        description = `Retrying failed issue ${queueType}`;
        break;

      case 'start-watch':
        command = `node "${SCRIPT_PATH}" watch 30000`;
        description = 'Starting continuous queue processing';
        break;

      case 'stop-watch':
        // Kill any running watch processes
        command = 'pkill -f "enhanced-queue-worker.js watch"';
        description = 'Stopping queue watcher';
        break;

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    console.log(`🚀 Executing enhanced queue action: ${description}`);
    console.log(`📝 Command: ${command}`);

    // Execute the command
    const { stdout, stderr } = await execAsync(command, {
      timeout: 60000, // 1 minute timeout
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production'
      }
    });

    let result: any = {
      success: true,
      action,
      queueType,
      description,
      output: stdout || 'Command executed successfully',
      timestamp: new Date().toISOString()
    };

    // Parse specific outputs for structured responses
    if (action === 'status' && stdout) {
      try {
        // Try to parse JSON output from status command
        const statusMatch = stdout.match(/ENHANCED QUEUE STATUS:([\s\S]*?)(?:Last Updated|$)/);
        if (statusMatch) {
          result.statusOutput = statusMatch[1].trim();
        }
      } catch (parseError) {
        // Keep raw output if parsing fails
        console.warn('Could not parse status output:', parseError);
      }
    }

    if (stderr && stderr.trim()) {
      console.warn('Enhanced queue worker stderr:', stderr);
      result.warnings = stderr.trim();
    }

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Enhanced queue action failed:', error);
    
    let errorMessage = error.message || 'Unknown error occurred';
    let statusCode = 500;

    // Handle specific error types
    if (error.code === 'ENOENT') {
      errorMessage = 'Enhanced queue worker script not found. Please ensure the script exists and is executable.';
      statusCode = 404;
    } else if (error.signal === 'SIGTERM' || error.killed) {
      errorMessage = 'Command timed out. The operation may still be running in the background.';
      statusCode = 408;
    } else if (error.code === 'EACCES') {
      errorMessage = 'Permission denied. Please ensure the script has execute permissions.';
      statusCode = 403;
    }

    return NextResponse.json(
      { 
        success: false, 
        error: errorMessage,
        code: error.code,
        signal: error.signal,
        timestamp: new Date().toISOString()
      },
      { status: statusCode }
    );
  }
}

export async function GET() {
  // Return available actions and their descriptions
  const actions = {
    populate: {
      description: 'Load issues from GitHub repositories',
      parameters: [],
      example: 'POST /api/enhanced-queue-action with { "action": "populate" }'
    },
    process: {
      description: 'Process next issue from queue(s)',
      parameters: ['queueType (optional): feature|content|e2e'],
      example: 'POST /api/enhanced-queue-action with { "action": "process", "queueType": "feature" }'
    },
    cleanup: {
      description: 'Clean up completed and failed items',
      parameters: [],
      example: 'POST /api/enhanced-queue-action with { "action": "cleanup" }'
    },
    status: {
      description: 'Get current queue statistics',
      parameters: [],
      example: 'POST /api/enhanced-queue-action with { "action": "status" }'
    },
    retry: {
      description: 'Retry a failed issue',
      parameters: ['queueType (required): issue ID to retry'],
      example: 'POST /api/enhanced-queue-action with { "action": "retry", "queueType": "issue-123" }'
    },
    'start-watch': {
      description: 'Start continuous queue processing',
      parameters: [],
      example: 'POST /api/enhanced-queue-action with { "action": "start-watch" }'
    },
    'stop-watch': {
      description: 'Stop continuous queue processing',
      parameters: [],
      example: 'POST /api/enhanced-queue-action with { "action": "stop-watch" }'
    }
  };

  return NextResponse.json({
    name: 'Enhanced Queue Action API',
    description: 'Control the three-pillar AI queue system (Feature, Content, E2E)',
    version: '1.0.0',
    actions,
    queueTypes: {
      feature: {
        icon: '🚀',
        title: 'Feature Development',
        description: 'New functionality, APIs, integrations',
        model: 'Qwen2.5-Coder:32b',
        tools: ['Aider', 'Continue.dev', 'GitHub']
      },
      content: {
        icon: '📝', 
        title: 'Content Creation',
        description: 'Documentation, guides, marketing',
        model: 'Qwen2.5-Coder:32b',
        tools: ['Repository Context', 'Style Guide']
      },
      e2e: {
        icon: '🧪',
        title: 'E2E Testing', 
        description: 'Quality assurance, test automation',
        model: 'Qwen2.5-Coder:32b',
        tools: ['Maestro', 'Test Generator', 'Device Farm']
      }
    },
    endpoints: {
      state: '/api/enhanced-queue-state',
      actions: '/api/enhanced-queue-action'
    }
  });
}