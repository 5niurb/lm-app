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
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => {
    fetch(`${process.env.RENDER_EXTERNAL_URL}/api/health`).catch(() => {});
  }, 14 * 60 * 1000);
}
