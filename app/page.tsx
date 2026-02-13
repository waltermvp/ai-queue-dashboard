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
  Plus
} from 'lucide-react'

interface QueueState {
  current_issue: {
    id: string
    started: string
  } | null
  processing: boolean
  completed: Array<{
    id: string
    title: string
    repo: string
    completed: string
    resolution?: string
  }>
  failed: Array<{
    id: string
    title: string
    repo: string
    failed: string
  }>
  needs_clarification: Array<{
    id: string
    title: string
    repo: string
    rejected: string
    reason: string
  }>
  bug_confirmed: Array<{
    id: string
    title: string
    repo: string
    confirmed: string
  }>
  queue: Array<{
    id: string
    title: string
    repo: string
    number: string
    added: string
  }>
}

export default function Dashboard() {
  const [queueState, setQueueState] = useState<QueueState | null>(null)
  const [loading, setLoading] = useState(true)
  const [processingOutput, setProcessingOutput] = useState('')

  // Helper function to detect if issue is likely a bug
  const isBugReport = (title: string) => {
    return /bug|error|broken|fail|doesn'?t work|not working|crash|exception|undefined|null/i.test(title)
  }

  const fetchQueueState = async () => {
    try {
      const response = await fetch('/api/queue-state')
      const data = await response.json()
      setQueueState(data)
    } catch (error) {
      console.error('Failed to fetch queue state:', error)
    } finally {
      setLoading(false)
    }
  }

  const executeAction = async (action: string) => {
    try {
      const response = await fetch('/api/queue-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const result = await response.json()
      console.log('Action result:', result)
      fetchQueueState() // Refresh state
    } catch (error) {
      console.error('Action failed:', error)
    }
  }

  useEffect(() => {
    fetchQueueState()
    // Refresh every 30 seconds
    const interval = setInterval(fetchQueueState, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        <span className="ml-2 text-gray-600">Loading queue status...</span>
      </div>
    )
  }

  if (!queueState) {
    return (
      <div className="text-center text-gray-600">
        Failed to load queue state
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Clock className="h-8 w-8 text-primary-600" />
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-900">Queued</h3>
              <p className="text-2xl font-semibold text-gray-900">{queueState.queue.length}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Cpu className="h-8 w-8 text-warning-600" />
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-900">Processing</h3>
              <p className="text-2xl font-semibold text-gray-900">
                {queueState.processing ? '1' : '0'}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CheckCircle className="h-8 w-8 text-success-600" />
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-900">Completed</h3>
              <p className="text-2xl font-semibold text-gray-900">{queueState.completed.length}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-8 w-8 text-orange-600 flex items-center justify-center">🐛</div>
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-900">Bug Confirmed</h3>
              <p className="text-2xl font-semibold text-gray-900">{queueState.bug_confirmed?.length || 0}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <XCircle className="h-8 w-8 text-danger-600" />
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-900">Failed</h3>
              <p className="text-2xl font-semibold text-gray-900">{queueState.failed.length}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 text-success-500 flex items-center justify-center">
                🐛
              </div>
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-900">Bugs Confirmed</h3>
              <p className="text-2xl font-semibold text-gray-900">{queueState.bug_confirmed?.length || 0}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <FileText className="h-8 w-8 text-warning-500" />
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-900">Needs Clarification</h3>
              <p className="text-2xl font-semibold text-gray-900">{queueState.needs_clarification?.length || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">Queue Controls</h2>
          <div className="flex space-x-2">
            <button 
              onClick={() => executeAction('populate')}
              className="btn-primary"
            >
              <Plus className="w-4 h-4 mr-2" />
              Load Issues
            </button>
            <button 
              onClick={() => executeAction('process-one')}
              className="btn-success"
              disabled={queueState.processing}
            >
              <Play className="w-4 h-4 mr-2" />
              Process One
            </button>
            <button 
              onClick={() => executeAction('cleanup')}
              className="btn-warning"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Cleanup
            </button>
          </div>
        </div>
      </div>

      {/* Current Processing */}
      {queueState.current_issue && (
        <div className="card">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Currently Processing</h2>
          <div className="flex items-center space-x-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
            <div>
              <p className="font-medium text-gray-900">{queueState.current_issue.id}</p>
              <p className="text-sm text-gray-500">
                Started: {new Date(queueState.current_issue.started).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Queue List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Issues */}
        <div className="card">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Pending Issues</h2>
          <div className="space-y-3">
            {queueState.queue.length > 0 ? (
              queueState.queue.map((issue, index) => (
                <div key={issue.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="badge-primary">#{index + 1}</span>
                      {isBugReport(issue.title) ? (
                        <div className="flex items-center space-x-1">
                          <span className="text-orange-600">🐛</span>
                          <span className="px-1 py-0.5 text-xs bg-orange-100 text-orange-800 rounded">Bug</span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1">
                          <span className="text-blue-600">✨</span>
                          <span className="px-1 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">Feature</span>
                        </div>
                      )}
                      <span className="text-sm font-medium text-gray-900">{issue.id}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{issue.title}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <GitBranch className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-500">{issue.repo}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">No issues in queue</p>
            )}
          </div>
        </div>

        {/* Completed Issues */}
        <div className="card">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Completed Issues</h2>
          <div className="space-y-3">
            {queueState.completed.length > 0 ? (
              queueState.completed.map((issue) => (
                <div key={issue.id} className="flex items-center justify-between p-3 bg-success-50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4 text-success-600" />
                      <span className="text-sm font-medium text-gray-900">{issue.id}</span>
                      {issue.resolution === 'not_a_bug' && (
                        <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">
                          Not a Bug
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{issue.title}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-xs text-gray-500">
                        {issue.resolution === 'not_a_bug' ? 'Analyzed' : 'Completed'}: {new Date(issue.completed).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <button className="text-sm text-primary-600 hover:text-primary-700">
                    <FileText className="w-4 h-4" />
                  </button>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">No completed issues yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Confirmed Bugs */}
      {queueState.bug_confirmed && queueState.bug_confirmed.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Bugs Confirmed & Ready for Fix</h2>
          <div className="space-y-3">
            {queueState.bug_confirmed.map((issue) => (
              <div key={issue.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border-l-4 border-green-400">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <div className="text-green-600">🐛</div>
                    <span className="text-sm font-medium text-gray-900">{issue.id}</span>
                    <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                      Bug Confirmed
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{issue.title}</p>
                  <div className="flex items-center space-x-2 mt-1">
                    <GitBranch className="w-3 h-3 text-gray-400" />
                    <span className="text-xs text-gray-500">{issue.repo}</span>
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-xs text-gray-500">
                      Confirmed: {new Date(issue.confirmed).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-green-700 mt-2">
                    ✅ Bug validated and ready for AI solution generation
                  </p>
                </div>
                <button 
                  onClick={() => window.open(`https://github.com/${issue.repo}/issues/${issue.id.split('-').pop()}`, '_blank')}
                  className="text-sm text-primary-600 hover:text-primary-700 ml-4"
                  title="View on GitHub"
                >
                  <GitBranch className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Failed Issues */}
      {queueState.failed.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Failed Issues</h2>
          <div className="space-y-3">
            {queueState.failed.map((issue) => (
              <div key={issue.id} className="flex items-center justify-between p-3 bg-danger-50 rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <XCircle className="w-4 h-4 text-danger-600" />
                    <span className="text-sm font-medium text-gray-900">{issue.id}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{issue.title}</p>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-xs text-gray-500">
                      Failed: {new Date(issue.failed).toLocaleString()}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => executeAction('retry')}
                  className="text-sm text-warning-600 hover:text-warning-700"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmed Bugs */}
      {queueState.bug_confirmed && queueState.bug_confirmed.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-medium text-gray-900 mb-4">🐛 Confirmed Bugs Ready for Fix</h2>
          <div className="space-y-3">
            {queueState.bug_confirmed.map((issue) => (
              <div key={issue.id} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border-l-4 border-orange-400">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <div className="text-orange-600">🐛</div>
                    <span className="text-sm font-medium text-gray-900">{issue.id}</span>
                    <span className="px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded-full">
                      Bug Confirmed
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{issue.title}</p>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-xs text-gray-500">
                      Confirmed: {new Date(issue.confirmed).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-orange-700 mt-2">
                    ✅ Bug validated and ready for AI solution generation
                  </p>
                </div>
                <button 
                  onClick={() => window.open(`https://github.com/${issue.repo}/issues/${issue.id.split('-').pop()}`, '_blank')}
                  className="text-sm text-primary-600 hover:text-primary-700 ml-4"
                  title="View on GitHub"
                >
                  <GitBranch className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Issues Needing Clarification */}
      {queueState.needs_clarification && queueState.needs_clarification.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Issues Needing Clarification</h2>
          <div className="space-y-3">
            {queueState.needs_clarification.map((issue) => (
              <div key={issue.id} className="flex items-center justify-between p-3 bg-warning-50 rounded-lg border-l-4 border-warning-400">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-warning-600" />
                    <span className="text-sm font-medium text-gray-900">{issue.id}</span>
                    <span className="px-2 py-1 text-xs bg-warning-100 text-warning-800 rounded-full">
                      More Info Needed
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{issue.title}</p>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-xs text-gray-500">
                      Rejected: {new Date(issue.rejected).toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-xs text-gray-500">
                      Reason: {issue.reason || 'insufficient_detail'}
                    </span>
                  </div>
                  <p className="text-xs text-warning-700 mt-2">
                    💡 AI feedback posted to GitHub issue - update with requested details to retry
                  </p>
                </div>
                <button 
                  onClick={() => window.open(`https://github.com/${issue.repo}/issues/${issue.id.split('-').pop()}`, '_blank')}
                  className="text-sm text-primary-600 hover:text-primary-700 ml-4"
                  title="View on GitHub"
                >
                  <GitBranch className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}