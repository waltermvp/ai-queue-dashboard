import { NextRequest, NextResponse } from 'next/server'
import { readFile, readdir, stat } from 'fs/promises'
import { join } from 'path'
import Database from 'better-sqlite3'

const DB_PATH = join(process.cwd(), 'queue-history.db')

function getDB() {
  const db = new Database(DB_PATH, { readonly: true })
  db.pragma('journal_mode = WAL')
  return db
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
    const logs = files.filter((f: string) => /\.(log|txt|patch|md|json)$/i.test(f))
    if (recordings.length > 0 || logs.length > 0) {
      return { dir: `artifacts/${issueId}`, recordings, logs }
    }
  } catch {}
  return undefined
}

export async function GET(request: NextRequest) {
  let db: ReturnType<typeof getDB> | null = null
  try {
    db = getDB()

    // Queue items from SQLite (single source of truth)
    const queuedRows = db.prepare(
      `SELECT * FROM queue_items WHERE status = 'queued' ORDER BY
        CASE priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC, added_at ASC`
    ).all() as any[]

    const processingRow = db.prepare("SELECT * FROM queue_items WHERE status = 'processing' LIMIT 1").get() as any

    // Historical data from runs table
    const recentCompleted = db.prepare(
      "SELECT * FROM runs WHERE status = 'completed' ORDER BY id DESC LIMIT 20"
    ).all() as any[]

    const recentFailed = db.prepare(
      "SELECT * FROM runs WHERE status = 'failed' ORDER BY id DESC LIMIT 20"
    ).all() as any[]

    const prOpenRows = db.prepare(
      "SELECT * FROM queue_items WHERE status = 'pr_open' ORDER BY completed_at DESC LIMIT 50"
    ).all() as any[]

    const mergedRows = db.prepare(
      "SELECT * FROM queue_items WHERE status = 'merged' ORDER BY completed_at DESC LIMIT 50"
    ).all() as any[]

    // Stats
    const total = (db.prepare('SELECT COUNT(*) as count FROM runs').get() as any).count
    const completedCount = (db.prepare("SELECT COUNT(*) as count FROM runs WHERE status = 'completed'").get() as any).count
    const failedCount = (db.prepare("SELECT COUNT(*) as count FROM runs WHERE status = 'failed'").get() as any).count
    const avg = (db.prepare("SELECT AVG(processing_time_ms) as avg FROM runs WHERE status = 'completed' AND processing_time_ms IS NOT NULL").get() as any).avg
    const byType = db.prepare("SELECT type, COUNT(*) as count FROM runs GROUP BY type").all() as any[]

    const stats = {
      totalRuns: total,
      completed: completedCount,
      failed: failedCount,
      avgProcessingTime: Math.round(avg || 0),
      byType: byType.reduce((acc: any, r: any) => { acc[r.type] = r.count; return acc }, {})
    }

    const toQueueItem = (row: any) => ({
      issueNumber: row.issue_number,
      repo: row.repo || '',
      title: row.title,
      labels: parseLabels(row.labels),
      priority: row.priority || 'medium',
      addedAt: row.added_at,
      url: row.url,
    })

    const queue = queuedRows.map(toQueueItem)
    const processing = processingRow ? { ...toQueueItem(processingRow), started_at: processingRow.started_at } : null

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
      error_class: r.error_class,
      labels: parseLabels(r.labels),
    }))

    const pr_open = prOpenRows.map((r: any) => ({
      issueNumber: r.issue_number,
      repo: r.repo || '',
      title: r.title,
      labels: parseLabels(r.labels),
      priority: r.priority || 'medium',
      url: r.url,
      completed_at: r.completed_at,
      pr_url: r.pr_url,
      pr_number: r.pr_number,
    }))

    const merged = mergedRows.map((r: any) => ({
      issueNumber: r.issue_number,
      repo: r.repo || '',
      title: r.title,
      labels: parseLabels(r.labels),
      priority: r.priority || 'medium',
      url: r.url,
      completed_at: r.completed_at,
      pr_url: r.pr_url,
      pr_number: r.pr_number,
    }))

    return NextResponse.json({
      processing,
      queue,
      completed,
      failed,
      pr_open,
      merged,
      needs_clarification: [],
      bug_confirmed: [],
      stats,
      lastUpdated: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error reading queue state:', error)
    // Fallback to queue-state.json if SQLite fails
    try {
      const data = await readFile(join(process.cwd(), 'queue-state.json'), 'utf-8')
      const state = JSON.parse(data)
      return NextResponse.json({
        processing: state.processing || null,
        queue: state.queue || [],
        completed: state.completed || [],
        failed: state.failed || [],
        needs_clarification: [],
        bug_confirmed: [],
        stats: { totalRuns: 0, completed: 0, failed: 0, avgProcessingTime: 0, byType: {} },
        lastUpdated: new Date().toISOString()
      })
    } catch {
      return NextResponse.json({
        processing: null, completed: [], failed: [], queue: [],
        needs_clarification: [], bug_confirmed: [],
        stats: { totalRuns: 0, completed: 0, failed: 0, avgProcessingTime: 0, byType: {} }
      })
    }
  } finally {
    if (db) try { db.close() } catch {}
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
