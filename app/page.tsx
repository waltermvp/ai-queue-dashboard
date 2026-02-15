'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
  Terminal,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Film,
  Download
} from 'lucide-react'

interface ProcessingItem {
  id: string
  title: string
  repo: string
  url: string
  priority: string
  labels: string[]
  created_at: string
  started_at: string
}

interface QueueState {
  processing: ProcessingItem | null
  completed: Array<{
    id: string
    title: string
    repo: string
    completed: string
    completed_at?: string
    resolution?: string
    artifacts?: {
      dir: string
      recordings: string[]
      logs: string[]
    }
  }>
  failed: Array<{
    id: string
    title: string
    repo: string
    failed: string
    failed_at?: string
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
    priority?: string
    labels?: string[]
  }>
}

function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState('')

  useEffect(() => {
    const update = () => {
      const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
      if (diff < 0) { setElapsed('0s'); return }
      const h = Math.floor(diff / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      if (h > 0) setElapsed(`${h}h ${m}m ${s}s`)
      else if (m > 0) setElapsed(`${m}m ${s}s`)
      else setElapsed(`${s}s`)
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  return <span className="text-primary-600 font-mono font-semibold">{elapsed}</span>
}

function LabelBadge({ label }: { label: string }) {
  const l = label.toLowerCase()
  let classes = 'px-2 py-0.5 text-xs rounded-full font-medium '
  if (l === 'e2e') classes += 'bg-blue-100 text-blue-800'
  else if (l === 'content') classes += 'bg-green-100 text-green-800'
  else classes += 'bg-gray-100 text-gray-800'
  return <span className={classes}>{label}</span>
}

function PriorityBadge({ priority }: { priority: string }) {
  const p = priority.toLowerCase()
  let classes = 'px-2 py-0.5 text-xs rounded-full font-medium '
  if (p === 'high') classes += 'bg-red-100 text-red-800'
  else if (p === 'medium') classes += 'bg-yellow-100 text-yellow-800'
  else classes += 'bg-gray-100 text-gray-600'
  return <span className={classes}>{priority}</span>
}

function ArtifactsPanel({ artifacts }: { artifacts: { dir: string; recordings: string[]; logs: string[] } }) {
  const [expanded, setExpanded] = useState(false)
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const [logContent, setLogContent] = useState<Record<string, string>>({})

  const loadLog = async (logFile: string) => {
    if (logContent[logFile]) {
      setExpandedLog(expandedLog === logFile ? null : logFile)
      return
    }
    try {
      const res = await fetch(`/api/artifacts/${artifacts.dir.replace('artifacts/', '')}/${logFile}`)
      const text = await res.text()
      setLogContent(prev => ({ ...prev, [logFile]: text }))
      setExpandedLog(logFile)
    } catch {
      setLogContent(prev => ({ ...prev, [logFile]: 'Failed to load log' }))
      setExpandedLog(logFile)
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center space-x-1 text-xs text-purple-600 hover:text-purple-800"
      >
        <Film className="w-3 h-3" />
        <span>Artifacts</span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {expanded && (
        <div className="mt-2 space-y-2 pl-2 border-l-2 border-purple-200">
          {artifacts.recordings.map((rec) => (
            <div key={rec} className="space-y-1">
              <div className="flex items-center space-x-2">
                <Film className="w-3 h-3 text-purple-500" />
                <span className="text-xs text-gray-700">{rec}</span>
                <a
                  href={`/api/artifacts/${artifacts.dir.replace('artifacts/', '')}/${rec}`}
                  download={rec}
                  className="text-purple-600 hover:text-purple-800"
                >
                  <Download className="w-3 h-3" />
                </a>
              </div>
              <video
                src={`/api/artifacts/${artifacts.dir.replace('artifacts/', '')}/${rec}`}
                controls
                className="max-w-full rounded-lg"
                style={{ maxHeight: '300px' }}
              />
            </div>
          ))}
          {artifacts.logs.map((logFile) => (
            <div key={logFile}>
              <div className="flex items-center space-x-2">
                <FileText className="w-3 h-3 text-gray-500" />
                <button
                  onClick={() => loadLog(logFile)}
                  className="text-xs text-gray-700 hover:text-gray-900 flex items-center space-x-1"
                >
                  <span>{logFile}</span>
                  {expandedLog === logFile ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                <a
                  href={`/api/artifacts/${artifacts.dir.replace('artifacts/', '')}/${logFile}`}
                  download={logFile}
                  className="text-purple-600 hover:text-purple-800"
                >
                  <Download className="w-3 h-3" />
                </a>
              </div>
              {expandedLog === logFile && logContent[logFile] && (
                <pre className="mt-1 bg-gray-900 text-green-400 text-xs p-2 rounded max-h-48 overflow-y-auto font-mono">
                  {logContent[logFile]}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [queueState, setQueueState] = useState<QueueState | null>(null)
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<string[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  const isProcessing = !!queueState?.processing

  // Helper function to detect if issue is likely a bug
  const isBugReport = (title: string) => {
    return /bug|error|broken|fail|doesn'?t work|not working|crash|exception|undefined|null/i.test(title)
  }

  const fetchQueueState = useCallback(async () => {
    try {
      const response = await fetch('/api/queue-state')
      const data = await response.json()
      setQueueState(data)
    } catch (error) {
      console.error('Failed to fetch queue state:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchLogs = useCallback(async () => {
    try {
      const response = await fetch('/api/queue-logs')
      const data = await response.json()
      setLogs(data.lines || [])
    } catch (error) {
      console.error('Failed to fetch logs:', error)
    }
  }, [])

  const executeAction = async (action: string) => {
    try {
      const response = await fetch('/api/queue-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const result = await response.json()
      console.log('Action result:', result)
      fetchQueueState()
    } catch (error) {
      console.error('Action failed:', error)
    }
  }

  // Dynamic refresh: 5s when processing, 30s when idle
  useEffect(() => {
    fetchQueueState()
    const interval = setInterval(fetchQueueState, isProcessing ? 5000 : 30000)
    return () => clearInterval(interval)
  }, [isProcessing, fetchQueueState])

  // Log fetching: every 5s while processing and logs visible
  useEffect(() => {
    if (showLogs) {
      fetchLogs()
      const interval = setInterval(fetchLogs, 5000)
      return () => clearInterval(interval)
    }
  }, [showLogs, fetchLogs])

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

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
                {isProcessing ? '1' : '0'}
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
              disabled={isProcessing}
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
      {queueState.processing && (
        <div className="card border-l-4 border-primary-500">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Currently Processing</h2>
          <div className="flex items-start space-x-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mt-1 flex-shrink-0"></div>
            <div className="flex-1">
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <a
                  href={queueState.processing.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-gray-900 hover:text-primary-600 flex items-center space-x-1"
                >
                  <span>{queueState.processing.title}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <PriorityBadge priority={queueState.processing.priority} />
                {(queueState.processing.labels || []).map((label) => (
                  <LabelBadge key={label} label={label} />
                ))}
              </div>
              <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                <div className="flex items-center space-x-1">
                  <GitBranch className="w-3 h-3" />
                  <span>{queueState.processing.repo}</span>
                </div>
                <span>•</span>
                <span>Elapsed: <ElapsedTimer startedAt={queueState.processing.started_at} /></span>
              </div>
            </div>
          </div>

          {/* Log viewer toggle */}
          <div className="mt-4">
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-900"
            >
              <Terminal className="w-4 h-4" />
              <span>{showLogs ? 'Hide' : 'Show'} Logs</span>
              {showLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {/* Log panel */}
          {showLogs && (
            <div className="mt-3 bg-gray-900 rounded-lg p-4 max-h-80 overflow-y-auto font-mono text-xs text-green-400">
              {logs.length === 0 ? (
                <p className="text-gray-500">No logs yet...</p>
              ) : (
                logs.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      )}

      {/* Show logs button even when not processing (for history) */}
      {!queueState.processing && (
        <div className="card">
          <button
            onClick={() => { setShowLogs(!showLogs); if (!showLogs) fetchLogs(); }}
            className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-900"
          >
            <Terminal className="w-4 h-4" />
            <span>{showLogs ? 'Hide' : 'Show'} Worker Logs</span>
            {showLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showLogs && (
            <div className="mt-3 bg-gray-900 rounded-lg p-4 max-h-80 overflow-y-auto font-mono text-xs text-green-400">
              {logs.length === 0 ? (
                <p className="text-gray-500">No logs yet...</p>
              ) : (
                logs.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          )}
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
                      {issue.priority && <PriorityBadge priority={issue.priority} />}
                      {(issue.labels || []).map((label) => (
                        <LabelBadge key={label} label={label} />
                      ))}
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
                <div key={issue.id} className="p-3 bg-success-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="w-4 h-4 text-success-600" />
                        <span className="text-sm font-medium text-gray-900">{issue.id}</span>
                        {issue.artifacts && <Film className="w-3.5 h-3.5 text-purple-500" title="Has recordings" />}
                        {issue.resolution === 'not_a_bug' && (
                          <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">
                            Not a Bug
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{issue.title}</p>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-xs text-gray-500">
                          {issue.resolution === 'not_a_bug' ? 'Analyzed' : 'Completed'}: {new Date(issue.completed_at || issue.completed).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <button className="text-sm text-primary-600 hover:text-primary-700">
                      <FileText className="w-4 h-4" />
                    </button>
                  </div>
                  {issue.artifacts && <ArtifactsPanel artifacts={issue.artifacts} />}
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
          <h2 className="text-lg font-medium text-gray-900 mb-4">🐛 Confirmed Bugs Ready for Fix</h2>
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
                      Failed: {new Date(issue.failed_at || issue.failed).toLocaleString()}
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
