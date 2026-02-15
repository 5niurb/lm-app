/**
 * Cross-platform stdin reader for Claude Code hooks.
 * Reads from file descriptor 0 (stdin) — works on Unix and Windows.
 *
 * Usage: import { readStdinSync } from './read-stdin.js';
 *        const input = readStdinSync();
 */
import { readFileSync } from 'fs';

export function readStdinSync() {
	try {
		// fd 0 = stdin — works cross-platform
		return JSON.parse(readFileSync(0, 'utf8'));
	} catch {
		return null;
	}
}
