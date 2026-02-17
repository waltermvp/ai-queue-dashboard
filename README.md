# 🤖 AI Issue Queue Dashboard

Automated GitHub issue processing pipeline powered by local LLMs, mini-swe-agent, Maestro device testing, and intelligent issue routing.

## Overview

```
GitHub Issue → Detect Type (label) → Route to Pipeline → Process → Results
                                         │
                         ┌───────────────┼───────────────┐
                         ▼               ▼               ▼
                    🔧 Coding       🧪 E2E Testing   📝 Content
                   mini-swe-agent   Maestro + Device   Llama 3.1 70B
                   + Qwen 2.5 32B  + Codestral 22B    (writing/copy)
                         │               │               │
                         ▼               ▼               ▼
                    PR Created      Pass/Fail + Video   Generated Text
```

The system watches GitHub repos for issues, detects the type from labels, routes to the appropriate pipeline, and processes automatically. Coding issues use [mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent) for actual code changes. E2E issues run Maestro tests on real devices with video recording.

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

The queue worker detects issue type from GitHub labels and routes to the matching pipeline.

### 1. 🔧 Coding (default)
**Label:** `coding` or no label  
**Pipeline:** `scripts/pipelines/coding.sh`  
**Agent:** [mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent) + Qwen 2.5 Coder 32B

**Workflow:**
1. Qwen analyzes the issue (planning, file identification, approach)
2. Creates a git worktree: `~/Documents/MapYourHealth-issue-{number}`
3. Copies required `amplify_outputs.json` from main clone
4. Runs mini-swe-agent with Qwen's analysis as context
5. If files changed: creates branch `issue-{number}`, commits, pushes
6. Opens PR assigned to `waltermvp` referencing the issue
7. Saves trajectory to `artifacts/{number}/mini-trajectory.json`

**Model:** `ollama/qwen2.5-coder:32b` — best local coding model for analysis + implementation

### 2. 🧪 E2E Testing
**Label:** `e2e`  
**Pipeline:** `scripts/pipelines/e2e.sh`  
**Model:** `ollama/codestral:22b` — Mistral's code model, fast for structured YAML/test generation  
**Tools:** Maestro + adb screenrecord

**Workflow:**
1. Sync amplify outputs
2. Build release APK (with smart caching by native dep hash)
3. Verify device connectivity
4. Install APK + health check (app must visibly load)
5. Run Maestro tests with per-flow video recording
   - Uses Qwen-generated flows if available
   - Falls back to `mapyourhealth-basic.yaml`
6. Post-test validation: exit code + screenshots + video verification
7. Summary: X/Y flows passed, Z videos recorded

**⚠️ CRITICAL:** E2E tests MUST use release builds. Dev builds show the React Native dev menu which breaks Maestro automation.

**Devices:**
| Device | Type | ID | Status |
|--------|------|----|--------|
| Moto E13 | Android | `ZL73232GKP` | ✅ Primary |
| iPhone 11 | iOS | `00008030-001950891A53402E` | ✅ Available |

### 3. 📝 Content Generation
**Label:** `content`  
**Pipeline:** `scripts/pipelines/content.sh`  
**Model:** `ollama/llama3.1:70b` — general-purpose model with strong writing quality

**Workflow:**
1. Qwen generates content based on issue requirements
2. Output saved to `artifacts/{number}/content-output.md`

---

## Architecture

```
ai-queue-dashboard/
├── scripts/
│   ├── queue-worker.js          # Queue watcher: polls, routes, processes
│   ├── pr-worker.js             # Legacy PR worker
│   ├── db.js                    # SQLite history layer
│   ├── db-api.js                # DB CLI API for Next.js routes
│   └── pipelines/
│       ├── coding.sh            # mini-swe-agent pipeline
│       ├── e2e.sh               # Maestro + device testing pipeline
│       └── content.sh           # Content generation pipeline
├── prompts/
│   ├── coding.md                # Coding analysis prompt (fed to Qwen)
│   ├── e2e.md                   # E2E testing prompt
│   ├── content.md               # Content generation prompt
│   └── react-native-coding-standards.md
├── app/                         # Next.js dashboard
│   ├── api/
│   │   ├── queue-state/         # Live queue data (JSON + SQLite)
│   │   ├── queue-action/        # Control actions (load, remove, clear)
│   │   ├── history/             # Historical run data
│   │   └── artifacts/           # Video/log artifact serving
│   └── page.tsx                 # Dashboard UI
├── artifacts/                   # Per-issue artifacts (videos, logs, trajectories)
│   └── {issue-number}/
│       ├── pipeline.log
│       ├── android-*.mp4        # E2E recordings
│       ├── mini-trajectory.json # Coding agent trajectory
│       └── qwen-solution.md
├── queue-state.json             # Live queue state (atomic writes)
├── queue-history.db             # SQLite history (completed/failed/stats)
└── README.md
```

## Data Flow

```
queue-state.json (live)          queue-history.db (SQLite)
┌──────────────────┐             ┌──────────────────┐
│ queue: [...]     │             │ runs table       │
│ processing: {}   │ ──done──►  │ artifacts table  │
│ completed: [...]│             │ stats/history    │
│ failed: [...]   │             └──────────────────┘
└──────────────────┘
```

- **Live state** (queue, processing) from `queue-state.json`
- **Historical data** (completed, failed, stats) from SQLite
- Atomic JSON writes (`.tmp` + rename) prevent corruption
- Stale processing recovery: items stuck >30 min auto-fail

## Tech Stack

- **Coding Agent:** [mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent) v2.1.0
- **LLMs (all local via Ollama, no API costs):**
  - `qwen2.5-coder:32b` (19GB) — coding analysis + implementation
  - `codestral:22b` (12GB) — E2E test flow generation
  - `llama3.1:70b` (42GB) — content writing (blogs, ads, copy)
- **E2E Testing:** Maestro 2.1.0 + physical Android/iOS devices
- **Dashboard:** Next.js 14 + TypeScript + Tailwind CSS
- **Database:** SQLite via better-sqlite3
- **CI/Git:** GitHub CLI (`gh`) for issues/PRs
- **Runtime:** Node.js 20 (via nvm)
- **Monitoring:** Telegram updates 3x daily to QueensClaw group

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

# Clear completed items
node scripts/queue-worker.js cleanup

# Remove specific issue
node scripts/queue-worker.js remove <issueNumber>

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
| Coding | `qwen2.5-coder:32b` | 19GB | Best local coding model — strong at reading code, generating patches |
| E2E | `codestral:22b` | 12GB | Mistral's code model — fast, good at structured YAML/test output |
| Content | `llama3.1:70b` | 42GB | General-purpose — writes like a human, not an engineer |

Only one model runs at a time (queue is sequential), so Ollama swaps them in/out of memory as needed.

```bash
# Check available models
ollama list

# Pull a model
ollama pull codestral:22b

# Check running model
ollama ps
```

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
