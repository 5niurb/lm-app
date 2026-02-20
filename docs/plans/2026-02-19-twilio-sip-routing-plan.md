# Twilio SIP Call Routing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Route operator calls to SIP endpoint + softphone instead of HighLevel, add "press 1 to text" to voicemails, and forward incoming SMS to TextMagic in parallel.

**Architecture:** Update Studio flow JSON to redirect operator calls to our existing `connect-operator` TwiML endpoint (which dials SIP + browser client). Add webhook logging at flow entry. Convert voicemail widgets to offer SMS opt-in. Add TextMagic forwarding to SMS webhook.

**Tech Stack:** Twilio Studio (JSON flow), Express.js TwiML generation, Twilio REST API (SMS send), Supabase

**Design Doc:** `docs/plans/2026-02-19-twilio-sip-call-routing-design.md`

**Execution:** Design & Build workflow — write → code review (subagent) → QA (subagent) → fix → ship

---

### Task 1: Add TextMagic Forwarding to SMS Webhook

**Files:**
- Modify: `api/routes/webhooks/sms.js:104-111`
- Test: `api/tests/sms-forward.test.js` (create)

**Step 1: Write the failing test**

Create `api/tests/sms-forward.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We test the forwarding logic in isolation
describe('TextMagic SMS forwarding', () => {
	let originalFetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		delete process.env.TEXTMAGIC_WEBHOOK_URL;
	});

	it('forwards Twilio payload to TEXTMAGIC_WEBHOOK_URL when set', async () => {
		process.env.TEXTMAGIC_WEBHOOK_URL = 'https://my.textmagic.com/webhook/twilio/sms/incoming';
		const fetchSpy = vi.fn(() => Promise.resolve({ ok: true }));
		globalThis.fetch = fetchSpy;

		// Import the forwarding function
		const { forwardToTextMagic } = await import('../routes/webhooks/sms-forward.js');

		const twilioBody = {
			MessageSid: 'SM123',
			From: '+13105551234',
			To: '+12134442242',
			Body: 'Hello'
		};

		await forwardToTextMagic(twilioBody);

		expect(fetchSpy).toHaveBeenCalledOnce();
		const [url, opts] = fetchSpy.mock.calls[0];
		expect(url).toBe('https://my.textmagic.com/webhook/twilio/sms/incoming');
		expect(opts.method).toBe('POST');
		expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
		expect(opts.body).toContain('MessageSid=SM123');
		expect(opts.body).toContain('From=%2B13105551234');
	});

	it('skips forwarding when TEXTMAGIC_WEBHOOK_URL is not set', async () => {
		const fetchSpy = vi.fn();
		globalThis.fetch = fetchSpy;

		const { forwardToTextMagic } = await import('../routes/webhooks/sms-forward.js');

		await forwardToTextMagic({ MessageSid: 'SM123' });

		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('does not throw when forwarding fails', async () => {
		process.env.TEXTMAGIC_WEBHOOK_URL = 'https://my.textmagic.com/webhook/twilio/sms/incoming';
		globalThis.fetch = vi.fn(() => Promise.reject(new Error('Network error')));

		const { forwardToTextMagic } = await import('../routes/webhooks/sms-forward.js');

		// Should not throw
		await expect(forwardToTextMagic({ MessageSid: 'SM123' })).resolves.not.toThrow();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run tests/sms-forward.test.js`
Expected: FAIL — `sms-forward.js` module doesn't exist

**Step 3: Write the forwarding module**

Create `api/routes/webhooks/sms-forward.js`:

