#!/usr/bin/env node
/**
 * SessionStart hook: Auto Context Loading
 *
 * Reads the latest session entries from SESSION_NOTES.md and injects them
 * as additional context so Claude starts with full awareness of project state.
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { readStdinSync } from './read-stdin.js';

const input = readStdinSync();
const projectDir = input?.cwd || process.cwd();
const sessionNotesPath = resolve(projectDir, 'SESSION_NOTES.md');

if (!existsSync(sessionNotesPath)) {
  const output = JSON.stringify({
    additionalContext: 'No SESSION_NOTES.md found. This may be a fresh project or the file needs to be created.'
  });
  console.log(output);
  process.exit(0);
}

try {
  const content = readFileSync(sessionNotesPath, 'utf8');

  // Extract the latest 2 session entries (separated by ---)
  const sessions = content.split(/^---$/m).filter(s => s.trim());
  const latestSessions = sessions.slice(0, 2).join('\n---\n');

  // Also check git status for uncommitted work
  let gitInfo = '';
  try {
    const status = execSync('git status --porcelain', {
      cwd: projectDir,
      timeout: 5000,
      stdio: 'pipe'
    }).toString().trim();
    if (status) {
      const changedFiles = status.split('\n').length;
      gitInfo = `\n\n⚠️ ${changedFiles} uncommitted file(s) from previous session.`;
    }
  } catch {
    // git not available or not a repo — skip
  }

  const output = JSON.stringify({
    additionalContext: `SESSION CONTEXT (auto-loaded):\n\n${latestSessions}${gitInfo}\n\nRead SESSION_NOTES.md for full history. Follow CLAUDE.md session management protocol.`
  });
  console.log(output);
  process.exit(0);
} catch {
  process.exit(0);
}
