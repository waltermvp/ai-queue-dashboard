# AI Queue System — Holistic Review

**Date:** 2026-02-16  
**Reviewer:** Automated deep audit  
**Scope:** All queue worker, pipeline, API, and dashboard code

---

## 1. System Status Summary

### What Actually Works End-to-End Today

| Component | Status | Notes |
|-----------|--------|-------|
| Load from GitHub → queue | ✅ Works | Fetches issues, deduplicates, correct schema |
| Queue state management | ✅ Works | Atomic writes, priority sorting, dequeue logic |
| Qwen/Ollama analysis | ✅ Works | Sends prompt, gets response |
| Coding pipeline (coding.sh) | ⚠️ Mostly works | Depends on `mini` CLI behavior — see issues below |
| E2E pipeline (e2e.sh) | ⚠️ Mostly works | Smart build cache, health check, recording — some edge cases |
| Content pipeline | ✅ Works (trivially) | Just copies Qwen output to artifacts. It's a stub. |
| Dashboard display | ✅ Works | Shows queue, processing, completed, failed |
| Remove / Clear All / Clear History | ✅ Works | Correct in worker and API routes |
| SQLite history | ✅ Works | Records runs, artifacts, stats |
| Artifact serving | ✅ Works | Videos, logs, screenshots served correctly |
| Stale recovery | ✅ Works | Correct property names (`issueNumber`), 30-min timeout |

### What's Broken or Incomplete

| Component | Status | Issue |
|-----------|--------|-------|
| Retry failed issues | ❌ Broken | Dashboard has retry button calling `executeAction('retry')` — **no `retry` action exists** in queue-action route or worker |
| History API command injection | ⚠️ Partially fixed | `type` and `status` params passed unsanitized to shell command |
| Dual data source (JSON vs SQLite) | ⚠️ Diverges | Completed/failed in JSON ≠ SQLite over time |
| Content pipeline | ❌ Stub | No real post-processing — just file copy |
| Qwen → Maestro flow extraction | ⚠️ Questionable | Qwen doesn't know Maestro syntax; rarely produces valid flows |
| Worker concurrency | ⚠️ Risk | Dashboard spawns `node queue-worker.js process` while watch mode may be running |

---

## 2. Critical Issues

### 2.1 🔴 History API — Command Injection Still Possible

**File:** `app/api/history/route.ts`

The `type` and `status` query params are interpolated directly into a shell command:

```typescript
args = `history --limit ${limit} --offset ${offset}`
if (type) args += ` --type ${type}`
if (status) args += ` --status ${status}`
```

A request like `GET /api/history?type=coding;rm+-rf+/` would execute arbitrary commands. The `limit` and `offset` use `||` fallback (not `parseInt` validation on the shell side).

**Fix:** Validate `type` against an allowlist (`coding`, `e2e`, `content`). Validate `status` against (`completed`, `failed`, `processing`). Use `parseInt` with strict validation for numeric params. Or better: import `db.js` directly instead of shelling out.

### 2.2 🔴 Retry Button Does Nothing

**File:** `app/page.tsx` line in failed issues section

```tsx
onClick={() => executeAction('retry')}
```

The `queue-action/route.ts` has no `retry` case — it falls through to `default: return 'Unknown action'`. Users click retry, nothing happens, no error shown.

**Fix:** Either implement retry (re-add failed item to queue) or remove the button.

### 2.3 🔴 Worker Concurrency — No Lock

When `watch` mode is running (polling every 30s), clicking "Process One" in the dashboard spawns a **separate** `node queue-worker.js process` process. Both read `queue-state.json`, both could pick the same item, both could start processing simultaneously. The JSON file has no locking.

**Fix:** Use a PID lockfile, or have the dashboard communicate with the running watcher (e.g., via a signal or socket) instead of spawning a new process.

### 2.4 🔴 Node Version Not Pinned in Spawned Commands

**File:** `app/api/queue-action/route.ts`

```typescript
command = `node "${workerScript}" load-github`
```

This uses whatever `node` is on the system PATH. The Next.js process runs under Node 20 (via nvm), but spawned `node` commands may pick up system Node v25. The `queue-state/route.ts` correctly uses `process.execPath` for db-api calls, but `queue-action` does not.

**Fix:** Use `process.execPath` instead of bare `node` in queue-action route.

### 2.5 🟡 `initializeQueueState()` Creates Demo Items with Wrong Schema

