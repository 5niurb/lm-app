/**
 * Automation execution engine.
 *
 * Processes automation sequences — sends SMS via Twilio, emails via Resend,
 * logs everything to automation_log, and creates conversation/message records
 * so outbound messages appear in the Messages page.
 */
import Twilio from 'twilio';
import { supabaseAdmin } from './supabase.js';

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_EMAIL = 'Le Med Spa <noreply@updates.lemedspa.com>';

/** HTML entity encoding to prevent XSS in email content */
function escHtml(str) {
	return String(str ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Reusable Twilio client — instantiated once */
let _twilioClient = null;
function getTwilioClient() {
	if (!_twilioClient) {
		const accountSid = process.env.TWILIO_ACCOUNT_SID;
		const authToken = process.env.TWILIO_AUTH_TOKEN;
		if (accountSid && authToken) {
			_twilioClient = new Twilio.Twilio(accountSid, authToken);
		}
	}
	return _twilioClient;
}

// ============================================================================
// SMS SENDING
// ============================================================================

/**
 * Send an SMS via Twilio and record it in conversations/messages.
 *
 * @param {object} opts
 * @param {string} opts.to - Recipient phone number (any format)
 * @param {string} opts.body - SMS message body
 * @param {string} [opts.clientId] - Contact ID for conversation linking
 * @param {string} [opts.clientName] - Contact display name
 * @param {object} [opts.metadata] - Extra metadata for the message
 * @returns {Promise<{success: boolean, twilioSid?: string, conversationId?: string, error?: string}>}
 */
export async function sendSms({ to, body, clientId, clientName, metadata }) {
	const accountSid = process.env.TWILIO_ACCOUNT_SID;
	const authToken = process.env.TWILIO_AUTH_TOKEN;
	const fromNumber =
		process.env.TWILIO_SMS_FROM_NUMBER ||
		process.env.TWILIO_PHONE_NUMBER ||
		process.env.TWILIO_MAIN_PHONE_NUMBER;

	if (!accountSid || !authToken) {
		return { success: false, error: 'Twilio credentials not configured' };
	}
	if (!fromNumber) {
		return { success: false, error: 'No Twilio phone number configured' };
	}

	// Normalize phone number
	let toNumber = to.replace(/[^\d+]/g, '');
	if (toNumber.length === 10) toNumber = '+1' + toNumber;
	if (!toNumber.startsWith('+')) toNumber = '+' + toNumber;

	try {
		const client = getTwilioClient();
		if (!client) return { success: false, error: 'Twilio client not available' };
		const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.API_BASE_URL || '';
		const statusCallback = baseUrl ? `${baseUrl}/api/webhooks/sms/status` : undefined;

		const twilioMsg = await client.messages.create({
			to: toNumber,
			from: fromNumber,
			body,
			...(statusCallback && { statusCallback })
		});

		// Record in conversations/messages so it appears in the Messages page
		const conversationId = await recordOutboundMessage({
			toNumber,
			fromNumber,
			body,
			twilioSid: twilioMsg.sid,
			status: twilioMsg.status || 'sent',
			clientId,
			clientName,
			metadata
		});

		return {
			success: true,
			twilioSid: twilioMsg.sid,
			conversationId
		};
	} catch (err) {
		console.error('Automation SMS send error:', err.message);
		return { success: false, error: err.message };
	}
}

/**
 * Record an outbound message in conversations + messages tables.
 * Finds or creates a conversation for the phone number.
 */
async function recordOutboundMessage({
	toNumber,
	fromNumber,
	body,
	twilioSid,
	status,
	clientId,
	clientName,
	metadata
}) {
	try {
		// Find existing conversation by phone number
		const { data: existing } = await supabaseAdmin
			.from('conversations')
			.select('id')
			.eq('phone_number', toNumber)
			.maybeSingle();

		let convId;
		if (existing) {
			convId = existing.id;
		} else {
			// Look up contact if clientId not provided
			let contactId = clientId;
			let displayName = clientName;

			if (!contactId) {
				const phoneDigits = toNumber.replace(/\D/g, '');
				const { data: contact } = await supabaseAdmin
					.from('contacts')
					.select('id, full_name')
					.or(`phone_normalized.eq.${phoneDigits},phone.eq.${toNumber}`)
					.limit(1)
					.maybeSingle();

				if (contact) {
					contactId = contact.id;
					displayName = displayName || contact.full_name;
				}
			}

			const { data: newConv } = await supabaseAdmin
				.from('conversations')
				.insert({
					phone_number: toNumber,
					display_name: displayName || null,
					contact_id: contactId || null,
					last_message: body,
					last_at: new Date().toISOString()
				})
				.select('id')
				.single();

			convId = newConv?.id;
		}

		if (!convId) return null;

		// Insert message
		await supabaseAdmin.from('messages').insert({
			conversation_id: convId,
			direction: 'outbound',
			body,
			from_number: fromNumber,
			to_number: toNumber,
			twilio_sid: twilioSid,
			status,
			metadata: metadata || { source: 'automation' }
		});

		// Update conversation last_message
		await supabaseAdmin
			.from('conversations')
			.update({
				last_message: body,
				last_at: new Date().toISOString(),
				status: 'active'
			})
			.eq('id', convId);

		return convId;
	} catch (err) {
		console.error('Failed to record outbound message:', err.message);
		return null;
	}
}

// ============================================================================
// EMAIL SENDING
// ============================================================================

/**
 * Send an automation email via Resend.
 *
 * @param {object} opts
 * @param {string} opts.to - Recipient email address
 * @param {string} opts.subject - Email subject line
 * @param {string} opts.html - Email HTML body
 * @param {string} [opts.text] - Plain text fallback
 * @returns {Promise<{success: boolean, resendId?: string, error?: string}>}
 */
export async function sendEmail({ to, subject, html, text }) {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) {
		return { success: false, error: 'RESEND_API_KEY not configured' };
	}

	try {
		const response = await fetch(RESEND_API_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				from: FROM_EMAIL,
				to: [to],
				subject,
				html,
				...(text && { text })
			})
		});

		if (!response.ok) {
			const errorBody = await response.text();
			console.error('Resend API error:', response.status, errorBody);
			return { success: false, error: `Email send failed: ${response.status}` };
		}

		const data = await response.json();
		return { success: true, resendId: data.id };
	} catch (err) {
		console.error('Automation email send error:', err.message);
		return { success: false, error: err.message };
	}
}

