import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';

const router = Router();

// All voicemail routes require authentication
router.use(verifyToken);

/**
 * GET /api/voicemails
 * List voicemails.
 * Skeleton: returns an empty array until voicemails table is implemented.
 */
router.get('/', logAction('voicemails.list'), async (req, res) => {
  // TODO: Query voicemails table with pagination, filtering, and sorting
  return res.json({
    data: [],
    count: 0,
    page: 1,
    pageSize: 25
  });
});

/**
 * GET /api/voicemails/:id
 * Get a single voicemail by ID.
 * Skeleton: returns 404 until voicemails table is implemented.
 */
router.get('/:id', logAction('voicemails.read'), async (req, res) => {
  const { id } = req.params;

  // TODO: Query voicemails table by id
  return res.status(404).json({
    error: 'Voicemail not found',
    id
  });
});

/**
 * PATCH /api/voicemails/:id/read
 * Mark a voicemail as read.
 * Skeleton: returns 200 until voicemails table is implemented.
 */
router.patch('/:id/read', logAction('voicemails.markRead'), async (req, res) => {
  const { id } = req.params;

  // TODO: Update voicemails table — set is_read = true, read_at = now(), read_by = req.user.id
  return res.json({
    message: 'Voicemail marked as read',
    data: {
      id,
      is_read: true,
      read_at: new Date().toISOString(),
      read_by: req.user.id
    }
  });
});

export default router;
