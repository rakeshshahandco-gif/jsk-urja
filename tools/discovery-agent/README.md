# JSK E-SARTHI Discovery Agent (Local)

Visible Chromium helper for browser-assisted Business Discovery.

## Rules

- Runs on the operator PC only (Windows recommended).
- Does **not** run on Render / cloud CRM backend.
- Never uploads cookies, passwords, or browser storage to CRM.
- CAPTCHA: pause and wait for manual solve — no bypass.
- Results are CRM **drafts / preview only** — no automatic Lead creation.

## Setup

```bash
cd tools/discovery-agent
npm install
npx playwright install chromium
```

Create an agent token in CRM:

CRM Data Extractor → Discovery Agent → Create token

Copy the token once into a local env file (gitignored):

```bash
# tools/discovery-agent/.env.local
CRM_BASE_URL=http://127.0.0.1:5100/api/v1
DISCOVERY_AGENT_TOKEN=jskdisc_...
```

## Commands

```bash
npm run connect
npm run run-job -- --job <agentJobId>
```

## Profiles

Browser profiles are stored under `tools/discovery-agent/profiles/<source>/` on disk only.
