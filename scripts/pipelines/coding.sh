#!/bin/bash
set -eo pipefail

# =============================================================
# Coding Pipeline — mini-swe-agent integration
# Usage: coding.sh <issue-number> [solution-file]
# =============================================================

ISSUE_ID="${1:?Usage: coding.sh <issue-number> [solution-file]}"
SOLUTION_FILE="${2:-}"

MAIN_REPO="$HOME/Documents/MapYourHealth"
WORKTREE_DIR="$HOME/Documents/MapYourHealth-issue-${ISSUE_ID}"
DASHBOARD_DIR="$HOME/Documents/ai-queue-dashboard"
ARTIFACTS_DIR="$DASHBOARD_DIR/artifacts/$ISSUE_ID"
LOG_FILE="$ARTIFACTS_DIR/pipeline.log"
BRANCH_NAME="issue-${ISSUE_ID}"
MINI_MODEL="${MINI_MODEL:-ollama/qwen2.5-coder:32b}"
TIMEOUT_SECONDS="${CODING_TIMEOUT:-1800}"  # 30 minutes

export PATH="$PATH:$HOME/.local/bin"

mkdir -p "$ARTIFACTS_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

fail() {
  log "❌ PIPELINE FAILED: $1"
  cleanup_worktree
  exit 1
}

cleanup_worktree() {
  if [ "${KEEP_WORKTREE:-0}" = "1" ]; then
    log "ℹ️ KEEP_WORKTREE=1, preserving $WORKTREE_DIR"
    return
  fi
  if [ -d "$WORKTREE_DIR" ]; then
    log "🧹 Cleaning up worktree..."
    cd "$MAIN_REPO"
    git worktree remove "$WORKTREE_DIR" --force 2>/dev/null || rm -rf "$WORKTREE_DIR"
  fi
}

log "=== Coding Pipeline Started for Issue #$ISSUE_ID ==="
log "Model: $MINI_MODEL"
log "Timeout: ${TIMEOUT_SECONDS}s"

# -------------------------------------------------------
# Step 1: Fetch issue details from GitHub
# -------------------------------------------------------
log "Step 1/7: Fetching issue details..."
ISSUE_JSON=$(gh issue view "$ISSUE_ID" --repo epiphanyapps/MapYourHealth --json title,body,labels 2>/dev/null) || fail "Failed to fetch issue #$ISSUE_ID from GitHub"
ISSUE_TITLE=$(echo "$ISSUE_JSON" | jq -r '.title // "Unknown"')
ISSUE_BODY=$(echo "$ISSUE_JSON" | jq -r '.body // "No description"')
log "Issue: $ISSUE_TITLE"

# -------------------------------------------------------
# Step 2: Create git worktree
# -------------------------------------------------------
log "Step 2/7: Creating git worktree..."
cd "$MAIN_REPO"

# Clean up existing worktree if present
if [ -d "$WORKTREE_DIR" ]; then
  log "⚠️ Worktree already exists, removing..."
  git worktree remove "$WORKTREE_DIR" --force 2>/dev/null || rm -rf "$WORKTREE_DIR"
fi

# Remove stale branch if it exists
git branch -D "$BRANCH_NAME" 2>/dev/null || true

# Ensure we're on latest main
git fetch origin main >> "$LOG_FILE" 2>&1 || log "⚠️ git fetch failed, continuing with local"

# Create worktree with new branch
git worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR" origin/main >> "$LOG_FILE" 2>&1 || fail "Failed to create worktree"
log "✅ Worktree created at $WORKTREE_DIR"

# -------------------------------------------------------
# Step 3: Copy amplify_outputs.json
# -------------------------------------------------------
log "Step 3/7: Copying amplify_outputs.json..."
if [ -f "$MAIN_REPO/amplify_outputs.json" ]; then
  cp "$MAIN_REPO/amplify_outputs.json" "$WORKTREE_DIR/amplify_outputs.json"
  log "✅ Copied root amplify_outputs.json"
else
  log "⚠️ Root amplify_outputs.json not found"
fi

if [ -f "$MAIN_REPO/apps/mobile/amplify_outputs.json" ]; then
  mkdir -p "$WORKTREE_DIR/apps/mobile"
  cp "$MAIN_REPO/apps/mobile/amplify_outputs.json" "$WORKTREE_DIR/apps/mobile/amplify_outputs.json"
  log "✅ Copied mobile amplify_outputs.json"
fi

# -------------------------------------------------------
# Step 4: Build task description for mini-swe-agent
# -------------------------------------------------------
log "Step 4/7: Preparing task for mini-swe-agent..."

TASK_FILE=$(mktemp /tmp/mini-task-${ISSUE_ID}-XXXXXX.md)

cat > "$TASK_FILE" <<TASK_EOF
# GitHub Issue #${ISSUE_ID}: ${ISSUE_TITLE}

## Issue Description
${ISSUE_BODY}

TASK_EOF

# Append Qwen analysis if provided
if [ -n "$SOLUTION_FILE" ] && [ -f "$SOLUTION_FILE" ]; then
  cat >> "$TASK_FILE" <<QWEN_EOF

## AI Analysis (Pre-planning)
The following analysis was done by an AI planning agent. Use it as guidance:

