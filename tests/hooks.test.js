/**
 * Hook script tests
 * Verifies the build guard and other hooks work correctly.
 */
import { describe, it, expect } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import { resolve } from 'path';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';

const HOOKS_DIR = resolve(import.meta.dirname, '../.claude/hooks');

/**
 * Run a hook script with the given JSON input.
 * Returns { exitCode, stdout, stderr }
 */
function runHook(hookPath, input) {
	const tmpFile = resolve(tmpdir(), `hook-test-${Date.now()}.json`);
	writeFileSync(tmpFile, JSON.stringify(input));
	try {
		const result = spawnSync('node', [hookPath], {
			input: JSON.stringify(input),
			timeout: 10000,
			encoding: 'utf8',
			env: { ...process.env, PUBLIC_API_URL: '' }
		});
		return {
			exitCode: result.status,
			stdout: result.stdout || '',
			stderr: result.stderr || ''
		};
	} finally {
		try {
			unlinkSync(tmpFile);
		} catch {
			/* ignore */
		}
	}
}

describe('build-guard hook', () => {
	const hookPath = resolve(HOOKS_DIR, 'build-guard.js');

	it('allows non-build bash commands', () => {
		const result = runHook(hookPath, {
			tool_name: 'Bash',
			tool_input: { command: 'git status' }
		});
		expect(result.exitCode).toBe(0);
	});

	it('allows vite build with PUBLIC_API_URL inline', () => {
		const result = runHook(hookPath, {
			tool_name: 'Bash',
			tool_input: { command: 'PUBLIC_API_URL=https://lm-app-api.onrender.com npx vite build' }
		});
		expect(result.exitCode).toBe(0);
	});

	it('blocks vite build without PUBLIC_API_URL', () => {
		const result = spawnSync('node', [hookPath], {
			input: JSON.stringify({
				tool_name: 'Bash',
				tool_input: { command: 'npx vite build' }
			}),
			timeout: 10000,
			encoding: 'utf8',
			env: { PATH: process.env.PATH, HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE }
		});
		expect(result.status).toBe(2);
		expect(result.stderr).toContain('BUILD GUARD');
	});

	it('allows npm run build with PUBLIC_API_URL', () => {
		const result = runHook(hookPath, {
			tool_name: 'Bash',
			tool_input: { command: 'PUBLIC_API_URL=https://lm-app-api.onrender.com npm run build' }
		});
		expect(result.exitCode).toBe(0);
	});

	it('allows non-Bash tools', () => {
		const result = runHook(hookPath, {
			tool_name: 'Read',
			tool_input: { file_path: '/some/file' }
		});
		expect(result.exitCode).toBe(0);
	});
});

describe('stop-check hook', () => {
	const hookPath = resolve(HOOKS_DIR, 'stop-check.js');

	it('runs without error and never blocks', () => {
		const result = spawnSync('node', [hookPath], {
			input: JSON.stringify({
				cwd: resolve(import.meta.dirname, '..')
			}),
			timeout: 10000,
			encoding: 'utf8'
		});
		expect(result.status).toBe(0);
	});
});
