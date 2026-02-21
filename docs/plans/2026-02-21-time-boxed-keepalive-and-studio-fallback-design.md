# Time-Boxed Keep-Alive & Studio Hours-Check Fallback

**Date:** 2026-02-21
**Status:** Approved

## Problem

1. The Render free tier gives 750 hrs/month shared across all services. The current 24/7 keep-alive burns ~720 hrs, leaving no room for a future test API.
2. When the API is unreachable (spun down), the Studio IVR flow falls through to the **open** hours greeting — wrong behavior for after-hours callers.

## Design

### Change 1: Studio hours-check failed fallback → closed greeting

In `twilio/flows/test-ivr.json` (then `main-ivr.json` after approval):

The `check_hours` HTTP request widget's `failed` transition currently points to `x0a-MainGreetingMenu_Open`. Change it to `gather_closed`.

Effect when API is unreachable:
- Caller hears closed greeting ("press 1 to text us, or leave a message")
- Press 1 → `send_sms_closed` webhook also fails (API down) → falls to voicemail
- No press → voicemail recording (Twilio stores it, retries callback when API wakes)

### Change 2: Time-boxed keep-alive (9 AM – 9 PM Pacific)

In `api/server.js`, add a time-of-day check inside the existing `setInterval`. If the current hour in `America/Los_Angeles` is outside 9 AM – 9 PM, skip the ping. The server spins down naturally after 15 minutes of no pings.

No new dependencies. ~5 lines changed.

**Resulting hour budget:**
- Prod API: 12 hrs/day × 30 = 360 hrs
- Test API (future): up to 13 hrs/day = 390 hrs
- Total: 750 hrs

### Deployment sequence

1. Edit `test-ivr.json` → deploy to test flow (`FW9d3a...`)
2. User calls test number to verify
3. On approval → apply same change to `main-ivr.json` → deploy to prod flow
4. Keep-alive change ships via normal git push → Render auto-deploy (affects both flows equally)