```js
/**
 * Fire-and-forget forwarding of Twilio SMS webhooks to TextMagic.
 * Used during parallel operation period — remove when TextMagic is retired.
 *
 * If TEXTMAGIC_WEBHOOK_URL env var is empty/unset, forwarding is skipped.
 * Failures are logged but never block the caller.
 */

/**
 * Forward a Twilio SMS webhook payload to TextMagic.
 * @param {Record<string, string>} body - The original Twilio POST params
 */
export async function forwardToTextMagic(body) {
	const url = process.env.TEXTMAGIC_WEBHOOK_URL;
	if (!url) return;

	try {
		const params = new URLSearchParams(body).toString();
		await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: params
		});
	} catch (err) {
		console.error('[sms-forward] TextMagic forwarding failed:', err.message);
	}
}
```

**Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run tests/sms-forward.test.js`
Expected: 3 tests PASS

**Step 5: Wire forwarding into the SMS webhook handler**

Modify `api/routes/webhooks/sms.js`:
- Add import at top: `import { forwardToTextMagic } from './sms-forward.js';`
- After line 106 (`} catch (e) {` block closes), before the TwiML response, add:

```js
	// Forward to TextMagic for parallel operation (fire-and-forget)
	forwardToTextMagic(req.body);
```

Place it between the try/catch block (line 106) and the TwiML response (line 108).

**Step 6: Run all tests**

Run: `cd api && npx vitest run`
Expected: All pass

**Step 7: Commit**

```bash
git add api/routes/webhooks/sms-forward.js api/tests/sms-forward.test.js api/routes/webhooks/sms.js
git commit -m "[sms] Add TextMagic webhook forwarding for parallel operation"
```

---

### Task 2: Add "Press 1 to Text" to Operator Voicemail Fallback

**Files:**
- Modify: `api/routes/twilio.js:238-266`
- Test: `api/tests/connect-operator-status.test.js` (create)

**Step 1: Write the failing test**

Create `api/tests/connect-operator-status.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Test the TwiML output of connect-operator-status.
 * We import the route handler and call it with mock req/res.
 */

// Mock twilio and supabase before importing the route
vi.mock('../services/supabase.js', () => ({
	supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => ({}) }) }) }) }
}));

// We test TwiML output by parsing the XML string
function parseTwiml(xml) {
	return xml;
}

