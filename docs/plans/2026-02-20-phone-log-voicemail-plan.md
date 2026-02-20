# Phone Log + Voicemail Enhancements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix contact name display on call logs, make voicemail playback prominent, add save/delete voicemail management, bump font sizes.

**Architecture:** API-side contact enrichment for stale call records. New DB columns + API endpoints for voicemail preservation (Supabase Storage) and deletion (Twilio API). Frontend layout rework for voicemail rows in the phone log.

**Tech Stack:** Express API, Supabase (PostgreSQL + Storage), Twilio REST API, SvelteKit + Tailwind v4 + Lucide icons

---

### Task 1: Font Size Bump (17px → 18px)

Smallest change, do it first so all subsequent UI work uses the new base.

**Files:**
- Modify: `src/app.css:531-532`

**Step 1: Update root font size**

In `src/app.css`, change line 532:
```css
/* Before */
html {
	font-size: 17px; /* Bump from 16px default — scales all rem-based text up ~6% */
}

/* After */
html {
	font-size: 18px; /* Bumped 16→17→18px — scales all rem-based text */
}
```

**Step 2: Build check**

Run: `npx vite build`
Expected: Success, no errors

**Step 3: Commit**

```bash
git add src/app.css
git commit -m "[app] Bump root font size 17px → 18px"
```

---

### Task 2: Contact Name Resolution (API Enrichment)

The `GET /api/calls` endpoint returns `caller_name`/`contact_id` as stored at insert time. If a contact was added after the call, or the webhook lookup failed, the name stays null. Fix by enriching the response server-side.

**Files:**
- Modify: `api/routes/calls.js:18-78` (the GET / handler)

**Step 1: Write the enrichment logic**

After the Supabase query returns `data`, add a post-processing step that:
1. Collects all rows where `contact_id` is null AND has a phone number
2. Batch-queries the `contacts` table for those phone numbers
3. Attaches the matched `contact_name` and `contact_id` to each row

In `api/routes/calls.js`, add this import at the top:
```js
import { lookupContactByPhone, normalizePhone } from '../services/phone-lookup.js';
```

Then after line 66 (`const { data, error, count } = await query;`) and the error check, before the `return res.json(...)`, add:

```js
	// Enrich rows missing contact info with live contact lookup
	if (data?.length) {
		const needsLookup = data.filter((c) => !c.contact_id);
		for (const call of needsLookup) {
			const phone = call.direction === 'inbound' ? call.from_number : call.to_number;
			if (!phone) continue;
			const { contactId, contactName } = await lookupContactByPhone(phone);
			if (contactId) {
				call.contact_id = contactId;
				call.caller_name = contactName || call.caller_name;
			}
		}
	}
```

**Note:** This does individual lookups per unmatched call. For a page of 25 calls, worst case is 25 DB queries. This is acceptable for now — if performance becomes an issue, refactor to a single batch query with `IN (phone1, phone2, ...)`.

**Step 2: Build check**

Run: `npx vite build` (no frontend changes, but sanity check)
Run API manually: `cd api && node -e "import('./routes/calls.js').then(() => console.log('OK'))"`

**Step 3: Commit**

```bash
git add api/routes/calls.js
git commit -m "[api] Enrich call logs with live contact lookup for stale records"
```

---

### Task 3: DB Migration — Voicemail Preserve Columns

Add `preserved` and `storage_path` columns to the `voicemails` table.

**Files:**
- Create: `api/db/migrations/006-voicemail-preserve.sql`
- Modify: `api/db/schema.sql:180-196` (update canonical schema to match)

**Step 1: Write the migration**

Create `api/db/migrations/006-voicemail-preserve.sql`:

```sql
-- Migration 006: Add voicemail preservation columns
-- Allows users to save voicemails permanently (downloads to Supabase Storage)
-- and soft-track deletion state.

ALTER TABLE public.voicemails
  ADD COLUMN IF NOT EXISTS preserved BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

COMMENT ON COLUMN public.voicemails.preserved IS 'When true, recording has been downloaded to Supabase Storage for permanent keeping';
COMMENT ON COLUMN public.voicemails.storage_path IS 'Path in Supabase Storage bucket where the preserved recording is stored';

CREATE INDEX IF NOT EXISTS idx_voicemails_preserved ON public.voicemails(preserved) WHERE preserved = true;
```

**Step 2: Update canonical schema**

In `api/db/schema.sql`, add the two new columns to the `voicemails` table definition (after `assigned_to`):

```sql
  preserved             BOOLEAN DEFAULT false,
  storage_path          TEXT,
```

**Step 3: Apply migration**

Run via Supabase MCP tool: `apply_migration` with the SQL above.
Or paste into Supabase SQL Editor.

