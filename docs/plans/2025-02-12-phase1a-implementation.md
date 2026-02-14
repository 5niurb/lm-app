# Phase 1A Implementation Plan — Call Logging + Voicemail

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship call logging + voicemail dashboard so Le Med Spa can shut down HighLevel. Twilio Studio keeps IVR control; our app is the passive logging/dashboard layer.

**Architecture:** Twilio Studio IVR sends HTTP Request webhooks at key points to our Express API. API logs everything to Supabase. SvelteKit dashboard reads from Supabase via the API. A `twilio/` directory in the repo stores Studio Flow JSON with deploy scripts for test/production flows.

**Tech Stack:** SvelteKit 2.50 + Svelte 5 (runes) + shadcn-svelte + Tailwind v4 (frontend), Express + Supabase (API), Twilio Studio + REST API (IVR), Node 20+

**Design Doc:** `docs/plans/2025-02-12-twilio-phone-flow-design.md`

---

## Task 1: Database Migration — Add `mailbox` column + `call_events` table

**Files:**
- Create: `api/db/migrations/001-add-mailbox-and-events.sql`
- Modify: `api/db/schema.sql` (append new table + column for reference)

**Step 1: Write the migration SQL**

Create `api/db/migrations/001-add-mailbox-and-events.sql`:

```sql
-- Migration 001: Add mailbox column to voicemails + call_events table
-- Run against Supabase project: skvsjcckissnyxcafwyr

-- Add mailbox column to voicemails
ALTER TABLE public.voicemails
  ADD COLUMN mailbox TEXT
  CHECK (mailbox IN ('lea', 'clinical_md', 'accounts', 'care_team'));

CREATE INDEX idx_voicemails_mailbox ON public.voicemails (mailbox);

COMMENT ON COLUMN public.voicemails.mailbox IS 'Which voicemail box received this message';

-- Create call_events table for tracking IVR navigation
CREATE TABLE public.call_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_log_id UUID REFERENCES public.call_logs(id) ON DELETE SET NULL,
  twilio_sid  TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  event_data  JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.call_events IS 'IVR menu navigation and call flow events';

CREATE INDEX idx_call_events_twilio_sid  ON public.call_events (twilio_sid);
CREATE INDEX idx_call_events_call_log_id ON public.call_events (call_log_id);
CREATE INDEX idx_call_events_created_at  ON public.call_events (created_at);

-- RLS for call_events
ALTER TABLE public.call_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read call events"
  ON public.call_events FOR SELECT
  TO authenticated
  USING (true);

-- Inserts handled by service role (webhook handler) — no INSERT policy needed

-- Update unheard_voicemails view to include mailbox
CREATE OR REPLACE VIEW public.unheard_voicemails AS
SELECT
  v.id,
  v.from_number,
  v.recording_url,
  v.recording_sid,
  v.duration,
  v.transcription,
  v.transcription_status,
  v.mailbox,
  v.assigned_to,
  v.created_at,
  cl.direction AS call_direction,
  cl.to_number AS called_number,
  cl.started_at AS call_started_at,
  pe.extension AS to_extension_number
FROM public.voicemails v
LEFT JOIN public.call_logs cl ON cl.id = v.call_log_id
LEFT JOIN public.phone_extensions pe ON pe.id = v.to_extension
WHERE v.is_new = true
ORDER BY v.created_at DESC;
```

**Step 2: Apply migration to Supabase**

Use the Supabase MCP tool `apply_migration`:
- project_id: `skvsjcckissnyxcafwyr`
- name: `add_mailbox_and_call_events`
- query: (the SQL above)

**Step 3: Verify migration**

Run via `execute_sql`:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'voicemails' AND column_name = 'mailbox';

