/**
 * Cron processing endpoint — authenticated via shared secret.
 *
 * Called by Supabase pg_cron + pg_net every 5 minutes to process
 * scheduled automation entries. No user auth required — uses
 * x-cron-secret header instead.
 */
import { Router } from 'express';
import { processScheduledAutomation } from '../services/automation.js';

const router = Router();

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * POST /api/cron/process
 * Process all scheduled automation entries that are due.
 * Authenticated via x-cron-secret header.
 */
router.post('/process', async (req, res) => {
    // Validate cron secret
    if (!CRON_SECRET) {
        console.error('[cron] CRON_SECRET env var not set — rejecting request');
        return res.status(503).json({ error: 'Cron processing not configured' });
    }

    const providedSecret = req.headers['x-cron-secret'];
    if (!providedSecret || providedSecret !== CRON_SECRET) {
        console.warn('[cron] Invalid or missing cron secret');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        console.log('[cron] Processing automation queue...');
        const results = await processScheduledAutomation();
        console.log(
            `[cron] Done: ${results.processed} processed, ${results.sent} sent, ${results.failed} failed`
        );

        res.json({
            message: `Processed ${results.processed} entries: ${results.sent} sent, ${results.failed} failed.`,
            ...results
        });
    } catch (err) {
        console.error('[cron] Automation process error:', err.message);
        res.status(500).json({ error: 'Failed to process automation queue' });
    }
});

export default router;
