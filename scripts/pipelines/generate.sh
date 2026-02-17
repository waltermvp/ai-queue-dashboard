#!/bin/bash
ISSUE_ID="${1:?Usage: generate.sh <issue-id> <solution-file>}"
SOLUTION_FILE="${2:?Usage: generate.sh <issue-id> <solution-file>}"
DASHBOARD_DIR="${DASHBOARD_DIR:-$HOME/Documents/ai-queue-dashboard}"
ARTIFACTS_DIR="${ARTIFACTS_DIR:-$DASHBOARD_DIR/artifacts/$ISSUE_ID}"
LOG_FILE="$ARTIFACTS_DIR/pipeline.log"

mkdir -p "$ARTIFACTS_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Generate Pipeline Started for Issue #$ISSUE_ID ==="

# Copy solution to artifacts as the deliverable
cp "$SOLUTION_FILE" "$ARTIFACTS_DIR/content-output.md"
log "✅ Content saved to $ARTIFACTS_DIR/content-output.md"

log "=== Generate Pipeline Complete for Issue #$ISSUE_ID ==="
exit 0