**Step 4: Commit**

```bash
git add api/db/migrations/006-voicemail-preserve.sql api/db/schema.sql
git commit -m "[db] Add voicemail preservation columns (preserved, storage_path)"
```

---

### Task 4: Voicemail Save Endpoint

Download recording from Twilio, upload to Supabase Storage, mark as preserved.

**Files:**
- Modify: `api/routes/voicemails.js` (add PATCH /:id/save route)

**Step 1: Add the save endpoint**

Add this route after the existing `/:id/unread` route in `api/routes/voicemails.js`:

```js
/**
 * PATCH /api/voicemails/:id/save
 * Preserve a voicemail by downloading the recording to Supabase Storage.
 * Sets preserved=true and storage_path in the DB.
 */
router.patch('/:id/save', logAction('voicemails.save'), async (req, res) => {
	const { id } = req.params;

	// Look up voicemail
	const { data: vm, error: fetchErr } = await supabaseAdmin
		.from('voicemails')
		.select('id, recording_url, recording_sid, preserved, storage_path')
		.eq('id', id)
		.single();

	if (fetchErr || !vm) {
		return res.status(404).json({ error: 'Voicemail not found' });
	}

	// Already preserved
	if (vm.preserved && vm.storage_path) {
		return res.json({ data: vm, message: 'Already preserved' });
	}

	// Build Twilio recording URL
	const accountSid = process.env.TWILIO_ACCOUNT_SID;
	const authToken = process.env.TWILIO_AUTH_TOKEN;
	let recordingUrl = vm.recording_url;

	if (recordingUrl && !recordingUrl.endsWith('.mp3') && !recordingUrl.endsWith('.wav')) {
		recordingUrl = recordingUrl + '.mp3';
	}
	if (!recordingUrl && vm.recording_sid) {
		recordingUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${vm.recording_sid}.mp3`;
	}

	if (!recordingUrl) {
		return res.status(404).json({ error: 'No recording URL available' });
	}

	try {
		// Download from Twilio
		const twilioRes = await fetch(recordingUrl, {
			headers: {
				Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
			}
		});

		if (!twilioRes.ok) {
			return res.status(502).json({ error: 'Failed to download from Twilio' });
		}

		const audioBuffer = Buffer.from(await twilioRes.arrayBuffer());
		const contentType = twilioRes.headers.get('content-type') || 'audio/mpeg';
		const ext = contentType.includes('wav') ? 'wav' : 'mp3';
		const storagePath = `voicemails/${id}.${ext}`;

		// Upload to Supabase Storage
		const { error: uploadErr } = await supabaseAdmin.storage
			.from('voicemails')
			.upload(storagePath, audioBuffer, {
				contentType,
				upsert: true
			});

		if (uploadErr) {
			console.error('Supabase Storage upload failed:', uploadErr.message);
			return res.status(500).json({ error: 'Failed to upload to storage' });
		}

		// Update DB
		const { data: updated, error: updateErr } = await supabaseAdmin
			.from('voicemails')
			.update({ preserved: true, storage_path: storagePath })
			.eq('id', id)
			.select()
			.single();

		if (updateErr) {
			console.error('Failed to update voicemail:', updateErr.message);
			return res.status(500).json({ error: 'Saved to storage but failed to update DB' });
		}

		return res.json({ data: updated });
	} catch (e) {
		console.error('Voicemail save error:', e.message);
		return res.status(500).json({ error: 'Failed to preserve voicemail' });
	}
});
```

**Step 2: Create Supabase Storage bucket**

Via Supabase MCP or SQL Editor, create the `voicemails` storage bucket:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('voicemails', 'voicemails', false)
ON CONFLICT (id) DO NOTHING;
```

**Step 3: Commit**

```bash
git add api/routes/voicemails.js
git commit -m "[api] Add voicemail save endpoint — downloads to Supabase Storage"
```

---

### Task 5: Voicemail Delete Endpoint

Delete voicemail from DB, Twilio, and Supabase Storage.

**Files:**
- Modify: `api/routes/voicemails.js` (add DELETE /:id route)

**Step 1: Add the delete endpoint**

Add after the save route:

```js
/**
 * DELETE /api/voicemails/:id
 * Delete a voicemail: remove from DB, Twilio recording, and Supabase Storage.
 */
router.delete('/:id', logAction('voicemails.delete'), async (req, res) => {
	const { id } = req.params;

	// Look up voicemail
	const { data: vm, error: fetchErr } = await supabaseAdmin
		.from('voicemails')
		.select('id, recording_sid, storage_path')
		.eq('id', id)
		.single();

	if (fetchErr || !vm) {
		return res.status(404).json({ error: 'Voicemail not found' });
	}

	// Delete from Supabase Storage (if preserved)
	if (vm.storage_path) {
		const { error: storageErr } = await supabaseAdmin.storage
			.from('voicemails')
			.remove([vm.storage_path]);
		if (storageErr) {
			console.error('Storage delete failed (continuing):', storageErr.message);
		}
	}

	// Delete from Twilio (best effort — may already be gone)
	if (vm.recording_sid) {
		try {
			const accountSid = process.env.TWILIO_ACCOUNT_SID;
			const authToken = process.env.TWILIO_AUTH_TOKEN;
			await fetch(
				`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${vm.recording_sid}`,
				{
					method: 'DELETE',
					headers: {
						Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
					}
				}
			);
		} catch (e) {
			console.error('Twilio recording delete failed (continuing):', e.message);
		}
	}

	// Delete from DB
	const { error: deleteErr } = await supabaseAdmin.from('voicemails').delete().eq('id', id);

	if (deleteErr) {
		console.error('Failed to delete voicemail from DB:', deleteErr.message);
		return res.status(500).json({ error: 'Failed to delete voicemail' });
	}

	return res.json({ success: true });
});
```

**Step 2: Update recording proxy to check Supabase Storage first**

In the existing `GET /:id/recording` handler (line 132), add a Storage check before the Twilio fetch. After fetching the voicemail record, add:

```js
	// Check Supabase Storage first (preserved recordings)
	if (vm.storage_path) {
		try {
			const { data: fileData, error: dlErr } = await supabaseAdmin.storage
				.from('voicemails')
				.download(vm.storage_path);
			if (!dlErr && fileData) {
				const buffer = Buffer.from(await fileData.arrayBuffer());
				const ext = vm.storage_path.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
				res.set('Content-Type', ext);
				res.set('Content-Length', buffer.length.toString());
				res.set('Cache-Control', 'private, max-age=3600');
				return res.send(buffer);
			}
		} catch (e) {
			console.error('Storage download failed, falling back to Twilio:', e.message);
		}
	}
```

Add `storage_path` to the select on line 138: `'recording_url, recording_sid, storage_path'`

**Step 3: Commit**

```bash
git add api/routes/voicemails.js
git commit -m "[api] Add voicemail delete endpoint + storage-first recording proxy"
```

---

### Task 6: Frontend — Redesign Voicemail Row in Phone Log

This is the main UI task. Rework the call row for voicemail entries to show:
- Prominent play button (pill-shaped, gold border, always visible)
- Transcription preview (~80 chars) between action icons and timestamp
- Save (bookmark) and delete (trash) action buttons

**Files:**
- Modify: `src/routes/(auth)/calls/+page.svelte`

**Step 1: Add new icon imports**

Add to the existing Lucide imports (line 6-18):
```js
import { Bookmark, BookmarkCheck, Trash2 } from '@lucide/svelte';
```

**Step 2: Add voicemail action functions**

Add after the `togglePlay` function (~line 250):

```js
/** Save (preserve) a voicemail to permanent storage */
async function saveVoicemail(vmId) {
	try {
		await api(`/api/voicemails/${vmId}/save`, { method: 'PATCH' });
		// Update local state
		if (calls) {
			calls = calls.map((c) => {
				if (c.voicemails?.[0]?.id === vmId) {
					c.voicemails[0].preserved = true;
				}
				return c;
			});
		}
	} catch (e) {
		console.error('Failed to save voicemail:', e);
	}
}

/** Delete a voicemail */
async function deleteVoicemail(vmId) {
	if (!confirm('Delete this voicemail? This cannot be undone.')) return;
	try {
		await api(`/api/voicemails/${vmId}`, { method: 'DELETE' });
		// Reload to reflect changes
		loadCalls();
	} catch (e) {
		console.error('Failed to delete voicemail:', e);
	}
}
```

**Step 3: Rework the voicemail action summary row**

Replace the existing voicemail section in the template (lines 475-494) with the new layout. The new layout puts the play button as a proper pill in the action icons row, transcription preview text in the middle, and save/delete buttons near the timestamp.

Replace the entire `<!-- Action summary line -->` block (lines 474-506) with:

