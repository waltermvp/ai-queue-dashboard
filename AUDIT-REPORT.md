# AI Queue System — E2E Handling Audit Report

**Date:** 2026-02-15  
**Scope:** Full end-to-end audit of the E2E testing pipeline, from GitHub issue ingestion through Qwen analysis, YAML extraction, Maestro execution, artifact collection, and dashboard display.

---

## 1. Critical Issues (WILL cause failures or data loss)

### 1.1 JAVA_HOME set to a command string, not a path
**File:** `scripts/pipelines/e2e.sh`, line ~13  
**Problem:** `JAVA_HOME` is set using command substitution syntax but without `$()`:
```bash
export JAVA_HOME="${JAVA_HOME:-/usr/libexec/java_home 2>/dev/null || echo /Library/Java/...}"
```
This sets JAVA_HOME to the **literal string** `/usr/libexec/java_home 2>/dev/null || echo /Library/Java/...` — not the output of that command. Gradle will fail if JAVA_HOME isn't already set in the environment.

**Fix:**
```bash
export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home 2>/dev/null || echo /Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home)}"
```

### 1.2 `screenrecord` kill race — recording PID is the `adb` process, not on-device
**File:** `scripts/pipelines/e2e.sh`, lines ~119-121  
**Problem:** `adb shell screenrecord ... &` backgrounds the local `adb` process. `kill $RECORD_PID` kills the local adb client, but the on-device `screenrecord` process may continue running or die uncleanly, producing a corrupt/incomplete MP4. Additionally, `adb screenrecord` has a **180-second hard limit** — long Maestro runs on a slow Moto E13 will lose the end of the recording.

**Fix:** Stop recording via `adb shell pkill -INT screenrecord` instead of killing the local PID:
```bash
# Stop recording gracefully
adb -s "$DEVICE_ID" shell pkill -INT screenrecord 2>/dev/null
sleep 3
```

### 1.3 Worker crashes leave issue permanently stuck in "processing"
**File:** `scripts/queue-worker.js`  
**Problem:** If the worker crashes (OOM, power loss, unhandled exception) after setting `state.processing` but before clearing it, the issue is stuck forever. On restart, `processNext()` sees `state.processing` is set and exits immediately. There is **no timeout, no stale-lock detection, and no recovery mechanism**.

**Fix:** Add stale processing detection at startup:
```javascript
// In processNext() or watch(), before checking state.processing:
if (state.processing) {
  const startedMs = new Date(state.processing.started_at).getTime();
  const staleMs = 60 * 60 * 1000; // 1 hour timeout
  if (Date.now() - startedMs > staleMs) {
    log(`⚠️ Stale processing detected (started ${state.processing.started_at}), moving to failed`);
    state.failed.push({ ...state.processing, error: 'Worker timeout/crash recovery', failed_at: new Date().toISOString() });
    state.processing = null;
    saveQueueState(state);
    // Also update DB if runId is trackable
  }
}
```

### 1.4 `queue-state.json` concurrent write corruption
**File:** `scripts/queue-worker.js` + `app/api/queue-state/route.ts`  
**Problem:** The worker does read-modify-write on `queue-state.json` (non-atomic). The dashboard reads the same file. If the worker writes while the dashboard reads, a partial read can return invalid JSON. The `POST` endpoint in `route.ts` doesn't actually write anything currently, but if it did, there'd be a write-write race too. More critically, the worker itself re-reads state after Ollama processing (`const updatedState = loadQueueState()`), which could miss changes if another process modified the file.

**Mitigation:** Use `fs.writeFileSync` with a temp file + rename (atomic on most filesystems):
```javascript
function saveQueueState(state) {
  const tmp = QUEUE_STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, QUEUE_STATE_FILE);
}
```

### 1.5 DB records "completed" even when E2E pipeline fails (partial)
**File:** `scripts/queue-worker.js`, around line ~155  
**Problem:** When `result.success` is true (Qwen responded) but the E2E pipeline fails, the code correctly sets `result.success = false` for e2e type. However, the item has already been pushed to `updatedState.completed` (line ~168) because the completion path runs before the success re-check. Let me re-read...

Actually, looking more carefully: the pipeline failure sets `result.success = false` only for e2e type, and the `if (result.success)` block continues. But wait — the pipeline execution happens **inside** the `if (result.success)` block, and after pipeline failure for e2e, it sets `result.success = false`. But the code continues inside the same `if` block and pushes to `completed`. The `else` (failed) branch won't run.

**This means failed E2E pipeline runs are recorded as "completed" in queue-state.json** even though the pipeline failed. The DB gets `completeRun()` called, not `failRun()`.

