# Ralph Loop — Messaging Features

You are implementing features for lm-app, a med spa management platform.
The project root is the current working directory.

## Instructions

1. Read the `progress.txt` file that follows the PRD section below for codebase patterns.
2. Read the `prd.json` file — the path is given in the PRD below under "Files" section.
3. Find the first user story where `passes: false`, sorted by `priority` ascending.
4. If a story has `inProgress: true`, resume it. Otherwise start fresh.
5. Mark the story `inProgress: true` in prd.json IMMEDIATELY before starting work.
6. Implement the story following the acceptance criteria exactly.
7. Run `npx vite build` to verify the build passes.
8. Run `npx prettier --write <changed files>` to format (skip .sql files — no parser).
9. Stage specific files and commit with message format: `[messaging] <story title>`
   Include: `Co-Authored-By: Claude <noreply@anthropic.com>`
10. Update `prd.json`: set `passes: true` and `inProgress: false` for the completed story.
11. Append any learnings to the progress.txt file at the path given in the PRD.
12. If ALL stories have `passes: true`, output: `RALPH_LOOP_COMPLETE`
13. Otherwise, exit cleanly. The loop will restart with a fresh context.

## Rules

- Only implement ONE story per iteration.
- Do NOT modify shadcn-svelte components in src/lib/components/ui/.
- Use Svelte 5 runes ($state, $derived, $props, $effect) — no legacy let reactivity.
- JS not TypeScript. Use JSDoc @type annotations if needed.
- Use supabaseAdmin for all API queries.
- Use existing patterns (phone-lookup.js, formatters.js) — don't reinvent.
- If the build fails, fix the error. You have up to 3 attempts.
- If stuck after 3 attempts on a single acceptance criterion, document the blocker in progress.txt and exit.
- Never force-push. Never commit .env files.
- Do NOT spend turns exploring the codebase extensively. The PRD and progress.txt give you everything you need. Go straight to implementation.