describe('connect-operator-status TwiML', () => {
	beforeEach(() => {
		process.env.TWILIO_ACCOUNT_SID = 'ACtest';
		process.env.TWILIO_AUTH_TOKEN = 'test';
		process.env.TWILIO_API_KEY_SID = 'SKtest';
		process.env.TWILIO_API_KEY_SECRET = 'secret';
		process.env.TWILIO_TWIML_APP_SID = 'APtest';
		process.env.TWILIO_PHONE_NUMBER = '+12134442242';
		process.env.RENDER_EXTERNAL_URL = 'https://api.lemedspa.app';
	});

	it('generates Gather with press-1-to-text when no-answer', async () => {
		const { default: router } = await import('../routes/twilio.js');

		// Find the connect-operator-status handler
		const layer = router.stack.find(
			(l) => l.route && l.route.path === '/connect-operator-status'
		);
		const handler = layer.route.stack[0].handle;

		const req = {
			body: {
				DialCallStatus: 'no-answer',
				Called: '+12134442242',
				From: '+13105551234'
			}
		};

		let sentXml = '';
		const res = {
			type: vi.fn().mockReturnThis(),
			send: vi.fn((xml) => {
				sentXml = xml;
			})
		};

		await handler(req, res);

		expect(sentXml).toContain('<Gather');
		expect(sentXml).toContain('numDigits="1"');
		expect(sentXml).toContain('press 1');
		expect(sentXml).toContain('/api/twilio/connect-operator-text');
	});

	it('returns empty TwiML when call was answered', async () => {
		const { default: router } = await import('../routes/twilio.js');

		const layer = router.stack.find(
			(l) => l.route && l.route.path === '/connect-operator-status'
		);
		const handler = layer.route.stack[0].handle;

		const req = { body: { DialCallStatus: 'completed' } };
		let sentXml = '';
		const res = {
			type: vi.fn().mockReturnThis(),
			send: vi.fn((xml) => {
				sentXml = xml;
			})
		};

		await handler(req, res);

		expect(sentXml).not.toContain('<Gather');
		expect(sentXml).not.toContain('<Record');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run tests/connect-operator-status.test.js`
Expected: FAIL — TwiML doesn't contain `<Gather` or `press 1`

**Step 3: Rewrite `connect-operator-status` and add `connect-operator-text`**

Replace lines 238-266 in `api/routes/twilio.js` with:

```js
/**
 * POST /api/twilio/connect-operator-status
 * Called after the operator dial completes.
 * If nobody answered, offers "press 1 to text" then falls back to voicemail.
 * All URLs MUST be absolute (see connect-operator comment).
 */
router.post('/connect-operator-status', (req, res) => {
	const twiml = new twilio.twiml.VoiceResponse();
	const dialStatus = req.body.DialCallStatus;
	const baseUrl =
		process.env.RENDER_EXTERNAL_URL ||
		process.env.FRONTEND_URL_PUBLIC ||
		'https://api.lemedspa.app';

	if (dialStatus === 'no-answer' || dialStatus === 'busy' || dialStatus === 'failed') {
		const gather = twiml.gather({
			numDigits: 1,
			timeout: 5,
			action: `${baseUrl}/api/twilio/connect-operator-text`,
			method: 'POST'
		});
		gather.say(
			{ voice: 'Polly.Joanna' },
			'Sorry, no one is available right now. To start a two-way text conversation, press 1. Otherwise, please leave a message after the beep.'
		);

		// Timeout fallback — record voicemail
		twiml.record({
			maxLength: 120,
			transcribe: false,
			transcribeCallback: `${baseUrl}/api/webhooks/voice/transcription`,
			recordingStatusCallback: `${baseUrl}/api/webhooks/voice/recording`,
			recordingStatusCallbackMethod: 'POST',
			recordingStatusCallbackEvent: 'completed',
			action: `${baseUrl}/api/webhooks/voice/recording`,
			method: 'POST'
		});
	}
	// If answered (completed), call is already done — just end gracefully

	res.type('text/xml');
	res.send(twiml.toString());
});

/**
 * POST /api/twilio/connect-operator-text
 * Called when caller presses 1 during the voicemail greeting.
 * Sends an SMS to initiate a 2-way text conversation, then hangs up.
 */
router.post('/connect-operator-text', async (req, res) => {
	const twiml = new twilio.twiml.VoiceResponse();
	const callerNumber = req.body.From || req.body.Caller;
	const twilioNumber = req.body.Called || req.body.To || process.env.TWILIO_PHONE_NUMBER;
	const digit = req.body.Digits;

	if (digit === '1' && callerNumber) {
		try {
			const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
			const baseUrl =
				process.env.RENDER_EXTERNAL_URL ||
				process.env.FRONTEND_URL_PUBLIC ||
				'https://api.lemedspa.app';

			const msgBody = '(LeMedSpa) Thank you for reaching out. How can we help you?';

			const twilioMsg = await client.messages.create({
				to: callerNumber,
				from: twilioNumber,
				body: msgBody,
				statusCallback: `${baseUrl}/api/webhooks/sms/status`
			});

			// Create conversation + message record via the same logic as studio-send
			const phoneDigits = callerNumber.replace(/\D/g, '');
			const { data: existing } = await supabaseAdmin
				.from('conversations')
				.select('id')
				.eq('phone_number', callerNumber)
				.maybeSingle();

			let convId = existing?.id;

			if (!convId) {
				const { data: contact } = await supabaseAdmin
					.from('contacts')
					.select('id, full_name')
					.or(`phone_normalized.eq.${phoneDigits},phone.eq.${callerNumber}`)
					.limit(1)
					.maybeSingle();

				const { data: newConv } = await supabaseAdmin
					.from('conversations')
					.insert({
						phone_number: callerNumber,
						twilio_number: twilioNumber,
						display_name: contact?.full_name || null,
						contact_id: contact?.id || null,
						last_message: msgBody.substring(0, 200),
						last_at: new Date().toISOString(),
						unread_count: 0
					})
					.select('id')
					.single();

				convId = newConv?.id;
			}

			if (convId) {
				await supabaseAdmin.from('messages').insert({
					conversation_id: convId,
					direction: 'outbound',
					body: msgBody,
					from_number: twilioNumber,
					to_number: callerNumber,
					twilio_sid: twilioMsg.sid,
					status: twilioMsg.status || 'sent',
					metadata: { source: 'ivr_press1' }
				});

				await supabaseAdmin
					.from('conversations')
					.update({
						last_message: msgBody.substring(0, 200),
						last_at: new Date().toISOString(),
						status: 'active'
					})
					.eq('id', convId);
			}

			twiml.say(
				{ voice: 'Polly.Joanna' },
				'A text message has been sent to your phone. You can reply directly to that message. Goodbye.'
			);
		} catch (err) {
			console.error('[connect-operator-text] Failed to send SMS:', err.message);
			twiml.say(
				{ voice: 'Polly.Joanna' },
				'Sorry, we were unable to send the text message. Please try calling again. Goodbye.'
			);
		}
	}

	twiml.hangup();
	res.type('text/xml');
	res.send(twiml.toString());
});
```

**Step 4: Run tests**

Run: `cd api && npx vitest run tests/connect-operator-status.test.js`
Expected: 2 tests PASS

**Step 5: Commit**

```bash
git add api/routes/twilio.js api/tests/connect-operator-status.test.js
git commit -m "[voice] Add press-1-to-text on operator voicemail fallback"
```

---

### Task 3: Update Studio Flow JSON

**Files:**
- Modify: `twilio/flows/main-ivr.json`

This task replaces the entire flow JSON. No unit tests — validated by JSON parse + deploy to test flow.

**Step 1: Understand the current flow structure**

Current widgets and their roles:
- `Trigger` → `x0a-MainGreetingMenu_Open` (greeting + gather)
- `split_digits_GreetingMenu` → routes digits 0-4, 9
- `connect_call_HighLevel` → dials +18184632211 (**REPLACE**)
- `x2a-Hours_Location` → plays hours audio
- `x2b-Company_Directory` → directory gather
- `Lea_voicemail` → record (**CONVERT to gather-then-record**)
- `ClinicalMD_Vmail` → record (**CONVERT to gather-then-record**)
- `x3c-AccountsOps_Menu` → accounts sub-menu
- `record_voicemail_accounts` → record (**CONVERT to gather-then-record**)
- `connect_call_accounts` → dials +12134442242 (**KEEP**)
- `send_message_accounts` → sends SMS
- `redirect_FlexSIP` → unused TwiML redirect (**REMOVE**)

**Step 2: Write the updated flow JSON**

Replace `twilio/flows/main-ivr.json` with the updated flow. Key changes:

1. **Add `log_incoming_call`** (make-http-request) — POSTs to `/api/webhooks/voice/incoming`
   - Insert between Trigger and MainGreetingMenu
   - Passes: CallSid, From, To, CallerName, CallerCity, CallerState, CallerCountry

2. **Replace `connect_call_HighLevel`** with `connect_operator_redirect` (add-twiml-redirect)
   - URL: `https://api.lemedspa.app/api/twilio/connect-operator`
   - Same position in flow (press 0 + timeout target)

3. **Convert `Lea_voicemail`** → `gather_lea_vmail` (gather) + `send_sms_lea` (make-http-request) + `record_lea_vmail` (record-voicemail)
   - Gather plays: "Leave a message after the beep, or press 1 to start a two-way text conversation"
   - Press 1 → send_sms_lea → POST to studio-send with `to={{contact.channel.address}}`, body
   - Timeout → record_lea_vmail

4. **Convert `ClinicalMD_Vmail`** → same pattern as Lea

5. **Convert `record_voicemail_accounts`** → same pattern as Lea

6. **Remove `redirect_FlexSIP`** — unused widget

7. **Update `send_message_accounts`** (press 1 for SMS) — change to POST to our `/webhooks/sms/studio-send` endpoint so the message appears in lm-app conversations. Body includes `to={{contact.channel.address}}`, `body=(LeMedSpa) Thank you for reaching out. How can we help you?`

**Step 3: Validate JSON**

Run: `node -e "const f=require('fs').readFileSync('twilio/flows/main-ivr.json','utf8'); const j=JSON.parse(f); console.log('Valid JSON:', j.states.length, 'states')"`
Expected: Valid JSON with ~20 states

**Step 4: Commit**

```bash
git add twilio/flows/main-ivr.json
git commit -m "[ivr] Update Studio flow: SIP routing, webhook logging, press-1-to-text"
```

---

### Task 4: Code Review

**Workflow:** Spawn `code-reviewer` subagent with all changed files.

**Files to review:**
- `api/routes/webhooks/sms-forward.js`
- `api/routes/webhooks/sms.js` (diff only)
- `api/routes/twilio.js` (connect-operator-status + connect-operator-text)
- `twilio/flows/main-ivr.json`

**Expected output:** Issues by severity (critical/high/medium/low) with PASS/FAIL verdict.

---

### Task 5: QA — Run Tests

**Workflow:** Spawn `qa` subagent.

**Commands:**
- `cd api && npx vitest run` — all unit tests
- `npx vite build` — frontend build check (unchanged but verify no breakage)

**Expected:** All tests pass, build succeeds.

---

### Task 6: Fix Issues

Apply fixes from code review and QA. Re-run tests after fixes.

---

### Task 7: Deploy to Test Flow

**Step 1: Deploy updated flow to test**

Run: `node twilio/deploy.js $TWILIO_TEST_FLOW_SID twilio/flows/main-ivr.json`
Expected: "Deployed successfully!" with revision number

**Step 2: Deploy API to Render**

Push to trigger Render auto-deploy:
```bash
git push origin main
```
Wait ~2-3 minutes for Render to redeploy.

**Step 3: Verify API health**

Run: `curl -s https://api.lemedspa.app/api/health`
Expected: `{"status":"ok"}`

**Step 4: Manual test — call test number**

1. Call the test Twilio number
2. Press 0 → verify SIP endpoint rings (Grandstream DECT) + softphone
3. Let it timeout → verify "press 1 to text" greeting plays
4. Press 1 → verify SMS received on caller's phone
5. Don't press anything → verify voicemail recording works

**Step 5: Manual test — SMS forwarding**

1. Send SMS to Twilio number from a phone
2. Check lm-app Messages page — should appear
3. Check TextMagic — should also appear (if signature validation passes)
4. If TextMagic doesn't receive → log the result, fall back to outbound-only mode

---

### Task 8: Deploy to Production

**Only after test flow is verified.**

**Step 1: Deploy flow to production**

Run: `node twilio/deploy.js $TWILIO_PROD_FLOW_SID twilio/flows/main-ivr.json --publish`
Expected: "Deployed successfully!" with published status

**Step 2: Update SMS webhook in Twilio Console**

Change the main Twilio number's "A message comes in" URL from:
- `https://my.textmagic.com/webhook/twilio/sms/incoming`
to:
- `https://api.lemedspa.app/api/webhooks/sms/incoming`

**Step 3: Set TEXTMAGIC_WEBHOOK_URL on Render**

Add env var on Render dashboard:
- `TEXTMAGIC_WEBHOOK_URL=https://my.textmagic.com/webhook/twilio/sms/incoming`

**Step 4: Final verification**

1. Call main number (818-4MEDSPA), press 0, verify SIP rings
2. Send SMS to main number, verify lm-app receives it
3. Check TextMagic receives the forwarded copy
4. Commit final session notes

```bash
git add -A && git commit -m "[deploy] Production: SIP routing + SMS forwarding live"
```
