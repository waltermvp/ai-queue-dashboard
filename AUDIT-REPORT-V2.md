# AI Queue System — Comprehensive Audit Report V2

**Date:** 2026-02-16  
**Auditor:** OpenClaw automated audit  
**Scope:** Full end-to-end review of every file in the AI queue system  

---

## 1. Architecture Overview

### How the system works today

```
GitHub Issues → queue-state.json → queue-worker.js → Ollama (Qwen 2.5 Coder 32B)
                                         ↓
                              detectIssueType(labels)
                                    ↓    ↓    ↓
                               coding  e2e  content
                                 ↓      ↓      ↓
                           coding.sh  e2e.sh  content.sh
                                 ↓      ↓      ↓
                           pr-worker  maestro  copy md
                                    ↓
                              queue-state.json (completed/failed)
                              queue-history.db (SQLite — persistent history)
                                    ↓
                              Next.js Dashboard (port 3001)
                              ├── /api/queue-state (live + DB merged)
                              ├── /api/history (DB queries via db-api.js)
                              ├── /api/artifacts/[...path] (file serving)
                              ├── /api/queue-action (trigger worker commands)
                              └── /api/queue-logs (tail worker log)
```

**Issue type detection:** Labels on GitHub issue → `e2e` label = E2E, `content` label = content, anything else = coding.

**Processing flow:** Worker dequeues highest priority item → sends issue + type-specific prompt to Ollama → executes pipeline script → records result in both JSON and SQLite → collects artifacts.

**Dashboard:** Next.js app merges live state from `queue-state.json` (processing/queue) with historical data from SQLite (completed/failed). Artifacts served via dedicated API route.

---

## 2. Critical Bugs — Things That ARE Broken Right Now

### 2.1 🔴 Ollama API call has NO timeout

**File:** `scripts/queue-worker.js`, `processWithOllama()`  
**Problem:** The `axios.post()` to Ollama has no timeout set. Qwen 2.5 Coder 32B can take 3-10+ minutes per response. If Ollama hangs or the model gets stuck, the worker blocks forever. There's no AbortController, no timeout, nothing.

**Impact:** Worker permanently stuck. Combined with the 30-minute stale recovery, that's 30 min of dead time before recovery kicks in — and recovery only moves it to failed, doesn't retry.

**Fix:** Add timeout to axios call:
```javascript
const response = await axios.post(OLLAMA_URL, {
    model: 'qwen2.5-coder:32b',
    prompt: prompt,
    stream: false
}, { timeout: 600000 }); // 10 minute timeout
```

### 2.2 🔴 Demo items use `id` property, real items use `issueNumber` — filter breaks for demos

**File:** `scripts/queue-worker.js`, `processNext()` and `addDemoItems()` / `initializeQueueState()`  
**Problem:** The dequeue filter is:
```javascript
state.queue = state.queue.filter(q => q.issueNumber !== item.issueNumber);
```
But demo items (from `addDemoItems()` and `initializeQueueState()`) use `id` not `issueNumber`. So demo items can **never be dequeued** — the filter matches nothing, and the same demo item gets processed infinitely.

Real GitHub items use `issueNumber` and work correctly. But the demo path is broken.

**Also:** `collectArtifacts(String(item.issueNumber))` would be `collectArtifacts("undefined")` for demo items.

### 2.3 🔴 `item.labels` join fails for object-type labels

**File:** `scripts/queue-worker.js`, `processWithOllama()`, line building the prompt:
```javascript
Labels: ${(item.labels || []).join(', ') || 'none'}
```
The `detectIssueType()` function handles labels that are strings OR objects (`typeof l === 'string' ? l : l.name`). But the prompt construction does `.join(', ')` directly — if labels are objects (e.g. from GitHub API), you get `Labels: [object Object], [object Object]`.

**Fix:**
```javascript
Labels: ${(item.labels || []).map(l => typeof l === 'string' ? l : l.name || '').join(', ') || 'none'}
```

### 2.4 🔴 History API — command injection vulnerability

**File:** `app/api/history/route.ts`  
**Problem:** Query parameters are interpolated directly into `execSync()`:
```typescript
if (type) args += ` --type ${type}`
if (status) args += ` --status ${status}`
const id = searchParams.get('id')
args = `run ${id}`
```
A request like `?type=coding;rm+-rf+/` or `?command=run&id=1;whoami` executes arbitrary shell commands.