SELECT table_name FROM information_schema.tables
WHERE table_name = 'call_events';
```

Expected: mailbox column exists as `text`, call_events table exists.

**Step 4: Update schema.sql reference**

Append the new table and column to `api/db/schema.sql` so the file stays as the authoritative schema reference.

**Step 5: Commit**

```bash
git add api/db/migrations/001-add-mailbox-and-events.sql api/db/schema.sql
git commit -m "feat: add mailbox column to voicemails + call_events table"
```

---

## Task 2: Simplify `/incoming` webhook — Remove TwiML, just log

**Files:**
- Modify: `api/routes/webhooks/voice.js` (lines 15-55)

**Context:** Currently `/incoming` generates TwiML for a voicemail greeting. With Approach A, Twilio Studio handles the IVR. Our webhook just logs the call and returns 200.

**Step 1: Rewrite the `/incoming` handler**

Replace the current `/incoming` handler (lines 15-55) with:

```javascript
/**
 * POST /api/webhooks/voice/incoming
 * Twilio Studio sends this at flow start.
 * Just log the call — Studio handles the IVR.
 */
router.post('/incoming', async (req, res) => {
  const { CallSid, From, To, CallStatus } = req.body;

  if (!CallSid) {
    return res.sendStatus(200);
  }

  const { error } = await supabaseAdmin
    .from('call_logs')
    .insert({
      twilio_sid: CallSid,
      direction: 'inbound',
      from_number: From || 'unknown',
      to_number: To || '',
      status: CallStatus || 'initiated',
      metadata: {
        caller_city: req.body.CallerCity || null,
        caller_state: req.body.CallerState || null,
        caller_country: req.body.CallerCountry || null
      }
    });

  if (error) {
    console.error('Failed to create call log:', error.message);
  }

  // No TwiML — Studio handles the IVR
  res.sendStatus(200);
});
```

**Step 2: Verify API starts cleanly**

Run: `cd api && node --check server.js`
Expected: No syntax errors.

**Step 3: Commit**

```bash
git add api/routes/webhooks/voice.js
git commit -m "refactor: simplify /incoming webhook — remove TwiML, just log call"
```

---

## Task 3: Add `/event` webhook endpoint

**Files:**
- Modify: `api/routes/webhooks/voice.js` (add new route after `/incoming`)

**Step 1: Add the `/event` route**

Insert after the `/incoming` handler:

```javascript
/**
 * POST /api/webhooks/voice/event
 * Twilio Studio sends this at key IVR decision points.
 * Logs menu selections, transfers, voicemail starts, etc.
 */
router.post('/event', async (req, res) => {
  const { CallSid } = req.body;

  if (!CallSid) {
    return res.sendStatus(200);
  }

  // Look up the call log to link the event
  const { data: callLog } = await supabaseAdmin
    .from('call_logs')
    .select('id')
    .eq('twilio_sid', CallSid)
    .maybeSingle();

  const eventType = req.body.event_type || req.body.EventType || 'unknown';
  const eventData = {};

  // Capture whatever Studio sends
  if (req.body.digit || req.body.Digits) {
    eventData.digit = req.body.digit || req.body.Digits;
  }
  if (req.body.menu) {
    eventData.menu = req.body.menu;
  }
  if (req.body.mailbox) {
    eventData.mailbox = req.body.mailbox;
  }
  if (req.body.action) {
    eventData.action = req.body.action;
  }

  const { error } = await supabaseAdmin
    .from('call_events')
    .insert({
      call_log_id: callLog?.id || null,
      twilio_sid: CallSid,
      event_type: eventType,
      event_data: eventData
    });

  if (error) {
    console.error('Failed to log call event:', error.message);
  }

  res.sendStatus(200);
});
```

**Step 2: Verify API starts cleanly**

Run: `cd api && node --check server.js`

**Step 3: Commit**

```bash
git add api/routes/webhooks/voice.js
git commit -m "feat: add /event webhook for IVR menu navigation tracking"
```

---

## Task 4: Update `/recording` webhook to accept `mailbox` parameter

**Files:**
- Modify: `api/routes/webhooks/voice.js` (the `/recording` handler, lines 131-178)

**Step 1: Update the recording handler**

Replace the `/recording` handler to include `mailbox`:

```javascript
/**
 * POST /api/webhooks/voice/recording
 * Twilio recording callback.
 * Creates a voicemail entry linked to the call log.
 * Studio sends `mailbox` param to identify which voicemail box.
 */
