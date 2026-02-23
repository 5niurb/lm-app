# Vivid Dark Theme Rollout — Ralph Loop Prompt

You are updating lm-app to complete the Vivid Dark design system rollout. Commit `77c8dc7` established the new theme on ~16 files (dashboard, login, sidebar, header, theme system, some messaging tabs). Several pages and all PRDs still use the old design tokens.

Your job: update every remaining page/component to use the Vivid Dark design system, update all PRDs with the correct design tokens, and update CLAUDE.md's Design Direction section.

## Completion Promise

Output `VIVID_DARK_ROLLOUT_COMPLETE` ONLY when ALL of the following are true:
1. Every file listed below has been updated
2. `npx vite build` passes with zero errors
3. All PRDs reference the correct design tokens
4. CLAUDE.md Design Direction is updated
5. All changes are committed

---

## Design System Reference (from src/app.css)

### Colors — Vivid Dark (Midnight theme)
| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#09090b` | Page background |
| `--foreground` | `#fafafa` | Primary text |
| `--card` | `#111113` | Card/panel bg |
| `--primary / --gold` | `#d4a843` | Gold accent — text, headers, links, borders, focus rings |
| `--gold-dim` | `rgba(212,168,67,0.4)` | Dimmed gold |
| `--gold-glow` | `rgba(212,168,67,0.1)` | Subtle gold glow bg |
| `--border` | `#27272a` | Default borders |
| `--border-subtle` | `rgba(255,255,255,0.06)` | Card/section borders |
| `--text-primary` | `#fafafa` | Primary text |
| `--text-secondary` | `#a1a1aa` | Secondary/muted text |
| `--text-tertiary` | `#71717a` | Tertiary/faded text |
| `--text-ghost` | `rgba(255,255,255,0.1)` | Ghost text |
| `--surface-subtle` | `rgba(255,255,255,0.02)` | Subtle surface |
| `--surface-raised` | `rgba(255,255,255,0.04)` | Raised surface |
| `--surface-hover` | `rgba(255,255,255,0.06)` | Hover state bg |
| `--destructive` | `#f43f5e` | Error/destructive |

### Vivid Accent Colors (for icons, badges, decorative elements ONLY)
| Token | Hex | CSS class |
|-------|-----|-----------|
| `--vivid-indigo` | `#818cf8` | `text-vivid-indigo`, `grad-indigo`, `glow-indigo` |
| `--vivid-blue` | `#60a5fa` | `text-vivid-blue`, `grad-blue`, `glow-blue` |
| `--vivid-violet` | `#a78bfa` | `text-vivid-violet`, `grad-violet`, `glow-violet` |
| `--vivid-emerald` | `#34d399` | `text-vivid-emerald`, `grad-emerald`, `glow-emerald` |
| `--vivid-cyan` | `#22d3ee` | `text-vivid-cyan`, `grad-cyan`, `glow-cyan` |
| `--vivid-amber` | `#fbbf24` | `text-vivid-amber`, `grad-amber`, `glow-amber` |
| `--vivid-orange` | `#fb923c` | `text-vivid-orange`, `grad-orange`, `glow-orange` |
| `--vivid-rose` | `#fb7185` | `text-vivid-rose`, `grad-rose`, `glow-rose` |
| `--vivid-pink` | `#f472b6` | `text-vivid-pink`, `grad-pink`, `glow-pink` |

### Status Colors
| Token | Hex |
|-------|-----|
| `--status-success` | `#10b981` |
| `--status-info` | `#3b82f6` |
| `--status-warning` | `#f59e0b` |
| `--status-danger` | `#f43f5e` |

### Typography
- **Headings:** `font-display` = Outfit (geometric sans), weight 600-700
- **Body:** `font-body` = DM Sans, weight 400
- **Patient-facing pages (care/, consent/):** Keep Playfair Display — intentionally different

### Utility Classes (defined in app.css)
- `icon-box` / `icon-box-lg` / `icon-box-xl` — gradient icon containers (32px / 40px / 48px)
- `grad-gold`, `grad-blue`, `grad-violet`, etc. — gradient fills for icon boxes
- `glow-indigo`, `glow-emerald`, etc. — soft glow bg + colored text for badges/counts
- `card-gradient` — card with hover gold top-line effect
- `card-elevated` — card with hover lift + shadow
- `text-gold` — gold text
- `bg-gold-glow` — gold glow background
- `page-enter` — fade-in-from-below animation
- `section-label` — uppercase tiny label

