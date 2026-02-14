# Twilio Studio Flow Management

## Directory Structure

- `flows/` — Studio Flow JSON definitions (exported from Twilio Console or built locally)
- `deploy.js` — CLI script to push flows to Twilio via REST API

## Workflow

1. Export flow from Twilio Console (or edit JSON locally)
2. Save to `twilio/flows/<flow-name>.json`
3. Deploy to test: `npm run twilio:deploy-test` (from api/)
4. Test with test phone number
5. Deploy to production: `npm run twilio:deploy-prod` (from api/)

## Environment

Requires in `api/.env`:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_TEST_FLOW_SID` — Flow SID for test number
- `TWILIO_PROD_FLOW_SID` — Flow SID for production number

## Deploy Modes

- **Draft** (default): Updates the flow without publishing. Safe for testing.
- **Publish** (`--publish`): Publishes the flow live. Use for production.

## Flow SIDs

Find your Flow SIDs in the Twilio Console under Studio > Flows.
Each flow has a SID starting with `FW`.

## Manual Deploy

```bash
# Draft deploy (safe):
node twilio/deploy.js FWxxxxxx twilio/flows/main-ivr.json

# Publish live:
node twilio/deploy.js FWxxxxxx twilio/flows/main-ivr.json --publish
```