**Fix:** Restructure the post-pipeline logic:
```javascript
if (result.success) {
  const pipelineResult = await executePipeline(issueType, item.id, result.solution);
  // ... existing pipeline handling that sets result.success = false for e2e ...
}

// Re-check after pipeline (moved OUTSIDE the original if block)
if (result.success) {
  updatedState.completed.push(completedItem);
  // DB completeRun...
} else {
  updatedState.failed.push({...});
  // DB failRun...
}
```

---

## 2. Important Improvements (SHOULD be fixed for reliability)

### 2.1 No YAML validation before running Qwen-generated flows
**File:** `scripts/queue-worker.js`, YAML extraction block  
**Problem:** Qwen-generated YAML is extracted via regex and written directly to disk. If the YAML is syntactically invalid or missing `appId`, Maestro will fail with a confusing error. There's no validation step.

**Fix:** Add basic YAML validation after extraction:
```javascript
const yaml = require('js-yaml'); // or use a lightweight parser

// After extracting yamlContent:
try {
  const parsed = yaml.load(yamlContent);
  if (!parsed || typeof parsed !== 'object') throw new Error('Not a valid YAML object');
} catch (e) {
  log(`⚠️ Skipping invalid YAML block: ${e.message}`);
  continue; // skip this block
}
```

### 2.2 E2E prompt doesn't teach Qwen how to write Maestro flows
**File:** `prompts/e2e.md`  
**Problem:** The prompt tells Qwen how to **build and run** the pipeline (shell commands) but doesn't teach it Maestro YAML syntax, available commands, element selectors, or the app's UI structure. Qwen has no way to know what screens exist, what text is visible, or what `testId` attributes are available. The "Output Requirements" section asks for test results, not for generating test flows.

**Fix:** Add a Maestro syntax reference and app UI context to the prompt:
```markdown
## Maestro YAML Syntax Reference

Available commands:
- `launchApp` / `clearState: true`
- `tapOn:` with `text:`, `id:`, `index:`, `optional: true`
- `assertVisible:` / `assertNotVisible:`
- `inputText:`
- `scrollUntilVisible:`
- `waitForAnimationToEnd`
- `takeScreenshot: <name>`
- `back`

## App UI Structure
- Login screen: email field, password field, "Sign In" button
- Bottom tabs: Home, Search, Profile
- Home screen: health metrics cards
...

## Your Task
Given the issue description, generate one or more Maestro YAML test flows
that validate the described behavior. Wrap each flow in ```yaml fences.
Each flow MUST start with `appId: com.epiphanyapps.mapyourhealth`.
```

### 2.3 `adb screenrecord` 180s timeout not handled
**File:** `scripts/pipelines/e2e.sh`  
**Problem:** Android `screenrecord` has a hard 180-second limit. On a slow Moto E13, Maestro tests could easily exceed this, resulting in a truncated recording with no indication to the user.

**Fix:** Either:
- Use `--time-limit 300` (max is 180, so this won't help) — actually, chain multiple recordings
- Or use `scrcpy --record` instead of `adb screenrecord` if available
- Or document the limitation and split long test flows

### 2.4 Artifacts API endpoint missing
**File:** Dashboard references `/api/artifacts/{id}/{file}` but no such route exists in the codebase.  
**Problem:** The `ArtifactsPanel` component tries to fetch videos/logs from `/api/artifacts/...` but there's no API route to serve these files. Videos won't play and logs won't load in the dashboard.

**Fix:** Create `app/api/artifacts/[...path]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { readFile, stat } from 'fs/promises'
import { join } from 'path'
import { lookup } from 'mime-types'

