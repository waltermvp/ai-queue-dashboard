# 🤖 AI Issue Queue Dashboard

Automated GitHub issue processing pipeline powered by local LLMs, Maestro device testing, and intelligent issue routing.

## Overview

```
GitHub Issue → Detect Type (label) → Load Prompt → Qwen 2.5 Coder 32B (local) → Execute Workflow → Results
```

The system watches GitHub repos for assigned issues, detects the issue type from labels, routes to the appropriate workflow (coding, E2E testing, or content generation), and processes using a local Ollama model. No API costs — everything runs locally.

## 🚀 Quick Start

```bash
# Start the dashboard
cd ~/Documents/ai-queue-dashboard && nvm use 20 && npm run dev

# Start the queue watcher (auto-processes new items)
node scripts/queue-worker.js watch 30000

# Process a single issue via PR worker
node scripts/pr-worker.js epiphanyapps/MapYourHealth 94

# Process with E2E testing skipped
node scripts/pr-worker.js epiphanyapps/MapYourHealth 94 --skip-e2e
```

**Dashboard:** http://localhost:3001 (local) / http://192.168.1.227:3001 (network)

---

## Issue Types & Routing

The queue worker detects issue type from GitHub labels and loads the matching prompt from `prompts/`. This determines the entire workflow for that issue.

### 1. 🔧 Coding (default)
**Label:** `coding` or no label (default)
**Prompt:** `prompts/coding.md`
**Model:** Qwen 2.5 Coder 32B

**Workflow:**
1. Fetch issue details from GitHub
2. Analyze codebase, identify root cause
3. Generate code fix following React Native coding standards
4. Create branch `issue-{number}`, commit, push
5. Open PR assigned to `waltermvp`

**When to use:** Bug fixes, feature implementations, refactors, performance improvements — any issue that requires code changes.

### 2. 🧪 E2E Testing
**Label:** `e2e`
**Prompt:** `prompts/e2e.md`
**Model:** Qwen 2.5 Coder 32B

**Workflow:**
1. Sync amplify outputs (`yarn sync:amplify`)
2. **Build RELEASE APK** (critical — no dev builds!)
   ```bash
   cd apps/mobile && npx expo prebuild --platform android --clean
   cd android && ./gradlew assembleRelease
   ```
3. Install on Moto E13: `adb -s ZL73232GKP install -r app/build/outputs/apk/release/app-release.apk`
4. Run Maestro tests: `maestro --device ZL73232GKP test ~/maestro-farm/flows/android/`
5. (Optional) iOS: start bridge, then run iOS flows
6. Report results — pass/fail, screenshots, logs

**⚠️ CRITICAL:** E2E tests MUST use release builds. Dev builds show the React Native dev menu which breaks Maestro automation. Release builds bundle JS into the APK — no Metro bundler needed.

**When to use:** UI validation, flow testing, regression testing, new feature verification on real devices.

### 3. 📝 Content Generation
**Label:** `content`
**Prompt:** `prompts/content.md`
**Model:** Qwen 2.5 Coder 32B

**Workflow:**
1. Read issue for content requirements
2. Generate content (marketing copy, docs, social posts, changelogs)
3. Output formatted text ready for use

**When to use:** App store descriptions, release notes, blog posts, social media content, documentation updates, marketing copy.

### How Routing Works

```
Issue comes in
  → Check labels array for 'e2e' or 'content'
  → Match found? Load prompts/{type}.md
  → No match? Default to prompts/coding.md
  → Append react-native-coding-standards.md for coding/e2e types
  → Send to Qwen with issue context
  → Execute type-specific workflow
```

See `prompts/README.md` for detailed routing documentation.

---

## How It Works (Detailed)

### Adding Issues
Create GitHub issues in any monitored repo. **Use labels to control routing:**
- No label → coding workflow
- `e2e` label → E2E testing workflow
- `content` label → content generation workflow

Be specific about files to modify and expected changes. See `prompts/react-native-coding-standards.md` for code issue guidelines.

### Code Generation (PR Worker)
The PR worker (`scripts/pr-worker.js`):
1. Fetches issue details from GitHub
2. Creates a git worktree for isolation
3. Discovers relevant source files based on issue keywords
4. Sends code context + issue to **Qwen 2.5 Coder 32B** via Ollama (local, no API costs)
5. Parses SEARCH/REPLACE edit blocks from LLM output
6. Applies edits, runs prettier/eslint/tsc validation
7. Self-corrects up to 2 times if validation fails
8. Commits, pushes, and creates a PR

### E2E Testing Pipeline
After PR creation or for standalone E2E issues:

**Build (Release APK — NOT dev build):**
```bash
cd ~/Documents/MapYourHealth && yarn sync:amplify
cd apps/mobile && npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
```

**Install & Test:**
```bash
adb -s ZL73232GKP install -r app/build/outputs/apk/release/app-release.apk
export PATH="$PATH:$HOME/.maestro/bin"
maestro --device ZL73232GKP test ~/maestro-farm/flows/android/
```

**iOS (requires bridge):**
```bash
# Terminal 1
maestro-ios-device --team-id 22X6D48M4G --device 00008030-001950891A53402E
# Terminal 2
maestro --driver-host-port 6001 --device 00008030-001950891A53402E test ~/maestro-farm/flows/ios/
```

Each step is fault-tolerant — failures are reported without crashing the worker.

### Queue Watcher
The queue worker (`scripts/queue-worker.js`) runs in watch mode:
- Polls `queue-state.json` every 30 seconds
- Auto-picks up new items by priority (high → medium → low)
- Detects issue type from labels
- Loads the right prompt and processes
- Immediately checks for more items after completing one

### Monitoring
- **Dashboard** at localhost:3001 — real-time queue status, controls, history
- **Telegram updates** — 3x daily to QueensClaw group (9am, 2pm, 8pm EST)
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
│   ├── queue-worker.js        # Queue watcher: polls, routes, processes
│   ├── pr-worker.js           # PR worker: issue → code → PR → E2E
│   └── auto-queue-processor.js
├── prompts/
│   ├── README.md              # How issue routing works
│   ├── coding.md              # Coding workflow prompt
│   ├── e2e.md                 # E2E testing workflow prompt
│   ├── content.md             # Content generation workflow prompt
│   ├── react-native-coding-standards.md  # Shared coding standards
│   └── device-testing-integration.md     # Device farm integration
├── app/                       # Next.js dashboard
│   ├── api/
│   │   ├── queue-state/       # Queue data API
│   │   └── queue-action/      # Control actions API
│   └── page.tsx               # Dashboard UI
├── queue-state.json           # Persistent queue state
└── README.md                  # ← You are here
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