---

## Translation Rules

Apply these replacements across all files listed below.

### Color/Token Migrations
| Old (DO NOT USE) | New (USE THIS) | Notes |
|------------------|----------------|-------|
| `text-muted-foreground` | `text-text-secondary` | Semantic muted text |
| `text-white` (for text content) | `text-foreground` or `text-text-primary` | Use semantic tokens |
| `text-red-400`, `text-red-400/70` | `text-vivid-rose` or `text-vivid-rose/70` | Error/missed/destructive |
| `text-red-400/50` | `text-vivid-rose/50` | Faded destructive |
| `text-blue-400`, `text-blue-400/70` | `text-vivid-blue` or `text-vivid-blue/70` | Info/inbound |
| `text-emerald-400`, `text-emerald-400/70` | `text-vivid-emerald` or `text-vivid-emerald/70` | Success/outbound |
| `text-emerald-400/60` | `text-vivid-emerald/70` | Answered calls |
| `text-green-400` | `text-vivid-emerald` | Active/success states |
| `text-yellow-400` | `text-vivid-amber` | Warning/pending states |
| `bg-red-500/5`, `bg-red-500/10` | `bg-vivid-rose/5` | Error backgrounds |
| `bg-green-400` | `bg-vivid-emerald` | Active dots |
| `bg-yellow-400` | `bg-vivid-amber` | Pending dots |
| `border-red-500/30` | `border-vivid-rose/20` | Error borders |
| `border-emerald-500/30` | `border-vivid-emerald/30` | Success action borders |
| `border-blue-500/30` | `border-vivid-blue/30` | Info action borders |
| `hover:bg-emerald-500/15` | `hover:bg-vivid-emerald/10` | Hover states |
| `hover:bg-blue-500/15` | `hover:bg-vivid-blue/10` | Hover states |
| `hover:text-emerald-400` | `hover:text-vivid-emerald` | Hover text |
| `hover:text-blue-400` | `hover:text-vivid-blue` | Hover text |
| `hover:border-emerald-400` | `hover:border-vivid-emerald` | Hover borders |
| `hover:border-blue-400` | `hover:border-vivid-blue` | Hover borders |

### Structural Patterns
| Old Pattern | New Pattern | Notes |
|-------------|-------------|-------|
| `rounded border border-border` (on cards) | `rounded-lg border border-border-subtle` | Use subtle border + larger radius |
| `border-b border-border` (section borders) | `border-b border-border-subtle` | Subtle section dividers |
| `Phone class="mx-auto mb-3 h-8 w-8 text-gold-dim"` | `<div class="icon-box-xl grad-blue"><Phone class="h-5 w-5 text-white" /></div>` | Empty states use icon boxes |
| `hover:bg-gold-glow` (on call rows) | `hover:bg-surface-hover` | Consistent hover backgrounds |
| Missing page-enter animation | Add `page-enter` class to page wrapper | Consistent page transitions |

---

## Files to Update (in order)

### Phase 1: Page Components

