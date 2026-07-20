# CRM Regression Protection Framework (Phase 2.5)

Read-only validation suite. **Does not** change Sales, GST, Print, Accounts, Stock, or live production data schemas (except temporary module-state toggles when `--mutate-modules` is explicitly passed, which are always restored).

## Commands

```bash
# Auto: LIVE if both backends healthy with correct DBs; else OFFLINE
npm run regression

# Force modes
npm run regression -- --offline
npm run regression -- --live
npm run regression -- --live --mutate-modules

# Category filter
npm run regression -- --offline --category environment,cache,module-state,build

# Optional heavier checks
npm run regression -- --offline --build --lint
```

## Environment

| Variable | Purpose |
|----------|---------|
| `REGRESSION_HANDLOOM_PASS` | Handloom local user password |
| `REGRESSION_JSK_PASS` | JSK local user password |
| `REGRESSION_PASS` | Shared fallback password |
| `REGRESSION_HANDLOOM_USER` / `REGRESSION_JSK_USER` | Override usernames |

## Categories

environment · authentication · company-isolation · module-state · sales · print · company-config · cache · security · database-safety · build

## Reports

Written to `backend/tools/regression/reports/CRM-SAFE-CHANGE-REPORT-*.txt`  
Latest: `CRM-SAFE-CHANGE-REPORT-latest.txt`

## Deployment blocker

Exit code `2` + **BLOCK DEPLOYMENT** when high-risk codes fire (company leak, wrong DB, sales/print regression, auth/security bypass, module bypass).

## CI/CD

**Not wired yet.** Wait for explicit approval before integrating into pipelines.
