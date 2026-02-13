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

// Webhook routes FIRST (before json parsing — Twilio sends URL-encoded)
import webhookVoice from './routes/webhooks/voice.js';
app.use('/api/webhooks/voice', webhookVoice);

// JSON parsing for all other routes
app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
import authRoutes from './routes/auth.js';
import callRoutes from './routes/calls.js';
import voicemailRoutes from './routes/voicemails.js';
import contactRoutes from './routes/contacts.js';

app.use('/api/auth', authRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/voicemails', voicemailRoutes);
app.use('/api/contacts', contactRoutes);

app.listen(PORT, () => {
  console.log(`LM App API running on port ${PORT}`);
});

// Keep-alive ping in production (prevent Render free tier spin-down)
// RENDER_EXTERNAL_URL is auto-set by Render; fallback to known URL
const KEEP_ALIVE_URL = process.env.RENDER_EXTERNAL_URL || (process.env.NODE_ENV === 'production' ? 'https://lm-app-api.onrender.com' : null);
if (KEEP_ALIVE_URL) {
  const INTERVAL = 14 * 60 * 1000; // 14 minutes
  setInterval(() => {
    fetch(`${KEEP_ALIVE_URL}/api/health`)
      .then(r => console.log(`[keep-alive] ${r.status}`))
      .catch(e => console.warn(`[keep-alive] failed: ${e.message}`));
  }, INTERVAL);
  console.log(`Keep-alive ping enabled: ${KEEP_ALIVE_URL} every 14m`);
}