router.post('/recording', async (req, res) => {
  const { CallSid, RecordingSid, RecordingUrl, RecordingDuration, From } = req.body;
  const mailbox = req.body.mailbox || req.body.Mailbox || null;

  // Look up the call log to link the voicemail
  const { data: callLog } = await supabaseAdmin
    .from('call_logs')
    .select('id')
    .eq('twilio_sid', CallSid)
    .maybeSingle();

  // Create the voicemail entry
  const { error } = await supabaseAdmin
    .from('voicemails')
    .insert({
      call_log_id: callLog?.id || null,
      from_number: From || 'unknown',
      recording_url: RecordingUrl || '',
      recording_sid: RecordingSid || null,
      duration: parseInt(RecordingDuration, 10) || 0,
      transcription_status: 'pending',
      mailbox: mailbox
    });

  if (error) {
    console.error('Failed to create voicemail:', error.message);
  }

  // Update the call log disposition to voicemail
  if (callLog?.id) {
    await supabaseAdmin
      .from('call_logs')
      .update({
        disposition: 'voicemail',
        recording_url: RecordingUrl,
        recording_duration: parseInt(RecordingDuration, 10) || 0
      })
      .eq('id', callLog.id);
  }

  // Respond with TwiML to end the call gracefully
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you. Goodbye.</Say>
  <Hangup />
</Response>`;

  res.type('text/xml');
  res.send(twiml);
});
```

**Step 2: Verify API starts cleanly**

Run: `cd api && node --check server.js`

**Step 3: Commit**

```bash
git add api/routes/webhooks/voice.js
git commit -m "feat: recording webhook accepts mailbox parameter from Studio"
```

---

## Task 5: Update voicemails API to support `mailbox` filter

**Files:**
- Modify: `api/routes/voicemails.js` (the GET `/` handler)

**Step 1: Add mailbox filter to the list endpoint**

In the GET `/` handler, after the `is_new` filter block (~line 32) and before the search block (~line 35), add:

```javascript
  // Filter by mailbox
  if (req.query.mailbox) {
    query = query.eq('mailbox', req.query.mailbox);
  }
```

Also update the select to include `mailbox` (it's already included via `*` but verify the join still works).

**Step 2: Add a stats endpoint for voicemails**

Add a new route before the `/:id` route:

```javascript
/**
 * GET /api/voicemails/stats
 * Voicemail mailbox counts.
 */
router.get('/stats', logAction('voicemails.stats'), async (req, res) => {
  // Count unheard per mailbox
  const { data, error } = await supabaseAdmin
    .from('voicemails')
    .select('mailbox, is_new')
    .eq('is_new', true);

  if (error) {
    console.error('Failed to fetch voicemail stats:', error.message);
    return res.status(500).json({ error: 'Failed to fetch voicemail stats' });
  }

  const counts = {
    total_unheard: data?.length || 0,
    lea: 0,
    clinical_md: 0,
    accounts: 0,
    care_team: 0,
    unassigned: 0
  };

  for (const vm of data || []) {
    if (vm.mailbox && counts[vm.mailbox] !== undefined) {
      counts[vm.mailbox]++;
    } else {
      counts.unassigned++;
    }
  }

  return res.json(counts);
});
```

**Step 3: Verify API starts cleanly**

Run: `cd api && node --check server.js`

**Step 4: Commit**

```bash
git add api/routes/voicemails.js
git commit -m "feat: voicemails API supports mailbox filter + stats endpoint"
```

---

## Task 6: Build the Voicemails frontend page

**Files:**
- Create: `src/routes/(auth)/voicemails/+page.svelte`
- Modify: `src/lib/components/AppSidebar.svelte` (add nav link)

**Step 1: Create the voicemails page**

Create `src/routes/(auth)/voicemails/+page.svelte`:

```svelte
<script>
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import { Voicemail, Search, Play, Pause, ChevronLeft, ChevronRight, Mail, MailOpen } from '@lucide/svelte';
	import { api } from '$lib/api/client.js';
	import { formatPhone, formatDuration, formatRelativeDate } from '$lib/utils/formatters.js';

	let search = $state('');
	let voicemails = $state(null);
	let stats = $state(null);
	let totalCount = $state(0);
	let page = $state(1);
	let pageSize = $state(25);
	let error = $state('');
	let mailboxFilter = $state('all');
	let statusFilter = $state('all');
	let expandedId = $state(null);
	let playingId = $state(null);

	/** @type {HTMLAudioElement | null} */
	let audioEl = $state(null);

	const mailboxLabels = {
		lea: 'Lea',
		clinical_md: 'Clinical MD',
		accounts: 'Accounts',
		care_team: 'Care Team'
	};

	$effect(() => {
		loadVoicemails();
		loadStats();
	});

	async function loadVoicemails() {
		try {
			const params = new URLSearchParams({
				page: page.toString(),
				pageSize: pageSize.toString()
			});

			if (search) params.set('search', search);
			if (mailboxFilter !== 'all') params.set('mailbox', mailboxFilter);
			if (statusFilter === 'new') params.set('is_new', 'true');
			if (statusFilter === 'read') params.set('is_new', 'false');

			const res = await api(`/api/voicemails?${params}`);
			voicemails = res.data;
			totalCount = res.count;
		} catch (e) {
			error = e.message;
		}
	}

	async function loadStats() {
		try {
			stats = await api('/api/voicemails/stats');
		} catch (e) {
			console.error('Failed to load voicemail stats:', e);
		}
	}

	function handleSearch() {
		page = 1;
		loadVoicemails();
	}

	function setMailbox(m) {
		mailboxFilter = m;
		page = 1;
		loadVoicemails();
	}

	function setStatus(s) {
		statusFilter = s;
		page = 1;
		loadVoicemails();
	}

	function toggleExpand(id) {
		expandedId = expandedId === id ? null : id;
	}

	async function toggleRead(vm) {
		try {
			if (vm.is_new) {
				await api(`/api/voicemails/${vm.id}/read`, { method: 'PATCH' });
				vm.is_new = false;
			} else {
				await api(`/api/voicemails/${vm.id}/unread`, { method: 'PATCH' });
				vm.is_new = true;
			}
			loadStats();
		} catch (e) {
			console.error('Failed to toggle read status:', e);
		}
	}

	function playRecording(vm) {
		if (playingId === vm.id) {
			audioEl?.pause();
			playingId = null;
			return;
		}
		if (audioEl) {
			audioEl.pause();
		}
		audioEl = new Audio(vm.recording_url);
		audioEl.play();
		playingId = vm.id;
		audioEl.onended = () => { playingId = null; };
	}

	function nextPage() {
		if (page * pageSize < totalCount) { page++; loadVoicemails(); }
	}
	function prevPage() {
		if (page > 1) { page--; loadVoicemails(); }
	}

	const totalPages = $derived(Math.ceil(totalCount / pageSize) || 1);
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Voicemails</h1>
			<p class="text-muted-foreground">Listen to and manage voicemail messages.</p>
		</div>
	</div>

	{#if error}
		<Card.Root>
			<Card.Content class="py-4">
				<p class="text-sm text-destructive">{error}</p>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Mailbox tabs -->
	{#if stats}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
			<button
				class="rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
				class:border-primary={mailboxFilter === 'all'}
				class:bg-muted/30={mailboxFilter === 'all'}
				onclick={() => setMailbox('all')}
			>
				<p class="text-sm font-medium">All</p>
				<p class="text-2xl font-bold">{stats.total_unheard}</p>
				<p class="text-xs text-muted-foreground">unheard</p>
			</button>
			{#each Object.entries(mailboxLabels) as [key, label]}
				<button
					class="rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
					class:border-primary={mailboxFilter === key}
					class:bg-muted/30={mailboxFilter === key}
					onclick={() => setMailbox(key)}
				>
					<p class="text-sm font-medium">{label}</p>
					<p class="text-2xl font-bold">{stats[key] || 0}</p>
					<p class="text-xs text-muted-foreground">unheard</p>
				</button>
			{/each}
		</div>
	{/if}

	<Card.Root>
		<Card.Header>
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
				<form class="relative flex-1" onsubmit={(e) => { e.preventDefault(); handleSearch(); }}>
					<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
					<Input placeholder="Search by phone or transcription..." class="pl-8" bind:value={search} />
				</form>
				<div class="flex gap-1">
					<Button variant={statusFilter === 'all' ? 'default' : 'outline'} size="sm" onclick={() => setStatus('all')}>All</Button>
					<Button variant={statusFilter === 'new' ? 'default' : 'outline'} size="sm" onclick={() => setStatus('new')}>New</Button>
					<Button variant={statusFilter === 'read' ? 'default' : 'outline'} size="sm" onclick={() => setStatus('read')}>Read</Button>
				</div>
			</div>
		</Card.Header>
		<Card.Content>
			{#if voicemails === null}
				<div class="space-y-3">
					{#each Array(5) as _}
						<Skeleton class="h-16 w-full" />
					{/each}
				</div>
			{:else if voicemails.length === 0}
				<div class="flex h-48 items-center justify-center text-muted-foreground">
					<div class="text-center">
						<Voicemail class="mx-auto mb-3 h-10 w-10 opacity-50" />
						<p>No voicemails found.</p>
					</div>
				</div>
			{:else}
				<div class="space-y-1">
					{#each voicemails as vm}
						<div
							class="rounded-md border transition-colors"
							class:bg-muted/30={vm.is_new}
							class:border-primary/20={vm.is_new}
						>
							<button
								class="flex w-full items-center justify-between p-3 text-left"
								onclick={() => toggleExpand(vm.id)}
							>
								<div class="flex items-center gap-3">
									{#if vm.is_new}
										<Mail class="h-4 w-4 shrink-0 text-primary" />
									{:else}
										<MailOpen class="h-4 w-4 shrink-0 text-muted-foreground" />
									{/if}
									<div class="min-w-0">
										<p class="text-sm font-medium truncate">
											{formatPhone(vm.from_number)}
										</p>
										<p class="text-xs text-muted-foreground">
											{formatRelativeDate(vm.created_at)} &middot; {formatDuration(vm.duration)}
											{#if vm.mailbox}
												&middot; {mailboxLabels[vm.mailbox] || vm.mailbox}
											{/if}
										</p>
									</div>
								</div>
								<div class="flex items-center gap-2">
									{#if vm.transcription_status === 'completed'}
										<Badge variant="secondary">Transcribed</Badge>
									{:else if vm.transcription_status === 'pending'}
										<Badge variant="outline">Pending</Badge>
									{/if}
								</div>
							</button>

							{#if expandedId === vm.id}
								<div class="border-t px-3 py-3 space-y-3">
									<!-- Audio player -->
									{#if vm.recording_url}
										<div class="flex items-center gap-2">
											<Button
												variant="outline"
												size="sm"
												onclick={() => playRecording(vm)}
											>
												{#if playingId === vm.id}
													<Pause class="h-3 w-3 mr-1" /> Pause
												{:else}
													<Play class="h-3 w-3 mr-1" /> Play
												{/if}
											</Button>
											<span class="text-xs text-muted-foreground">{formatDuration(vm.duration)}</span>
										</div>
									{/if}

									<!-- Transcription -->
									{#if vm.transcription}
										<div>
											<p class="text-xs font-medium text-muted-foreground mb-1">Transcription</p>
											<p class="text-sm leading-relaxed bg-muted/50 rounded-md p-2">{vm.transcription}</p>
										</div>
									{:else if vm.transcription_status === 'pending'}
										<p class="text-sm text-muted-foreground italic">Transcription in progress...</p>
									{:else if vm.transcription_status === 'failed'}
										<p class="text-sm text-destructive">Transcription failed.</p>
									{/if}

									<!-- Actions -->
									<div class="flex gap-2">
										<Button variant="outline" size="sm" onclick={() => toggleRead(vm)}>
											{vm.is_new ? 'Mark as Read' : 'Mark as Unread'}
										</Button>
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>

				{#if totalCount > pageSize}
					<div class="flex items-center justify-between pt-4">
						<p class="text-sm text-muted-foreground">
							Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount}
						</p>
						<div class="flex gap-1">
							<Button variant="outline" size="sm" onclick={prevPage} disabled={page <= 1}>
								<ChevronLeft class="h-4 w-4" />
							</Button>
							<span class="flex items-center px-2 text-sm text-muted-foreground">{page} / {totalPages}</span>
							<Button variant="outline" size="sm" onclick={nextPage} disabled={page >= totalPages}>
								<ChevronRight class="h-4 w-4" />
							</Button>
						</div>
					</div>
				{/if}
			{/if}
		</Card.Content>
	</Card.Root>
</div>
```

**Step 2: Add Voicemails link to sidebar**

In `src/lib/components/AppSidebar.svelte`, add the Voicemail import and nav item:

```javascript
// Add to imports:
import { LayoutDashboard, Phone, Voicemail, Settings } from '@lucide/svelte';

// Update navItems array:
const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/calls', label: 'Calls', icon: Phone },
  { href: '/voicemails', label: 'Voicemails', icon: Voicemail },
  { href: '/settings', label: 'Settings', icon: Settings }
];
```

**Step 3: Verify build**

Run: `npm run build` (from project root)
Expected: Build succeeds with no errors.

**Step 4: Commit**

```bash
git add src/routes/(auth)/voicemails/+page.svelte src/lib/components/AppSidebar.svelte
git commit -m "feat: add voicemails page with audio player, transcription, mailbox tabs"
```

---

## Task 7: Twilio Studio deploy infrastructure

**Files:**
- Create: `twilio/README.md`
- Create: `twilio/deploy.js`
- Create: `twilio/flows/.gitkeep`
- Modify: `api/package.json` (add deploy scripts)

**Step 1: Create the twilio directory structure**

```bash
mkdir -p twilio/flows
```

**Step 2: Create the deploy script**

Create `twilio/deploy.js`:

```javascript
/**
 * Deploy a Twilio Studio Flow from a local JSON file.
 *
 * Usage:
 *   node twilio/deploy.js <flow-sid> <path-to-flow.json> [--publish]
 *
 * Environment:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN (from api/.env)
 *
 * Without --publish: updates the draft (safe for testing)
 * With --publish: publishes the flow live
 */
import 'dotenv/config';
import { readFileSync } from 'fs';

const [,, flowSid, flowPath, ...flags] = process.argv;
const shouldPublish = flags.includes('--publish');

if (!flowSid || !flowPath) {
  console.error('Usage: node twilio/deploy.js <flow-sid> <path-to-flow.json> [--publish]');
  process.exit(1);
}

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  console.error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in environment');
  process.exit(1);
}

const flowJson = readFileSync(flowPath, 'utf-8');
const definition = JSON.parse(flowJson);

// Validate it looks like a Studio flow
if (!definition.states || !Array.isArray(definition.states)) {
  console.error('Invalid flow JSON — missing "states" array');
  process.exit(1);
}

const status = shouldPublish ? 'published' : 'draft';

console.log(`Deploying flow ${flowSid} as ${status}...`);

const params = new URLSearchParams();
params.set('Definition', JSON.stringify(definition));
params.set('Status', status);
params.set('CommitMessage', `Deploy from CLI at ${new Date().toISOString()}`);

const res = await fetch(
  `https://studio.twilio.com/v2/Flows/${flowSid}`,
  {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  }
);

if (!res.ok) {
  const body = await res.text();
  console.error(`Deploy failed (${res.status}):`, body);
  process.exit(1);
}

const result = await res.json();
console.log(`Deployed! Flow SID: ${result.sid}, Status: ${result.status}`);
console.log(`Revision: ${result.revision}`);
```

**Step 3: Create README**

Create `twilio/README.md`:

```markdown
# Twilio Studio Flow Management

## Directory Structure

- `flows/` — Studio Flow JSON definitions (exported from Twilio Console or built locally)
- `deploy.js` — CLI script to push flows to Twilio via REST API

## Workflow

1. Export flow from Twilio Console (or edit JSON locally)
2. Save to `twilio/flows/<flow-name>.json`
3. Deploy to test: `npm run twilio:deploy-test`
4. Test with test phone number
5. Deploy to production: `npm run twilio:deploy-prod`

## Environment

Requires `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` in `api/.env`.

## Flow SIDs

- **Test flow:** (set TWILIO_TEST_FLOW_SID in api/.env after creating)
- **Production flow:** (set TWILIO_PROD_FLOW_SID in api/.env after creating)
```

**Step 4: Add npm scripts to api/package.json**

Add to `api/package.json` scripts:

```json
"twilio:deploy-test": "node ../twilio/deploy.js $TWILIO_TEST_FLOW_SID ../twilio/flows/main-ivr.json",
"twilio:deploy-prod": "node ../twilio/deploy.js $TWILIO_PROD_FLOW_SID ../twilio/flows/main-ivr.json --publish"
```

**Step 5: Add flow SID env vars to api/.env**

Add to `api/.env`:
```
TWILIO_TEST_FLOW_SID=
TWILIO_PROD_FLOW_SID=
```

(These get filled in once the test flow is created in Twilio Console)

**Step 6: Commit**

```bash
git add twilio/ api/package.json
git commit -m "feat: add Twilio Studio flow deploy infrastructure"
```

---

## Task 8: Export and store current Twilio Studio Flow

**Files:**
- Create: `twilio/flows/main-ivr.json`

**Step 1: Export the current Studio flow**

Use Twilio REST API to fetch the current flow definition:

```javascript
// Quick one-liner to fetch and save:
// node -e "..." (with the Twilio credentials from api/.env)
```

Or: Copy the flow JSON from Twilio Console → Studio → Flow → Export.

The user already has the flow JSON from the brainstorming session. Save it to `twilio/flows/main-ivr.json`.

**Step 2: Verify the JSON is valid**

```bash
node -e "const f = require('./twilio/flows/main-ivr.json'); console.log(f.states.length + ' states')"
```

**Step 3: Commit**

```bash
git add twilio/flows/main-ivr.json
git commit -m "feat: store current Twilio Studio IVR flow definition"
```

---

## Task 9: Modify Studio Flow — Add webhook HTTP Request widgets

**Files:**
- Modify: `twilio/flows/main-ivr.json`

**Context:** The Studio Flow JSON needs HTTP Request widgets added at key points to call our API. These are new widgets that get wired into the existing flow.

**Step 1: Add HTTP Request widget at flow trigger (call start)**

Add a widget that fires `POST /api/webhooks/voice/incoming` with CallSid, From, To, CallStatus. Wire it as the first action after the trigger, before the main greeting.

**Step 2: Add HTTP Request widgets after each Gather (key press)**

For each Gather widget in the flow (main menu, directory submenu, accounts submenu), add an HTTP Request that fires `POST /api/webhooks/voice/event` with CallSid, digit, and menu name.

**Step 3: Update Record widgets**

For each Record widget (Lea VM, MD VM, Accounts VM, Care Team VM):
- Set the `action` URL to our API: `https://<api-host>/api/webhooks/voice/recording`
- Add `mailbox` as a parameter (e.g., `lea`, `clinical_md`, `accounts`, `care_team`)
- Set `transcribeCallback` to `https://<api-host>/api/webhooks/voice/transcription`
- Ensure `transcribe="true"` on all Record widgets

**Step 4: Replace HighLevel forwarding number with SIP endpoint**

Find the widget that dials `+18184632211` (HighLevel) and replace with the SIP endpoint URI.

**Note:** The exact JSON modifications depend on the Studio Flow widget IDs and structure. This task will be done interactively — the flow JSON from the brainstorming session provides the exact widget names and structure.

**Step 5: Deploy to test flow**

```bash
cd api && npm run twilio:deploy-test
```

**Step 6: Commit**

```bash
git add twilio/flows/main-ivr.json
git commit -m "feat: add webhook HTTP Request widgets to Studio Flow"
```

---

## Task 10: Test end-to-end with test Twilio number

**This task is manual testing — no code changes.**

**Step 1: Start API server**

```bash
cd api && npm run dev
```

**Step 2: Start SvelteKit dev server**

```bash
npm run dev
```

**Step 3: Expose API via ngrok (for Twilio to reach localhost)**

```bash
ngrok http 3001
```

Copy the ngrok HTTPS URL.

**Step 4: Update Studio Flow webhook URLs**

Update all HTTP Request widget URLs in the Studio Flow to use the ngrok URL:
- `https://<ngrok>.ngrok.io/api/webhooks/voice/incoming`
- `https://<ngrok>.ngrok.io/api/webhooks/voice/event`
- `https://<ngrok>.ngrok.io/api/webhooks/voice/recording`
- `https://<ngrok>.ngrok.io/api/webhooks/voice/transcription`

Deploy to test flow.

**Step 5: Call the test number**

- Call +1 (213) 444-2242 from a cell phone
- Navigate through the IVR menu
- Leave a voicemail
- Hang up

**Step 6: Verify in dashboard**

- Check `/dashboard` — stats should update
- Check `/calls` — new call log should appear
- Check `/voicemails` — new voicemail with transcription pending
- Wait ~60 seconds for transcription callback

**Step 7: Document results**

Note any issues for fixing before production deployment.

---

## Task 11: Deploy API to Render

**Files:**
- Create: `api/render.yaml` (if not exists)
- Verify: `api/package.json` has correct `start` script

**Step 1: Verify api/package.json start script**

The `start` script should be `node server.js`. Already confirmed.

**Step 2: Create/verify render.yaml**

```yaml
services:
  - type: web
    name: lm-app-api
    runtime: node
    region: oregon
    rootDir: api
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3001
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_ANON_KEY
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: TWILIO_ACCOUNT_SID
        sync: false
      - key: TWILIO_AUTH_TOKEN
        sync: false
      - key: TWILIO_PHONE_NUMBER
        sync: false
      - key: RESEND_API_KEY
        sync: false
      - key: FRONTEND_URL
        sync: false
```

**Step 3: Push to GitHub and deploy on Render**

1. Commit and push
2. Create web service on Render dashboard pointing to the repo
3. Set all env vars in Render dashboard
4. Deploy

**Step 4: Verify health check**

```bash
curl https://<render-url>/api/health
```

Expected: `{"status":"ok","timestamp":"..."}`

**Step 5: Commit**

```bash
git add api/render.yaml
git commit -m "deploy: add Render config for API deployment"
```

---

## Task 12: Update Studio Flow with production API URL

**Files:**
- Modify: `twilio/flows/main-ivr.json`

**Step 1: Replace ngrok URLs with Render URL**

Update all HTTP Request widget URLs to use the production Render API URL:
- `https://lm-app-api.onrender.com/api/webhooks/voice/incoming`
- `https://lm-app-api.onrender.com/api/webhooks/voice/event`
- `https://lm-app-api.onrender.com/api/webhooks/voice/recording`
- `https://lm-app-api.onrender.com/api/webhooks/voice/transcription`

Also set the status callback URL on the Twilio phone number config (in Twilio Console):
- `https://lm-app-api.onrender.com/api/webhooks/voice/status`

**Step 2: Deploy to test flow first**

```bash
cd api && npm run twilio:deploy-test
```

**Step 3: Test with test number**

Call the test number, verify logs appear in the dashboard.

**Step 4: When ready — deploy to production flow**

```bash
cd api && npm run twilio:deploy-prod
```

**Step 5: Commit**

```bash
git add twilio/flows/main-ivr.json
git commit -m "deploy: update Studio Flow with production API URLs"
```

---

## Task 13: Final verification + SESSION_NOTES update

**Step 1: Run full build check**

```bash
npm run build
cd api && node --check server.js
```

**Step 2: Verify all commits are pushed**

```bash
git status
git push
```

**Step 3: Update SESSION_NOTES.md**

Document:
- All tasks completed
- Production URLs
- How to test
- Known issues
- Next steps (Phase 1B: SMS, booking, CRM)

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | DB migration (mailbox + call_events) | `api/db/migrations/001-*`, `schema.sql` |
| 2 | Simplify /incoming webhook | `voice.js` |
| 3 | Add /event webhook | `voice.js` |
| 4 | Update /recording with mailbox | `voice.js` |
| 5 | Voicemails API mailbox filter + stats | `voicemails.js` |
| 6 | Voicemails frontend page | `+page.svelte`, `AppSidebar.svelte` |
| 7 | Twilio deploy infrastructure | `twilio/deploy.js`, `twilio/README.md` |
| 8 | Export current Studio Flow | `twilio/flows/main-ivr.json` |
| 9 | Modify Studio Flow (add webhooks) | `twilio/flows/main-ivr.json` |
| 10 | End-to-end testing | (manual) |
| 11 | Deploy API to Render | `api/render.yaml` |
| 12 | Production Studio Flow URLs | `twilio/flows/main-ivr.json` |
| 13 | Final verification | `SESSION_NOTES.md` |
