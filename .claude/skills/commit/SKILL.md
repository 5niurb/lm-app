---
name: commit
description: Stage changes, create a formatted git commit, and push to GitHub following project conventions
argument-hint: [commit message or area]
disable-model-invocation: false
allowed-tools: Bash, Read, Grep
---

# Git Commit & Push

Create a well-formatted git commit following lm-app conventions and push to GitHub.

## Arguments

- If provided, use as the commit message or area hint: $ARGUMENTS
- If not provided, analyze changes and generate an appropriate message

## Steps

1. **Assess changes:**
   ```bash
   git status
   git diff --stat
   git diff --cached --stat
   ```

2. **Stage files:**
   - Stage specific files (NOT `git add -A`)
   - NEVER stage `.env`, `.env.*`, credentials, or large binaries
   - Group related changes logically

3. **Generate commit message** following the project format:
   ```
   [area] Brief description of what changed

   - Detail 1
   - Detail 2

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
   ```

   Area prefixes:
   - `[website]` — lemedspa-website changes
   - `[dashboard]` — Dashboard page changes
   - `[ui]` — UI components, sidebar, header
   - `[api]` — Express API routes/middleware
   - `[calls]` — Call logging / Phone Log
   - `[messages]` — SMS messaging
   - `[contacts]` — CRM / contacts
   - `[voicemails]` — Voicemail system
   - `[services]` — Services catalog
   - `[automation]` — Automation sequences
   - `[softphone]` — Browser softphone
   - `[auth]` — Authentication
   - `[config]` — Configuration, CLAUDE.md, settings
   - `[db]` — Database schema, migrations
   - `[deploy]` — Deployment, CI/CD
   - `[docs]` — Documentation
   - `[consent]` — Consent forms
   - `[twilio]` — Twilio/Studio flow changes

4. **Commit** using HEREDOC format:
   ```bash
   git commit -m "$(cat <<'EOF'
   [area] Message here

   - Detail

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
   EOF
   )"
   ```

5. **Push to GitHub:**
   ```bash
   git push origin main
   ```
   If push fails (remote ahead), run `git pull --rebase` first, then push again.

6. **Report:** Show commit hash and summary

## Important

- Never force push to main
- Never commit .env files or secrets
- If there are no changes to commit, say so — don't create empty commits
