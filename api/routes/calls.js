import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { supabaseAdmin } from '../services/supabase.js';

const router = Router();

// All call routes require authentication
router.use(verifyToken);

/**
 * GET /api/calls
 * List call logs with pagination, filtering, and sorting.
 *
 * Query params:
 *   page (default 1), pageSize (default 25), direction, disposition, search, sort, order
 */
router.get('/', logAction('calls.list'), async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
  const offset = (page - 1) * pageSize;

  let query = supabaseAdmin
    .from('call_logs')
    .select('*', { count: 'exact' });

  // Filters
  if (req.query.direction) {
    query = query.eq('direction', req.query.direction);
  }
  if (req.query.disposition) {
    query = query.eq('disposition', req.query.disposition);
  }
  if (req.query.status) {
    query = query.eq('status', req.query.status);
  }
  if (req.query.search) {
    query = query.or(`from_number.ilike.%${req.query.search}%,to_number.ilike.%${req.query.search}%,notes.ilike.%${req.query.search}%,caller_name.ilike.%${req.query.search}%`);
  }

  // Date range
  if (req.query.from) {
    query = query.gte('started_at', req.query.from);
  }
  if (req.query.to) {
    query = query.lte('started_at', req.query.to);
  }

  // Sorting
  const sortField = req.query.sort || 'started_at';
  const sortOrder = req.query.order === 'asc' ? true : false;
  query = query.order(sortField, { ascending: sortOrder });

  // Pagination
  query = query.range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Failed to fetch call logs:', error.message);
    return res.status(500).json({ error: 'Failed to fetch call logs' });
  }

  return res.json({
    data: data || [],
    count: count || 0,
    page,
    pageSize
  });
});

/**
 * GET /api/calls/stats
 * Get call statistics for the dashboard.
 *
 * Query params: days (default 7)
 */
router.get('/stats', logAction('calls.stats'), async (req, res) => {
  const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 7));
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabaseAdmin
    .from('call_logs')
    .select('disposition, duration, status')
    .gte('started_at', since.toISOString());

  if (error) {
    console.error('Failed to fetch call stats:', error.message);
    return res.status(500).json({ error: 'Failed to fetch call stats' });
  }

  const calls = data || [];
  const totalCalls = calls.length;
  const answered = calls.filter(c => c.disposition === 'answered').length;
  const missed = calls.filter(c => c.disposition === 'missed').length;
  const voicemail = calls.filter(c => c.disposition === 'voicemail').length;
  const durations = calls.filter(c => c.duration > 0).map(c => c.duration);
  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  // Get unheard voicemail count
  const { count: unheardCount } = await supabaseAdmin
    .from('voicemails')
    .select('id', { count: 'exact', head: true })
    .eq('is_new', true);

  return res.json({
    totalCalls,
    answered,
    missed,
    voicemail,
    avgDuration,
    unheardVoicemails: unheardCount || 0,
    days
  });
});

/**
 * GET /api/calls/:id
 * Get a single call log by ID.
 */
router.get('/:id', logAction('calls.read'), async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabaseAdmin
    .from('call_logs')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Call log not found' });
  }

  return res.json({ data });
});

/**
 * POST /api/calls
 * Create a manual call log entry (e.g. for outbound calls logged by staff).
 */
router.post('/', logAction('calls.create'), async (req, res) => {
  const { direction, from_number, to_number, notes, tags, disposition } = req.body;

  if (!from_number && !to_number) {
    return res.status(400).json({ error: 'At least one phone number is required' });
  }

  const { data, error } = await supabaseAdmin
    .from('call_logs')
    .insert({
      direction: direction || 'outbound',
      from_number: from_number || '',
      to_number: to_number || '',
      notes: notes || null,
      tags: tags || [],
      disposition: disposition || 'answered',
      status: 'completed',
      handled_by: req.user.id,
      started_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create call log:', error.message);
    return res.status(500).json({ error: 'Failed to create call log' });
  }

  return res.status(201).json({ data });
});

/**
 * PATCH /api/calls/:id
 * Update an existing call log entry (notes, tags, disposition).
 * Admin only.
 */
router.patch('/:id', logAction('calls.update'), async (req, res) => {
  const { id } = req.params;
  const { notes, tags, disposition, handled_by } = req.body;

  // Build update object with only provided fields
  const update = {};
  if (notes !== undefined) update.notes = notes;
  if (tags !== undefined) update.tags = tags;
  if (disposition !== undefined) update.disposition = disposition;
  if (handled_by !== undefined) update.handled_by = handled_by;

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  const { data, error } = await supabaseAdmin
    .from('call_logs')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Failed to update call log:', error.message);
    return res.status(500).json({ error: 'Failed to update call log' });
  }

  return res.json({ data });
});

export default router;
