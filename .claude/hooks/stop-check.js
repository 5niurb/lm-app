#!/usr/bin/env node
/**
 * Stop hook: Pre-stop checks
 *
 * Before Claude stops, checks for:
 * 1. Uncommitted changes that should be saved
 * 2. SESSION_NOTES.md hasn't been updated this session
 * 3. Unpushed commits
 *
 * Provides context to the TextMe hook (which runs after this).
 * Does NOT block — just adds context for better TextMe menus.
 */

import { statSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { readStdinSync } from './read-stdin.js';

const input = readStdinSync();
const projectDir = input?.cwd || process.cwd();
const warnings = [];

// Check for uncommitted changes
try {
  const status = execSync('git status --porcelain', {
    cwd: projectDir,
    timeout: 5000,
    stdio: 'pipe'
  }).toString().trim();

  if (status) {
    const files = status.split('\n');
    const modified = files.filter(f => f.startsWith(' M') || f.startsWith('M ')).length;
    const untracked = files.filter(f => f.startsWith('??')).length;
    const staged = files.filter(f => f.startsWith('A ') || f.startsWith('M ')).length;

    let msg = `📝 ${files.length} uncommitted file(s)`;
    if (modified) msg += `, ${modified} modified`;
    if (untracked) msg += `, ${untracked} untracked`;
    if (staged) msg += `, ${staged} staged`;
    warnings.push(msg);
  }
} catch {
  // Skip if git fails
}

// Check if SESSION_NOTES.md was recently updated (within last 30 min)
try {
  const notesPath = resolve(projectDir, 'SESSION_NOTES.md');
  if (existsSync(notesPath)) {
    const stats = statSync(notesPath);
    const minutesSinceModified = (Date.now() - stats.mtime.getTime()) / 60000;
    if (minutesSinceModified > 30) {
      warnings.push(`📋 SESSION_NOTES.md last updated ${Math.round(minutesSinceModified)} min ago — consider updating`);
    }
  }
} catch {
  // Skip
}

// Check if there's an unpushed commit
try {
  const unpushed = execSync('git log origin/main..HEAD --oneline', {
    cwd: projectDir,
    timeout: 5000,
    stdio: 'pipe'
  }).toString().trim();

  if (unpushed) {
    const count = unpushed.split('\n').filter(l => l.trim()).length;
    warnings.push(`🔄 ${count} unpushed commit(s) — remember to push`);
  }
} catch {
  // Skip if no remote or git fails
}

if (warnings.length > 0) {
  const output = JSON.stringify({
    additionalContext: `PRE-STOP WARNINGS:\n${warnings.join('\n')}\n\nConsider using /commit to save work before stopping.`
  });
  console.log(output);
}

process.exit(0); // Never block — TextMe handles the actual stop decision
