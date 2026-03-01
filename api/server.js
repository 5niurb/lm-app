import 'dotenv/config';
import express from 'express';
import cors from 'cors';

// Validate required env vars at startup
const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const key of required) {
	if (!process.env[key]) {
		console.error(`Missing required env var: ${key}`);
		process.exit(1);
	}
}

const app = express();
const PORT = process.env.PORT || 3001;

// CORS — must be BEFORE all routes so every response gets headers
// Allow both the production CF Pages URL and local dev
const ALLOWED_ORIGINS = [
	'https://lemedspa.app',
	'https://lm-app.pages.dev',
	'https://lemedspa.com',
	'https://www.lemedspa.com',
	'https://lemedspa.pages.dev',
	'http://localhost:5173',
	process.env.FRONTEND_URL,
	process.env.FRONTEND_URL_LOCAL,
	process.env.FRONTEND_URL_PUBLIC
].filter(Boolean);

app.use(
	cors({
		origin(origin, cb) {
			// Allow requests with no origin (curl, server-to-server, Twilio webhooks)
			if (!origin) return cb(null, true);
			if (
				ALLOWED_ORIGINS.includes(origin) ||
				origin.endsWith('.lemedspa.app') ||
				origin.endsWith('.lm-app.pages.dev') ||
				origin.endsWith('.lemedspa.pages.dev')
			) {
				return cb(null, origin);
			}
			cb(new Error('Not allowed by CORS'));
		},
		credentials: true
	})
);

// Webhook routes FIRST (before json parsing — Twilio sends URL-encoded)
import webhookVoice from './routes/webhooks/voice.js';
import webhookSms from './routes/webhooks/sms.js';
app.use('/api/webhooks/voice', webhookVoice);
app.use('/api/webhooks/sms', webhookSms);

// Twilio softphone routes (token + TwiML — needs URL-encoded for TwiML callbacks)
import twilioRoutes from './routes/twilio.js';
app.use('/api/twilio', express.urlencoded({ extended: false }), express.json(), twilioRoutes);

// JSON parsing for all other routes
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
	res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Google Sheets connectivity check (no auth — reads 1 cell to verify service account)
app.get('/api/health/sheets', async (req, res) => {
	try {
		const { getSheetsClient, SPREADSHEET_ID } = await import('./services/google-sheets.js');
		const sheets = getSheetsClient();
		const { data } = await sheets.spreadsheets.values.get({
			spreadsheetId: SPREADSHEET_ID,
			range: "'patients3'!A1:A1"
		});
		const cell = data.values?.[0]?.[0] || '(empty)';
		res.json({ status: 'ok', cell, timestamp: new Date().toISOString() });
	} catch (err) {
		res.status(500).json({ status: 'error', error: err.message });
	}
});

// Public webhook — website contact form (no auth, needs JSON parsing)
import webhookContactForm from './routes/webhooks/contact-form.js';
app.use('/api/webhooks/contact-form', webhookContactForm);

// Public content API — no auth, for patient-facing care instruction pages
import publicContentRoutes from './routes/public-content.js';
app.use('/api/public/content', publicContentRoutes);

// Public consent API — no auth, for patient-facing consent forms
import publicConsentRoutes from './routes/public-consent.js';
app.use('/api/public/consent', publicConsentRoutes);

// Cron processing — secret-key auth (no user token), called by pg_cron + pg_net
import cronRoutes from './routes/cron-process.js';
app.use('/api/cron', cronRoutes);

// Feature flags — lightweight endpoint, no auth needed
app.get('/api/features', (req, res) => {
	res.json({
		aiSuggest: !!process.env.ANTHROPIC_API_KEY
	});
});

// API routes
import authRoutes from './routes/auth.js';
import callRoutes from './routes/calls.js';
import voicemailRoutes from './routes/voicemails.js';
import contactRoutes from './routes/contacts.js';
import messageRoutes from './routes/messages.js';
import settingsRoutes from './routes/settings.js';
import serviceRoutes from './routes/services.js';
import automationRoutes from './routes/automation.js';
import twilioHistoryRoutes from './routes/twilio-history.js';
import syncRoutes from './routes/sync.js';
import appointmentRoutes from './routes/appointments.js';
import templateRoutes from './routes/templates.js';
import scheduledMessageRoutes from './routes/scheduled-messages.js';
import autoReplyRoutes from './routes/auto-replies.js';
import broadcastRoutes from './routes/broadcasts.js';
import emailRoutes from './routes/emails.js';
import pushTokenRoutes from './routes/push-tokens.js';

app.use('/api/auth', authRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/voicemails', voicemailRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/twilio-history', twilioHistoryRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/scheduled-messages', scheduledMessageRoutes);
app.use('/api/auto-replies', autoReplyRoutes);
app.use('/api/broadcasts', broadcastRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/push-tokens', pushTokenRoutes);

app.listen(PORT, () => {
	console.log(`LM App API running on port ${PORT}`);
});

// Background job: send scheduled messages every 60 seconds
import { processScheduledMessages } from './services/scheduled-sender.js';
setInterval(() => {
	processScheduledMessages().catch((err) => console.error('[scheduled] Job error:', err.message));
}, 60_000);
console.log('Scheduled message sender running (every 60s)');

// Keep-alive not needed on Fly.io (auto_stop_machines: off, min_machines_running: 1)
