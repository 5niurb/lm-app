# Messaging Composer — Design Reference

Reference screenshots from TextMagic showing the target UX for compose bar enhancements.

## Screenshots to Add

Save the 4 screenshots from the Claude Code conversation (2026-02-22) to this directory:

1. **`01-more-menu.png`** — Three-dot more menu showing: Add dynamic field, Schedule, Preview, Generate with AI
2. **`02-internal-note-compose.png`** — Compose area in "Internal note" mode: yellow/cream background, toggle ON, "Add note" button
3. **`03-internal-note-inline.png`** — Internal note displayed inline in the thread: yellow bubble with "Care Coordinator 2 (internal note)" header
4. **`04-ai-suggest-panel.png`** — AI Generate panel: thread summary paragraph + 3 clickable draft response cards (Recommend, Suggest, Encourage)

## Feature Mapping

| Screenshot | Feature | PRD |
|---|---|---|
| 01 | More menu with Schedule + AI | `messaging-ai-suggest` (AI-003) |
| 02 | Internal note compose mode | `messaging-internal-notes` (IN-003) |
| 03 | Internal note inline display | `messaging-internal-notes` (IN-004) |
| 04 | AI response suggestions | `messaging-ai-suggest` (AI-002) |

## Notes from Reference
- TextMagic also shows emoji, attachment, and template icons in the toolbar — we already have all three
- "Add dynamic field" = our existing TagInsert component (merge tags like `{{first_name}}`)
- "Preview" = message preview with resolved tags — not currently prioritized
- Toggle uses a standard switch/toggle component with "Internal note" label
- AI panel has a prominent "Thread summary" heading and scrollable card-based suggestions
