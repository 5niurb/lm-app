import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		include: ['tests/**/*.test.js', 'api/tests/**/*.test.js'],
		exclude: [
			'api/tests/health.test.js',
			'api/tests/security-utils.test.js',
			'api/tests/gcal-utils.test.js',
			'api/tests/webhooks.test.js'
		]
	}
});
