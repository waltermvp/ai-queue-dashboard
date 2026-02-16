#!/bin/bash
set -eo pipefail

# Quality gates for coding pipeline
# Usage: coding-gates.sh <worktree-dir>
# Exit 0 = all gates passed, Exit 1 = some gates failed

WORKTREE_DIR="${1:?Usage: coding-gates.sh <worktree-dir>}"
cd "$WORKTREE_DIR"

GATE_RESULTS=""
GATES_PASSED=true

# Gate 1: TypeScript compilation
if [ -f "tsconfig.json" ] || [ -f "apps/mobile/tsconfig.json" ]; then
  echo "🔍 Gate: TypeScript check..."
  if npx tsc --noEmit 2>&1; then
    GATE_RESULTS+="✅ TypeScript: passed\n"
  else
    GATE_RESULTS+="❌ TypeScript: failed\n"
    GATES_PASSED=false
  fi
fi

# Gate 2: ESLint (if configured)
if [ -f ".eslintrc.js" ] || [ -f ".eslintrc.json" ] || [ -f "apps/mobile/.eslintrc.js" ]; then
  echo "🔍 Gate: ESLint..."
  if npx eslint --no-error-on-unmatched-pattern apps/mobile/src 2>&1; then
    GATE_RESULTS+="✅ ESLint: passed\n"
  else
    GATE_RESULTS+="❌ ESLint: failed\n"
    GATES_PASSED=false
  fi
fi

echo ""
echo "=== Quality Gate Results ==="
echo -e "$GATE_RESULTS"

if $GATES_PASSED; then
  echo "✅ All quality gates passed"
  exit 0
else
  echo "❌ Some quality gates failed"
  exit 1
fi
