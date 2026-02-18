#!/bin/bash
set -eo pipefail

# =============================================================
# Implement Pipeline — Qwen direct code generation
# Usage: implement.sh <issue-number> [solution-file]
# Env vars (from worker): REPO_FULL, REPO_OWNER, REPO_NAME,
#   MAIN_CLONE_DIR, WORKTREE_DIR, ARTIFACTS_DIR, DASHBOARD_DIR
# =============================================================

ISSUE_ID="${1:?Usage: implement.sh <issue-number> [solution-file]}"
SOLUTION_FILE="${2:-}"

MAIN_REPO="${MAIN_CLONE_DIR:-$HOME/Documents/MapYourHealth}"
WORKTREE_DIR="${WORKTREE_DIR:-$HOME/Documents/MapYourHealth-issue-${ISSUE_ID}}"
DASHBOARD_DIR="${DASHBOARD_DIR:-$HOME/Documents/ai-queue-dashboard}"
ARTIFACTS_DIR="${ARTIFACTS_DIR:-$DASHBOARD_DIR/artifacts/$ISSUE_ID}"
LOG_FILE="$ARTIFACTS_DIR/pipeline.log"
BRANCH_NAME="issue-${ISSUE_ID}"
TIMEOUT_SECONDS="${CODING_TIMEOUT:-1800}"

# Exit code conventions (for failure categorization):
# 0 = success
# 1 = build failure
# 2 = test failure
# 3 = infra failure
# 4 = agent failure (timeout, no changes)

mkdir -p "$ARTIFACTS_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