#### 1. `src/routes/(auth)/calls/+page.svelte`
**What to change:**
- Replace all raw Tailwind color classes with vivid tokens (see Translation Rules)
- Card borders: `rounded border border-border` → `rounded-lg border border-border-subtle`
- Section dividers: `border-b border-border` → `border-b border-border-subtle`
- Header subtitle: `text-muted-foreground` → `text-text-secondary`
- Pagination text: `text-muted-foreground` → `text-text-secondary`
- Error block: `border-red-500/30 bg-red-500/5` → `border-vivid-rose/20 bg-vivid-rose/5`, `text-red-400` → `text-vivid-rose`
- Empty state: Replace bare `Phone` icon with `icon-box-xl grad-blue` container
- Missed call icon: `text-red-400/70` → `text-vivid-rose`
- Inbound icon: `text-blue-400/70 group-hover:text-blue-400` → `text-vivid-blue group-hover:text-vivid-blue`
- Outbound icon: `text-emerald-400/70 group-hover:text-emerald-400` → `text-vivid-emerald group-hover:text-vivid-emerald`
- Call back button: `border-emerald-500/30 text-emerald-400/50 hover:bg-emerald-500/15 hover:text-emerald-400 hover:border-emerald-400` → `border-vivid-emerald/30 text-vivid-emerald/50 hover:bg-vivid-emerald/10 hover:text-vivid-emerald hover:border-vivid-emerald`
- Message button: `border-blue-500/30 text-blue-400/50 hover:bg-blue-500/15 hover:text-blue-400 hover:border-blue-400` → `border-vivid-blue/30 text-vivid-blue/50 hover:bg-vivid-blue/10 hover:text-vivid-blue hover:border-vivid-blue`
- Answered text: `text-emerald-400/60` → `text-vivid-emerald/70`
- Missed text: `text-red-400/70` → `text-vivid-rose/70`
- Failed text: `text-red-400/50` → `text-vivid-rose/50`
- Delete button: `text-red-400/50 hover:text-red-400` → `text-vivid-rose/50 hover:text-vivid-rose`
- VM status: `text-green-400` → `text-vivid-emerald`
- Row hover: `hover:bg-gold-glow` → `hover:bg-surface-hover`
- Row hover border: `hover:border-border` → `hover:border-border-subtle`

#### 2. `src/routes/(auth)/settings/+page.svelte`
**What to change:**
- Header subtitle: `text-muted-foreground` → `text-text-secondary`
- All `border-border` on cards/sections → `border-border-subtle`
- `text-white` (for text labels like day names, timezone select, time inputs) → `text-foreground`
- Delete buttons: `text-red-400/50 hover:text-red-400` → `text-vivid-rose/50 hover:text-vivid-rose`
- VM status: `text-green-400` → `text-vivid-emerald`
- Security active dots: `bg-green-400` → `bg-vivid-emerald`
- Security active text: `text-green-400` → `text-vivid-emerald`
- Security pending dots: `bg-yellow-400` → `bg-vivid-amber`
- Security pending text: `text-yellow-400` → `text-vivid-amber`
- Empty state icons: Wrap in `icon-box-lg` with appropriate `grad-*` class
- Consider adding `page-enter` to the wrapper div

#### 3. `src/routes/(auth)/messages/+page.svelte`
**What to change:**
- Error block: `border-red-500/30 bg-red-500/10` → `border-vivid-rose/20 bg-vivid-rose/5`
- Error text: `text-red-400` → `text-vivid-rose`
- Dismiss button: `text-red-400/60 hover:text-red-400` → `text-vivid-rose/60 hover:text-vivid-rose`

#### 4. `src/routes/(auth)/voicemails/+page.svelte`
**What to change:**
- `text-muted-foreground` → `text-text-secondary`

#### 5. `src/routes/(auth)/design-test/+page.svelte`
**What to check:** Read this file first. If it uses old tokens, update them. If it's a dev-only test page, update minimally.

### Phase 2: Messaging Components (check and update if needed)

Read each file. If it uses raw Tailwind colors (red-400, blue-400, emerald-400, green-400) or `text-muted-foreground`, apply the translation rules.

- `src/lib/components/messaging/ComposeBar.svelte`
- `src/lib/components/messaging/EmojiPicker.svelte`
- `src/lib/components/messaging/TagInsert.svelte`
- `src/lib/components/messaging/TemplateInsert.svelte`
- `src/lib/components/messaging/MessageReactions.svelte`
- `src/lib/components/messaging/ImageLightbox.svelte`

### Phase 3: CommandPalette

- `src/lib/components/CommandPalette.svelte` — Already mostly themed. Scan for any remaining raw Tailwind colors and replace.

### Phase 4: PRD Updates

Update the "Context for Agent" → "Design system" line in ALL 6 PRDs:

**Old line:** `- **Design system:** Dark bg #0a0a0c, gold accent #C5A55A, Playfair Display headings`

