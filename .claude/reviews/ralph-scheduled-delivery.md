## Summary
The scheduled delivery implementation is mostly sound in architecture but has a silent double-send race condition, a field-name mismatch that silently breaks edits, a missing pagination field in the frontend, and no schema migration shipped with the branch.

## Issues

- **[severity: high]** Correctness — Race condition / double-send in `api/services/scheduled-sender.js` lines 11–19:
  The job uses `updated_at <= 5_min_ago` as a concurrency guard, but `updated_at` is not set until *after* Twilio send succeeds (line 48–54). On a multi-instance Render deployment (or if the same instance fires twice before the first completes), two concurrent job ticks can both fetch the same `pending` row, both call `client.messages.create`, and both mark it `sent`. The guard only prevents retries of *previously updated* rows, not simultaneous in-flight sends of the same row.
  Suggested fix: Use an optimistic status-claim step before sending — update `status = 'processing'` where `status = 'pending'` and only process the rows that were actually updated (use Supabase's returning count or select post-update). This is the standard "claim before process" pattern for at-least-once job queues.

- **[severity: high]** Correctness — Silent no-op on `PUT /api/scheduled-messages/:id` in `api/routes/scheduled-messages.js` lines 94–96:
  The frontend sends `{ body, scheduled_at }` (snake_case, line 105 of `ScheduledTab.svelte`), but the route handler maps `req.body.scheduledAt` (camelCase) and `req.body.body`. The `scheduled_at` field is never captured — the update silently applies only `body` and ignores the new send time. A user who reschedules a message will see no error, but the scheduled time will not change.
  Suggested fix: Accept `scheduled_at` in addition to `scheduledAt`: `if (req.body.scheduled_at || req.body.scheduledAt) updates.scheduled_at = req.body.scheduled_at || req.body.scheduledAt;`. Alternatively normalise the frontend to send camelCase consistently.

- **[severity: medium]** Correctness — Wrong response field consumed in `src/lib/components/messaging/ScheduledTab.svelte` line 57:
  The API returns `{ data, count, page, pageSize }` (line 41 of `scheduled-messages.js`), but the frontend reads `res.total` for pagination (`totalCount = res.total || 0`). `res.total` is always `undefined`; it should be `res.count`. As a result `totalCount` is always 0, pagination controls never appear, and the "X scheduled messages" header always reads 0.
  Suggested fix: Change `res.total` to `res.count` on line 57 of `ScheduledTab.svelte`.

- **[severity: medium]** Correctness — Retry backoff guard is evaluated on first attempt in `api/services/scheduled-sender.js` line 17:
  The query filters `.lte('updated_at', fiveMinAgo)`. For a brand-new `pending` row created seconds ago, `updated_at` equals `created_at` (just now), so the row will not be picked up by the job until 5 minutes have elapsed — even for the very first send attempt. Messages scheduled for right now will be delayed by up to 5 minutes on their first delivery.
  Suggested fix: Add an OR condition so new rows (never attempted) bypass the backoff: `.or('retry_count.eq.0,updated_at.lte.' + fiveMinAgo)`. The backoff should only apply when `retry_count > 0`.

- **[severity: medium]** Correctness — No schema migration shipped with the branch. There is no `scheduled_messages` table definition in `api/db/schema.sql` or `api/db/schema-phase1c.sql`, and no migration file exists. The `scheduled-messages.js` route and `scheduled-sender.js` both reference this table at runtime; the branch cannot be deployed without the table being created out-of-band.
  Suggested fix: Add a `api/db/schema-scheduled-messages.sql` (or a migration) that creates the table with the expected columns (`id`, `to_number`, `from_number`, `body`, `template_id`, `conversation_id`, `scheduled_at`, `status`, `retry_count`, `error_message`, `sent_at`, `created_by`, `created_at`, `updated_at`) plus the index on `(status, scheduled_at)` needed for efficient polling.

- **[severity: medium]** Performance — N+1 conversation lookup inside the send loop in `api/services/scheduled-sender.js` lines 58–87:
  For each of the up to 10 messages processed per tick, the job potentially makes 3 sequential Supabase calls: `findConversation`, then `contacts` lookup, then `conversations` insert. For a batch of 10, that is up to 30 additional DB round-trips per job tick. While the batch size is capped at 10, this pattern becomes expensive if scheduled sends are frequent.
  Suggested fix: Pre-fetch conversations for all `to_number` values in the batch before the loop using a single `in` query, then resolve per-message inside the loop without extra DB calls.

- **[severity: low]** Correctness — `PUT /:id` in `api/routes/scheduled-messages.js` (lines 104–117) returns HTTP 200 with `{ data: null }` when the message is not found or is no longer `pending` (the `.eq('status', 'pending')` filter causes the update to match zero rows, `data` is null, but `error` is also null from Supabase). A client cancelling then editing the same message gets a silent 200 with null data instead of a 404.
  Suggested fix: Check `if (!data) return res.status(404).json({ error: 'Scheduled message not found or not pending' });` after the update.

- **[severity: low]** Code quality — `DELETE /api/scheduled-messages/:id` in `api/routes/scheduled-messages.js` lines 124–137 returns HTTP 200 even when no row was matched (e.g., message already sent or ID does not exist). Same Supabase zero-row-match / null-error issue as above.
  Suggested fix: Return 404 when the update affected zero rows.

- **[severity: low]** Code quality — The auto-refresh `$effect` in `ScheduledTab.svelte` (lines 138–143) and the filter-change `$effect` (lines 42–46) will both run on mount and both call `loadMessages()`. The initial load is therefore doubled — one from the filter effect and one 30 seconds later from the interval, which is fine, but both call `loadStats()` too. Non-blocking but wasteful.
  Suggested fix: The auto-refresh interval is acceptable; no structural fix required, but worth noting if request volume becomes a concern.

- **[severity: low]** Code quality — `api/services/scheduled-sender.js` line 117: the success log uses string concatenation rather than the structured format used by existing log lines elsewhere in the codebase (e.g., `console.error('[scheduled] Failed to query due messages:', error.message)`). Minor inconsistency.
  Suggested fix: `console.log('[scheduled] Sent: to=%s sid=%s', msg.to_number, twilioMsg.sid);`

## Verdict
NEEDS CHANGES — Two blocking issues (double-send race condition, silent schedule-time update failure) and a missing schema migration must be resolved before this branch ships. The pagination field mismatch and first-attempt backoff delay are also functional bugs that should be fixed in the same pass.
