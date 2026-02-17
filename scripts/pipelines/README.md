# Execution Pipelines

Pipeline scripts that run **after** LLM analysis completes. Each pipeline is a standalone bash script triggered by `queue-worker.js` based on the issue type.

## How It Works

1. Queue worker processes an issue with LLM (Ollama)
2. If LLM succeeds, `executePipeline()` runs the matching script
3. Pipeline receives env vars: `REPO_FULL`, `WORKTREE_DIR`, `ARTIFACTS_DIR`, `DASHBOARD_DIR`, `ISSUE_TYPE`, etc.
4. Pipeline logs to `$ARTIFACTS_DIR/pipeline.log`
5. Results are tracked in queue state (`pipelineExecuted`, `pipelineSuccess`)

## Pipelines

| Script | Label | Old Label | What It Does |
|--------|-------|-----------|--------------|
| `implement.sh` | `ai:implement` (default) | `coding` | Worktree → mini-swe-agent → lint → PR |
| `test.sh` | `ai:test` | `e2e` | Sync amplify → build APK → install → Maestro tests with recording |
| `generate.sh` | `ai:generate` | `content` | Saves LLM output to `$ARTIFACTS_DIR/content-output.md` |
| `build.sh` | `ai:build` | — | 🚧 Not yet implemented |
| `review.sh` | `ai:review` | — | 🚧 Not yet implemented |

## Usage

### Run independently (for testing)

```bash
# Implement pipeline
./scripts/pipelines/implement.sh 42 /path/to/solution.md

# Test pipeline
./scripts/pipelines/test.sh 42

# Generate pipeline
./scripts/pipelines/generate.sh 42 /path/to/solution.md
```

### Via queue worker (automatic)

Pipelines run automatically when the queue worker processes items in watch mode:

```bash
node scripts/queue-worker.js watch 30000
```

## Adding a New Pipeline

1. Create `scripts/pipelines/<type>.sh` (must be executable)
2. Accept `$1` as the issue ID
3. Use env vars (`ARTIFACTS_DIR`, `WORKTREE_DIR`, etc.) with fallback defaults
4. Add config entry in `routing.config.json` under `pipelines` and `routing`
5. Add a matching prompt in `prompts/<type>.md`

## Environment Requirements

- **Node.js 20+** (use `nvm use 20`)
- **Ollama** running on `localhost:11434`
- **Android SDK** (`adb` in PATH) for test pipeline
- **Maestro** (`~/.maestro/bin` in PATH) for test pipeline
- **Moto E13** device connected (ID: `ZL73232GKP`) for test pipeline
- **yarn** for amplify sync
