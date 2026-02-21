#!/bin/bash
# Cloud environment bootstrap for lm-app
# Runs on SessionStart — detects cloud VM and installs dependencies

if [ -n "$CLAUDE_CODE_REMOTE" ] || [ ! -d "/c/Users/LMOperations" ]; then
  echo "Cloud session detected — bootstrapping environment..."

  # Install global tools
  npm install -g prettier 2>/dev/null || true

  # Install project dependencies
  if [ -n "$CLAUDE_PROJECT_DIR" ]; then
    cd "$CLAUDE_PROJECT_DIR" && npm install 2>/dev/null || true
    if [ -d "$CLAUDE_PROJECT_DIR/api" ]; then
      cd "$CLAUDE_PROJECT_DIR/api" && npm install 2>/dev/null || true
    fi
  fi

  echo "Cloud bootstrap complete."
fi