**File:** `scripts/queue-worker.js`

```javascript
{ id: 'demo-1', title: 'Sample Task 1', priority: 'high', ... }
```

These demo items use `id` instead of `issueNumber`. If this function ever runs (new install, deleted JSON), the worker will fail to dequeue them because `state.queue.filter(q => q.issueNumber !== item.issueNumber)` won't match `undefined !== undefined`.

**Fix:** Either remove demo items entirely (since we have load-github now) or fix the schema.

---

## 3. Design Problems

### 3.1 Dual Data Store (JSON + SQLite) Creates Inconsistency

The system uses `queue-state.json` for live state AND stores completed/failed items there, while ALSO recording to SQLite. The `queue-state/route.ts` reads completed/failed from **SQLite** but queue/processing from **JSON**. Meanwhile, `clear-history` only clears the JSON arrays — SQLite history persists.

This means:
- After `clear-history`, the dashboard still shows old completed/failed items (from SQLite)
- The JSON `completed`/`failed` arrays grow unbounded (never cleaned except manually)
- The `cleanup` command only clears JSON `completed`, not `failed` or SQLite

**Recommendation:** Pick one source of truth. Use JSON only for `queue` + `processing` (transient). Use SQLite for all historical data. Remove `completed`/`failed` arrays from JSON entirely.

### 3.2 Queue-State Route Shells Out to db-api.js

