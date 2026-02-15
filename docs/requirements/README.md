# Requirements Capture System

## Purpose

Structured documentation of all design decisions, user stories, and acceptance criteria for each major component/page of the lm-app. This serves as the single source of truth for:

- **Rebuilding from scratch** if ever needed
- **Onboarding new developers** to understand intended behavior
- **Regression testing** — acceptance criteria define what "working" means
- **Design consistency** — UI patterns and brand adherence documented per component

## How It Works

Each page/component gets its own `.md` file in `docs/requirements/`. Files are named by route path (e.g., `calls.md` for `/calls`, `messages.md` for `/messages`).

### Auto-Capture Process

When Claude Code implements a feature or design change based on user instructions:

1. **During implementation**: Claude updates the relevant requirement file in `docs/requirements/`
2. **What gets captured**:
   - User stories (what the user asked for, in their own words)
   - Acceptance criteria (specific testable behaviors)
   - Design specs (colors, spacing, typography, interactions)
   - Technical decisions (API endpoints, data flow, state management)
   - Revision history (when and why things changed)

### File Format

Each requirement file follows this structure:

```markdown
# [Page Name]

**Route:** `/path`
**Status:** Active | Planned | Deprecated
**Last Updated:** YYYY-MM-DD

## Overview
Brief description of the page's purpose and role.

## User Stories

### US-001: [Story Title]
**As a** [role], **I want to** [action], **so that** [benefit].
**Priority:** P0 (critical) | P1 (important) | P2 (nice to have)
**Status:** Implemented | In Progress | Planned

#### Acceptance Criteria
- [ ] AC-1: [Specific testable behavior]
- [ ] AC-2: ...

#### Design Notes
- [Colors, spacing, component choices, interaction patterns]

#### User's Original Words
> "[Exact quote from user instruction that prompted this]"

---

## Design Specifications

### Layout
- [Structure, responsive behavior, panels]

### Visual Style
- **Background:** [color]
- **Borders:** [style]
- **Typography:** [fonts, sizes, weights]
- **Accent colors:** [what's used where]

### Interactions
- [Hover states, click behaviors, transitions, animations]

### States
- [Loading, empty, error, success states]

## API Dependencies
- `GET /api/endpoint` — [what it returns]
- `POST /api/endpoint` — [what it does]

## Revision History
| Date | Change | Prompted By |
|------|--------|-------------|
| YYYY-MM-DD | Initial implementation | [context] |
| YYYY-MM-DD | [Change description] | User request: "[brief quote]" |
```

## Adding a New Requirement

Claude: When implementing something new or changing existing behavior based on user instructions, update or create the relevant file in `docs/requirements/`. Focus on capturing:

1. **What** the user asked for (exact words when possible)
2. **Why** (the user's intent/goal)
3. **How** it was implemented (key design decisions)
4. **Acceptance criteria** (how to verify it works)

## Index of Requirement Documents

| File | Page | Status |
|------|------|--------|
| `dashboard.md` | Dashboard | Active |
| `calls.md` | Phone Log / Calls | Active |
| `messages.md` | Messages / SMS | Active |
| `contacts.md` | Contacts / CRM | Active |
| `softphone.md` | Softphone | Active |
| `voicemails.md` | Voicemails (redirect) | Active |
| `ivr-flow.md` | Twilio IVR / Studio Flow | Active |
