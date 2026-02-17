# 🤖 AI Issue Queue Dashboard

Automated GitHub issue processing pipeline powered by local LLMs, mini-swe-agent, Maestro device testing, and intelligent issue routing.

## Overview

```
GitHub Issue → Detect Type (ai: label) → Route to Pipeline → Process → Results
                                              │
                    ┌────────────┬────────────┼────────────┬────────────┐
                    ▼            ▼            ▼            ▼            ▼
              🔧 Implement  🧪 Test     📝 Generate  🏗️ Build    👀 Review
              mini-swe-agent Maestro     Llama 3.1    APK/IPA    AI code
              + Qwen 32B    + Device    70B writing   builds     review
                    │            │            │            │            │
                    ▼            ▼            ▼            ▼            ▼
              PR Created    Pass/Fail    Generated    Build        Review
                            + Video      Text        Artifact     Comments
```

The system watches GitHub repos for issues, detects the type from labels, routes to the appropriate pipeline, and processes automatically. Implement issues use [mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent) for actual code changes. Test issues run Maestro tests on real devices with video recording.

## 🚀 Quick Start

```bash
# Start the dashboard
cd ~/Documents/ai-queue-dashboard && nvm use 20 && npm run dev

# Start the queue watcher (auto-processes every 30s)
node scripts/queue-worker.js watch 30000

# Or process a single issue
node scripts/queue-worker.js process
```

**Dashboard:** http://localhost:3001 (local) / http://192.168.1.227:3001 (network)

### Dashboard Controls
- **Add Issues** — Browse open issues from any repo (epiphanyapps + waltermvp orgs), selectively add to queue
- **Process One** — Triggers processing of next queued item
- **Cancel** — Kills the currently running pipeline (appears while processing)
- **Clear All** — Empties the queue
- **Clear History** — Clears completed/failed items
- **❌ per item** — Remove individual queued issues
- **🔄 Retry** — Move failed issues back to queue

---

## Issue Types & Routing

The queue worker detects issue type from GitHub labels (using `ai:` prefix) and routes to the matching pipeline. Old labels (`coding`, `e2e`, `content`) are supported as aliases.

| Pipeline | Label | Old Label | Model | Status |
|----------|-------|-----------|-------|--------|
| **implement** | `ai:implement` (or no label) | `coding` | Qwen 2.5 Coder 32B | ✅ Active |
| **test** | `ai:test` | `e2e` | Codestral 22B | ✅ Active |
| **generate** | `ai:generate` | `content` | Llama 3.1 70B | ✅ Active |
| **build** | `ai:build` | — | — | 🚧 Placeholder |
| **review** | `ai:review` | — | Qwen 2.5 Coder 32B | 🚧 Placeholder |

### 1. 🔧 Implement (default)
**Label:** `ai:implement` or no label  
**Pipeline:** `scripts/pipelines/implement.sh`  
**Agent:** [mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent) + Qwen 2.5 Coder 32B

**Workflow:**
1. Qwen analyzes the issue (planning, file identification, approach)
2. Creates a git worktree (configurable via `WORKTREE_DIR` env var)
3. Copies required `amplify_outputs.json` from main clone
4. Runs mini-swe-agent with Qwen's analysis as context
5. If files changed: creates branch `issue-{number}`, commits, pushes
6. Opens PR assigned to `waltermvp` referencing the issue
7. Saves trajectory to artifacts

### 2. 🧪 Test
**Label:** `ai:test`  
**Pipeline:** `scripts/pipelines/test.sh`  
**Model:** `ollama/codestral:22b` — Mistral's code model, fast for structured YAML/test generation  
**Tools:** Maestro + adb screenrecord

**Workflow:**
1. Sync amplify outputs
2. Build release APK (with smart caching by native dep hash)
3. Verify device connectivity
4. Install APK + health check
5. Run Maestro tests with per-flow video recording
6. Post-test validation: exit code + screenshots + video verification
7. Summary: X/Y flows passed, Z videos recorded

**⚠️ CRITICAL:** Tests MUST use release builds. Dev builds show the React Native dev menu which breaks Maestro automation.

**Devices:**
| Device | Type | ID | Status |
|--------|------|----|--------|
| Moto E13 | Android | `ZL73232GKP` | ✅ Primary |
| iPhone 11 | iOS | `00008030-001950891A53402E` | ✅ Available |

### 3. 📝 Generate
**Label:** `ai:generate`  
**Pipeline:** `scripts/pipelines/generate.sh`  
**Model:** `ollama/llama3.1:70b` — general-purpose model with strong writing quality

**Workflow:**
1. LLM generates content based on issue requirements
2. Output saved to artifacts as `content-output.md`

### 4. 🏗️ Build (placeholder)
**Label:** `ai:build`  
**Pipeline:** `scripts/pipelines/build.sh` (not yet implemented)

### 5. 👀 Review (placeholder)
**Label:** `ai:review`  
**Pipeline:** `scripts/pipelines/review.sh` (not yet implemented)

---

## Architecture