$(cat "$SOLUTION_FILE")
QWEN_EOF
  log "✅ Appended Qwen analysis from $SOLUTION_FILE"
fi

cat >> "$TASK_FILE" <<FOOTER_EOF

## Instructions
- Fix this issue in the codebase
- Follow existing code patterns and conventions
- Make minimal, focused changes
- Ensure the code compiles and is correct
FOOTER_EOF

TASK_CONTENT=$(cat "$TASK_FILE")
log "Task file: $TASK_FILE ($(wc -c < "$TASK_FILE") bytes)"

# -------------------------------------------------------
# Step 5: Run mini-swe-agent
# -------------------------------------------------------
log "Step 5/7: Running mini-swe-agent..."

cd "$WORKTREE_DIR"

# Build mini args
MINI_ARGS="-m $MINI_MODEL --yolo"

# For local Ollama models, disable cost limit
if [[ "$MINI_MODEL" == ollama/* ]]; then
  MINI_ARGS="$MINI_ARGS"
  log "Using local Ollama model (no cost limit)"
fi

TRAJECTORY_FILE="$ARTIFACTS_DIR/mini-trajectory.json"

# Run with timeout
log "Running: mini $MINI_ARGS -t <task>"
timeout "$TIMEOUT_SECONDS" mini $MINI_ARGS -t "$TASK_CONTENT" > "$ARTIFACTS_DIR/mini-output.log" 2>&1
MINI_EXIT=$?

if [ $MINI_EXIT -eq 124 ]; then
  log "⚠️ mini-swe-agent timed out after ${TIMEOUT_SECONDS}s"
elif [ $MINI_EXIT -ne 0 ]; then
  log "⚠️ mini-swe-agent exited with code $MINI_EXIT"
else
  log "✅ mini-swe-agent completed successfully"
fi

# Save trajectory if it exists
if [ -f "$WORKTREE_DIR/.mini/trajectory.json" ]; then
  cp "$WORKTREE_DIR/.mini/trajectory.json" "$TRAJECTORY_FILE"
  log "✅ Saved trajectory to $TRAJECTORY_FILE"
elif [ -f "$WORKTREE_DIR/.mini-swe-agent/trajectory.json" ]; then
  cp "$WORKTREE_DIR/.mini-swe-agent/trajectory.json" "$TRAJECTORY_FILE"
  log "✅ Saved trajectory to $TRAJECTORY_FILE"
else
  log "ℹ️ No trajectory file found"
fi

# -------------------------------------------------------
# Step 6: Check for changes and create PR
# -------------------------------------------------------
log "Step 6/7: Checking for code changes..."
cd "$WORKTREE_DIR"

CHANGED_FILES=$(git diff --name-only 2>/dev/null || true)
UNTRACKED_FILES=$(git ls-files --others --exclude-standard 2>/dev/null || true)

if [ -z "$CHANGED_FILES" ] && [ -z "$UNTRACKED_FILES" ]; then
  log "ℹ️ No code changes detected. mini-swe-agent did not modify any files."
  log "=== Coding Pipeline Complete (no changes) for Issue #$ISSUE_ID ==="
  cleanup_worktree
  rm -f "$TASK_FILE"
  exit 0
fi

log "Changed files:"
echo "$CHANGED_FILES" | while read -r f; do [ -n "$f" ] && log "  M $f"; done
echo "$UNTRACKED_FILES" | while read -r f; do [ -n "$f" ] && log "  A $f"; done

# Stage and commit
git add -A
git commit -m "fix: address issue #${ISSUE_ID} - ${ISSUE_TITLE}

Automated fix generated by mini-swe-agent ($MINI_MODEL).
Fixes #${ISSUE_ID}" >> "$LOG_FILE" 2>&1 || fail "git commit failed"
log "✅ Changes committed"

# Push branch
git push origin "$BRANCH_NAME" >> "$LOG_FILE" 2>&1 || fail "git push failed"
log "✅ Branch pushed to origin/$BRANCH_NAME"

# Create PR
PR_URL=$(gh pr create \
  --repo epiphanyapps/MapYourHealth \
  --base main \
  --head "$BRANCH_NAME" \
  --title "Fix #${ISSUE_ID}: ${ISSUE_TITLE}" \
  --body "## Automated Fix for #${ISSUE_ID}

This PR was generated by **mini-swe-agent** (\`$MINI_MODEL\`) via the AI queue system.

### Changes
\`\`\`
$(git diff --stat HEAD~1)
\`\`\`

### Issue
Fixes #${ISSUE_ID}

### Review Notes
- Auto-generated code — please review carefully
- Generated by: \`$MINI_MODEL\`
" \
  --assignee waltermvp 2>&1) || log "⚠️ PR creation failed (branch pushed, create manually)"

if [ -n "$PR_URL" ]; then
  log "✅ PR created: $PR_URL"
fi

# -------------------------------------------------------
# Step 7: Cleanup
# -------------------------------------------------------
log "Step 7/7: Cleanup..."
rm -f "$TASK_FILE"
cleanup_worktree

log ""
log "=== Coding Pipeline Complete for Issue #$ISSUE_ID ==="
log "Branch: $BRANCH_NAME"
[ -n "$PR_URL" ] && log "PR: $PR_URL"
exit 0
