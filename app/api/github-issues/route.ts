import { NextResponse } from 'next/server'
import { execFileSync } from 'child_process'
import path from 'path'

const NODE_BIN = process.execPath
const workerScript = path.join(process.cwd(), 'scripts', 'queue-worker.js')

// Orgs/users to list repos from
const OWNERS = ['epiphanyapps', 'waltermvp']

let repoCache: { repos: string[]; ts: number } | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 min

function getRepos(): string[] {
  if (repoCache && Date.now() - repoCache.ts < CACHE_TTL) return repoCache.repos
  const repos: string[] = []
  for (const owner of OWNERS) {
    try {
      const raw = execFileSync('gh', [
        'repo', 'list', owner, '--limit', '50', '--json', 'nameWithOwner,hasIssuesEnabled',
        '-q', '.[] | select(.hasIssuesEnabled) | .nameWithOwner'
      ], { encoding: 'utf8' })
      repos.push(...raw.trim().split('\n').filter(Boolean))
    } catch {}
  }
  repos.sort()
  repoCache = { repos, ts: Date.now() }
  return repos
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const repos = getRepos()

  // If just asking for repo list
  if (searchParams.get('list') === 'repos') {
    return NextResponse.json({ repos })
  }

  const repo = searchParams.get('repo') || repos[0] || 'epiphanyapps/MapYourHealth'

  // Validate repo is accessible (case-insensitive — GitHub API returns lowercase)
  const matchedRepo = repos.find(r => r.toLowerCase() === repo.toLowerCase()) || repo
  if (!repos.find(r => r.toLowerCase() === repo.toLowerCase())) {
    return NextResponse.json({ error: `Repo not found: ${repo}`, repos }, { status: 400 })
  }

  try {
    // Get open issues from GitHub
    const raw = execFileSync('gh', [
      'issue', 'list',
      '--repo', matchedRepo,
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
      alreadyQueued: tracked.has(issue.number),
      repo: matchedRepo,
    }))

    return NextResponse.json({ issues: result, repos, currentRepo: matchedRepo })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
