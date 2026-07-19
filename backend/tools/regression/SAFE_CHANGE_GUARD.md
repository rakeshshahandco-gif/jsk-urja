# Safe Change Guard (Phase 2.6)

Manual package commands + GitHub Actions validation. **No Husky. No Render deploy. No process kill.**

## Commands

```bash
npm run safe-change:check
npm run regression:fast
npm run regression:full
npm run regression:release
npm run regression:report
```

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Pass / safe for review or local development |
| 1 | Test failures / warnings |
| 2 | **BLOCK DEPLOYMENT** |

## CI

Workflow: `.github/workflows/crm-safe-change-validation.yml`  
Triggers: `pull_request`, `workflow_dispatch` only.  
Live DB tests: **SKIPPED** (`dedicated CI database not configured`).  
CI must not claim **SAFE FOR DEPLOYMENT** from offline checks alone.

## Secrets

Never commit passwords. Optional local live tests use `REGRESSION_*_PASS` env vars only.
