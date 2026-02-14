import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { supabaseAdmin } from '../services/supabase.js';

const router = Router();

// All settings routes require authentication
router.use(verifyToken);

/** Admin-only guard middleware */
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// =============================================================================
// SETTINGS (key-value store)
// =============================================================================

/**
 * GET /api/settings
 * Get all settings (any authenticated user can read).
 */
router.get('/', logAction('settings.list'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('*')
      .order('key');

    if (error) throw error;

    // Convert array to keyed object for easier frontend use
    const settings = {};
    for (const row of data) {
      settings[row.key] = row.value;
    }

    res.json({ data: settings, raw: data });
  } catch (err) {
    console.error('Settings list error:', err.message);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

/**
 * PUT /api/settings/:key
 * Update a single setting (admin only).
 */
router.put('/:key', requireAdmin, logAction('settings.update'), async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  if (value === undefined) {
    return res.status(400).json({ error: 'Missing "value" in request body' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .upsert(
        { key, value, updated_by: req.user.id },
        { onConflict: 'key' }
      )
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('Settings update error:', err.message);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

/**
 * PUT /api/settings
 * Bulk update multiple settings at once (admin only).
 */
router.put('/', requireAdmin, logAction('settings.bulk_update'), async (req, res) => {
  const { settings } = req.body;

  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Missing "settings" object in request body' });
  }

  try {
    const rows = Object.entries(settings).map(([key, value]) => ({
      key,
      value,
      updated_by: req.user.id
    }));

    const { data, error } = await supabaseAdmin
      .from('settings')
      .upsert(rows, { onConflict: 'key' })
      .select();

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('Settings bulk update error:', err.message);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// =============================================================================
// PHONE EXTENSIONS
// =============================================================================

/**
 * GET /api/settings/extensions
 * List all phone extensions.
 */
router.get('/extensions', logAction('extensions.list'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('phone_extensions')
      .select(`
        *,
        user:profiles(id, full_name, email, role)
      `)
      .order('extension');

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('Extensions list error:', err.message);
    res.status(500).json({ error: 'Failed to load extensions' });
  }
});

/**
 * POST /api/settings/extensions
 * Create a new phone extension (admin only).
 */
router.post('/extensions', requireAdmin, logAction('extensions.create'), async (req, res) => {
  const { extension, forward_number, ring_timeout, voicemail_enabled, voicemail_greeting_url, user_id } = req.body;

  if (!extension) {
    return res.status(400).json({ error: 'Extension number is required' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('phone_extensions')
      .insert({
        extension,
        forward_number: forward_number || null,
        ring_timeout: ring_timeout || 20,
        voicemail_enabled: voicemail_enabled !== false,
        voicemail_greeting_url: voicemail_greeting_url || null,
        user_id: user_id || null
      })
      .select(`
        *,
        user:profiles(id, full_name, email, role)
      `)
      .single();

    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) {
    console.error('Extension create error:', err.message);
    if (err.message?.includes('unique')) {
      return res.status(409).json({ error: 'Extension number already exists' });
    }
    res.status(500).json({ error: 'Failed to create extension' });
  }
});

/**
 * PUT /api/settings/extensions/:id
 * Update a phone extension (admin only).
 */
router.put('/extensions/:id', requireAdmin, logAction('extensions.update'), async (req, res) => {
  const { id } = req.params;
  const { extension, forward_number, ring_timeout, voicemail_enabled, voicemail_greeting_url, user_id } = req.body;

  try {
    const updates = {};
    if (extension !== undefined) updates.extension = extension;
    if (forward_number !== undefined) updates.forward_number = forward_number || null;
    if (ring_timeout !== undefined) updates.ring_timeout = ring_timeout;
    if (voicemail_enabled !== undefined) updates.voicemail_enabled = voicemail_enabled;
    if (voicemail_greeting_url !== undefined) updates.voicemail_greeting_url = voicemail_greeting_url || null;
    if (user_id !== undefined) updates.user_id = user_id || null;

    const { data, error } = await supabaseAdmin
      .from('phone_extensions')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        user:profiles(id, full_name, email, role)
      `)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Extension not found' });
    res.json({ data });
  } catch (err) {
    console.error('Extension update error:', err.message);
    res.status(500).json({ error: 'Failed to update extension' });
  }
});

/**
 * DELETE /api/settings/extensions/:id
 * Delete a phone extension (admin only).
 */
router.delete('/extensions/:id', requireAdmin, logAction('extensions.delete'), async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabaseAdmin
      .from('phone_extensions')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.status(204).end();
  } catch (err) {
    console.error('Extension delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete extension' });
  }
});

// =============================================================================
// CALL ROUTING RULES
// =============================================================================

/**
 * GET /api/settings/routing
 * List all call routing rules.
 */
router.get('/routing', logAction('routing.list'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('call_routing_rules')
      .select('*')
      .order('priority', { ascending: true });

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('Routing rules list error:', err.message);
    res.status(500).json({ error: 'Failed to load routing rules' });
  }
});

/**
 * POST /api/settings/routing
 * Create a new routing rule (admin only).
 */
router.post('/routing', requireAdmin, logAction('routing.create'), async (req, res) => {
  const { name, priority, day_of_week, start_time, end_time, action_type, action_target, fallback_action, is_active } = req.body;

  if (!name || !action_type) {
    return res.status(400).json({ error: 'Name and action_type are required' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('call_routing_rules')
      .insert({
        name,
        priority: priority || 0,
        day_of_week: day_of_week || null,
        start_time: start_time || null,
        end_time: end_time || null,
        action_type,
        action_target: action_target || null,
        fallback_action: fallback_action || 'voicemail',
        is_active: is_active !== false
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) {
    console.error('Routing rule create error:', err.message);
    res.status(500).json({ error: 'Failed to create routing rule' });
  }
});

/**
 * PUT /api/settings/routing/:id
 * Update a routing rule (admin only).
 */
router.put('/routing/:id', requireAdmin, logAction('routing.update'), async (req, res) => {
  const { id } = req.params;
  const { name, priority, day_of_week, start_time, end_time, action_type, action_target, fallback_action, is_active } = req.body;

  try {
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (priority !== undefined) updates.priority = priority;
    if (day_of_week !== undefined) updates.day_of_week = day_of_week;
    if (start_time !== undefined) updates.start_time = start_time;
    if (end_time !== undefined) updates.end_time = end_time;
    if (action_type !== undefined) updates.action_type = action_type;
    if (action_target !== undefined) updates.action_target = action_target;
    if (fallback_action !== undefined) updates.fallback_action = fallback_action;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data, error } = await supabaseAdmin
      .from('call_routing_rules')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Routing rule not found' });
    res.json({ data });
  } catch (err) {
    console.error('Routing rule update error:', err.message);
    res.status(500).json({ error: 'Failed to update routing rule' });
  }
});

/**
 * DELETE /api/settings/routing/:id
 * Delete a routing rule (admin only).
 */
router.delete('/routing/:id', requireAdmin, logAction('routing.delete'), async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabaseAdmin
      .from('call_routing_rules')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.status(204).end();
  } catch (err) {
    console.error('Routing rule delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete routing rule' });
  }
});

export default router;
