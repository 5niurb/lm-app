/**
 * Temporary script to update the Studio flow JSON:
 * - Replace connect_call_HighLevel (dials old HighLevel number) with TwiML Redirect to our connect-operator
 * - Ensure digit-0 from hours/directory menus also routes to operator
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const flowPath = resolve(__dirname, '..', 'twilio', 'flows', 'test-ivr.json');

const flow = JSON.parse(readFileSync(flowPath, 'utf8'));

const RENDER_URL = 'https://lm-app-api.onrender.com/api/twilio/connect-operator';

// 1. Replace connect_call_HighLevel with TwiML Redirect
const idx = flow.states.findIndex(s => s.name === 'connect_call_HighLevel');
if (idx !== -1) {
  flow.states[idx] = {
    name: 'connect_call_HighLevel',
    type: 'add-twiml-redirect',
    properties: {
      url: RENDER_URL,
      method: 'POST',
      offset: {
        x: 1340,
        y: 550
      }
    },
    transitions: [
      { event: 'return' },
      { event: 'timeout' },
      { event: 'fail' }
    ]
  };
  console.log('✓ Replaced connect_call_HighLevel with TwiML Redirect to:', RENDER_URL);
} else {
  console.log('✗ connect_call_HighLevel not found!');
}

// 2. Check all gather/split states for digit-0 dead ends
for (const state of flow.states) {
  for (const t of state.transitions || []) {
    if (t.conditions) {
      const zeroCondition = t.conditions.find(c => c.value === '0');
      if (zeroCondition) {
        if (!t.next) {
          console.log(`  ⚠ Dead-end digit-0 in: ${state.name} — routing to connect_call_HighLevel`);
          t.next = 'connect_call_HighLevel';
        } else {
          console.log(`  ✓ Digit-0 in ${state.name} → ${t.next}`);
        }
      }
    }
  }
}

// 3. Check the main menu timeout (no input) — should also go to operator
for (const state of flow.states) {
  if (state.name === 'x0a-MainGreetingMenu_Open') {
    for (const t of state.transitions || []) {
      if (t.event === 'timeout') {
        if (t.next === 'connect_call_HighLevel') {
          console.log('  ✓ Main menu timeout → connect_call_HighLevel (now TwiML Redirect)');
        } else {
          console.log(`  ⚠ Main menu timeout → ${t.next} (should be connect_call_HighLevel)`);
        }
      }
    }
  }
}

// Save updated flow
writeFileSync(flowPath, JSON.stringify(flow, null, 2));
console.log('\n✓ Flow saved to:', flowPath);
