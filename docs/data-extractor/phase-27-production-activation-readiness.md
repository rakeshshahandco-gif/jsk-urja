# Phase 27 — Production Activation Readiness Orchestrator

## 1. Purpose

Phase 27 prepares and verifies readiness for a **separately authorized manual production deployment** performed by a human outside Cursor.

It validates release lineage, certification, pilot closure, operational review, gates, plans, checklists and handover documentation.

It may recommend `READY_FOR_MANUAL_PRODUCTION_DEPLOYMENT`. That status is a **recommendation only**.

## 2. Scope

Isolated inside:

Data Extractor → AI Lead Intelligence → Production Activation Readiness

Workspace: `D:\JSK-DATA-EXTRACTOR-DEV`  
Branch: `feature/data-extractor-serpapi-places`  
Database: `mongodb://127.0.0.1:27017/crm_test` only

## 3. Safety boundaries

Phase 27 does **not**:

- Deploy frontend or backend
- Activate production
- Access Render
- Access production MongoDB
- Commit / push / merge / rebase
- Execute backup, restore, rollback or migration
- Enable live feature flags or company modules
- Send Email or WhatsApp
- Call external providers
- Mutate live CRM accounting/GST/TDS/inventory/sales data

Mandatory defaults:

- `simulationOnly = true`
- `manualDeploymentOnly = true`
- `productionExecutionAllowed = false`
- `deploymentExecuted = false`
- `productionActivated = false`
- `renderActionExecuted = false`
- `gitCommitExecuted = false`
- `gitPushExecuted = false`
- `rollbackExecuted = false`
- `backupExecuted = false`
- `restoreExecuted = false`
- `migrationExecuted = false`

API attempts to set unsafe fields to `true` are rejected.

## 4–5. Workspace and baseline

Approved Phase 26 baseline:

- Full Data Extractor suite: 401/401
- Phase 26 tests: 10/10
- Frontend build: Passing
- Backend health: OK
- Protected Phase 14 fingerprints: Unchanged
- No deployment / activation / Render / production DB / commit / push

## 6–7. Architecture and statuses

Base API: `/api/v1/data-extractor/ai-lead-intelligence/activation-readiness`

Allowed statuses include `DRAFT` … `READY_FOR_MANUAL_PRODUCTION_DEPLOYMENT` … `ARCHIVED`.

Forbidden statuses include `DEPLOYED`, `PRODUCTION_ACTIVATED`, `LIVE`, `DEPLOY_NOW`, `AUTO_DEPLOY`, and other execution outcomes.

## 8–9. Models

Primary models:

- `ActivationReadinessProgram`
- `ArAudit`
- `ArSavedView`
- `ArSetting`

Reviews, gates, checklists and handover are stored as Mixed subdocuments on the program (references to Phase 23–26 records preferred over duplication).

## 10–11. Permissions and APIs

Permissions: `data_extractor.activation_readiness.*` (view/create/update/manage/validate/review/final_review/release_lineage/integrity_review/defect_gate/risk_gate/approvals/environment_review/maintenance_review/monitoring_review/incident_review/backup_review/restore_review/rollback_review/dr_review/communication_review/customer_impact/hypercare/smoke_test_plan/manual_checklist/handover/exceptions/recommendation/audit/export/saved_views/settings).

No endpoints named or functioning as deploy / render-deploy / activate-production / commit / push / rollback-now / backup-now / restore-now / migrate.

## 12–14. Lineage, integrity, dependencies

Validates Phase 23 → 24 → 25 → 26 → 27 chain with company/tenant/industry scope, checksum and superseded-release checks.

Missing phase approvals cannot be overridden.

## 15–27. Gates, reviews, checklist, handover, recommendation

Final readiness gate aggregates mandatory categories (integrity, lineage, certification, pilot, operations, defects, risks, approvals, environment, maintenance, monitoring, incident, escalation, backup, restore, rollback, DR, BC, communication, customer impact, hypercare, smoke, checklist, handover).

Recommendation warning (required):

> Manual deployment has not been performed. Separate human authorization and execution outside Cursor are required.

## 28–33. Isolation, audit, views, export, settings

Company / tenant / industry isolation enforced. Body `companyId`/`tenantId` rejected.

Audit is append-only. Saved views are user+company scoped. Exports exclude secrets and executable scripts.

No setting may enable production execution.

## 34. UI

Route: Data Extractor → AI Lead Intelligence → Production Activation Readiness

Permanent warning: planning and readiness only; no deploy/activate buttons.

## 35. Tests

`backend/test/dataExtractor/activationReadiness.phase27.test.js`

Covers safety, auth, isolation, lineage, integrity, defects/risks, approvals, operational reviews, smoke/checklist/handover, final recommendation non-execution, audit/export/views.

## 36. Known limitations

- Local readiness validation is not production proof
- No production service/database/Render access
- No deployment or production activation
- No production smoke test
- No backup/restore/rollback/migration
- No Email/WhatsApp/external providers
- `READY_FOR_MANUAL_PRODUCTION_DEPLOYMENT` is only a recommendation
- Manual human deployment outside Cursor remains separately required

## 37. Confirmation

Phase 27 prepares readiness for a separately authorized manual production deployment.

It does not perform deployment.

It does not activate production.

It does not perform Git, Render, backup, restore, rollback or migration actions.