import { NextResponse } from 'next/server'
import { execFileSync } from 'child_process'
import path from 'path'

const NODE_BIN = process.execPath
const workerScript = path.join(process.cwd(), 'scripts', 'queue-worker.js')

export async function GET() {
  try {
    // Get open issues from GitHub
    const raw = execFileSync('gh', [
      'issue', 'list',
      '--repo', 'epiphanyapps/MapYourHealth',
      '--state', 'open',
      '--json', 'number,title,labels,createdAt',
      '--limit', '50'
    ], { encoding: 'utf8' })

    const issues = JSON.parse(raw)

    // Get currently tracked issue numbers from queue state
    const stateRaw = execFileSync(NODE_BIN, [workerScript, 'status'], { encoding: 'utf8' })
    // Parse tracked numbers from the queue-state.json directly
    let tracked = new Set<number>()
    try {
      const fs = require('fs')
      const statePath = path.join(process.cwd(), 'queue-state.json')
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
      for (const item of state.queue || []) tracked.add(Number(item.issueNumber || item.number))
      if (state.processing) tracked.add(Number(state.processing.issueNumber || state.processing.number))
      for (const item of state.completed || []) tracked.add(Number(item.issueNumber || item.number))
      for (const item of state.failed || []) tracked.add(Number(item.issueNumber || item.number))
    } catch {}

    const result = issues.map((issue: any) => ({
      number: issue.number,
      title: issue.title,
      labels: (issue.labels || []).map((l: any) => typeof l === 'string' ? l : l.name || ''),
      createdAt: issue.createdAt,
      alreadyQueued: tracked.has(issue.number)
    }))

    return NextResponse.json({ issues: result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
