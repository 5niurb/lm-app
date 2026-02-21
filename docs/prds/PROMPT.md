# Ralph Loop — Messaging Features

You are implementing features for lm-app, a med spa management platform.

## Instructions

1. Read `progress.txt` in this directory for codebase patterns and gotchas.
2. Read the `prd.json` in the current feature directory.
3. Find the first user story where `passes: false`, sorted by `priority` ascending.
4. If a story has `inProgress: true`, resume it. Otherwise start fresh.
5. Implement the story following the acceptance criteria exactly.
6. Run `npx vite build` to verify the build passes.
7. Run `npx prettier --write <changed files>` to format.
8. Commit with message format: `[messaging] <story title>`
9. Update `prd.json`: set `passes: true` for the completed story.
10. Append any learnings, gotchas, or patterns discovered to `progress.txt`.
11. If ALL stories have `passes: true`, output: `<promise>COMPLETE</promise>`
12. Otherwise, exit cleanly. The loop will restart with a fresh context.

## Rules

- Only implement ONE story per iteration.
- Do NOT modify shadcn-svelte components in src/lib/components/ui/.
- Use Svelte 5 runes ($state, $derived, $props, $effect) — no legacy let reactivity.
- Use supabaseAdmin for all API queries.
- Use existing patterns (phone-lookup.js, formatters.js) — don't reinvent.
- If stuck after 3 attempts on a single acceptance criterion, document the blocker in progress.txt and exit.
- Never force-push. Never commit .env files.
