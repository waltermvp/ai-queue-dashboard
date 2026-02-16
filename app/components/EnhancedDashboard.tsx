'use client'

import { useState, useEffect } from 'react'
import { 
  Play, 
  Pause, 
  RotateCcw, 
  CheckCircle, 
  XCircle, 
  Clock,
  GitBranch,
  Cpu,
  FileText,
  Plus,
  Zap,
  BookOpen,
  TestTube,
  TrendingUp,
  Settings
} from 'lucide-react'

// Types for the enhanced three-pillar system
interface QueueStats {
  total: number;
  ready: number;
  processing: number;
  blocked: number;
  completed: number;
  failed: number;
}

interface ModelConfig {
  primary: string;
  fallback?: string;
  temperature: number;
  maxTokens: number;
}

interface QueuedIssue {
  id: string;
  number: number;
  title: string;
  body: string;
  repository: string;
  queueType: 'feature' | 'content' | 'e2e';
  complexity: 'simple' | 'moderate' | 'complex';
  priority: 'low' | 'medium' | 'high';
  isReady: boolean;
  queuedAt: string;
  modelConfig?: ModelConfig;
}

interface ProcessingItem {
  issue: QueuedIssue;
  startedAt: string;
  modelUsed: string;
  progress?: string;
}

interface EnhancedQueueState {
  queues: {
    feature: QueuedIssue[];
    content: QueuedIssue[];
    e2e: QueuedIssue[];
  };
  processing: {
    feature: ProcessingItem | null;
    content: ProcessingItem | null;
    e2e: ProcessingItem | null;
  };
  completed: Array<{
    issue: QueuedIssue;
    completedAt: string;
    solution?: string;
    modelUsed: string;
    tokensUsed?: number;
  }>;
  failed: Array<{
    issue: QueuedIssue;
    failedAt: string;
    error: string;
    modelUsed?: string;
  }>;
  stats: {
    feature: QueueStats;
    content: QueueStats;
    e2e: QueueStats;
  };
  lastUpdated: string;
}

// Queue type configurations
const QUEUE_CONFIGS = {
  feature: {
    icon: '🚀',
    title: 'Feature Development',
    description: 'New functionality, APIs, integrations',
    color: 'blue',
    model: 'Qwen2.5-Coder:32b',
    tools: ['Aider', 'Continue.dev', 'GitHub'],
    bgGradient: 'from-blue-500 to-indigo-600'
  },
  content: {
    icon: '📝',
    title: 'Content Creation', 
    description: 'Documentation, guides, marketing',
    color: 'green',
    model: 'Qwen2.5-Coder:32b',
    tools: ['Repository Context', 'Style Guide'],
    bgGradient: 'from-green-500 to-emerald-600'
  },
  e2e: {
    icon: '🧪',
    title: 'E2E Testing',
    description: 'Quality assurance, test automation',
    color: 'purple',
    model: 'Qwen2.5-Coder:32b',
    tools: ['Maestro', 'Test Generator', 'Device Farm'],
    bgGradient: 'from-purple-500 to-violet-600'
  }
} as const;

const PRIORITY_COLORS = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-gray-100 text-gray-800 border-gray-200'
};

const COMPLEXITY_ICONS = {
  simple: '🟢',
  moderate: '🟡', 
  complex: '🔴'
};

