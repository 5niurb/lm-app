---
paths:
  - "src/**/*.svelte"
  - "src/**/*.js"
---

# Frontend Code Rules

## Framework
- SvelteKit 2 with Svelte 5 runes
- Tailwind CSS v4 for styling
- shadcn-svelte for UI components

## Svelte 5 Runes (MANDATORY)
- `$state()` for reactive state — NEVER use `let x = value` for reactive variables
- `$derived()` for computed values — NEVER use `$:` reactive declarations
- `$effect()` for side effects — NEVER use `$:` reactive statements
- `$props()` for component props — NEVER use `export let`
- `$bindable()` for two-way binding props

## Design Theme
- Background: `#0a0a0c` (dark)
- Accents: `#C5A55A` / `#d4af37` (gold)
- Typography: Playfair Display (headings) + Inter (body)
- Style: Luxurious, intimate, high-end medical spa
- Hover effects: `translateY(-1px)` or `translateY(-2px)` with gold border transitions

## shadcn-svelte Components
- Located in `src/lib/components/ui/` — NEVER edit these directly
- Add new components via: `npx shadcn-svelte add <component>`
- Theme them via Tailwind classes, not by modifying source

## API Calls
- Use the `api()` wrapper from `$lib/api/index.js`
- Handles auth headers, error formatting, base URL resolution
- Pattern: `const data = await api('/api/endpoint')`

## Component Organization
- App components: `src/lib/components/` (AppSidebar, AppHeader, etc.)
- UI primitives: `src/lib/components/ui/` (shadcn, don't edit)
- Stores: `src/lib/stores/` (auth store)
- Utilities: `src/lib/utils/`
- Pages: `src/routes/` following SvelteKit file-based routing

## Auth Routes
- Public pages: `src/routes/login/`, `src/routes/consent/`, `src/routes/care/`
- Protected pages: `src/routes/(auth)/` — uses layout group with auth guard
- Auth state: `src/lib/stores/auth.js`

## Env Vars
- Client-side: must use `PUBLIC_` prefix
- Access via `$env/static/public` (baked at build time)
- CRITICAL: `PUBLIC_API_URL` must be set to production URL when building for deploy
