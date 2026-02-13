/**
 * Deploy a Twilio Studio Flow from a local JSON file.
 *
 * Usage:
 *   node twilio/deploy.js <flow-sid> <path-to-flow.json> [--publish]
 *
 * Environment:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN (from api/.env)
 *
 * Without --publish: updates the draft (safe for testing)
 * With --publish: publishes the flow live
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from api/ directory (dotenv is installed there, but we parse manually
// so this script can run from any directory)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', 'api', '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const val = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

const [,, flowSid, flowPath, ...flags] = process.argv;
const shouldPublish = flags.includes('--publish');

if (!flowSid || !flowPath) {
  console.error('Usage: node twilio/deploy.js <flow-sid> <path-to-flow.json> [--publish]');
  console.error('');
  console.error('Options:');
  console.error('  --publish    Publish the flow live (default: draft only)');
  console.error('');
  console.error('Examples:');
  console.error('  node twilio/deploy.js FWxxxxxx twilio/flows/main-ivr.json');
  console.error('  node twilio/deploy.js FWxxxxxx twilio/flows/main-ivr.json --publish');
  process.exit(1);
}

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  console.error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in environment.');
  console.error('Make sure api/.env is configured.');
  process.exit(1);
}

let flowJson;
try {
  flowJson = readFileSync(flowPath, 'utf-8');
} catch (err) {
  console.error(`Cannot read file: ${flowPath}`);
  console.error(err.message);
  process.exit(1);
}

let definition;
try {
  definition = JSON.parse(flowJson);
} catch (err) {
  console.error(`Invalid JSON in ${flowPath}: ${err.message}`);
  process.exit(1);
}

// Validate it looks like a Studio flow
if (!definition.states || !Array.isArray(definition.states)) {
  console.error('Invalid flow JSON — missing "states" array.');
  console.error('Make sure this is a Twilio Studio Flow definition (not the full API response).');
  process.exit(1);
}

const status = shouldPublish ? 'published' : 'draft';

console.log(`Deploying flow ${flowSid} as ${status}...`);
console.log(`  Source: ${flowPath}`);
console.log(`  States: ${definition.states.length}`);

const params = new URLSearchParams();
params.set('Definition', JSON.stringify(definition));
params.set('Status', status);
params.set('CommitMessage', `Deploy from CLI at ${new Date().toISOString()}`);

try {
  const res = await fetch(
    `https://studio.twilio.com/v2/Flows/${flowSid}`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    }
  );

  if (!res.ok) {
    const body = await res.text();
    console.error(`Deploy failed (${res.status}):`, body);
    process.exit(1);
  }

  const result = await res.json();
  console.log('');
  console.log(`Deployed successfully!`);
  console.log(`  Flow SID: ${result.sid}`);
  console.log(`  Status:   ${result.status}`);
  console.log(`  Revision: ${result.revision}`);
  console.log(`  URL:      https://www.twilio.com/console/studio/flows/${result.sid}`);
} catch (err) {
  console.error('Deploy request failed:', err.message);
  process.exit(1);
}