export default function EnhancedDashboard() {
  const [queueState, setQueueState] = useState<EnhancedQueueState | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedQueue, setSelectedQueue] = useState<'all' | 'feature' | 'content' | 'e2e'>('all')

  const fetchQueueState = async () => {
    try {
      const response = await fetch('/api/enhanced-queue-state')
      const data = await response.json()
      setQueueState(data)
    } catch (error) {
      console.error('Failed to fetch enhanced queue state:', error)
    } finally {
      setLoading(false)
    }
  }

  const executeAction = async (action: string, queueType?: string) => {
    try {
      const response = await fetch('/api/enhanced-queue-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, queueType }),
      })
      const result = await response.json()
      console.log('Enhanced action result:', result)
      fetchQueueState() // Refresh state
    } catch (error) {
      console.error('Enhanced action failed:', error)
    }
  }

  useEffect(() => {
    fetchQueueState()
    // Refresh every 15 seconds for more responsive updates
    const interval = setInterval(fetchQueueState, 15000)
    return () => clearInterval(interval)
  }, [])

  const getTotalStats = (): QueueStats => {
    if (!queueState) return { total: 0, ready: 0, processing: 0, blocked: 0, completed: 0, failed: 0 };
    
    const { feature, content, e2e } = queueState.stats;
    return {
      total: feature.total + content.total + e2e.total,
      ready: feature.ready + content.ready + e2e.ready,
      processing: feature.processing + content.processing + e2e.processing,
      blocked: feature.blocked + content.blocked + e2e.blocked,
      completed: feature.completed + content.completed + e2e.completed,
      failed: feature.failed + content.failed + e2e.failed
    };
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading enhanced queue system...</span>
      </div>
    )
  }

  if (!queueState) {
    return (
      <div className="text-center text-gray-600">
        <XCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
        <h3 className="text-lg font-semibold mb-2">Failed to Load Enhanced Queue</h3>
        <p>Check if the enhanced queue worker is running</p>
      </div>
    )
  }

  const totalStats = getTotalStats();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-700 text-white p-6 rounded-xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">AI Queue Dashboard - Three Pillar System</h1>
            <p className="text-slate-300">Quality-first AI processing with specialized model routing</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{totalStats.total}</div>
            <div className="text-slate-300 text-sm">Total Issues</div>
          </div>
        </div>
      </div>

      {/* Three Pillar Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {(Object.keys(QUEUE_CONFIGS) as Array<keyof typeof QUEUE_CONFIGS>).map((queueType) => {
          const config = QUEUE_CONFIGS[queueType];
          const stats = queueState.stats[queueType];
          const processing = queueState.processing[queueType];
          
          return (
            <div
              key={queueType}
              className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${config.bgGradient} text-white p-6 cursor-pointer transition-transform hover:scale-105`}
              onClick={() => setSelectedQueue(selectedQueue === queueType ? 'all' : queueType)}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="text-4xl">{config.icon}</div>
                <div className="text-right">
                  <div className="text-2xl font-bold">{stats.total}</div>
                  <div className="text-sm opacity-90">queued</div>
                </div>
              </div>
              
              <h3 className="text-xl font-semibold mb-1">{config.title}</h3>
              <p className="text-sm opacity-90 mb-4">{config.description}</p>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Ready:</span>
                  <span className="font-semibold">{stats.ready}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Processing:</span>
                  <span className="font-semibold">{stats.processing}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Completed:</span>
                  <span className="font-semibold">{stats.completed}</span>
                </div>
              </div>

              {processing && (
                <div className="absolute top-4 right-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-white/20">
                <div className="flex items-center space-x-2 text-xs opacity-75">
                  <Cpu className="h-3 w-3" />
                  <span>{config.model}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="flex items-center">
            <Clock className="h-5 w-5 text-gray-500 mr-2" />
            <div>
              <div className="text-sm text-gray-600">Ready</div>
              <div className="font-semibold">{totalStats.ready}</div>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="flex items-center">
            <Cpu className="h-5 w-5 text-blue-500 mr-2" />
            <div>
              <div className="text-sm text-gray-600">Processing</div>
              <div className="font-semibold">{totalStats.processing}</div>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
            <div>
              <div className="text-sm text-gray-600">Completed</div>
              <div className="font-semibold">{totalStats.completed}</div>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="flex items-center">
            <XCircle className="h-5 w-5 text-red-500 mr-2" />
            <div>
              <div className="text-sm text-gray-600">Failed</div>
              <div className="font-semibold">{totalStats.failed}</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="flex items-center">
            <TrendingUp className="h-5 w-5 text-purple-500 mr-2" />
            <div>
              <div className="text-sm text-gray-600">Success Rate</div>
              <div className="font-semibold">
                {totalStats.completed + totalStats.failed > 0 
                  ? Math.round((totalStats.completed / (totalStats.completed + totalStats.failed)) * 100) 
                  : 0}%
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="flex items-center">
            <Settings className="h-5 w-5 text-gray-500 mr-2" />
            <div>
              <div className="text-sm text-gray-600">Last Updated</div>
              <div className="text-xs text-gray-500">
                {new Date(queueState.lastUpdated).toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Enhanced Queue Controls</h2>
          <div className="flex space-x-2">
            <button 
              onClick={() => executeAction('populate')}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus className="w-4 h-4 mr-2" />
              Load Issues
            </button>
            <button 
              onClick={() => executeAction('process')}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              disabled={totalStats.processing > 0}
            >
              <Play className="w-4 h-4 mr-2" />
              Process Next
            </button>
            <button 
              onClick={() => executeAction('cleanup')}
              className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Cleanup
            </button>
          </div>
        </div>

        {/* Queue Filter */}
        <div className="flex space-x-2">
          {['all', 'feature', 'content', 'e2e'].map((filter) => (
            <button
              key={filter}
              onClick={() => setSelectedQueue(filter as any)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                selectedQueue === filter
                  ? 'bg-blue-100 text-blue-700 border border-blue-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {filter === 'all' ? 'All Queues' : QUEUE_CONFIGS[filter as keyof typeof QUEUE_CONFIGS]?.title}
            </button>
          ))}
        </div>
      </div>

      {/* Active Processing */}
      {Object.entries(queueState.processing).some(([_, proc]) => proc) && (
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Currently Processing</h2>
          <div className="space-y-4">
            {Object.entries(queueState.processing).map(([queueType, processing]) => {
              if (!processing) return null;
              
              const config = QUEUE_CONFIGS[queueType as keyof typeof QUEUE_CONFIGS];
              const duration = Date.now() - new Date(processing.startedAt).getTime();
              const minutes = Math.floor(duration / 60000);
              const seconds = Math.floor((duration % 60000) / 1000);
              
              return (
                <div key={queueType} className="flex items-center space-x-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-2xl">{config.icon}</span>
                      <span className="font-semibold text-gray-900">{processing.issue.title}</span>
                    </div>
                    <div className="text-sm text-gray-600 space-x-4">
                      <span>Queue: {config.title}</span>
                      <span>Model: {processing.modelUsed}</span>
                      <span>Duration: {minutes}m {seconds}s</span>
                    </div>
                    {processing.progress && (
                      <div className="mt-2 text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded">
                        {processing.progress}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Queue Contents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Queued Issues */}
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Queued Issues 
            {selectedQueue !== 'all' && (
              <span className="ml-2 text-base font-normal text-gray-600">
                ({QUEUE_CONFIGS[selectedQueue]?.title})
              </span>
            )}
          </h2>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {Object.entries(queueState.queues)
              .filter(([queueType, _]) => selectedQueue === 'all' || selectedQueue === queueType)
              .flatMap(([queueType, queue]) => 
                queue.map(issue => ({ ...issue, queueType: queueType as keyof typeof QUEUE_CONFIGS }))
              )
              .sort((a, b) => {
                const priorityOrder = { high: 3, medium: 2, low: 1 };
                return priorityOrder[b.priority] - priorityOrder[a.priority];
              })
              .map((issue) => {
                const config = QUEUE_CONFIGS[issue.queueType];
                
                return (
                  <div key={issue.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-lg">{config.icon}</span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${PRIORITY_COLORS[issue.priority]}`}>
                          {issue.priority}
                        </span>
                        <span className="text-lg">{COMPLEXITY_ICONS[issue.complexity]}</span>
                        <span className="font-medium text-gray-900 truncate">{issue.title}</span>
                      </div>
                      <div className="flex items-center space-x-3 text-xs text-gray-500">
                        <span className="flex items-center">
                          <GitBranch className="h-3 w-3 mr-1" />
                          {issue.repository}
                        </span>
                        <span>#{issue.number}</span>
                        <span>{config.title}</span>
                        <span>Queued: {new Date(issue.queuedAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => window.open(`https://github.com/${issue.repository}/issues/${issue.number}`, '_blank')}
                      className="text-blue-600 hover:text-blue-700 ml-2"
                    >
                      <GitBranch className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            
            {Object.values(queueState.queues).every(queue => queue.length === 0) && (
              <p className="text-gray-500 text-center py-8">No issues in queue</p>
            )}
          </div>
        </div>

        {/* Recent Completions */}
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Completions</h2>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {queueState.completed.slice(0, 10).map((completed) => {
              const config = QUEUE_CONFIGS[completed.issue.queueType];
              const processingTime = completed.issue.queuedAt ? 
                new Date(completed.completedAt).getTime() - new Date(completed.issue.queuedAt).getTime() : 0;
              const minutes = Math.floor(processingTime / 60000);
              const seconds = Math.floor((processingTime % 60000) / 1000);
              
              return (
                <div key={completed.issue.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-lg">{config.icon}</span>
                      <span className="font-medium text-gray-900 truncate">{completed.issue.title}</span>
                    </div>
                    <div className="flex items-center space-x-3 text-xs text-gray-500">
                      <span>{config.title}</span>
                      <span>Model: {completed.modelUsed}</span>
                      {completed.tokensUsed && <span>{completed.tokensUsed.toLocaleString()} tokens</span>}
                      <span>Time: {minutes}m {seconds}s</span>
                      <span>{new Date(completed.completedAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    {completed.solution && (
                      <button 
                        className="text-blue-600 hover:text-blue-700"
                        title="View Solution"
                      >
                        <FileText className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => window.open(`https://github.com/${completed.issue.repository}/issues/${completed.issue.number}`, '_blank')}
                      className="text-blue-600 hover:text-blue-700"
                      title="View on GitHub"
                    >
                      <GitBranch className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
            
            {queueState.completed.length === 0 && (
              <p className="text-gray-500 text-center py-8">No completed issues yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Failed Issues (if any) */}
      {queueState.failed.length > 0 && (
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 text-red-600">Failed Issues</h2>
          
          <div className="space-y-3">
            {queueState.failed.slice(0, 5).map((failed) => {
              const config = QUEUE_CONFIGS[failed.issue.queueType];
              
              return (
                <div key={failed.issue.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <XCircle className="h-4 w-4 text-red-600" />
                      <span className="text-lg">{config.icon}</span>
                      <span className="font-medium text-gray-900">{failed.issue.title}</span>
                    </div>
                    <div className="text-xs text-gray-600 mb-1">
                      {config.title} • {failed.modelUsed || 'Unknown Model'} • {new Date(failed.failedAt).toLocaleString()}
                    </div>
                    <div className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded">
                      Error: {failed.error}
                    </div>
                  </div>
                  <button 
                    onClick={() => executeAction('retry', failed.issue.id)}
                    className="text-orange-600 hover:text-orange-700 ml-2"
                    title="Retry Issue"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  )
}