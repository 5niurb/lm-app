import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
	js.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		},
		rules: {
			// Relax rules for our codebase — warn instead of error for common patterns
			'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			'no-undef': 'warn'
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				svelteConfig: await import('./svelte.config.js')
			}
		},
		rules: {
			// Svelte-specific relaxations
			'svelte/no-navigation-without-resolve': 'warn',
			'svelte/require-each-key': 'warn',
			'svelte/prefer-svelte-reactivity': 'off',
			'no-useless-assignment': 'warn'
		}
	},
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'dist/',
			'.wrangler/',
			'.cloudflare/',
			'node_modules/',
			'api/node_modules/',
			// shadcn-svelte generated components — don't lint
			'src/lib/components/ui/'
		]
	}
];
