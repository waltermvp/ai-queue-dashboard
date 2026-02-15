# 🤖 AI Issue Queue Dashboard

Automated GitHub issue → code → PR → E2E testing pipeline powered by local LLMs and Maestro device testing.

## Overview

```
GitHub Issue → AI Queue → Qwen 2.5 Coder 32B (local) → PR → Maestro E2E Tests → Results on PR
```

The system watches GitHub repos for assigned issues, generates code fixes using a local Ollama model, creates PRs, and optionally runs end-to-end tests on physical devices.

## 🚀 Quick Start

```bash
# Start the dashboard
cd ~/Documents/ai-queue-dashboard && nvm use 20 && npm run dev

# Process a single issue
node scripts/pr-worker.js epiphanyapps/MapYourHealth 94

# Process with E2E testing skipped
node scripts/pr-worker.js epiphanyapps/MapYourHealth 94 --skip-e2e
```

**Dashboard:** http://localhost:3001 (local) / http://192.168.1.227:3001 (network)

## How It Works

### 1. Adding Issues
Create GitHub issues in any monitored repo. Be specific about files to modify and expected changes. See `prompts/react-native-coding-standards.md` for issue writing guidelines.

### 2. Code Generation
The PR worker (`scripts/pr-worker.js`):
1. Fetches issue details from GitHub
2. Creates a git worktree for isolation
3. Discovers relevant source files based on issue keywords
4. Sends code context + issue to **Qwen 2.5 Coder 32B** via Ollama (local, no API costs)
5. Parses SEARCH/REPLACE edit blocks from LLM output
6. Applies edits, runs prettier/eslint/tsc validation
7. Self-corrects up to 2 times if validation fails
8. Commits, pushes, and creates a PR

### 3. E2E Testing (Auto-Detected)
After PR creation, the worker checks if the issue needs device testing:

**Detection:** Issues with `e2e` or `test` labels, or containing keywords like "e2e", "maestro", "end-to-end" in title/body.

**Pipeline:**
1. **Build** — Expo prebuild + Gradle assembleDebug (Android)
2. **Install** — `adb install` to Moto E13 (`ZL73232GKP`)
3. **Test** — Maestro runs all flows in `apps/mobile/.maestro/flows/`
4. **Report** — Results posted as a PR comment

Each step is fault-tolerant — failures are reported on the PR without crashing the worker.

**Skip with:** `--skip-e2e` flag

### 4. Monitoring
- **Dashboard** at localhost:3001 — real-time queue status, controls, history
- **Telegram updates** — 3x daily summaries of queue progress
- **Queue state** stored in `queue-state.json`

## Available Commands

| Command | Description |
|---------|-------------|
| `node scripts/pr-worker.js <repo> <issue>` | Process a single issue |
| `node scripts/pr-worker.js <url>` | Process by GitHub issue URL |
| `--skip-e2e` | Skip E2E testing |
| Dashboard: Load Issues | Fetch latest assigned issues |
| Dashboard: Process One | Trigger next issue processing |
| Dashboard: Cleanup | Clear completed items |

## Available Devices

| Device | Type | ID | Status |
|--------|------|----|--------|
| Moto E13 | Android | `ZL73232GKP` | ✅ Primary |
| iPhone 11 | iOS | `00008030-001950891A53402E` | ✅ Available |
| iPhone 16e | iOS | `00008140-0018288A0CBA801C` | Available |

## Architecture

```
ai-queue-dashboard/
├── scripts/
│   └── pr-worker.js          # Main worker: issue → code → PR → E2E
├── prompts/
│   └── react-native-coding-standards.md  # LLM coding guidelines
├── app/                       # Next.js dashboard
│   ├── api/
│   │   ├── queue-state/       # Queue data API
│   │   └── queue-action/      # Control actions API
│   └── page.tsx               # Dashboard UI
├── queue-state.json           # Persistent queue state
└── README.md
```

## Tech Stack

- **LLM:** Qwen 2.5 Coder 32B via Ollama (local)
- **E2E:** Maestro + physical Android/iOS devices
- **Dashboard:** Next.js 14 + TypeScript + Tailwind CSS
- **CI:** GitHub CLI (`gh`) for issues/PRs
- **Runtime:** Node.js 20

## Troubleshooting

**Build fails:** Ensure `nvm use 20`, Expo CLI installed, Android SDK available.
**Device not found:** Check `adb devices` for `ZL73232GKP`. Reconnect USB if needed.
**Maestro fails:** Ensure `$HOME/.maestro/bin` is in PATH. Run `maestro --version`.
**Ollama timeout:** Model needs ~42GB RAM. Check `ollama ps` and restart if needed.
