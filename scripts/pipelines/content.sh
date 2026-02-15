#!/bin/bash
ISSUE_ID="${1:?Usage: content.sh <issue-id>}"
SOLUTION_FILE="${2:?Usage: content.sh <issue-id> <solution-file>}"
ARTIFACTS_DIR="$HOME/Documents/ai-queue-dashboard/artifacts/$ISSUE_ID"
LOG_FILE="$ARTIFACTS_DIR/pipeline.log"

mkdir -p "$ARTIFACTS_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Content Pipeline Started for Issue #$ISSUE_ID ==="

# Copy solution to artifacts as the deliverable
cp "$SOLUTION_FILE" "$ARTIFACTS_DIR/content-output.md"
log "✅ Content saved to $ARTIFACTS_DIR/content-output.md"

log "=== Content Pipeline Complete for Issue #$ISSUE_ID ==="
exit 0
