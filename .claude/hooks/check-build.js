#!/usr/bin/env node
/**
 * PostToolUse hook: Auto Build Check (async)
 *
 * After Write/Edit on frontend files (.svelte, .js under src/),
 * runs a quick build to catch errors early.
 *
 * Runs async so it doesn't block Claude — just provides context if errors found.
 */

import { readStdinSync } from './read-stdin.js';
import { execSync } from 'child_process';

const input = readStdinSync();
if (!input) process.exit(0);

const toolName = input.tool_name;
if (toolName !== 'Write' && toolName !== 'Edit') {
	process.exit(0);
}

// Get the file path from tool input
const filePath = input.tool_input?.file_path || input.tool_input?.path || '';

// Only check frontend source files
const isFrontendFile =
	(filePath.includes('/src/') || filePath.includes('\\src\\')) &&
	(filePath.endsWith('.svelte') || filePath.endsWith('.js') || filePath.endsWith('.ts'));

if (!isFrontendFile) {
	process.exit(0);
}

// Try a quick build check
const projectDir = input.cwd || process.cwd();

try {
	execSync('npx vite build 2>&1', {
		cwd: projectDir,
		timeout: 30000,
		env: {
			...process.env,
			PUBLIC_API_URL: 'http://localhost:3001',
			NODE_ENV: 'production'
		},
		stdio: 'pipe'
	});

	const output = JSON.stringify({
		additionalContext: `Build check passed after editing ${filePath.split(/[/\\]/).pop()}`
	});
	console.log(output);
	process.exit(0);
} catch (err) {
	const stderr = err.stderr?.toString() || err.stdout?.toString() || 'Unknown build error';
	const errorLines = stderr
		.split('\n')
		.filter((line) => line.includes('Error') || line.includes('error') || line.includes('✘'))
		.slice(0, 10)
		.join('\n');

	const output = JSON.stringify({
		additionalContext: `⚠️ Build check FAILED after editing ${filePath.split(/[/\\]/).pop()}:\n${errorLines || stderr.slice(0, 500)}\n\nFix the error before deploying.`
	});
	console.log(output);
	process.exit(0);
}
