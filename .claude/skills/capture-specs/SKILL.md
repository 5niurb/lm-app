---
name: capture-specs
description: Review session work and update SPECS.md with new/changed page specs, components, API endpoints, schema, and design decisions
argument-hint: [optional: specific pages or features to capture]
disable-model-invocation: false
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, Task
---

# Capture Specs

Review the current session's work and update `SPECS.md` with new or changed specifications. This ensures the project can be rebuilt from scratch using SPECS.md alone.

## Arguments

- If provided, focus on specific pages or features: $ARGUMENTS
- If not provided, review SESSION_NOTES.md and recent git history to find all changes

## Steps

1. **Identify what changed this session:**
   - Read `SESSION_NOTES.md` (latest entry) to understand what was built
   - Run `git log --oneline -10` to see recent commits
   - Run `git diff HEAD~5 --name-only` to see changed files (adjust count as needed)

2. **Read the current SPECS.md:**
   - Read `SPECS.md` fully to understand existing structure and content
   - Note the format: Purpose → Components table → Acceptance Criteria checklist → Design Decisions log

3. **For each new or changed feature, gather details from source code:**
   - **Pages:** Read the `.svelte` file to identify components, state variables, API calls, URL params
   - **API endpoints:** Read route files for method, path, request/response shape, auth requirements
   - **Database:** Check schema files for new tables, columns, constraints
   - **Components:** Check for new shared components in `src/lib/components/`
   - **Design:** Note any new CSS classes, color tokens, typography changes

4. **Update SPECS.md** following the existing format:

   **For page specs:**
   ```markdown
   ## Page Name (`/route`)

   **Purpose:** One-line description.

   **Status:** Scaffolded | Functional | Complete

   **Components:**

   | Component | Description |
   |-----------|-------------|
   | Name | What it does |

   **API:** `GET /api/endpoint`, `POST /api/endpoint`

   **Acceptance Criteria:**
   - [x] Completed items
   - [ ] Pending items

   **Design Decisions:**
   - Key decisions with rationale
   ```

   **For API endpoints:** Add to the Webhooks or Public API section as appropriate.

   **For database changes:** Update the Database Schema section tables.

   **For design decisions:** Add a row to the Design Decisions Log table at the bottom:
   ```markdown
   | 2026-MM | Decision | Rationale |
   ```

5. **Update the "Last updated" line** at the top of SPECS.md with the current session number and date.

6. **Verify the update:**
   - Ensure no sections were accidentally deleted
   - Check that acceptance criteria checkboxes are accurate ([x] for done, [ ] for pending)
   - Confirm component tables are formatted correctly

7. **Commit the change:**
   ```bash
   git add SPECS.md
   git commit -m "$(cat <<'EOF'
   [docs] Update SPECS.md — Session NN

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
   EOF
   )"
   git push origin main
   ```

## Format Rules

- Use `**Purpose:**` not just "Purpose:"
- Component tables use `| Component | Description |` headers
- Acceptance criteria are checkboxes: `- [x]` or `- [ ]`
- API endpoints listed as inline code: `` `GET /api/path` ``
- Design decisions log uses table format with Date | Decision | Rationale
- Keep descriptions concise — enough to rebuild, not a novel
- Mark status accurately: "Scaffolded" (UI only), "Functional" (works end-to-end), "Complete" (tested + polished)

## Important

- NEVER remove existing specs — only add or update
- If a feature was renamed or merged, update the old entry and add the new one
- Acceptance criteria that regressed should be unchecked with a note
- Always read the source code to verify — don't rely solely on session notes