**New line:** `- **Design system:** Vivid Dark — near-black bg #09090b, gold accent #d4a843, Outfit headings, DM Sans body. Multi-color vivid accents (indigo, blue, violet, emerald, cyan, amber, orange, rose) for icons and badges. Use semantic CSS tokens (text-text-secondary, bg-surface-hover, border-border-subtle, etc.) — see src/app.css for full design system.`

Files:
1. `docs/prds/messaging-ai-suggest/prd.md`
2. `docs/prds/messaging-auto-replies/prd.md`
3. `docs/prds/messaging-broadcast/prd.md`
4. `docs/prds/messaging-internal-notes/prd.md`
5. `docs/prds/messaging-mms/prd.md`
6. `docs/prds/messaging-scheduled-delivery/prd.md`

**Additional for Internal Notes PRD** (`docs/prds/messaging-internal-notes/prd.md`):
- The hardcoded warm cream colors (`#FFF8E1`, `rgba(255,248,225,0.08)`, `rgba(255,248,225,0.12)`, `rgba(255,248,225,0.2)`) are intentional for the internal note visual distinction. Keep them — they provide visual differentiation from normal messages. But add a note: "These warm tones are intentional for note mode contrast against the Vivid Dark base theme."

### Phase 5: PROMPT.md Update

In `docs/prds/PROMPT.md`, if there are references to the old design system (`#0a0a0c`, `#C5A55A`, `Playfair Display`), update them to match the new tokens.

### Phase 6: CLAUDE.md Design Direction

Update the `## Design Direction` section in the project `CLAUDE.md` (root of lm-app).

**Replace this:**
```
## Design Direction

All Le Med Spa properties use the **dark + gold** aesthetic:
- **Background:** Dark (#0a0a0c)
- **Accents:** Gold (#d4af37, #c5a24d)
- **Typography:** Playfair Display (headings) + Inter (body)
- **Style:** Luxurious, intimate, high-end

The lm-app dashboard should follow this same design language where possible — dark sidebar, gold accents, clean typography. shadcn-svelte components can be themed to match.
```

**With this:**
```
## Design Direction

The lm-app internal dashboard uses the **Vivid Dark** design system:
- **Background:** Near-black (#09090b)
- **Primary accent:** Gold (#d4a843) — for text, headers, links, borders, focus rings
- **Multi-color accents:** Vivid indigo, blue, violet, emerald, cyan, amber, orange, rose — for icon boxes, badges, and decorative elements
- **Typography:** Outfit (headings) + DM Sans (body)
- **Style:** Modern fintech-inspired dashboard (Mercury, LaunchDarkly), dark + colorful

**Three themes:** Midnight (dark, default), Dusk (warm dark), Champagne (light) — all share the same gold primary and vivid accent palette.

**Patient-facing pages** (care/, consent/) intentionally use Playfair Display + the luxury spa aesthetic. These do NOT follow the Vivid Dark dashboard theme.

The full design system (tokens, utilities, gradients) is defined in `src/app.css`. Use semantic CSS classes (`text-text-secondary`, `bg-surface-hover`, `border-border-subtle`, `icon-box grad-blue`, etc.) rather than raw Tailwind colors.
```

---

## Workflow Per Iteration

1. Read this prompt and check what's already been done (via git status / git log).
2. Pick the next incomplete phase/file.
3. Read the target file.
4. Apply the translation rules.
5. Run `npx prettier --write <file>` to format.
6. Run `npx vite build` to verify no errors.
7. Commit with message: `[ui] Apply Vivid Dark theme to <component/area>`
8. Move to the next file or phase.
9. When ALL phases are complete: run final `npx vite build`, verify, commit any remaining changes, then output `VIVID_DARK_ROLLOUT_COMPLETE`.

## Rules

- Do NOT modify `src/app.css` — the design system is already correct.
- Do NOT modify shadcn-svelte components in `src/lib/components/ui/`.
- Do NOT modify care/ or consent/ pages — they intentionally use different branding.
- Do NOT change functionality — only update CSS classes and design tokens.
- Do NOT add new features or restructure components.
- Preserve all existing behavior, event handlers, and logic.
- One commit per phase or per major file group.
- If vite build fails, fix the error before committing.
- Use `npx prettier --write` on changed files before committing.
