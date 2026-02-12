import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';

const router = Router();

// All call routes require authentication
router.use(verifyToken);

/**
 * GET /api/calls
 * List call logs.
 * Skeleton: returns an empty array until call log table is implemented.
 */
router.get('/', logAction('calls.list'), async (req, res) => {
  // TODO: Query call_logs table with pagination, filtering, and sorting
  return res.json({
    data: [],
    count: 0,
    page: 1,
    pageSize: 25
  });
});

/**
 * GET /api/calls/:id
 * Get a single call log by ID.
 * Skeleton: returns 404 until call log table is implemented.
 */
router.get('/:id', logAction('calls.read'), async (req, res) => {
  const { id } = req.params;

  // TODO: Query call_logs table by id
  return res.status(404).json({
    error: 'Call log not found',
    id
  });
});

/**
 * POST /api/calls
 * Create a new call log entry.
 * Skeleton: returns 201 with the submitted data echoed back.
 */
router.post('/', logAction('calls.create'), async (req, res) => {
  const { direction, phone_number, contact_name, notes } = req.body;

  // TODO: Insert into call_logs table
  return res.status(201).json({
    message: 'Call log created',
    data: {
      id: null,
      direction: direction || 'outbound',
      phone_number: phone_number || null,
      contact_name: contact_name || null,
      notes: notes || null,
      created_by: req.user.id,
      created_at: new Date().toISOString()
    }
  });
});

/**
 * PATCH /api/calls/:id
 * Update an existing call log entry.
 * Skeleton: returns 200 with the submitted data echoed back.
 */
router.patch('/:id', logAction('calls.update'), async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  // TODO: Update call_logs table by id
  return res.json({
    message: 'Call log updated',
    data: {
      id,
      ...updates,
      updated_at: new Date().toISOString()
    }
  });
});

export default router;