```svelte
<!-- Action summary line -->
<div class="flex items-center gap-2 mt-1">
	{#if summary.type === 'voicemail' || summary.type === 'voicemail-pending'}
		<!-- Play button — prominent pill -->
		{#if summary.hasAudio}
			<button
				class="shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border transition-all {playingId === summary.vmId
					? 'border-gold bg-gold/15 text-gold'
					: 'border-gold/40 text-gold/70 hover:bg-gold/10 hover:text-gold hover:border-gold'}"
				onclick={(e) => {
					e.stopPropagation();
					togglePlay(summary.vmId);
				}}
			>
				{#if playingId === summary.vmId}
					<Pause class="h-3.5 w-3.5" />
					<span class="text-xs font-medium">Pause</span>
				{:else}
					<Play class="h-3.5 w-3.5" />
					<span class="text-xs font-medium">Play</span>
				{/if}
			</button>
		{/if}
		<!-- Transcription preview -->
		<span class="text-xs text-text-tertiary truncate italic min-w-0 flex-1">
			{summary.text}
		</span>
		<!-- Save/Delete actions -->
		{#if summary.vmId}
			<div class="flex items-center gap-1 shrink-0">
				<button
					class="inline-flex items-center justify-center h-6 w-6 rounded transition-colors {summary.vmPreserved
						? 'text-gold'
						: 'text-text-ghost hover:text-gold/70'}"
					title={summary.vmPreserved ? 'Saved permanently' : 'Save voicemail'}
					onclick={(e) => {
						e.stopPropagation();
						if (!summary.vmPreserved) saveVoicemail(summary.vmId);
					}}
				>
					{#if summary.vmPreserved}
						<BookmarkCheck class="h-3.5 w-3.5" />
					{:else}
						<Bookmark class="h-3.5 w-3.5" />
					{/if}
				</button>
				<button
					class="inline-flex items-center justify-center h-6 w-6 rounded text-text-ghost hover:text-red-400 transition-colors"
					title="Delete voicemail"
					onclick={(e) => {
						e.stopPropagation();
						deleteVoicemail(summary.vmId);
					}}
				>
					<Trash2 class="h-3.5 w-3.5" />
				</button>
			</div>
		{/if}
	{:else if summary.type === 'answered'}
		<span class="text-xs text-emerald-400/60">{summary.text}</span>
	{:else if summary.type === 'missed'}
		<span class="text-xs text-red-400/70">{summary.text}</span>
	{:else if summary.type === 'abandoned'}
		<span class="text-xs text-text-tertiary">{summary.text}</span>
	{:else if summary.type === 'failed'}
		<span class="text-xs text-red-400/50">{summary.text}</span>
	{:else}
		<span class="text-xs text-text-tertiary">{summary.text}</span>
	{/if}
</div>
```

**Step 4: Update getActionSummary to include preserved flag**

In the `getActionSummary` function, add `vmPreserved` to the return objects that have voicemail data.

Lines ~130-157, add `vmPreserved: vm.preserved` to each return that has a `vmId`:

```js
return {
	text: preview,
	type: 'voicemail',
	hasAudio: !!vm.recording_url,
	vmId: vm.id,
	vmIsNew: vm.is_new,
	vmPreserved: !!vm.preserved
};
```

Do this for all 3 voicemail return paths (transcription, pending, fallback).

**Step 5: Update voicemails select in calls API to include preserved**

In `api/routes/calls.js` line 26, add `preserved` to the voicemails join select:

```js
'*, voicemails(id, transcription, transcription_status, is_new, recording_url, duration, mailbox, preserved, storage_path)'
```

**Step 6: Update transcription preview to ~80 chars**

In `getActionSummary`, change the transcription truncation from 90 to 80 chars (line 133):

```js
const preview =
	vm.transcription.length > 80
		? vm.transcription.slice(0, 80).trim() + '...'
		: vm.transcription;
```

**Step 7: Build check**

Run: `npx vite build`
Expected: Success

**Step 8: Commit**

```bash
git add src/routes/(auth)/calls/+page.svelte api/routes/calls.js
git commit -m "[app] Redesign voicemail row — prominent play button, save/delete, 80-char preview"
```

---

### Task 7: Build, Deploy, Verify

**Step 1: Full build**

```bash
PUBLIC_API_URL=https://api.lemedspa.app npx vite build
```

**Step 2: Deploy frontend**

```bash
npx wrangler pages deploy .svelte-kit/cloudflare --project-name lm-app --branch main --commit-dirty=true
```

**Step 3: Push API changes (triggers Render redeploy)**

```bash
git push origin main
```

**Step 4: Verify**

- Check https://lmedspa.app/calls — contact names should show for known numbers
- Check voicemail rows — play button should be a visible gold pill
- Test play/pause on a voicemail
- Test save bookmark — should show filled icon
- Test delete — should prompt confirmation and remove
- Check font sizes are slightly larger across the app

**Step 5: Final commit if any fixes needed**

---

## Execution Order

1. Font size (trivial, standalone)
2. Contact enrichment (API only, no frontend deps)
3. DB migration (must run before save/delete endpoints)
4. Save endpoint (depends on migration)
5. Delete endpoint + storage proxy (depends on migration)
6. Frontend redesign (depends on all API changes)
7. Deploy + verify