export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  const filePath = join(process.cwd(), 'artifacts', ...params.path)
  try {
    await stat(filePath)
    const data = await readFile(filePath)
    const mime = lookup(filePath) || 'application/octet-stream'
    return new NextResponse(data, { headers: { 'Content-Type': mime } })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
```

### 2.5 Screenshots not collected as artifacts
**File:** `scripts/pipelines/e2e.sh`, screenshot collection block  
**Problem:** Screenshots are copied to `$ARTIFACTS_DIR` but the worker's `collectArtifacts()` function only looks for `.mp4` (recordings) and `.log` (logs). PNG screenshots are ignored.

**Fix in `queue-worker.js`:**
```javascript
function collectArtifacts(issueId) {
    const artifactDir = path.join(ARTIFACTS_DIR, issueId);
    if (!fs.existsSync(artifactDir)) return null;
    const files = fs.readdirSync(artifactDir);
    const recordings = files.filter(f => f.endsWith('.mp4'));
    const logs = files.filter(f => f.endsWith('.log'));
    const screenshots = files.filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
    if (recordings.length === 0 && logs.length === 0 && screenshots.length === 0) return null;
    return { dir: `artifacts/${issueId}`, recordings, logs, screenshots };
}
```

### 2.6 `sort()` mutates queue array in place
**File:** `scripts/queue-worker.js`, `processNext()`  
**Problem:** `state.queue.sort(...)` mutates the original array, then `state.queue.filter(...)` creates a new one. This works but is fragile. More importantly, the priority sort uses only 3 levels — items with equal priority are processed in undefined order (not FIFO).

**Fix:** Add creation time as tiebreaker:
```javascript
const sortedQueue = [...state.queue].sort((a, b) => {
  const priorities = { high: 3, medium: 2, low: 1 };
  const pDiff = (priorities[b.priority] || 1) - (priorities[a.priority] || 1);
  if (pDiff !== 0) return pDiff;
  return new Date(a.created_at) - new Date(b.created_at); // FIFO tiebreak
});
```

### 2.7 SQLite not closed on process exit
**File:** `scripts/db.js`  
**Problem:** `better-sqlite3` connections should be closed on exit to flush WAL. If the worker crashes or is killed, WAL data may not be checkpointed.

**Fix:**
```javascript
process.on('exit', () => { if (db) db.close(); });
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());
```

### 2.8 History API vulnerable to command injection
**File:** `app/api/history/route.ts`  
**Problem:** Query parameters (`type`, `status`, `id`) are interpolated directly into the `execSync` command string without sanitization:
```typescript
if (type) args += ` --type ${type}`
```
A malicious `type` parameter like `coding; rm -rf /` would execute arbitrary commands.

**Fix:** Validate/sanitize inputs:
```typescript
const ALLOWED_TYPES = ['coding', 'e2e', 'content'];
const ALLOWED_STATUSES = ['queued', 'processing', 'completed', 'failed'];
if (type && !ALLOWED_TYPES.includes(type)) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
if (status && !ALLOWED_STATUSES.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
```
Or better: import `db.js` directly instead of shelling out via `execSync`.

---

## 3. Nice-to-Haves (optimizations and polish)

### 3.1 Dashboard doesn't show E2E pass/fail counts
The completed items panel shows artifacts but not the pass/fail flow breakdown. The pipeline logs this info (`$PASSED_FLOWS/$TOTAL_FLOWS`) but it's not captured in a structured way.

**Suggestion:** Have `e2e.sh` write a `results.json` summary file:
```json
{"total": 3, "passed": 2, "failed": 1, "flows": [{"name": "qwen-flow-1", "status": "passed"}, ...]}
```
Then parse this in `collectArtifacts()` and display in the dashboard.

### 3.2 No retry mechanism for failed E2E runs
When a flow fails, there's no easy way to retry just the E2E pipeline without re-processing through Qwen. A "retry pipeline" button would save significant time.

### 3.3 `healthcheck.yaml` is too minimal
The health check only asserts `".*"` is visible — this passes even if the app crashes to a system dialog. It should assert something app-specific like the app's title bar or a known UI element.

### 3.4 Log file grows unbounded
`queue-worker.log` is appended to forever with no rotation. Over time this will consume significant disk space.

### 3.5 `queue-state.json` completed/failed arrays grow forever
These arrays are never trimmed (except manual "cleanup" which nukes all completed items). Since historical data is in SQLite, the JSON file should only keep the last N items.

### 3.6 Dashboard `POST` endpoint is a no-op
The `queue-state/route.ts` POST handler accepts an action but does nothing with it. The "Process One", "Load Issues", and "Cleanup" buttons call `/api/queue-action` which doesn't exist in the reviewed code.

### 3.7 Prompt includes `maestro record` but pipeline uses `adb screenrecord` + `maestro test`
The E2E prompt (`prompts/e2e.md`) tells Qwen to use `maestro record`, but the actual pipeline (`e2e.sh`) uses `adb screenrecord` + `maestro test`. This inconsistency means if Qwen's analysis references `maestro record`, it's misleading.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| **Critical** | 5 | Stuck processing, JAVA_HOME broken, failed E2E recorded as completed, recording corruption, JSON write races |
| **Important** | 8 | No YAML validation, missing artifacts API, command injection, prompt quality, screenshot gaps |
| **Nice-to-have** | 7 | Pass/fail display, retry UX, log rotation, healthcheck quality |

**Top 3 priorities:**
1. Fix the "failed E2E recorded as completed" logic bug (#1.5) — this corrupts your results data
2. Add stale processing recovery (#1.3) — prevents the system from getting permanently stuck
3. Fix JAVA_HOME (#1.1) — this will break every build when env isn't pre-set
