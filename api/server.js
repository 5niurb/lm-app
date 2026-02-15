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

// Public webhook — website contact form (no auth, needs JSON parsing)
import webhookContactForm from './routes/webhooks/contact-form.js';
app.use('/api/webhooks/contact-form', webhookContactForm);

// Public content API — no auth, for patient-facing care instruction pages
import publicContentRoutes from './routes/public-content.js';
app.use('/api/public/content', publicContentRoutes);

// Public consent API — no auth, for patient-facing consent forms
import publicConsentRoutes from './routes/public-consent.js';
app.use('/api/public/consent', publicConsentRoutes);

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

app.use('/api/auth', authRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/voicemails', voicemailRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api/twilio-history', twilioHistoryRoutes);

app.listen(PORT, () => {
	console.log(`LM App API running on port ${PORT}`);
});

// Keep-alive ping in production (prevent Render free tier spin-down)
// RENDER_EXTERNAL_URL is auto-set by Render; fallback to known URL
const KEEP_ALIVE_URL =
	process.env.RENDER_EXTERNAL_URL ||
	(process.env.NODE_ENV === 'production' ? 'https://lm-app-api.onrender.com' : null);
if (KEEP_ALIVE_URL) {
	const INTERVAL = 14 * 60 * 1000; // 14 minutes
	setInterval(() => {
		fetch(`${KEEP_ALIVE_URL}/api/health`)
			.then((r) => console.log(`[keep-alive] ${r.status}`))
			.catch((e) => console.warn(`[keep-alive] failed: ${e.message}`));
	}, INTERVAL);
	console.log(`Keep-alive ping enabled: ${KEEP_ALIVE_URL} every 14m`);
}
