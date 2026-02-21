/**
 * Sample Twilio webhook payloads for testing.
 *
 * These match the fields each webhook handler actually reads.
 * All values are fake/test data — safe to POST to staging.
 */

// ── Voice webhooks ──────────────────────────────────────────

/** POST /api/webhooks/voice/incoming — Studio HTTP Request (no signature) */
export const voiceIncoming = {
	CallSid: 'CA_test_incoming_0001',
	From: '+15551234567',
	To: '+13101234567',
	CallStatus: 'ringing',
	CallerName: 'Test Caller',
	CallerCity: 'Los Angeles',
	CallerState: 'CA',
	CallerCountry: 'US',
	CallerZip: '90001'
};

/** POST /api/webhooks/voice/event — Studio HTTP Request (no signature) */
export const voiceEvent = {
	CallSid: 'CA_test_event_0001',
	event_type: 'menu_selection',
	digit: '1',
	menu: 'main',
	action: 'forward_to_sip'
};

/** POST /api/webhooks/voice/event — voicemail_start variant */
export const voiceEventVoicemail = {
	CallSid: 'CA_test_event_0002',
	event_type: 'voicemail_start',
	mailbox: 'general',
	action: 'record_voicemail'
};

/** POST /api/webhooks/voice/status — Twilio direct callback (signed) */
export const voiceStatus = {
	CallSid: 'CA_test_status_0001',
	CallStatus: 'completed',
	CallDuration: '45',
	From: '+15551234567',
	To: '+13101234567'
};

/** POST /api/webhooks/voice/recording — Twilio direct callback (signed) */
export const voiceRecording = {
	CallSid: 'CA_test_recording_0001',
	RecordingSid: 'RE_test_0001',
	RecordingUrl: 'https://api.twilio.com/2010-04-01/Accounts/AC_test/Recordings/RE_test_0001',
	RecordingDuration: '15',
	From: '+15551234567',
	mailbox: 'general'
};

/** POST /api/webhooks/voice/transcription — Twilio direct callback (signed) */
export const voiceTranscription = {
	RecordingSid: 'RE_test_0001',
	TranscriptionText: 'Hi this is a test voicemail message for staging.',
	TranscriptionStatus: 'completed'
};

// ── SMS webhooks ────────────────────────────────────────────

/** POST /api/webhooks/sms/incoming — Twilio direct callback (signed) */
export const smsIncoming = {
	MessageSid: 'SM_test_incoming_0001',
	From: '+15559876543',
	To: '+13101234567',
	Body: 'Test incoming SMS for staging webhook verification',
	NumMedia: '0'
};

/** POST /api/webhooks/sms/status — Twilio direct callback (signed) */
export const smsStatus = {
	MessageSid: 'SM_test_status_0001',
	MessageStatus: 'delivered'
};
