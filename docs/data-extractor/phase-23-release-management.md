# Phase 23 — Deployment, Release Management and Controlled Rollout Center

## Architecture

Phase 23 is a **Deployment Control Center**, not a deployment executor. It prepares release packages, environment metadata, rollout plans, checklists, simulations, approvals, and exportable deployment instructions for future phases.

All Phase 23 outputs remain:

- `executable: false`
- `deploymentExecuted: false`
- `productionActivated: false`

API base: `/api/v1/data-extractor/ai-lead-intelligence/release-manager`

## Environment model

Supported codes: `LOCALHOST`, `DEVELOPMENT`, `TESTING`, `STAGING`, `PRODUCTION`.

Each environment stores safe aliases only (frontend/backend service references, database alias, branch reference, health-check definition, approval policy). **Never** stores MongoDB passwords, Render API keys, GitHub tokens, private keys, session tokens, or env-var values.

Production is protected: stronger approval policy, cannot be selected as a source environment, backup + rollback plans required for production-plan readiness.

## Release Package architecture

`ReleasePackage` holds version metadata, module inclusion/exclusion, linked Phase 20 Implementation Specs, Phase 21 configuration versions, Phase 22 sandbox evaluation runs, checklists, plans (backup/rollback/migration/health/smoke/monitoring), company/industry rollout, feature-flag plans, manifest, checksum, readiness, and approval status.

Release types include FEATURE_RELEASE, BUG_FIX, SECURITY_FIX, CONFIGURATION_RELEASE, DATA_EXTRACTOR_RELEASE, AI_INTELLIGENCE_RELEASE, INDUSTRY_TEMPLATE_RELEASE, COMPANY_SPECIFIC_RELEASE, HOTFIX_PLAN, ROLLBACK_PLAN, DOCUMENTATION_ONLY, DATABASE_MIGRATION_PLAN. HOTFIX_PLAN remains a plan only.

## Release lifecycle

```
DRAFT → VALIDATING → VALIDATION_FAILED | READY_FOR_REVIEW
→ UNDER_TECHNICAL_REVIEW → UNDER_BUSINESS_REVIEW → UNDER_SECURITY_REVIEW → UNDER_RELEASE_REVIEW
→ NEEDS_CHANGES | APPROVED_FOR_STAGING_PLAN → STAGING_VALIDATION_RECORDED
→ APPROVED_FOR_PILOT_PLAN → PILOT_VALIDATION_RECORDED
→ APPROVED_FOR_FUTURE_PRODUCTION_PLAN → RELEASE_PACKAGE_FINALIZED → ARCHIVED
```

**Not used:** DEPLOYED, LIVE, ACTIVE_PRODUCTION, ROLLED_OUT, EXECUTED.

## Release Manifest

Generated secret-free manifest with package ID, environments, versions, modules, configs, specs, sandbox links, migration notes, feature flags, company/industry scope, checklists, and `executable:false`.

## Module allocation / Company / Industry rollout

Plans only — no live module activation. Company rollout is tenant-scoped (`req.companyId`); cross-company requires Platform Admin. Industry plans validate isolation (JSK URJA electronics, Handloom/Textile, Professional CRM, Healthcare CRM) without touching live industry deployments.

## Feature-flag planning

Plans store flagCode, planned state, scopes, prerequisites, rollout percentage plan, rollback state. Always `executable:false` / `liveChanged:false`. Not connected to live runtime flags.

## Backup / Rollback / Migration plan architecture

Metadata only. Backup plans do not run mongodump/snapshots. Rollback plans do not restore. Migration plans do not alter indexes/collections outside Phase 23 models and never execute migrations/backfills.

## Health-check / Smoke-test / Monitoring plans

Definitions only (endpoint aliases, checklist categories, metric names). No production endpoint calls; no production monitoring service connections.

## Deployment simulation

Dry validation: PASS | PASS_WITH_WARNINGS | FAIL | INCONCLUSIVE. Does **not** run Git, npm deploy, Render, restarts, migrations, activations, or MongoDB source mutations.

## Readiness calculation

`NOT_READY` | `READY_WITH_WARNINGS` | `READY_FOR_STAGING_PLAN` | `READY_FOR_PILOT_PLAN` | `READY_FOR_FUTURE_PRODUCTION_REVIEW`.

**Never** `READY_FOR_AUTOMATIC_DEPLOYMENT`. Considers linked Phase 20/21/22 records, backup/rollback, security review settings, environment compatibility, and approvals.

## Approval workflow / Separation of duties

Review types: DEVELOPMENT, TECHNICAL, QA, SECURITY, DATABASE, BUSINESS, INDUSTRY, RELEASE_MANAGER, FINAL_PRODUCTION_PLAN. Decisions: APPROVE, REJECT, NEEDS_CHANGES, NEEDS_EVIDENCE, APPROVE_WITH_CONDITIONS, ABSTAIN.

Forged `reviewerId` / `approverId` rejected. Creator cannot be sole final production-plan approver when `requireSeparateFinalApprover` is enabled.

## Platform Admin vs Client Admin

| Capability | Platform Admin | Client Admin |
|---|---|---|
| Environment definitions | Yes | No |
| Create release packages | Yes | No |
| Cross-company rollout | Yes | No |
| View own permitted release notes/status | Yes | Limited |
| Approve platform production plans | Yes | No |
| Trigger deployment | Never (Phase 23) | Never |

## Permissions

`data_extractor.release_manager.*` — view, create, edit_draft, validate, simulate, review tracks, approve_staging/pilot/production_plan, feature_flags, backup/rollback/migration_plan, export, saved_views, audit, settings, manage.

## Security

- Reject body/query `companyId` / `tenantId`
- `assertNoSecrets` / prompt-injection rejection on notes
- Unknown/unsafe Mongo operators rejected
- Append-only audited actions
- Safe aliases only for services/databases

## Prompt-injection protection

Release notes and imported text containing “Deploy now”, “Ignore approval”, shell/Render/GitHub instructions, etc. never trigger actions. No dynamic command/shell/tool execution from text.

## Audit

Append-only `ReleaseAudit` for environment/release/plan/simulation/review/finalize/export/settings/saved-view events. Sanitized, permission-controlled, company/platform scoped.

## Settings

Safe flags under `ExtractorSettings.aiLeadIntelligence.releaseManager` (require staging/pilot/sandbox/spec/config/backup/rollback/security reviews, SoD, limits, retention). No credentials.

## Indexes

Scoped unique release numbers; company+status; simulation/approval/audit by release/company. No unrelated index drops.

## Non-execution boundary

Phase 23 must not: deploy, activate, restart, promote, commit, push, call Render, change env vars, run migrations, execute backups/restores/rollbacks, enable live feature flags, or switch runtime configuration.

Forbidden API suffixes: `/deploy`, `/execute`, `/activate`, `/promote`, `/restart`, `/rollback-now`, `/backup-now`, `/restore`, `/run-migration`, `/git-*`, `/render-deploy`, `/update-env`, `/switch-runtime`, `/enable-feature-live`.

## Known limitations

- Simulation validates plans only; it does not prove production readiness by itself.
- Staging/pilot “validation recorded” statuses are metadata markers — not live environment proofs in Phase 23.
- Feature-flag and module allocation plans are not wired to runtime.
- Export produces instructions for a future controlled phase, not an executable deploy script.

## Future Phase 24 boundary

Actual controlled deployment execution (if ever approved) belongs to a future phase. Phase 23 stops at finalized non-executable packages.

## Stop

Wait for approval before Phase 24. Do not begin production activation.
