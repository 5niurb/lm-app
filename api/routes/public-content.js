/**
 * Public content API — no authentication required.
 * Used by patient-facing care instruction pages.
 */
import { Router } from 'express';
import { supabaseAdmin } from '../services/supabase.js';

const router = Router();

/**
 * GET /api/public/content/:slug
 * Get a content block by its page_slug. Public endpoint (no auth).
 * Returns content with service info for rendering care instruction pages.
 */
router.get('/:slug', async (req, res) => {
	try {
		const { data, error } = await supabaseAdmin
			.from('service_content')
			.select(
				`
        id,
        content_type,
        title,
        summary,
        page_slug,
        content_json,
        is_active,
        version,
        service:services(id, name, slug, category, description)
      `
			)
			.eq('page_slug', req.params.slug)
			.eq('is_active', true)
			.single();

		if (error || !data) {
			return res.status(404).json({ error: 'Content not found' });
		}

		res.json({ data });
	} catch (err) {
		console.error('Public content fetch error:', err.message);
		res.status(500).json({ error: 'Failed to load content' });
	}
});

/**
 * GET /api/public/content
 * List all active content slugs (for sitemap/index).
 */
router.get('/', async (req, res) => {
	try {
		const { data, error } = await supabaseAdmin
			.from('service_content')
			.select(
				`
        page_slug,
        title,
        content_type,
        service:services(name, slug)
      `
			)
			.eq('is_active', true)
			.order('page_slug');

		if (error) throw error;

		res.json({ data: data || [] });
	} catch (err) {
		console.error('Public content list error:', err.message);
		res.status(500).json({ error: 'Failed to list content' });
	}
});

export default router;