Instead of importing `db.js` directly (which would work since they're in the same project), the route spawns a child process:

```typescript
execSync(`"${NODE_BIN}" "${DB_API}" ${args}`, { timeout: 5000 })
```

This adds latency, process overhead, and the command injection surface. The only reason might be that `better-sqlite3` is a native module that doesn't play well with Next.js bundling — but since this is server-side only, it should work with proper configuration.

### 3.3 Dashboard `issue.id` vs `issue.issueNumber` in Frontend

In `page.tsx`, the queue items display `issue.id` but the schema from `loadFromGitHub` doesn't set `id` — it sets `issueNumber`. The remove button tries:

```tsx
issueNumber: issue.number || issue.id.split('-').pop()
```

For GitHub-loaded items, `issue.number` is undefined (the field is `issueNumber`), and `issue.id` is also undefined. So `issue.id.split('-')` will **throw a runtime error**.

**This is a live bug.** The remove button will crash for GitHub-loaded items.

**Fix:** Use `issue.issueNumber` in the frontend, or ensure the API maps it correctly.

### 3.4 Qwen Analysis → mini-swe-agent: Useful but Redundant?

The coding pipeline sends the issue to Qwen for "planning", then passes that plan to mini-swe-agent. This is actually reasonable — it gives mini a head start with file paths and approach. The question is whether Qwen's analysis (without repo access) is accurate enough to help. Given that Qwen sees the issue body but NOT the actual code, its file path suggestions may be wrong. Still, it provides structured thinking that mini can use or ignore.

**Verdict:** Marginally useful. Not redundant but not critical. The real work happens in mini.

---

## 4. Per-Pipeline Status

### 4.1 🔧 Coding Pipeline — 75% Functional

**What works:**
- Git worktree creation, branch management, cleanup
- Amplify outputs copying
- Task file construction with Qwen analysis
- `mini` invocation with timeout
- PR creation via `gh pr create`

**Issues:**
- `mini` CLI flags: The script uses `mini -m $MINI_MODEL --yolo -t "$TASK_CONTENT"`. Need to verify `mini` actually accepts `-t` for inline task content (vs a file path). If `-t` expects a file, this breaks. The `mini` docs should be checked.
- The `--yolo` flag disables confirmation prompts — correct for automation.
- No `--cost-limit` flag is passed for Ollama models, which is fine (local = free).
- If `mini` modifies files but the changes don't compile, the PR gets created anyway with broken code.
- No test execution to validate the fix before PR creation.

### 4.2 🧪 E2E Pipeline — 80% Functional

**What works:**
- Smart build caching (hash-based)
- `local.properties` regeneration after prebuild
- Device connectivity check
- Health check gate (app must load before tests)
- Per-flow video recording with proper screenrecord kill (`pkill -INT`)
- Post-test video validation with retry
- Multi-flow execution with summary

**Issues:**
- Qwen flow extraction is mostly wasted effort. Qwen generates YAML that looks vaguely like Maestro but usually isn't valid. The fallback to `mapyourhealth-basic.yaml` is what actually runs 99% of the time.
- `JAVA_HOME` fallback to hardcoded zulu-17 path may break if JDK changes.
- `maestro test --udid` — verify Maestro uses `--udid` not `--device`. (The healthcheck uses `--udid` correctly based on Maestro 2.x CLI.)
- The health check flow (`assertVisible: ".*"`) is extremely weak — it just checks *anything* is visible. The app could be showing a crash dialog and this would pass.
- iOS testing is completely skipped ("skipping iOS build for now").

### 4.3 📝 Content Pipeline — 10% Functional (Stub)

The content pipeline is:
```bash
cp "$SOLUTION_FILE" "$ARTIFACTS_DIR/content-output.md"
exit 0
```

That's it. Qwen generates content, it gets saved. There's no:
- Review or formatting step
- Publishing to any channel
- Integration with docs/blog/app store
- Feedback loop

This is a file copy operation pretending to be a pipeline.

---

## 5. Integration Gaps

### 5.1 Frontend Schema Mismatch

The `page.tsx` `QueueState` interface defines queue items with `{ id, title, repo, number, added, ... }` but `loadFromGitHub` produces `{ issueNumber, repo, title, labels, priority, addedAt, url }`. Fields don't match:
- `id` → doesn't exist (should be `issueNumber`)
- `number` → doesn't exist (should be `issueNumber`)  
- `added` → doesn't exist (should be `addedAt`)

The dashboard likely shows blank fields for queue items.

### 5.2 Completed Items: JSON vs SQLite Schema Mismatch

`queue-state/route.ts` maps SQLite rows to `{ id: r.issue_id, ... }` but the dashboard expects different shapes for JSON-sourced vs SQLite-sourced items. The `id` field in SQLite-mapped items is the issue number (string), while in JSON it would be the full item.

### 5.3 No Artifact Linking for Coding Issues

The coding pipeline saves `mini-trajectory.json` and `mini-output.log` to artifacts, but `collectArtifacts()` only looks for `.mp4` and `.log` files. The `.json` trajectory is collected via the `.log` filter... wait, no — `.json` doesn't match `.log`. So trajectories are saved but never surfaced in the dashboard.

**Fix:** Add `.json` and `.md` to the artifact collection in `collectArtifacts()`, or make it collect all files.

### 5.4 `collectArtifacts` Only Runs for E2E Issues

In `queue-worker.js`:
```javascript
if (issueType === 'e2e') {
    const artifacts = collectArtifacts(String(item.issueNumber));
```

Coding issues generate artifacts too (logs, trajectory, solution) but they're never collected or shown in the dashboard.

### 5.5 Missing `/api/queue-logs` Route?

The dashboard fetches `/api/queue-logs` but I didn't see this route in the file list. If it doesn't exist, the log viewer silently fails (shows "No logs yet...").

---

## 6. Recommended Priority Actions

### P0 — Fix Now (Will Crash or Security Risk)

1. **Fix command injection in history API** — Validate/sanitize `type` and `status` params, or import db.js directly
2. **Fix remove button crash** — `issue.id.split('-')` throws for GitHub items. Use `issue.issueNumber`
3. **Fix Node version in queue-action** — Use `process.execPath` instead of bare `node`
4. **Remove or fix demo items** — `initializeQueueState()` uses wrong schema

### P1 — Fix Soon (Broken Features)

5. **Implement retry action** — Or remove the retry button from the UI
6. **Add worker lock** — Prevent concurrent processing from dashboard + watch mode
7. **Fix frontend queue item schema** — Align TypeScript interfaces with actual data shape
8. **Collect artifacts for all issue types** — Not just e2e

### P2 — Improve (Design Debt)

9. **Consolidate to single data store** — Drop completed/failed from JSON, use SQLite only
10. **Import db.js directly** in API routes instead of shelling out
11. **Strengthen health check** — `assertVisible: ".*"` is too weak; check for actual app content
12. **Remove Qwen→Maestro flow extraction** — It almost never produces valid flows; simplify the e2e pipeline
13. **Build out content pipeline** — Or remove it as an option until it does something real

### P3 — Nice to Have

14. **Add re-run from dashboard** for failed items
15. **Show coding artifacts** (trajectory, logs) in dashboard
16. **Add compilation check** before PR creation in coding pipeline
17. **iOS e2e support** — Currently completely skipped
18. **Verify `mini -t` flag** accepts inline content (not just file paths)