fail() {
  local exit_code="${2:-1}"
  log "❌ PIPELINE FAILED: $1 (exit code: $exit_code)"
  cleanup_worktree
  exit "$exit_code"
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
log "Timeout: ${TIMEOUT_SECONDS}s"

# -------------------------------------------------------
# Step 1: Fetch issue details from GitHub
# -------------------------------------------------------
log "Step 1/7: Fetching issue details..."
REPO="${REPO_FULL:-epiphanyapps/MapYourHealth}"
ISSUE_JSON=$(gh issue view "$ISSUE_ID" --repo "$REPO" --json title,body,labels 2>/dev/null) || fail "Failed to fetch issue #$ISSUE_ID from GitHub" 3
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
git worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR" origin/main >> "$LOG_FILE" 2>&1 || fail "Failed to create worktree" 3
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
# Step 4: Build task description for AI analysis  
# -------------------------------------------------------
log "Step 4/7: Preparing task for AI analysis..."

TASK_FILE=$(mktemp /tmp/mini-task-${ISSUE_ID}-XXXXXX)
mv "$TASK_FILE" "${TASK_FILE}.md"
TASK_FILE="${TASK_FILE}.md"

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
# Step 5: Parse AI solution and write files
# -------------------------------------------------------
log "Step 5/7: Parsing AI solution and writing files..."

cd "$WORKTREE_DIR"

# Check if solution file exists
if [ -z "$SOLUTION_FILE" ] || [ ! -f "$SOLUTION_FILE" ]; then
  fail "No solution file provided or file does not exist" 4
fi

# Parse solution file for ### FILE: blocks and write files
PARSING_LOG="$ARTIFACTS_DIR/file-parsing.log"
FILES_WRITTEN=0
PARSING_ERROR=""

# Create a temp script to parse the solution file
PARSER_SCRIPT=$(mktemp /tmp/parse-files-XXXXXX.sh)
cat > "$PARSER_SCRIPT" << 'PARSER_EOF'
#!/bin/bash
SOLUTION_FILE="$1"
WORKTREE_DIR="$2"
PARSING_LOG="$3"

FILES_WRITTEN=0
CURRENT_FILE=""
CURRENT_LANG=""
IN_CODE_BLOCK=false

while IFS= read -r line; do
  # Check for ### FILE: header
  if [[ "$line" =~ ^###[[:space:]]+FILE:[[:space:]]+(.+)$ ]]; then
    CURRENT_FILE="${BASH_REMATCH[1]}"
    echo "Found file: $CURRENT_FILE" >> "$PARSING_LOG"
    IN_CODE_BLOCK=false
    continue
  fi
  
  # Check for code block end (must check BEFORE code block start)
  if [[ "$IN_CODE_BLOCK" = true && "$line" =~ ^\`\`\`[[:space:]]*$ ]]; then
    IN_CODE_BLOCK=false
    echo "Finished writing $CURRENT_FILE" >> "$PARSING_LOG"
    FILES_WRITTEN=$((FILES_WRITTEN + 1))
    CURRENT_FILE=""
    CURRENT_LANG=""
    continue
  fi

  # Check for code block start after a file header
  if [[ -n "$CURRENT_FILE" && "$IN_CODE_BLOCK" = false && "$line" =~ ^\`\`\`([a-zA-Z]*) ]]; then
    CURRENT_LANG="${BASH_REMATCH[1]}"
    IN_CODE_BLOCK=true
    echo "Starting code block for $CURRENT_FILE (lang: $CURRENT_LANG)" >> "$PARSING_LOG"
    
    # Create directory if needed
    FULL_PATH="$WORKTREE_DIR/$CURRENT_FILE"
    FULL_DIR=$(dirname "$FULL_PATH")
    mkdir -p "$FULL_DIR"
    
    # Clear the file
    : > "$FULL_PATH"
    continue
  fi
  
  # Write content to current file if in code block
  if [[ "$IN_CODE_BLOCK" = true && -n "$CURRENT_FILE" ]]; then
    echo "$line" >> "$WORKTREE_DIR/$CURRENT_FILE"
  fi
done < "$SOLUTION_FILE"

echo "Parsing complete. Files written: $FILES_WRITTEN" >> "$PARSING_LOG"
echo "$FILES_WRITTEN"
PARSER_EOF

chmod +x "$PARSER_SCRIPT"

# Run the parser
log "Parsing solution file for FILE blocks..."
FILES_WRITTEN=$("$PARSER_SCRIPT" "$SOLUTION_FILE" "$WORKTREE_DIR" "$PARSING_LOG" 2>&1)
PARSER_EXIT=$?

# Clean up parser script
rm -f "$PARSER_SCRIPT"

if [ $PARSER_EXIT -ne 0 ]; then
  log "⚠️ File parsing failed with exit code $PARSER_EXIT"
  PARSING_ERROR="File parsing script failed"
elif [ "$FILES_WRITTEN" -eq 0 ]; then
  log "⚠️ No files were written - no ### FILE: blocks found in solution"
  PARSING_ERROR="No FILE blocks found in AI solution"
else
  log "✅ Successfully wrote $FILES_WRITTEN file(s) from AI solution"
fi

# Log parsing details
if [ -f "$PARSING_LOG" ]; then
  log "File parsing details:"
  cat "$PARSING_LOG" | while read -r logline; do
    log "  $logline"
  done
fi

# If parsing failed, continue but note the error
if [ -n "$PARSING_ERROR" ]; then
  log "⚠️ Parsing error: $PARSING_ERROR, but continuing to check for changes"
fi

# -------------------------------------------------------
# Step 6: Check for changes and create PR
# -------------------------------------------------------
log "Step 6/7: Checking for code changes..."
cd "$WORKTREE_DIR"

CHANGED_FILES=$(git diff --name-only 2>/dev/null || true)
UNTRACKED_FILES=$(git ls-files --others --exclude-standard 2>/dev/null || true)

if [ -z "$CHANGED_FILES" ] && [ -z "$UNTRACKED_FILES" ]; then
  log "ℹ️ No code changes detected. AI solution did not modify any files."
  log "=== Coding Pipeline Complete (no changes) for Issue #$ISSUE_ID ==="
  cleanup_worktree
  rm -f "$TASK_FILE"
  exit 4  # agent failure — no changes produced
fi

log "Changed files:"
echo "$CHANGED_FILES" | while read -r f; do [ -n "$f" ] && log "  M $f"; done
echo "$UNTRACKED_FILES" | while read -r f; do [ -n "$f" ] && log "  A $f"; done

# Stage and commit
git add -A
git commit -m "fix: address issue #${ISSUE_ID} - ${ISSUE_TITLE}

Automated fix generated by AI queue system.
Fixes #${ISSUE_ID}" >> "$LOG_FILE" 2>&1 || fail "git commit failed" 1
log "✅ Changes committed"

# -------------------------------------------------------
# Audit trail: save diff summary and full diff
# -------------------------------------------------------
git diff --stat HEAD~1 > "$ARTIFACTS_DIR/diff-summary.txt" 2>/dev/null || true
git diff HEAD~1 > "$ARTIFACTS_DIR/full-diff.patch" 2>/dev/null || true
log "📋 Saved diff summary and full diff to artifacts"

# -------------------------------------------------------
# Quality gates
# -------------------------------------------------------
log "Step 6.5/7: Running quality gates..."
GATES_SCRIPT="$DASHBOARD_DIR/scripts/gates/coding-gates.sh"
PR_FLAGS=""
GATES_PASSED=true

if [ -f "$GATES_SCRIPT" ]; then
  bash "$GATES_SCRIPT" "$WORKTREE_DIR" >> "$ARTIFACTS_DIR/quality-gates.log" 2>&1
  GATES_EXIT=$?
  if [ $GATES_EXIT -ne 0 ]; then
    GATES_PASSED=false
    PR_FLAGS="--draft --label needs-input"
    log "⚠️ Quality gates FAILED — will create DRAFT PR"
    cat "$ARTIFACTS_DIR/quality-gates.log" >> "$LOG_FILE"
  else
    log "✅ Quality gates passed"
  fi
else
  log "ℹ️ No quality gates script found, skipping"
fi

# Push branch
git push origin "$BRANCH_NAME" >> "$LOG_FILE" 2>&1 || fail "git push failed" 3
log "✅ Branch pushed to origin/$BRANCH_NAME"

# Create PR (draft if gates failed)
GATE_STATUS=""
if [ "$GATES_PASSED" = "false" ]; then
  GATE_STATUS="
### ⚠️ Quality Gates Failed
This PR was created as a **draft** because quality gates did not pass. See \`artifacts/${ISSUE_ID}/quality-gates.log\` for details.
"
fi

PR_URL=$(gh pr create \
  --repo "$REPO" \
  --base main \
  --head "$BRANCH_NAME" \
  --title "Fix #${ISSUE_ID}: ${ISSUE_TITLE}" \
  --body "## Automated Fix for #${ISSUE_ID}

This PR was generated by the **AI queue system** using Qwen for direct code generation.

### Changes
\`\`\`
$(git diff --stat HEAD~1)
\`\`\`

### Issue
Fixes #${ISSUE_ID}
${GATE_STATUS}
### Review Notes
- Auto-generated code — please review carefully
- Generated by: AI queue system (Qwen direct generation)
" \
  --assignee waltermvp $PR_FLAGS 2>&1) || log "⚠️ PR creation failed (branch pushed, create manually)"

if [ -n "$PR_URL" ]; then
  log "✅ PR created: $PR_URL"
fi

# If gates failed, still treat as success (draft PR was created)
if [ "$GATES_PASSED" = "false" ]; then
  log "⚠️ Quality gates failed — draft PR created for manual review"
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
