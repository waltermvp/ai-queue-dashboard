import { NextRequest, NextResponse } from 'next/server'
import { readFile, readdir, stat } from 'fs/promises'
import { execSync } from 'child_process'
import { join } from 'path'

// Use the same Node 20 that Next.js runs under
const NODE_BIN = process.execPath
const DB_API = join(process.cwd(), 'scripts', 'db-api.js')

function queryDB(args: string): any {
  try {
    const result = execSync(`"${NODE_BIN}" "${DB_API}" ${args}`, { timeout: 5000, encoding: 'utf-8' })
    return JSON.parse(result)
  } catch {
    return null
  }
}

function parseLabels(labels: string | null): string[] {
  if (!labels) return []
  try { return JSON.parse(labels) } catch { return labels.split(',').map(s => s.trim()) }
}

async function getArtifacts(issueId: string) {
  try {
    const artDir = join(process.cwd(), 'artifacts', issueId)
    await stat(artDir)
    const files = await readdir(artDir)
    const recordings = files.filter((f: string) => /\.(mp4|mov|webm)$/i.test(f))
    const logs = files.filter((f: string) => /\.(log|txt)$/i.test(f))
    if (recordings.length > 0 || logs.length > 0) {
      return { dir: `artifacts/${issueId}`, recordings, logs }
    }
  } catch {}
  return undefined
}

export async function GET(request: NextRequest) {
  try {
    // Live state from queue-state.json
    const queueStatePath = join(process.cwd(), 'queue-state.json')
    let liveState: any = { processing: null, queue: [] }
    try {
      const data = await readFile(queueStatePath, 'utf-8')
      liveState = JSON.parse(data)
    } catch {}

    // Historical data from SQLite
    const stats = queryDB('stats') || { totalRuns: 0, completed: 0, failed: 0, avgProcessingTime: 0, byType: {} }
    const recentCompleted = queryDB('history --status completed --limit 20') || []
    const recentFailed = queryDB('history --status failed --limit 20') || []

    const completed = await Promise.all(recentCompleted.map(async (r: any) => ({
      id: r.issue_id,
      title: r.title,
      repo: r.repo || '',
      completed: r.completed_at,
      completed_at: r.completed_at,
      type: r.type,
      labels: parseLabels(r.labels),
      priority: r.priority,
      processing_time_ms: r.processing_time_ms,
      model: r.model,
      pr_url: r.pr_url,
      github_url: r.github_url,
      artifacts: await getArtifacts(r.issue_id)
    })))

    const failed = recentFailed.map((r: any) => ({
      id: r.issue_id,
      title: r.title,
      repo: r.repo || '',
      failed: r.completed_at,
      failed_at: r.completed_at,
      type: r.type,
      error: r.error,
      labels: parseLabels(r.labels),
    }))

    return NextResponse.json({
      processing: liveState.processing || null,
      queue: liveState.queue || [],
      completed,
      failed,
      needs_clarification: liveState.needs_clarification || [],
      bug_confirmed: liveState.bug_confirmed || [],
      stats,
      lastUpdated: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error reading queue state:', error)
    return NextResponse.json({
      processing: null, completed: [], failed: [], queue: [],
      needs_clarification: [], bug_confirmed: [],
      stats: { totalRuns: 0, completed: 0, failed: 0, avgProcessingTime: 0, byType: {} }
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json()
    return NextResponse.json({ success: true, action })
  } catch (error) {
    console.error('Error updating queue state:', error)
    return NextResponse.json({ error: 'Failed to update queue state' }, { status: 500 })
  }
}
