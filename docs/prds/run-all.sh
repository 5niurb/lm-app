#!/bin/bash
# Ralph Loop — Run all remaining features sequentially
# Usage: bash docs/prds/run-all.sh
#
# Features (in order):
#   1. Internal Notes   (5 stories)
#   2. AI Suggest        (5 stories)
#   3. Broadcast         (6 stories)
#
# Each feature gets up to N iterations (one story per iteration).
# If RALPH_LOOP_COMPLETE is output, the feature is done and we move on.

# Unset to allow running from within a Claude Code session
unset CLAUDECODE

FEATURES=("messaging-internal-notes" "messaging-ai-suggest" "messaging-broadcast")
MAX_PER_FEATURE=(6 6 7)  # slightly more than story count for safety

for idx in "${!FEATURES[@]}"; do
  FEATURE="${FEATURES[$idx]}"
  MAX="${MAX_PER_FEATURE[$idx]}"
  PRD_DIR="docs/prds/$FEATURE"

  echo ""
  echo "╔══════════════════════════════════════════════════╗"
  echo "║  Starting feature: $FEATURE"
  echo "║  Max iterations: $MAX"
  echo "╚══════════════════════════════════════════════════╝"
  echo ""

  if [ ! -f "$PRD_DIR/prd.md" ]; then
    echo "ERROR: $PRD_DIR/prd.md not found — skipping"
    continue
  fi

  if [ ! -f "$PRD_DIR/progress.txt" ]; then
    echo "WARNING: $PRD_DIR/progress.txt not found — creating empty"
    echo "# $FEATURE — Progress & Learnings" > "$PRD_DIR/progress.txt"
  fi

  COMPLETE=false
  for i in $(seq 1 "$MAX"); do
    echo ""
    echo "--- $FEATURE iteration $i/$MAX ---"
    echo ""

    OUTPUT=$(cat docs/prds/PROMPT.md "$PRD_DIR/prd.md" "$PRD_DIR/progress.txt" | claude -p --dangerously-skip-permissions --max-turns 50 2>&1)
    echo "$OUTPUT"

    if echo "$OUTPUT" | grep -q "RALPH_LOOP_COMPLETE"; then
      echo ""
      echo "✓ $FEATURE COMPLETE after $i iterations"
      COMPLETE=true
      break
    fi
  done

  if [ "$COMPLETE" = false ]; then
    echo ""
    echo "⚠ $FEATURE did not complete within $MAX iterations"
    echo "Check progress.txt for blockers"
  fi
done

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  All features processed                         ║"
echo "╚══════════════════════════════════════════════════╝"