**Fix:** Whitelist allowed values or (better) import db.js directly instead of shelling out. The queue-state route already does this via db-api.js — both should validate inputs.

### 2.5 🔴 `queue-state/route.ts` also has injection via `queryDB()`

**File:** `app/api/queue-state/route.ts`  
```typescript
function queryDB(args: string): any {
  const result = execSync(`"${NODE_BIN}" "${DB_API}" ${args}`, ...)
```
While the args are currently hardcoded (`'stats'`, `'history --status completed --limit 20'`), the pattern is dangerous. Any future change that passes user input would be exploitable.

---

## 3. Important Gaps — Things That SHOULD Work But Don't

### 3.1 🟡 Retry button doesn't actually retry the specific failed item

**File:** `app/page.tsx`, failed items section:
```jsx
<button onClick={() => executeAction('retry')} ...>
```
This sends `action: 'retry'` to `/api/queue-action/route.ts`, which doesn't handle `'retry'` — it returns `{ error: 'Unknown action' }`. Failed items cannot be re-queued from the dashboard.

### 3.2 🟡 "Process One" button has no feedback on completion

**File:** `app/api/queue-action/route.ts`:
```typescript
if (action === 'process-one') {
  execAsync(command).then(...).catch(...)
  return NextResponse.json({ message: 'Processing started...' })
}
```
The processing runs in background with fire-and-forget. No way to know when it finishes except polling the dashboard. Errors are logged to console but never surfaced to the user.

### 3.3 🟡 No cancellation mechanism for processing items

There's no way to cancel a currently processing item. The only escape is waiting for the 30-minute stale timeout. If Ollama is generating a bad response, you're stuck.

### 3.4 🟡 `coding.sh` delegates to `pr-worker.js` but passes wrong args

**File:** `scripts/pipelines/coding.sh`:
```bash
node scripts/pr-worker.js "$REPO" "$ISSUE_ID"
```
But in `queue-worker.js`, the coding pipeline is called with:
```javascript
args.push('epiphanyapps/MapYourHealth', solutionFile);
```
So `coding.sh` receives `(issueId, repo, solutionFile)` and calls `pr-worker.js` with `(repo, issueId)`. The `solutionFile` (arg $3) is used for logging but **not passed to pr-worker.js** — so pr-worker never receives Qwen's solution.

### 3.5 🟡 Content pipeline is a simple file copy — no post-processing

**File:** `scripts/pipelines/content.sh` — copies the Qwen solution to `content-output.md` and exits. There's no GitHub comment posting, no PR creation, no delivery mechanism. The content just sits in the artifacts folder.

### 3.6 🟡 E2E prompt teaches Qwen to run commands, not write Maestro flows

**File:** `prompts/e2e.md`  
The prompt gives Qwen build/install/run instructions (shell commands), but doesn't teach:
- Maestro YAML syntax or available commands
- The app's actual UI structure (screen names, button text, testIDs)
- How to write valid Maestro flows

