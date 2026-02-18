---
name: deploy
description: Build and deploy lm-app to Cloudflare Pages with automatic retry and verification. Handles the full pipeline - build with correct API URL, deploy, verify health.
argument-hint: [frontend|api|both]
disable-model-invocation: false
allowed-tools: Bash, Read, Grep, WebFetch
---

# Deploy lm-app

Deploy the application to production. Handles frontend (Cloudflare Pages), API (Render auto-deploys on push), or both.

## Arguments

- `frontend` (default) — Build + deploy frontend to CF Pages
- `api` — Push to GitHub (triggers Render auto-deploy), then verify API health
- `both` — Deploy frontend + push for API

Target: $ARGUMENTS

## Frontend Deploy Steps

1. **Pre-flight checks:**
   - Run `git status` to warn about uncommitted changes (don't block, just warn)
   - Verify we're in the lm-app directory

2. **Build with correct API URL:**
   ```bash
   PUBLIC_API_URL=https://api.lemedspa.app npx vite build
   ```
   - **CRITICAL:** Always use the production API URL. Never build without it.
   - If build fails, stop and report the error. Do NOT deploy a broken build.

3. **Deploy to Cloudflare Pages (with retry):**
   ```bash
   npx wrangler pages deploy .svelte-kit/cloudflare --project-name lm-app --branch main --commit-dirty=true
   ```
   - If deploy fails with a network/fetch error, wait 5 seconds and retry (up to 3 attempts)
   - If all 3 attempts fail, report the error

4. **Post-deploy verification:**
   - Wait 10 seconds for propagation
   - Check `https://lemedspa.app` responds (WebFetch or curl)
   - Check API health: `curl -s https://api.lemedspa.app/api/health`
   - Check CORS: `curl -s -D - -H "Origin: https://lemedspa.app" https://api.lemedspa.app/api/health 2>&1 | grep -i access-control-allow-origin`

5. **Report results** in a clear table format

## API Deploy Steps

1. Push current branch to GitHub: `git push origin main`
2. Wait 2-3 minutes for Render auto-deploy
3. Verify health endpoint: `curl -s https://api.lemedspa.app/api/health`
4. Verify CORS from CF Pages origin

## Important

- The `.env` file has `PUBLIC_API_URL=http://localhost:3001` for local dev
- SvelteKit bakes `$env/static/public` vars at BUILD TIME — always override for production
- Render redeploys take ~2-3 minutes after push
- CF Pages deploys are near-instant but sometimes have network issues (hence retry logic)
