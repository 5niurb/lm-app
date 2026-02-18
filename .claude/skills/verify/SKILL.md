---
name: verify
description: Check production health - API status, CORS, frontend, Supabase connectivity, and deployed version
disable-model-invocation: false
allowed-tools: Bash, WebFetch
---

# Verify Production Health

Run a comprehensive health check on all lm-app production services.

## Checks to Run (in parallel where possible)

### 1. API Health
```bash
curl -s https://api.lemedspa.app/api/health
```
Expected: `{"status":"ok","timestamp":"..."}`

### 2. CORS Headers
```bash
curl -s -D - -H "Origin: https://lemedspa.app" https://api.lemedspa.app/api/health 2>&1 | grep -i access-control
```
Expected: `access-control-allow-origin: https://lemedspa.app`

### 3. Frontend Loads
```bash
curl -s -o /dev/null -w "%{http_code}" https://lemedspa.app
```
Expected: `200`

### 4. Supabase Connectivity (via API)
```bash
curl -s https://api.lemedspa.app/api/calls/stats -H "Authorization: Bearer test" 2>&1 | head -c 200
```
Expected: Should return data or auth error (not connection error)

### 5. Public Endpoints (no auth)
```bash
curl -s -o /dev/null -w "%{http_code}" https://api.lemedspa.app/api/public/content
curl -s -o /dev/null -w "%{http_code}" https://api.lemedspa.app/api/public/consent/consent-neuromodulators
```
Expected: `200` for both

### 6. Webhook Endpoints
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST https://api.lemedspa.app/api/webhooks/voice/incoming
curl -s -o /dev/null -w "%{http_code}" -X POST https://api.lemedspa.app/api/webhooks/sms/incoming
```
Expected: `400` or `200` (not `404` or `500`)

## Output Format

Present results as a table:

| Check | Status | Details |
|-------|--------|---------|
| API Health | ✅/❌ | response |
| CORS | ✅/❌ | header value |
| Frontend | ✅/❌ | HTTP status |
| Supabase | ✅/❌ | response |
| Public Content | ✅/❌ | HTTP status |
| Public Consent | ✅/❌ | HTTP status |
| Voice Webhook | ✅/❌ | HTTP status |
| SMS Webhook | ✅/❌ | HTTP status |

If any check fails, provide specific troubleshooting guidance.
