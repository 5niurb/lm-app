## Summary
The POST /sheet route is mostly well-structured but has several correctness bugs, one significant data integrity gap, and a problematic module-level cache that causes silent cross-request state bleed.

## Issues

- **[severity: high]** Correctness — **AR ID diffing compares strings to strings but `source_id` may be stored as an integer.**
  Line 564: `arIdSet` is built from `c.source_id` which could be a number in the DB depending on the column type. Line 607: `arIdSet.has(arId)` compares against the string produced by `mapSheetRow` (line 414: `source_id: arId || null` where `arId` is a raw CSV string). If `source_id` is a `bigint` or `integer` column, the Set will always miss and every existing contact will be treated as new on every run, causing duplicate inserts.
  **Fix:** Cast both sides — either `arIdSet` built with `.map(c => String(c.source_id))` or `mapSheetRow` stores `source_id: arId ? parseInt(arId, 10) : null`, consistently matching the DB column type.

- **[severity: high]** Data integrity — **No uniqueness guard on the insert path means concurrent runs or a double-POST produce duplicate contacts.**
  Line 678: `supabaseAdmin.from('contacts').insert(mapped)` is executed without an `onConflict` upsert clause. If two sync requests overlap (or a retry fires before the first completes), the same AR ID will be inserted twice because `arIdSet` is fetched once at the start (line 558) and does not reflect in-flight inserts from the current run.
  **Fix:** Use `.upsert(mapped, { onConflict: 'source_id' })` (requires a unique index on `source_id` where `source = 'aesthetic_record'`), or add a `UNIQUE(source, source_id)` constraint to the table.

- **[severity: high]** Correctness — **Module-level `cachedPatientsListId` persists across requests and across sync runs indefinitely.**
  Lines 447–458: `cachedPatientsListId` is declared at module scope and is never invalidated. If the TextMagic "Patients" list is renamed, deleted, or the API returns a different ID (e.g., after a TM account reset), every subsequent sync will use the stale cached ID silently adding contacts to the wrong list or receiving 404 errors from TM.
  **Fix:** Reset the cache per-request (declare inside the route handler or pass it as a local variable), or at minimum give it a TTL (e.g., cache for 1 hour using a timestamp guard).

- **[severity: high]** Correctness — **Phone collision in `phoneIndex` silently drops all but one contact per phone number.**
  Lines 572–576: `phoneIndex.set(c.phone_normalized, c)` — if two existing contacts share the same normalized phone (duplicate records from a prior bad import), only the last one survives in the Map. The AR row will enrich the wrong record (whichever happened to be last in the `allContacts` result set order) and the other record will grow stale indefinitely. Same risk on `emailIndex`.
  **Fix:** Log a warning and skip enrichment when a collision is detected, or prefer the contact that already has `source = 'aesthetic_record'`.

- **[severity: medium]** Correctness — **Conversation name-refresh loop issues N+1 queries with no upper bound.**
  Lines 720–751: Every conversation row triggers a separate `SELECT` on contacts and potentially a separate `UPDATE` on conversations. For a large database (hundreds of conversations) this will be slow and may hit Supabase's per-second request limits mid-sync, causing sporadic 429 errors that are silently swallowed (no error check on the inner `supabaseAdmin` calls at lines 738–748).
  **Fix:** Fetch all relevant contacts by phone in a single `IN` query, build a Map, then batch the updates. Add error checks on the inner update calls.

- **[severity: medium]** Correctness — **`parseCsv` splits on `\n` only — CRLF line endings from Windows/Google Sheets exports leave a trailing `\r` on every field value.**
  Line 323: `content.split('\n')`. Google Sheets CSV exports use `\r\n`. The `line.trim()` on line 332 removes the trailing `\r` from the last field of each line, but `parseCsvLine` (called on line 334) returns raw field values without trimming, so every field except the last will have no trailing `\r`, while the last field in each row silently has it stripped. The real problem is the header parse on line 327 — `parseCsvLine(lines[0])` is called before `trim()`, so if `lines[0]` ends in `\r`, the last header key will be `"ar id\r"` or similar, and `raw['ar id']` on line 356 will return `undefined` for every row, causing all rows to be discarded as invalid (line 552–553).
  **Fix:** Normalize line endings before splitting: `content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')`.

- **[severity: medium]** Correctness — **`tmWrite` sends a JSON body for PUT `/contacts/:id` but TextMagic v2 REST API expects `application/x-www-form-urlencoded` for contact PUT/POST, not JSON.**
  Lines 426–442 and 487: The `Content-Type: application/json` header with a JSON-stringified body is correct for the `POST /contacts/normalized` endpoint (which does accept JSON), but `PUT /contacts/{id}` in the TextMagic v2 API expects form-encoded data. Sending JSON to the PUT endpoint will result in a 400 or the update being silently ignored.
  **Fix:** For PUT calls, encode the body as `URLSearchParams` and set `Content-Type: application/x-www-form-urlencoded`, or verify against the TM v2 docs that the specific endpoint accepts JSON before using the shared `tmWrite` helper for both methods.

- **[severity: medium]** Error handling — **Supabase error on `existingByAr` fetch (line 558) is not checked — a DB outage silently makes `arIdSet` empty, re-inserting every contact.**
  Lines 558–564: The destructuring discards the `error` field entirely. If the Supabase query fails, `existingByAr` is `null`, `arIdSet` becomes an empty Set, and every sheet row passes the "already synced?" check at line 607 and proceeds to insert — potentially duplicating thousands of contacts with no indication in the response.
  **Fix:** Check `const { data: existingByAr, error: fetchErr } = ...` and `if (fetchErr) throw new Error(...)` before proceeding.

- **[severity: medium]** Correctness — **TM metadata update (lines 700–711) matches by `phone_normalized` + `source` rather than by `id`, so it can update the wrong contact if a phone number changed between insert and TM sync.**
  After inserting or enriching a contact, the TM contact ID is written back using `.eq('phone_normalized', ...).eq('source', 'aesthetic_record')`. If two AR contacts somehow share a phone (data quality issue), both records get the same `textmagic_contact_id`. Using the contact's own `id` (which is available on `existingContact.id` for enrichment, and can be retrieved from the insert response) would be safer.
  **Fix:** Capture the contact `id` from the insert/update operation and use `.eq('id', contactId)` for the metadata write-back.

## Verdict
NEEDS CHANGES — multiple blocking correctness issues (duplicate inserts, AR ID type mismatch, CRLF header corruption) that will cause silent data loss or duplication on the first real sync run.
