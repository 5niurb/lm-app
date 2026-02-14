/**
 * Clean up unnecessary routes from the Studio IVR flow:
 * 1. Remove redirect_FlexSIP (orphaned old Flex redirect — nothing links to it)
 * 2. Remove dead-end digit routes (4 and 9 from main menu)
 * 3. Replace connect_call_accounts (dials old test number) with TwiML Redirect to our operator
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const flowPath = resolve(__dirname, '..', 'twilio', 'flows', 'test-ivr.json');

const flow = JSON.parse(readFileSync(flowPath, 'utf8'));

// 1. Remove redirect_FlexSIP (orphaned — nothing transitions to it)
const flexIdx = flow.states.findIndex(s => s.name === 'redirect_FlexSIP');
if (flexIdx !== -1) {
  flow.states.splice(flexIdx, 1);
  console.log('✓ Removed orphaned redirect_FlexSIP');
} else {
  console.log('  redirect_FlexSIP already removed');
}

// 2. Remove dead-end digit routes from main menu split (4 and 9 go nowhere)
const mainSplit = flow.states.find(s => s.name === 'split_digits_GreetingMenu');
if (mainSplit) {
  const before = mainSplit.transitions.length;
  mainSplit.transitions = mainSplit.transitions.filter(t => {
    if (!t.conditions) return true; // keep noMatch
    const cond = t.conditions[0];
    if (cond && (cond.value === '4' || cond.value === '9') && !t.next) {
      console.log(`✓ Removed dead-end digit ${cond.value} from main menu`);
      return false;
    }
    return true;
  });
  console.log(`  Main menu split: ${before} → ${mainSplit.transitions.length} transitions`);
}

// 3. Replace connect_call_accounts (dials +12134442242) with TwiML Redirect to operator
const accountsCallIdx = flow.states.findIndex(s => s.name === 'connect_call_accounts');
if (accountsCallIdx !== -1) {
  const oldTo = flow.states[accountsCallIdx].properties?.to;
  flow.states[accountsCallIdx] = {
    name: 'connect_call_accounts',
    type: 'add-twiml-redirect',
    properties: {
      url: 'https://lm-app-api.onrender.com/api/twilio/connect-operator',
      method: 'POST',
      offset: {
        x: flow.states[accountsCallIdx].properties?.offset?.x || 1340,
        y: flow.states[accountsCallIdx].properties?.offset?.y || 900
      }
    },
    transitions: [
      { event: 'return' },
      { event: 'timeout' },
      { event: 'fail' }
    ]
  };
  console.log(`✓ Replaced connect_call_accounts (was dialing ${oldTo}) with TwiML Redirect`);
} else {
  console.log('  connect_call_accounts not found');
}

// Summary
console.log(`\nFinal state count: ${flow.states.length}`);
console.log('States:');
for (const s of flow.states) {
  const targets = (s.transitions || [])
    .filter(t => t.next)
    .map(t => t.next);
  console.log(`  ${s.name} [${s.type}] → ${targets.length ? targets.join(', ') : '(terminal)'}`);
}

writeFileSync(flowPath, JSON.stringify(flow, null, 2));
console.log('\n✓ Flow saved');