```
ai-queue-dashboard/
├── scripts/
│   ├── queue-worker.js          # Queue watcher: polls, routes, processes
│   ├── pr-worker.js             # Standalone PR worker
│   ├── db.js                    # SQLite history layer
│   ├── db-api.js                # DB CLI API for Next.js routes
│   └── pipelines/
│       ├── implement.sh         # mini-swe-agent pipeline
│       ├── test.sh              # Maestro + device testing pipeline
│       └── generate.sh          # Content generation pipeline
├── prompts/
│   ├── implement.md             # Implement analysis prompt
│   ├── test.md                  # Test generation prompt
│   ├── generate.md              # Content generation prompt
│   └── react-native-coding-standards.md
├── routing.config.json          # v2 config: pipelines, routing, repos
├── app/                         # Next.js dashboard
│   ├── api/
│   │   ├── queue-state/         # Live queue data (JSON + SQLite)
│   │   ├── queue-action/        # Control actions (load, remove, clear)
│   │   ├── history/             # Historical run data
│   │   └── artifacts/           # Video/log artifact serving
│   └── page.tsx                 # Dashboard UI
├── artifacts/                   # Per-issue artifacts
│   └── {issue-number}/
│       ├── pipeline.log
│       ├── android-*.mp4        # Test recordings
│       ├── mini-trajectory.json # Agent trajectory
│       └── ai-solution.md       # LLM output (model-agnostic)
├── queue-state.json             # Live queue state (atomic writes)
├── queue-history.db             # SQLite history (composite unique on repo+issue)
└── README.md
```

## Configuration (routing.config.json v2)

```json
{
  "version": 2,
  "defaults": {
    "pipeline": "implement",
    "worktreeBase": "~/Documents/worktrees",
    "artifactsBase": "artifacts"
  },
  "pipelines": {
    "implement": { "script": "scripts/pipelines/implement.sh", "prompt": "prompts/implement.md", ... },
    "test": { "script": "scripts/pipelines/test.sh", "prompt": "prompts/test.md", ... },
    "generate": { "script": "scripts/pipelines/generate.sh", "prompt": "prompts/generate.md", ... },
    "build": { "enabled": false, ... },
    "review": { "enabled": false, ... }
  },
  "routing": {
    "ai:implement": "implement", "ai:test": "test", "ai:generate": "generate",
    "coding": "implement", "e2e": "test", "content": "generate",
    "*": "implement"
  },
  "repos": { ... }
}
```

## Environment Variables (passed to pipelines)

| Variable | Description | Example |
|----------|-------------|---------|
| `REPO_OWNER` | GitHub org/user | `epiphanyapps` |
| `REPO_NAME` | Repository name | `MapYourHealth` |
| `REPO_FULL` | Full repo path | `epiphanyapps/MapYourHealth` |
| `WORKTREE_DIR` | Git worktree path | `~/Documents/worktrees/epiphanyapps/MapYourHealth/issue-112` |
| `ARTIFACTS_DIR` | Artifacts output dir | `artifacts/epiphanyapps/MapYourHealth/112` |
| `MAIN_CLONE_DIR` | Main repo clone | `~/Documents/MapYourHealth` |
| `ISSUE_TYPE` | Pipeline type | `implement` |
| `DASHBOARD_DIR` | Dashboard root | `~/Documents/ai-queue-dashboard` |

## Queue Commands

```bash
# Watch mode (recommended)
node scripts/queue-worker.js watch 30000

# Process next item once
node scripts/queue-worker.js process

# Load issues from GitHub
node scripts/queue-worker.js load-github

# Check status
node scripts/queue-worker.js status

# Add a specific issue by number (optional repo)
node scripts/queue-worker.js add-issue 112
node scripts/queue-worker.js add-issue 5 waltermvp/ai-queue-dashboard

# Cancel currently processing issue
node scripts/queue-worker.js cancel

# Retry a failed issue
node scripts/queue-worker.js retry <issueNumber>

# Clear all queued items
node scripts/queue-worker.js clear-all

# Clear history (completed + failed)
node scripts/queue-worker.js clear-history
```

## Models

Each pipeline uses a different model optimized for its task. Models are configured in `routing.config.json` and run locally via Ollama (no API costs).

| Pipeline | Model | Size | Why |
|----------|-------|------|-----|
| Implement | `qwen2.5-coder:32b` | 19GB | Best local coding model — strong at reading code, generating patches |
| Test | `codestral:22b` | 12GB | Mistral's code model — fast, good at structured YAML/test output |
| Generate | `llama3.1:70b` | 42GB | General-purpose — writes like a human, not an engineer |

Only one model runs at a time (queue is sequential), so Ollama swaps them in/out of memory as needed.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails | `nvm use 20`, check Android SDK, run `yarn sync:amplify` |
| Device not found | `adb devices` — reconnect USB if `ZL73232GKP` missing |
| Maestro fails | Check `$HOME/.maestro/bin` in PATH, `maestro --version` |
| Ollama timeout | Model needs ~20GB VRAM. `ollama ps`, restart if hung |
| Worker hangs | Kill and restart: `pkill -f queue-worker && node scripts/queue-worker.js watch 30000` |
| Dashboard down | `nvm use 20 && nohup npx next dev -p 3001 -H 0.0.0.0 &` |
| mini-swe-agent not found | `which mini` — install with `uv tool install mini-swe-agent` |
| Stale processing | Worker auto-recovers items stuck >30 min on restart |
