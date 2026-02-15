#!/bin/bash
set -e

ISSUE_ID="${1:?Usage: coding.sh <issue-id>}"
REPO="${2:-epiphanyapps/MapYourHealth}"
SOLUTION_FILE="${3:?Usage: coding.sh <issue-id> <repo> <solution-file>}"
LOG_FILE="$HOME/Documents/ai-queue-dashboard/artifacts/$ISSUE_ID/pipeline.log"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Coding Pipeline Started for Issue #$ISSUE_ID ==="
log "Repository: $REPO"

# For now, this is a placeholder that calls the existing pr-worker
# The pr-worker handles: worktree → apply changes → lint → PR
log "Delegating to pr-worker.js..."
cd "$HOME/Documents/ai-queue-dashboard"
node scripts/pr-worker.js "$REPO" "$ISSUE_ID" >> "$LOG_FILE" 2>&1 || {
  log "⚠️ PR worker finished with errors"
  exit 1
}

log "=== Coding Pipeline Complete for Issue #$ISSUE_ID ==="
exit 0
