# Execution Pipelines

Pipeline scripts that run **after** Qwen analysis completes. Each pipeline is a standalone bash script triggered by `queue-worker.js` based on the issue type.

## How It Works

1. Queue worker processes an issue with Qwen (Ollama)
2. If Qwen succeeds, `executePipeline()` runs the matching script
3. Pipeline logs to `artifacts/{issue-id}/pipeline.log`
4. Results are tracked in queue state (`pipelineExecuted`, `pipelineSuccess`)

## Pipelines

| Script | Trigger Label | What It Does |
|--------|--------------|--------------|
| `e2e.sh` | `e2e` | sync amplify → prebuild → build APK → install on device → Maestro tests with recording |
| `coding.sh` | *(default)* | Delegates to `pr-worker.js` (worktree → apply → lint → PR) |
| `content.sh` | `content` | Saves Qwen output to `artifacts/{id}/content-output.md` |

## Usage

### Run independently (for testing)

```bash
# E2E pipeline
./scripts/pipelines/e2e.sh 42

# Coding pipeline
./scripts/pipelines/coding.sh 42 epiphanyapps/MapYourHealth /path/to/solution.md

# Content pipeline
./scripts/pipelines/content.sh 42 /path/to/solution.md
```

### Via queue worker (automatic)

Pipelines run automatically when the queue worker processes items in watch mode:

```bash
node scripts/queue-worker.js watch 30000
```

## Adding a New Pipeline

1. Create `scripts/pipelines/<type>.sh` (must be executable)
2. Accept `$1` as the issue ID
3. Log to `$HOME/Documents/ai-queue-dashboard/artifacts/$ISSUE_ID/pipeline.log`
4. Add the corresponding label detection in `detectIssueType()` in `queue-worker.js`
5. Add a matching prompt in `prompts/<type>.md`

## Environment Requirements

- **Node.js 20+** (use `nvm use 20`)
- **Ollama** running on `localhost:11434` with `qwen2.5-coder:32b`
- **Android SDK** (`adb` in PATH) for e2e
- **Maestro** (`~/.maestro/bin` in PATH) for e2e
- **Moto E13** device connected (ID: `ZL73232GKP`) for e2e
- **yarn** for amplify sync