Result: Qwen generates shell command instructions (which the pipeline doesn't execute) or guesses at YAML that fails because it doesn't know what's on screen. The current `queue-state.json` shows this happening — issue #103 failed with Qwen generating a hypothetical flow with `"Sign In"` button text that may not exist.

### 3.7 🟡 Health check flow is too weak

**File:** `~/maestro-farm/flows/android/healthcheck.yaml`:
```yaml
- assertVisible:
    text: ".*"
    optional: false
```
This regex matches ANY text on screen — including Android system dialogs, crash reporters, or "App has stopped" messages. It doesn't actually verify the app loaded.

### 3.8 🟡 `adb screenrecord` 180-second hard limit

**File:** `scripts/pipelines/e2e.sh`  
Android `screenrecord` has an absolute 180s max. Moto E13 is slow — complex flows easily exceed this. Recording silently stops at 3 minutes with no error, producing a truncated video.

### 3.9 🟡 Screenshots not included in artifacts model

**File:** `scripts/queue-worker.js`, `collectArtifacts()`:
```javascript
const recordings = files.filter(f => f.endsWith('.mp4'));
const logs = files.filter(f => f.endsWith('.log'));
```
PNG/JPG screenshots from Maestro are ignored. The dashboard's `ArtifactsPanel` component only renders `recordings` and `logs` — no screenshots section.

### 3.10 🟡 Completed/failed arrays in queue-state.json grow unbounded

The JSON file keeps ALL completed and failed items forever. SQLite already stores history. The JSON arrays should be trimmed to the last N items (or emptied after DB recording).

---

## 4. Per-Type Analysis

### 🔧 Coding Pipeline

| Aspect | Status |
|--------|--------|
| Prompt | ✅ Good — clear instructions, coding standards, PR workflow |
| Pipeline script | ⚠️ Exists (`coding.sh`) but delegates to `pr-worker.js` |
| Solution delivery | ⚠️ `pr-worker.js` exists but doesn't receive Qwen's solution text |
| Branch/PR creation | ❓ Depends on `pr-worker.js` implementation (not fully audited) |
| Post-processing | ⚠️ No automated linting, testing, or validation of Qwen's code |

**Verdict:** Partially implemented. The prompt is solid but the pipeline has an argument passing bug — Qwen's solution never reaches pr-worker.

### 🧪 E2E Pipeline  

| Aspect | Status |
|--------|--------|
| Prompt | ❌ Teaches shell commands, not Maestro YAML authoring |
| Pipeline script | ✅ Most robust — build caching, health check, multi-flow, recording |
| Build system | ✅ Smart cache with hash, incremental builds, local.properties fix |
| Flow execution | ✅ Iterates flows, records each, collects results |
| Recording | ⚠️ Works but 180s limit and pkill race condition |
| Artifact collection | ⚠️ Missing screenshots, videos work |
| Health check | ⚠️ Too weak (`".*"` matches anything) |

**Verdict:** Pipeline infrastructure is excellent. Main problem is the prompt — Qwen can't write useful Maestro flows without knowing the app's UI. The existing basic flow (`mapyourhealth-basic.yaml`) is a reasonable fallback.

### ✍️ Content Pipeline

| Aspect | Status |
|--------|--------|
| Prompt | ✅ Good brand voice guidance, multiple format support |
| Pipeline script | ✅ Exists but trivial (file copy) |
| Delivery mechanism | ❌ None — content sits in artifacts folder |
| GitHub integration | ❌ No comment posting or PR with content |

**Verdict:** Generates content via Qwen but has no delivery mechanism. Needs a step to post content back to the GitHub issue as a comment or create a PR with the content files.

---

## 5. Recommendations — Prioritized

### P0 — Fix immediately (system broken without these)

1. **Add Ollama timeout** — Worker can hang forever without it
2. **Fix label `.join()` for object labels** — Corrupts prompts sent to Qwen  
3. **Sanitize history API inputs** — Command injection is exploitable on the network (`0.0.0.0` binding)
4. **Fix coding.sh to pass solution file to pr-worker** — Coding pipeline is broken without it

### P1 — Fix soon (significant reliability/quality issues)

5. **Improve E2E prompt** — Add Maestro YAML syntax reference and app UI structure so Qwen can generate useful flows
6. **Strengthen health check** — Assert an app-specific element, not `".*"`
7. **Implement retry from dashboard** — Handle `retry` action in queue-action route, re-queue the specific failed item
8. **Add screenshots to artifact model** — Include `.png`/`.jpg` in `collectArtifacts()` and render in dashboard
9. **Handle screenrecord 180s limit** — Either chain recordings or document the limitation
10. **Add content delivery** — Post content back to GitHub issue as a comment

### P2 — Improve when possible (polish and robustness)

11. **Trim queue-state.json arrays** — Cap at last 20 items, rely on SQLite for history
12. **Add log rotation** — `queue-worker.log` grows unbounded
13. **Close SQLite on exit** — Add process exit handlers in `db.js`
14. **FIFO tiebreaker for equal priority** — Sort by `created_at` when priority matches
15. **Import db.js directly in API routes** — Eliminate `execSync` + `db-api.js` shell-out pattern entirely
16. **Add cancel processing button** — Kill the Ollama request and move item back to queue
17. **Add notification on completion** — Webhook, Telegram message, or email when items complete/fail

---

## 6. Previous Audit Status (AUDIT-REPORT.md dated 2026-02-15)

### ✅ Fixed since last audit

| Issue | Status |
|-------|--------|
| **1.1 JAVA_HOME command substitution** | ✅ Fixed — now uses `$()` syntax correctly |
| **1.2 screenrecord kill race** | ✅ Fixed — now uses `pkill -INT screenrecord` on device + `wait` + retry pull |
| **1.3 Worker crash → stuck processing** | ✅ Fixed — 30-minute stale detection added in `processNext()` |
| **1.4 JSON write corruption** | ✅ Fixed — `saveQueueState()` uses temp file + rename (atomic) |
| **1.5 Failed E2E recorded as completed** | ✅ Fixed — restructured logic with `if (result.success)` re-check after pipeline |
| **2.4 Artifacts API missing** | ✅ Fixed — `app/api/artifacts/[...path]/route.ts` implemented with directory traversal protection |
| **2.8 History API command injection** | ❌ Still open — inputs still unsanitized |

### ❌ Still open from last audit

| Issue | Status |
|-------|--------|
| **2.1 No YAML validation** | ❌ Still open — Qwen YAML extracted via regex, no validation |
| **2.2 E2E prompt doesn't teach Maestro syntax** | ❌ Still open — prompt unchanged |
| **2.3 screenrecord 180s limit** | ❌ Still open — no mitigation |
| **2.5 Screenshots not in artifacts** | ❌ Still open — `collectArtifacts()` ignores PNGs |
| **2.6 sort() mutates array** | ⚠️ Partially — works correctly but no FIFO tiebreaker |
| **2.7 SQLite not closed on exit** | ❌ Still open |
| **2.8 History API injection** | ❌ Still open |
| **3.1 Dashboard pass/fail counts** | ❌ Still open |
| **3.2 No retry mechanism** | ❌ Still open — button exists but sends unhandled action |
| **3.3 Health check too minimal** | ❌ Still open |
| **3.5 queue-state.json grows unbounded** | ❌ Still open |
| **3.6 Dashboard POST is a no-op** | ✅ Fixed — POST exists but queue-action route handles actual work |
| **3.7 Prompt/pipeline inconsistency** | ❌ Still open — prompt says `maestro record`, pipeline uses `adb screenrecord` |

### New issues found in V2

| Issue | Severity |
|-------|----------|
| No Ollama timeout | 🔴 Critical |
| Demo items can't be dequeued (id vs issueNumber) | 🔴 Critical |
| Label objects break `.join()` in prompt | 🔴 Critical |
| coding.sh doesn't pass solution to pr-worker | 🟡 Important |
| Content pipeline has no delivery mechanism | 🟡 Important |
| queue-state route also uses execSync pattern | 🟡 Important |
| Retry button sends unhandled action | 🟡 Important |
| No cancel processing mechanism | 🟡 Gap |

---

## Appendix: File-by-File Summary

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `scripts/queue-worker.js` | ~280 | ⚠️ | Core worker — several bugs documented above |
| `scripts/pipelines/e2e.sh` | ~200 | ✅ | Most robust pipeline, well-structured |
| `scripts/pipelines/coding.sh` | ~25 | ⚠️ | Thin wrapper, arg passing bug |
| `scripts/pipelines/content.sh` | ~20 | ⚠️ | File copy only, no delivery |
| `scripts/db.js` | ~100 | ✅ | Clean SQLite layer, WAL mode |
| `scripts/db-api.js` | ~35 | ✅ | Simple CLI wrapper |
| `prompts/coding.md` | ~30 | ✅ | Good prompt |
| `prompts/e2e.md` | ~80 | ❌ | Doesn't teach Maestro YAML |
| `prompts/content.md` | ~30 | ✅ | Good brand voice guidance |
| `prompts/README.md` | ~30 | ✅ | Accurate docs |
| `app/api/queue-state/route.ts` | ~80 | ⚠️ | Works but uses execSync |
| `app/api/history/route.ts` | ~35 | 🔴 | Command injection |
| `app/api/artifacts/[...path]/route.ts` | ~35 | ✅ | Proper traversal protection |
| `app/api/queue-action/route.ts` | ~55 | ⚠️ | Missing retry handler |
| `app/api/queue-logs/route.ts` | ~20 | ✅ | Simple, works |
| `app/page.tsx` | ~550 | ✅ | Feature-rich dashboard |
| `queue-state.json` | — | ✅ | Currently has 1 processing, 1 queued, 1 failed |
| `healthcheck.yaml` | 5 | ⚠️ | Too weak |
| `mapyourhealth-basic.yaml` | 30 | ✅ | Reasonable basic flow |
