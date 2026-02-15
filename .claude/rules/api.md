---
paths:
  - "api/**/*.js"
---

# API Code Rules

## Architecture
- Express.js with ES modules (`import`/`export`)
- Direct Supabase client calls — no ORM
- Use `supabaseAdmin` (service role) for server-side operations that bypass RLS
- Use `supabase` (anon key) only when you want RLS enforcement

## Route Patterns
- Webhook routes (`/api/webhooks/*`) mount BEFORE `express.json()` — Twilio sends URL-encoded
- All other routes go after `express.json()`
- Public routes (no auth): `/api/public/*`, `/api/webhooks/*`
- Protected routes: everything else under `/api/*`

## Response Format
- Success: `res.json({ data, total?, page? })` or `res.json(data)` for simple responses
- Error: `res.status(code).json({ error: 'message' })`
- Always set appropriate HTTP status codes

## Error Handling
- Wrap route handlers in try/catch
- Log errors to console: `console.error('[route] action failed:', error.message)`
- Return 500 with generic message for unexpected errors
- Return specific 4xx codes for client errors

## Audit Logging
- Fire-and-forget pattern — don't await, don't block responses
- `supabaseAdmin.from('audit_log').insert({...})` at end of handlers
- Include: action, user_id, resource_type, resource_id, details

## Environment Variables
- Required vars checked at startup in server.js
- Access via `process.env.VAR_NAME`
- Never log secrets or include in error responses

## File Organization
- Routes: `api/routes/*.js`
- Services: `api/services/*.js` (business logic, external API wrappers)
- Middleware: `api/middleware/*.js`
- Scripts: `api/scripts/*.js` (one-off data tasks)
- Schema: `api/db/*.sql`
