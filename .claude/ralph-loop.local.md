---
active: true
iteration: 1
max_iterations: 20
completion_promise: "RALPH_LOOP_COMPLETE"
started_at: "2026-02-23T16:00:00Z"
---

# Multi-Feature Ralph Loop — Internal Notes → AI Suggest → Broadcast

You are implementing messaging features for lm-app. Three features need to be built, in order:

1. **Internal Notes** (5 stories) — Staff-only notes inline in conversation threads
2. **AI Suggest** (5 stories) — AI-powered reply suggestions
3. **Broadcast** (6 stories) — Bulk SMS messaging with filters and merge tags

## How to Pick the Next Story

1. Check each feature's `prd.json` in order: internal-notes → ai-suggest → broadcast
2. Find the first feature with a story where `passes: false`
3. Within that feature, find the first story (by priority) where `passes: false`
4. If that story has `inProgress: true`, resume it. Otherwise start fresh.

## Per-Story Workflow

1. Read the feature's `prd.md` and `progress.txt` from `docs/prds/PROMPT.md` and the feature directory
2. Mark the story `inProgress: true` in prd.json IMMEDIATELY
3. Implement the story following acceptance criteria exactly
4. Run `npx vite build` to verify the build passes
5. Run `npx prettier --write <changed files>` to format
6. Stage specific files and commit: `[messaging] <story title>`
   Include: `Co-Authored-By: Claude <noreply@anthropic.com>`
7. Set `passes: true` and `inProgress: false` in prd.json
8. Append learnings to the feature's progress.txt
9. Exit cleanly — the loop restarts with fresh context

## Completion

If ALL stories across ALL three features have `passes: true`, output: `RALPH_LOOP_COMPLETE`

## Feature Directories

| Feature | PRD | JSON | Progress |
|---------|-----|------|----------|
| Internal Notes | `docs/prds/messaging-internal-notes/prd.md` | `docs/prds/messaging-internal-notes/prd.json` | `docs/prds/messaging-internal-notes/progress.txt` |
| AI Suggest | `docs/prds/messaging-ai-suggest/prd.md` | `docs/prds/messaging-ai-suggest/prd.json` | `docs/prds/messaging-ai-suggest/progress.txt` |
| Broadcast | `docs/prds/messaging-broadcast/prd.md` | `docs/prds/messaging-broadcast/prd.json` | `docs/prds/messaging-broadcast/progress.txt` |

## Rules

- Only implement ONE story per iteration
- Do NOT modify shadcn-svelte components in src/lib/components/ui/
- Use Svelte 5 runes ($state, $derived, $props, $effect) — no legacy let reactivity
- JS not TypeScript. Use JSDoc @type annotations if needed
- Use supabaseAdmin for all API queries
- Use existing patterns (phone-lookup.js, formatters.js) — don't reinvent
- If the build fails, fix the error. Up to 3 attempts per story
- If stuck after 3 attempts, document the blocker in progress.txt and exit
- Never force-push. Never commit .env files
- Read `docs/prds/PROMPT.md` for codebase patterns and commit conventions
