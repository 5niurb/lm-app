#!/usr/bin/env node

/**
 * textme.mjs — Send an SMS via Twilio when Claude Code stops.
 *
 * Used as a Claude Code "Stop" hook. Reads hook input from stdin,
 * peeks at the transcript to figure out WHY Claude stopped, then
 * texts you a short summary with numeric menu options.
 *
 * Environment variables (reads from .env-vars in project root):
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TEXTME_FROM               — the sending number (defaults to TWILIO_TEST1_PHONE_NUMBER)
 *   TEXTME_TO                 — your personal cell (the "to" number)
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// 1. Load env vars from .env-vars (no dependency on dotenv)
// ---------------------------------------------------------------------------
function loadEnvFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* file not found — that's fine, env may already be set */ }
}

loadEnvFile(resolve(__dirname, '..', '.env-vars'));
loadEnvFile(resolve(__dirname, '..', '.env'));

// ---------------------------------------------------------------------------
// 2. Validate required env vars
// ---------------------------------------------------------------------------
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER = process.env.TEXTME_FROM || process.env.TWILIO_TEST1_PHONE_NUMBER;
const TO_NUMBER = process.env.TEXTME_TO;

if (!ACCOUNT_SID || !AUTH_TOKEN || !FROM_NUMBER) {
  console.error('[textme] Missing Twilio credentials.');
  process.exit(0);
}

if (!TO_NUMBER) {
  console.error('[textme] Missing TEXTME_TO — set it to your phone number in .env-vars');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 3. Read hook input from stdin
// ---------------------------------------------------------------------------
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { stdinData += chunk; });
process.stdin.on('end', async () => {
  try {
    await main(stdinData);
  } catch (err) {
    console.error('[textme] Error:', err.message);
  }
  process.exit(0);
});

// If stdin closes immediately (manual run), use empty JSON
setTimeout(() => {
  if (!stdinData) {
    main('{}').then(() => process.exit(0)).catch(() => process.exit(0));
  }
}, 500);

// ---------------------------------------------------------------------------
// 4. Main logic
// ---------------------------------------------------------------------------
async function main(rawInput) {
  let hookData = {};
  try { hookData = JSON.parse(rawInput); } catch { /* manual invocation */ }

  // Don't send if this is a recursive stop-hook firing
  if (hookData.stop_hook_active) {
    console.error('[textme] Stop hook already active, skipping to avoid loop');
    return;
  }

  const { reason, menu } = analyzeTranscript(hookData.transcript_path);
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true
  });

  const body = `[Claude Code ${timestamp}]\n${reason}\n\n${menu}`;

  await sendSMS(body);
  console.error(`[textme] Sent: "${body.replace(/\n/g, ' | ')}"`);
}

// ---------------------------------------------------------------------------
// 5. Analyze transcript to determine stop reason + build menu
// ---------------------------------------------------------------------------

/** @typedef {{ reason: string, menu: string }} Analysis */

/** @returns {Analysis} */
function analyzeTranscript(transcriptPath) {
  if (!transcriptPath) {
    return {
      reason: 'Task finished.',
      menu: formatMenu([
        ['1', 'Continue working'],
        ['2', 'Start new task'],
        ['3', 'Commit & push'],
      ]),
    };
  }

  try {
    const raw = readFileSync(transcriptPath, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);

    const recent = lines.slice(-8).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);

    // --- Permission / authorization needed ---
    const hasPermission = recent.some((e) =>
      e.type === 'tool_use_permission' ||
      e.type === 'permission_request' ||
      (e.type === 'text' && /\b(permission|approve|confirm|authorize)\b/i.test(e.content))
    );
    if (hasPermission) {
      const detail = extractLastText(recent);
      return {
        reason: `Needs approval:\n${truncate(detail, 120)}`,
        menu: formatMenu([
          ['1', 'Approve'],
          ['2', 'Deny'],
          ['3', 'I\'ll check the terminal'],
        ]),
      };
    }

    // --- Question asked ---
    const hasQuestion = recent.some((e) =>
      e.type === 'text' && /\?\s*$/.test(e.content?.trim?.() || '')
    );
    if (hasQuestion) {
      const detail = extractLastText(recent);
      return {
        reason: `Question:\n${truncate(detail, 140)}`,
        menu: formatMenu([
          ['1', 'Yes'],
          ['2', 'No'],
          ['3', 'I\'ll reply in terminal'],
        ]),
      };
    }

    // --- Error ---
    const hasError = recent.some((e) =>
      e.type === 'tool_result' && e.is_error
    );
    if (hasError) {
      return {
        reason: 'Hit an error.',
        menu: formatMenu([
          ['1', 'Retry'],
          ['2', 'Skip it'],
          ['3', 'I\'ll check the terminal'],
        ]),
      };
    }

    // --- Default: task complete ---
    return {
      reason: 'Task finished.',
      menu: formatMenu([
        ['1', 'Continue working'],
        ['2', 'Start new task'],
        ['3', 'Commit & push'],
      ]),
    };
  } catch {
    return {
      reason: 'Task finished.',
      menu: formatMenu([
        ['1', 'Continue working'],
        ['2', 'Start new task'],
        ['3', 'Commit & push'],
      ]),
    };
  }
}

// ---------------------------------------------------------------------------
// 6. Helpers
// ---------------------------------------------------------------------------

/** Format numbered menu options */
function formatMenu(items) {
  return items.map(([num, label]) => `  ${num}. ${label}`).join('\n');
}

/** Pull the last meaningful text from transcript */
function extractLastText(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === 'text' && e.content?.trim()) {
      return e.content.trim();
    }
    // assistant message content array
    if (e.type === 'assistant' && Array.isArray(e.content)) {
      for (let j = e.content.length - 1; j >= 0; j--) {
        if (e.content[j].type === 'text' && e.content[j].text?.trim()) {
          return e.content[j].text.trim();
        }
      }
    }
    // message.content string
    if (e.message?.content && typeof e.message.content === 'string') {
      return e.message.content.trim();
    }
  }
  return '';
}

/** Truncate text to maxLen, adding ellipsis */
function truncate(text, maxLen) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

// ---------------------------------------------------------------------------
// 7. Send SMS via Twilio REST API (zero dependencies)
// ---------------------------------------------------------------------------
async function sendSMS(body) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`;

  const params = new URLSearchParams({
    To: TO_NUMBER,
    From: FROM_NUMBER,
    Body: body,
  });

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Twilio API ${resp.status}: ${err}`);
  }

  return resp.json();
}
