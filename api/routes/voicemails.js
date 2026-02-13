import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { supabaseAdmin } from '../services/supabase.js';

const router = Router();

// All voicemail routes require authentication
router.use(verifyToken);

/**
 * GET /api/voicemails
 * List voicemails with pagination and filtering.
 *
 * Query params:
 *   page (default 1), pageSize (default 25), is_new (true/false),
 *   mailbox (lea/clinical_md/accounts/care_team), search
 */
router.get('/', logAction('voicemails.list'), async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
  const offset = (page - 1) * pageSize;

  let query = supabaseAdmin
    .from('voicemails')
    .select('*, call_logs(from_number, to_number, started_at)', { count: 'exact' });

  // Filter by new/read status
  if (req.query.is_new === 'true') {
    query = query.eq('is_new', true);
  } else if (req.query.is_new === 'false') {
    query = query.eq('is_new', false);
  }

  // Filter by mailbox
  if (req.query.mailbox) {
    query = query.eq('mailbox', req.query.mailbox);
  }

  // Search by phone number or transcription
  if (req.query.search) {
    query = query.or(`from_number.ilike.%${req.query.search}%,transcription.ilike.%${req.query.search}%`);
  }

  // Sort newest first
  query = query.order('created_at', { ascending: false });

  // Pagination
  query = query.range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Failed to fetch voicemails:', error.message);
    return res.status(500).json({ error: 'Failed to fetch voicemails' });
  }

  return res.json({
    data: data || [],
    count: count || 0,
    page,
    pageSize
  });
});

/**
 * GET /api/voicemails/stats
 * Voicemail mailbox counts (unheard per mailbox).
 */
router.get('/stats', logAction('voicemails.stats'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('voicemails')
    .select('mailbox, is_new')
    .eq('is_new', true);

  if (error) {
    console.error('Failed to fetch voicemail stats:', error.message);
    return res.status(500).json({ error: 'Failed to fetch voicemail stats' });
  }

  const counts = {
    total_unheard: data?.length || 0,
    lea: 0,
    clinical_md: 0,
    accounts: 0,
    care_team: 0,
    unassigned: 0
  };

  for (const vm of data || []) {
    if (vm.mailbox && counts[vm.mailbox] !== undefined) {
      counts[vm.mailbox]++;
    } else {
      counts.unassigned++;
    }
  }

  return res.json(counts);
});

/**
 * GET /api/voicemails/:id
 * Get a single voicemail by ID.
 */
router.get('/:id', logAction('voicemails.read'), async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabaseAdmin
    .from('voicemails')
    .select('*, call_logs(from_number, to_number, started_at, direction)')
    .eq('id', id)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Voicemail not found' });
  }

  return res.json({ data });
});

/**
 * PATCH /api/voicemails/:id/read
 * Mark a voicemail as read (is_new = false).
 */
router.patch('/:id/read', logAction('voicemails.markRead'), async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabaseAdmin
    .from('voicemails')
    .update({
      is_new: false,
      assigned_to: req.user.id
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Failed to mark voicemail as read:', error.message);
    return res.status(500).json({ error: 'Failed to mark voicemail as read' });
  }

  return res.json({ data });
});

/**
 * PATCH /api/voicemails/:id/unread
 * Mark a voicemail as unread (is_new = true).
 */
router.patch('/:id/unread', logAction('voicemails.markUnread'), async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabaseAdmin
    .from('voicemails')
    .update({ is_new: true })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Failed to mark voicemail as unread:', error.message);
    return res.status(500).json({ error: 'Failed to mark voicemail as unread' });
  }

  return res.json({ data });
});

export default router;
