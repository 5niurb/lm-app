#!/usr/bin/env node
/**
 * PreToolUse hook: Build Guard
 *
 * Prevents `vite build` from running without PUBLIC_API_URL set.
 * Without this, SvelteKit bakes localhost:3001 into the production bundle,
 * causing silent "failed to fetch" errors on the deployed site.
 *
 * Exit code 2 = block the command
 * Exit code 0 = allow the command
 */

import { readStdinSync } from './read-stdin.js';

const input = readStdinSync();
if (!input) process.exit(0);

// Only check Bash commands
if (input.tool_name !== 'Bash') {
	process.exit(0);
}

const command = input.tool_input?.command || '';

// Check if this is a vite build command
const isViteBuild = /\bvite\s+build\b/.test(command) || /\bnpm\s+run\s+build\b/.test(command);

if (!isViteBuild) {
	process.exit(0);
}

// Check if PUBLIC_API_URL is set in the command (inline env var)
const hasApiUrl = /PUBLIC_API_URL=https?:\/\//.test(command);

// Check if it's set in the environment
const envApiUrl = process.env.PUBLIC_API_URL;
const envHasProductionUrl = envApiUrl && !envApiUrl.includes('localhost');

if (hasApiUrl || envHasProductionUrl) {
	// Good — production URL is set
	process.exit(0);
}

// Block: vite build without production API URL
console.error(
	'BUILD GUARD: vite build detected without PUBLIC_API_URL set to production URL.\n' +
		'This would bake localhost:3001 into the production bundle.\n\n' +
		'Fix: Prefix the command with the production URL:\n' +
		'  PUBLIC_API_URL=https://api.lemedspa.app npx vite build\n\n' +
		'Or use /deploy which handles this automatically.'
);
process.exit(2);