// ============================================================================
// CONTENT RENDERING
// ============================================================================

/**
 * Build SMS body from a sequence + optional content block.
 *
 * Priority:
 * 1. Custom message_body on the sequence
 * 2. Content block summary (short SMS version)
 * 3. Generic fallback with sequence name
 */
function buildSmsBody(sequence, content, client) {
	const name = client.full_name?.split(' ')[0] || 'there';

	if (sequence.message_body) {
		return sequence.message_body.replace(/\{name\}/gi, name).replace(/\{first_name\}/gi, name);
	}

	if (content?.summary) {
		return `Hi ${name}, ${content.summary}`;
	}

	// Generic fallback
	const label = sequence.name || 'your upcoming appointment';
	return `Hi ${name}, this is Le Med Spa with important information about ${label}. Questions? Call us at 818-4MEDSPA.`;
}

/**
 * Build email HTML from a sequence + optional content block.
 *
 * If a content block with sections exists, renders them as a structured email.
 * Otherwise falls back to a simple text email.
 */
function buildEmailHtml(sequence, content, client) {
	const name = escHtml(client.full_name?.split(' ')[0] || 'there');
	const sections = content?.content_json || [];

	// Gold color palette matching the app
	const gold = '#c5a55a';
	const darkBg = '#0a0a0c';
	const lightText = '#e8e0d0';

	let sectionsHtml = '';

	if (sections.length > 0) {
		sectionsHtml = sections
			.map(
				(s) => `
      <div style="margin-bottom: 24px;">
        <h3 style="color: ${gold}; font-family: 'Georgia', serif; font-size: 16px; margin-bottom: 8px; font-weight: normal;">
          ${escHtml(s.heading)}
        </h3>
        <p style="color: ${lightText}; font-size: 14px; line-height: 1.7; margin: 0;">
          ${escHtml(s.body)}
        </p>
      </div>
    `
			)
			.join('');
	} else if (sequence.message_body) {
		sectionsHtml = `
      <div style="margin-bottom: 24px;">
        <p style="color: ${lightText}; font-size: 14px; line-height: 1.7; margin: 0;">
          ${escHtml(sequence.message_body.replace(/\{name\}/gi, name).replace(/\{first_name\}/gi, name))}
        </p>
      </div>
    `;
	}

	const title = escHtml(content?.title || sequence.subject_line || sequence.name);

	return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: ${darkBg}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 32px 24px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid rgba(197,165,90,0.2);">
      <h1 style="color: ${gold}; font-family: 'Georgia', serif; font-size: 24px; font-weight: normal; margin: 0; letter-spacing: 2px;">
        LEMEDSPA
      </h1>
      <p style="color: rgba(255,255,255,0.3); font-size: 11px; letter-spacing: 3px; margin-top: 8px;">
        PRIVATE · INTIMATE · EXCLUSIVE
      </p>
    </div>

    <!-- Greeting -->
    <p style="color: ${lightText}; font-size: 15px; margin-bottom: 24px;">
      Hi ${name},
    </p>

    <!-- Title -->
    <h2 style="color: white; font-family: 'Georgia', serif; font-size: 20px; font-weight: normal; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid rgba(197,165,90,0.15);">
      ${title}
    </h2>

    <!-- Content Sections -->
    ${sectionsHtml}

    <!-- Footer -->
    <div style="margin-top: 40px; padding-top: 24px; border-top: 1px solid rgba(197,165,90,0.15); text-align: center;">
      <p style="color: rgba(255,255,255,0.35); font-size: 13px; margin-bottom: 8px;">
        Questions? We're here to help.
      </p>
      <p style="margin: 0;">
        <a href="tel:+18184633772" style="color: ${gold}; text-decoration: none; font-size: 14px;">
          818-4MEDSPA (818-463-3772)
        </a>
      </p>
      <p style="color: rgba(255,255,255,0.2); font-size: 11px; margin-top: 16px;">
        Le Med Spa · 17414 Ventura Blvd, Encino, CA 91316
      </p>
      <p style="color: rgba(255,255,255,0.15); font-size: 10px; margin-top: 8px;">
        LEMEDSPA® is a registered trademark of LM Operations.
      </p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Build email subject line from a sequence + optional content block.
 */
function buildEmailSubject(sequence, content) {
	if (sequence.subject_line) return sequence.subject_line;
	if (content?.title) return `Le Med Spa — ${content.title}`;
	return `Le Med Spa — ${sequence.name}`;
}

// ============================================================================
// SEQUENCE EXECUTION
// ============================================================================

/**
 * Execute a single automation sequence for a specific client.
 *
 * @param {object} opts
 * @param {object} opts.sequence - The automation_sequences row
 * @param {object} opts.client - The contacts row (must have id, full_name, phone, email)
 * @param {object} [opts.content] - The service_content row (optional, for linked content)
 * @param {string} [opts.triggeredBy] - User ID who triggered (for audit)
 * @param {boolean} [opts.manual] - Whether this was manually triggered
 * @returns {Promise<{smsResult?: object, emailResult?: object, logEntries: object[]}>}
 */
export async function executeSequence({ sequence, client, content, triggeredBy, manual = false }) {
	const results = { logEntries: [] };

	// Determine which channels to send on
	const channels = [];
	if (sequence.channel === 'sms' || sequence.channel === 'both') {
		if (client.phone) channels.push('sms');
	}
	if (sequence.channel === 'email' || sequence.channel === 'both') {
		if (client.email) channels.push('email');
	}

	if (channels.length === 0) {
		console.warn(
			`executeSequence: No valid channels for client ${client.id} (phone: ${!!client.phone}, email: ${!!client.email})`
		);
		// Log as failed — no valid contact method
		const { data: logEntry } = await supabaseAdmin
			.from('automation_log')
			.insert({
				client_id: client.id,
				sequence_id: sequence.id,
				channel: sequence.channel === 'both' ? 'sms' : sequence.channel,
				status: 'failed',
				scheduled_at: new Date().toISOString(),
				sent_at: new Date().toISOString(),
				metadata: {
					triggered_by: triggeredBy,
					manual,
					error: 'No valid contact method (missing phone/email)',
					client_name: client.full_name,
					sequence_name: sequence.name
				}
			})
			.select()
			.single();

		if (logEntry) results.logEntries.push(logEntry);
		return results;
	}

	// Send SMS
	if (channels.includes('sms')) {
		const smsBody = buildSmsBody(sequence, content, client);

		const smsResult = await sendSms({
			to: client.phone,
			body: smsBody,
			clientId: client.id,
			clientName: client.full_name,
			metadata: {
				source: 'automation',
				sequence_id: sequence.id,
				sequence_name: sequence.name,
				content_ref: sequence.content_ref || null,
				manual
			}
		});

		results.smsResult = smsResult;

		// Log
		const { data: logEntry } = await supabaseAdmin
			.from('automation_log')
			.insert({
				client_id: client.id,
				sequence_id: sequence.id,
				channel: 'sms',
				status: smsResult.success ? 'sent' : 'failed',
				scheduled_at: new Date().toISOString(),
				sent_at: smsResult.success ? new Date().toISOString() : null,
				metadata: {
					triggered_by: triggeredBy,
					manual,
					twilio_sid: smsResult.twilioSid || null,
					conversation_id: smsResult.conversationId || null,
					error: smsResult.error || null,
					client_name: client.full_name,
					sequence_name: sequence.name,
					sms_body_preview: smsBody.slice(0, 100)
				}
			})
			.select()
			.single();

		if (logEntry) results.logEntries.push(logEntry);
	}

	// Send Email
	if (channels.includes('email')) {
		const subject = buildEmailSubject(sequence, content);
		const html = buildEmailHtml(sequence, content, client);

		const emailResult = await sendEmail({
			to: client.email,
			subject,
			html
		});

		results.emailResult = emailResult;

		// Log
		const { data: logEntry } = await supabaseAdmin
			.from('automation_log')
			.insert({
				client_id: client.id,
				sequence_id: sequence.id,
				channel: 'email',
				status: emailResult.success ? 'sent' : 'failed',
				scheduled_at: new Date().toISOString(),
				sent_at: emailResult.success ? new Date().toISOString() : null,
				metadata: {
					triggered_by: triggeredBy,
					manual,
					resend_id: emailResult.resendId || null,
					error: emailResult.error || null,
					client_name: client.full_name,
					sequence_name: sequence.name,
					email_subject: subject
				}
			})
			.select()
			.single();

		if (logEntry) results.logEntries.push(logEntry);
	}

	return results;
}

// ============================================================================
// BATCH PROCESSOR
// ============================================================================

/**
 * Process all scheduled automation log entries.
 * Called by cron or manual /api/automation/process endpoint.
 *
 * Picks up entries with status='scheduled' and scheduled_at <= now,
 * then executes each one.
 *
 * @returns {Promise<{processed: number, sent: number, failed: number}>}
 */
export async function processScheduledAutomation() {
	const now = new Date().toISOString();

	// Get all scheduled entries that are due
	const { data: pending, error } = await supabaseAdmin
		.from('automation_log')
		.select(
			`
      *,
      sequence:automation_sequences(
        *,
        content:service_content(id, title, content_type, summary, content_json)
      )
    `
		)
		.eq('status', 'scheduled')
		.lte('scheduled_at', now)
		.order('scheduled_at', { ascending: true })
		.limit(50); // Process in batches

	if (error) {
		console.error('[automation] Failed to fetch scheduled entries:', error.message);
		return { processed: 0, sent: 0, failed: 0 };
	}
	if (!pending || pending.length === 0) {
		return { processed: 0, sent: 0, failed: 0 };
	}

	let sent = 0;
	let failed = 0;

	for (const entry of pending) {
		// Get client
		const { data: client } = await supabaseAdmin
			.from('contacts')
			.select('id, full_name, phone, email')
			.eq('id', entry.client_id)
			.single();

		if (!client) {
			// Mark as failed — client not found
			await supabaseAdmin
				.from('automation_log')
				.update({
					status: 'failed',
					metadata: { ...entry.metadata, error: 'Client not found' }
				})
				.eq('id', entry.id);
			failed++;
			continue;
		}

		const sequence = entry.sequence;
		if (!sequence) {
			await supabaseAdmin
				.from('automation_log')
				.update({
					status: 'failed',
					metadata: { ...entry.metadata, error: 'Sequence not found' }
				})
				.eq('id', entry.id);
			failed++;
			continue;
		}

		// Determine channel from original log entry
		const channel = entry.channel;
		let success = false;

		if (channel === 'sms' && client.phone) {
			const smsBody = buildSmsBody(sequence, sequence.content, client);
			const result = await sendSms({
				to: client.phone,
				body: smsBody,
				clientId: client.id,
				clientName: client.full_name,
				metadata: {
					source: 'automation',
					sequence_id: sequence.id,
					batch_processed: true
				}
			});
			success = result.success;

			await supabaseAdmin
				.from('automation_log')
				.update({
					status: success ? 'sent' : 'failed',
					sent_at: success ? new Date().toISOString() : null,
					metadata: {
						...entry.metadata,
						twilio_sid: result.twilioSid || null,
						conversation_id: result.conversationId || null,
						error: result.error || null
					}
				})
				.eq('id', entry.id);
		} else if (channel === 'email' && client.email) {
			const subject = buildEmailSubject(sequence, sequence.content);
			const html = buildEmailHtml(sequence, sequence.content, client);
			const result = await sendEmail({ to: client.email, subject, html });
			success = result.success;

			await supabaseAdmin
				.from('automation_log')
				.update({
					status: success ? 'sent' : 'failed',
					sent_at: success ? new Date().toISOString() : null,
					metadata: {
						...entry.metadata,
						resend_id: result.resendId || null,
						error: result.error || null
					}
				})
				.eq('id', entry.id);
		} else {
			await supabaseAdmin
				.from('automation_log')
				.update({
					status: 'failed',
					metadata: { ...entry.metadata, error: `No ${channel} contact method available` }
				})
				.eq('id', entry.id);
		}

		if (success) sent++;
		else failed++;
	}

	return { processed: pending.length, sent, failed };
}
