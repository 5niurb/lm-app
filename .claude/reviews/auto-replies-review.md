## Summary
Solid implementation with clean architecture and good separation of concerns; two medium-severity correctness issues need fixing before this ships, plus one low-severity security gap.

---

## Issues

### api/routes/auto-replies.js

- **[severity: medium] Correctness:** The `DELETE` handler soft-deletes by setting `is_active = false`, which is fine, but the `PUT` handler's allowed-fields list includes `is_active`. This means a client could accidentally (or deliberately) reactivate a "deleted" rule by sending `{ is_active: true }` to the update endpoint. If soft-delete is intentional, make `is_active` writable through the toggle path only and remove it from the PUT allowed list, or document clearly that this is expected behavior.

- **[severity: low] Correctness:** `priority: priority || 10` — falsy check means a submitted priority of `0` silently becomes `10`. Use `priority != null ? priority : 10` to correctly accept zero as a valid value. Same pattern applies to any numeric field in the POST handler.

- **[severity: low] Security:** The `PUT` and `DELETE` handlers accept `req.params.id` raw and pass it directly to Supabase as a filter value without validating it is a UUID. Supabase will reject a malformed UUID at the DB layer, but the error will bubble up as a 500 rather than a clean 400. A simple UUID regex check at the top of each handler would give a better client-facing error and prevents the upstream trip. Example: `if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid id' });`

---

### api/routes/webhooks/sms.js

- **[severity: high] Correctness — auto-reply storm risk:** `processAutoReply` is fire-and-forget with no deduplication or rate-limiting guard. If a contact sends a message that matches a `trigger_type: 'any'` rule, every inbound message from that number will receive an auto-reply, including any reply they send to the auto-reply itself, creating a potential back-and-forth loop. There is no cooldown period stored per conversation. Recommended fix: before sending, check whether the most recent outbound message in the conversation was already an auto-reply within the last N minutes (e.g., 5 min), and skip if so. The `metadata.source = 'auto_reply'` field you're already writing makes this query trivial.

  ```js
  // Example cooldown check (add before client.messages.create)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: recent } = await supabaseAdmin
    .from('messages')
    .select('id')
    .eq('conversation_id', convId)
    .eq('direction', 'outbound')
    .eq('metadata->>source', 'auto_reply')
    .gte('created_at', fiveMinAgo)
    .limit(1);
  if (recent?.length) return; // already replied recently
  ```

- **[severity: medium] Correctness — `trigger_type: 'any'` ordering hazard:** Rules are sorted by priority ascending and the first match is returned. A `trigger_type: 'any'` rule at priority 1 will shadow every keyword rule at priority 2+, regardless of intent. There is no UI warning about this, and the form doesn't prevent it. At minimum, the UI should surface a warning when saving a `trigger_type: 'any'` rule with a lower priority number than existing keyword rules. This is a UX/data integrity issue that will silently break keyword rules without explanation.

- **[severity: low] Performance:** `findMatchingAutoReplyRule` fetches all active rules from the database on every inbound SMS (`SELECT *`). For a low-volume clinic this is fine, but the query returns full rows including `metadata` and `response_body` for every rule just to find the first match. The partial index on `(is_active, priority) WHERE is_active = true` is correctly set up and will make the scan fast; this is not a blocking issue — just note that if the rule table ever grows, projecting only the needed columns would reduce payload.

---

### api/db/migration-auto-replies.sql

- **[severity: low] Correctness:** There is no RLS `DELETE` policy. The API routes use `supabaseAdmin` (service role) which bypasses RLS, so this has no immediate impact, but if any future code path uses the anon client to touch this table, deletions will silently fail rather than error. Consider adding a `DELETE` policy consistent with the others for completeness.

---

### src/lib/components/messaging/AutoRepliesTab.svelte

- **[severity: medium] Correctness — keyword rules with empty keywords:** The Save button is disabled when `formTriggerType === 'keyword' && !formKeywords.trim()`, which is correct client-side validation. However, the API `POST` handler does not enforce this — it will happily insert a keyword rule with `trigger_keywords: []`. An empty keyword array means the keyword loop runs `.some(...)` over an empty array, always returning `false`, so the rule never fires. The rule will appear active in the UI but silently do nothing. Fix: add server-side validation in the POST handler: `if (trigger_type === 'keyword' && (!trigger_keywords || trigger_keywords.length === 0)) return res.status(400).json({ error: 'keyword rules require at least one keyword' });`

- **[severity: low] Correctness:** `handleToggle` re-fetches the full rules list after every toggle (`await loadRules()`). This causes a visible flicker/skeleton flash on toggle because `loading` is set to `true` inside `loadRules`. An optimistic local update (flip `rule.is_active` in the `rules` array immediately, then reconcile on reload) would be smoother, though this is a UX improvement rather than a bug.

---

### src/lib/components/messaging/ChatsTab.svelte (Auto badge)

No issues. The `msg.metadata?.source === 'auto_reply'` guard is safe and correct. The badge is scoped to outbound messages via the bubble layout, so it can't appear on inbound messages erroneously.

---

### src/routes/(auth)/messages/+page.svelte

No issues. Tab integration is clean and follows the existing pattern.

---

## Verdict

NEEDS CHANGES — the auto-reply storm risk (high) and missing server-side keyword validation (medium) are blocking issues that should be fixed before this feature ships.
