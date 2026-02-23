#!/bin/bash
# Ralph Loop runner — pass the PRD directory as argument
# Usage: bash docs/prds/run-loop.sh messaging-auto-replies 5

unset CLAUDECODE

PRD_DIR="docs/prds/$1"
ITERATIONS="${2:-5}"

if [ ! -f "$PRD_DIR/prd.md" ]; then
  echo "ERROR: $PRD_DIR/prd.md not found"
  exit 1
fi

for i in $(seq 1 "$ITERATIONS"); do
  echo "=== $1 iteration $i ==="
  cat docs/prds/PROMPT.md "$PRD_DIR/prd.md" "$PRD_DIR/progress.txt" | claude -p --dangerously-skip-permissions --max-turns 50
  echo "=== Done $i ==="
done
