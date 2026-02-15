/**
 * Update the Studio IVR flow to route SMS-sending through our API:
 * 1. Replace send_message_accounts (send-message) with make-http-request to our /api/webhooks/sms/studio-send
 * 2. Remove fcn_NewSMSEmailNotify (old Twilio Function — replaced by our pipeline)
 * 3. Make play_MsgSentGoodbye terminal (remove transition to removed function)
 *
 * This ensures that IVR-initiated SMS messages appear in our messages chat.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const flowPath = resolve(__dirname, '..', 'twilio', 'flows', 'test-ivr.json');

const flow = JSON.parse(readFileSync(flowPath, 'utf8'));

const RENDER_URL = 'https://lm-app-api.onrender.com/api/webhooks/sms/studio-send';

// 1. Replace send_message_accounts with make-http-request
const smsIdx = flow.states.findIndex((s) => s.name === 'send_message_accounts');
if (smsIdx !== -1) {
	const oldType = flow.states[smsIdx].type;
	flow.states[smsIdx] = {
		name: 'send_message_accounts',
		type: 'make-http-request',
		properties: {
			method: 'POST',
			content_type: 'application/json;charset=utf-8',
			body: JSON.stringify({
				to: '{{contact.channel.address}}',
				body: '(LeMedSpa) Thank you for reaching out. How can we help you?',
				callSid: '{{trigger.call.CallSid}}'
			}),
			url: RENDER_URL,
			offset: {
				x: 670,
				y: 1570
			}
		},
		transitions: [{ event: 'success', next: 'play_MsgSentGoodbye' }, { event: 'failed' }]
	};
	console.log(
		`✓ Replaced send_message_accounts (was ${oldType}) with make-http-request → ${RENDER_URL}`
	);
} else {
	console.log('✗ send_message_accounts not found!');
}

// 2. Remove fcn_NewSMSEmailNotify (old Twilio Function notification)
const fcnIdx = flow.states.findIndex((s) => s.name === 'fcn_NewSMSEmailNotify');
if (fcnIdx !== -1) {
	flow.states.splice(fcnIdx, 1);
	console.log('✓ Removed fcn_NewSMSEmailNotify (old Twilio Function)');
} else {
	console.log('  fcn_NewSMSEmailNotify already removed');
}

// 3. Make play_MsgSentGoodbye terminal (remove next → fcn_NewSMSEmailNotify)
const goodbyeState = flow.states.find((s) => s.name === 'play_MsgSentGoodbye');
if (goodbyeState) {
	const before = goodbyeState.transitions.length;
	goodbyeState.transitions = goodbyeState.transitions.map((t) => {
		if (t.next === 'fcn_NewSMSEmailNotify') {
			console.log(
				'✓ play_MsgSentGoodbye: removed transition to fcn_NewSMSEmailNotify (now terminal)'
			);
			return { event: t.event }; // Keep event, remove next
		}
		return t;
	});
}

// Summary
console.log(`\nFinal state count: ${flow.states.length}`);
console.log('States:');
for (const s of flow.states) {
	const targets = (s.transitions || []).filter((t) => t.next).map((t) => t.next);
	console.log(`  ${s.name} [${s.type}] → ${targets.length ? targets.join(', ') : '(terminal)'}`);
}

writeFileSync(flowPath, JSON.stringify(flow, null, 2));
console.log('\n✓ Flow saved to:', flowPath);
