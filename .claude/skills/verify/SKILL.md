---
name: verify
description: Full verification — 6 local checks (build, lint, tests, console.log audit, git status, API syntax) then production health checks (API, CORS, frontend, Supabase, webhooks)
argument-hint: [local|prod|full]
disable-model-invocation: false
allowed-tools: Bash, Read, Grep, WebFetch
---

# Verify — Local + Production Health Checks

Two-phase verification: local code quality first, then production health. Run both by default, or target one phase.

## Arguments

Parse from: $ARGUMENTS

| Argument | Behavior |
|---|---|
| `local` | Run only local checks (Phases 1-6) |
| `prod` | Run only production checks (Phases 7-12) |
| `full` (default) | Run all phases |
| *(empty)* | Same as `full` |

---

## Phase 1: Build Check

```bash
PUBLIC_API_URL=https://api.lemedspa.app npx vite build 2>&1
```

- **Pass:** Build completes with no errors (warnings are OK)
- **Fail:** Build errors → report the error and stop. Don't continue with a broken build.

## Phase 2: Lint

```bash
npx eslint src/ api/ --max-warnings 50 2>&1
```

- **Pass:** No errors (warnings under threshold are OK)
- **Fail:** ESLint errors → report them
- If eslint is not configured, skip with a note

## Phase 3: Tests

```bash
npx vitest run 2>&1
```

- **Pass:** All tests pass
- **Fail:** Any test failures → report which tests failed
- If no test runner configured, skip with a note

## Phase 4: Console.log Audit

Search for `console.log` statements in source code that shouldn't ship:

```bash
# Search src/ and api/ for console.log, excluding legitimate uses
```

Use Grep to find `console.log` in `src/**/*.{js,svelte}` and `api/**/*.js`.

**Ignore (don't flag):**
- `console.error` and `console.warn` (these are intentional)
- Files in `node_modules/`
- Test files (`*.test.js`, `*.spec.js`)
- The string `console.log` inside comments

**Flag:**
- `console.log` in route handlers, components, or services
- Report count and locations

This is informational — don't fail the verification, just report.

## Phase 5: Git Status

```bash
git status --porcelain
git log --oneline -3
```

Report:
- Uncommitted changes (if any)
- Untracked files (if any)
- Last 3 commits (for context)
- Current branch

## Phase 6: API Syntax Check

```bash
node --check api/server.js 2>&1
```

- **Pass:** No syntax errors
- **Fail:** Syntax error → report it

---

## Phase 7: API Health (Production)

```bash
curl -s https://api.lemedspa.app/api/health
```
Expected: `{"status":"ok","timestamp":"..."}`

## Phase 8: CORS Headers

```bash
curl -s -D - -H "Origin: https://lemedspa.app" https://api.lemedspa.app/api/health 2>&1 | grep -i access-control
```
Expected: `access-control-allow-origin: https://lemedspa.app`

## Phase 9: Frontend Loads

```bash
curl -s -o /dev/null -w "%{http_code}" https://lemedspa.app
```
Expected: `200`

## Phase 10: Supabase Connectivity

```bash
curl -s https://api.lemedspa.app/api/calls/stats -H "Authorization: Bearer test" 2>&1 | head -c 200
```
Expected: Data or auth error (not connection error)

## Phase 11: Public Endpoints

```bash
curl -s -o /dev/null -w "%{http_code}" https://api.lemedspa.app/api/public/content
curl -s -o /dev/null -w "%{http_code}" https://api.lemedspa.app/api/public/consent/consent-neuromodulators
```
Expected: `200` for both

## Phase 12: Webhook Endpoints

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST https://api.lemedspa.app/api/webhooks/voice/incoming
curl -s -o /dev/null -w "%{http_code}" -X POST https://api.lemedspa.app/api/webhooks/sms/incoming
```
Expected: `400` or `200` (not `404` or `500`)

---

## Output Format

Present results as two tables:

### Local Checks
| Phase | Check | Status | Details |
|-------|-------|--------|---------|
| 1 | Build | ✅/❌ | errors or "clean" |
| 2 | Lint | ✅/❌/⏭️ | error count |
| 3 | Tests | ✅/❌/⏭️ | pass/fail count |
| 4 | Console.log | ✅/⚠️ | count found |
| 5 | Git Status | ✅/⚠️ | clean or uncommitted count |
| 6 | API Syntax | ✅/❌ | errors or "clean" |

### Production Health
| Phase | Check | Status | Details |
|-------|-------|--------|---------|
| 7 | API Health | ✅/❌ | response |
| 8 | CORS | ✅/❌ | header value |
| 9 | Frontend | ✅/❌ | HTTP status |
| 10 | Supabase | ✅/❌ | response |
| 11 | Public Content | ✅/❌ | HTTP status |
| 12 | Webhooks | ✅/❌ | HTTP status |

### Overall Verdict
- **ALL CLEAR** — Everything passes
- **LOCAL ISSUES** — Local checks failed (don't deploy)
- **PROD ISSUES** — Production checks failed (investigate)
- **ISSUES FOUND** — Both local and prod problems

If any check fails, provide specific troubleshooting guidance.
