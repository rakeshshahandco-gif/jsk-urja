# Phase 25 — Controlled Staging, Pilot Rollout and User Acceptance Testing Center

## 1. Purpose
Enterprise center for planning, simulating, reviewing and documenting staging readiness, pilot rollout, UAT, defects, risks, feedback, rollback readiness and Phase 26 **recommendation** only.

## 2. Scope
Isolated under Data Extractor → AI Lead Intelligence → Pilot & UAT Center.
API base: `/api/v1/data-extractor/ai-lead-intelligence/pilot-rollout`

## 3. Safety boundaries
Phase 25 does **not** deploy, activate production, execute rollback/backup/restore/migration, touch Render/Git, send Email/WhatsApp, activate live feature flags, or mutate CRM source data outside local test fixtures.
Forced defaults: `simulationOnly=true`, `productionExecutionAllowed=false`, `deploymentExecuted=false`, `productionActivated=false`.
Forbidden outcomes: PRODUCTION_ACTIVATED, DEPLOY_NOW, AUTO_DEPLOY, PRODUCTION_READY (as authorization), AUTOMATIC_APPROVAL, LIVE_ROLLOUT_COMPLETE, ROLLBACK_EXECUTED.

## 4. Environment
- Workspace: `D:\JSK-DATA-EXTRACTOR-DEV`
- Branch: `feature/data-extractor-serpapi-places`
- Database: `mongodb://127.0.0.1:27017/crm_test` only
- Allowed envs: LOCAL, DEVELOPMENT, TESTING, STAGING_SIMULATION

## 5. Preflight result
- Baseline full DE suite: 381/381 (serial `--test-concurrency=1`; parallel run had Phase 21 lead-count race flake)
- Phase 24 approved baseline used
- Protected Phase 14 fingerprints verified before implementation

## 6. Architecture
Services under `backend/src/services/dataExtractor/pilotRollout/`.
Thin controller `pilotRollout.controller.js`. Routes registered in `dataExtractor.routes.js`.

## 7. Models
PilotProgram, StagingSimulation, PilotCompanyPlan, PilotCohort, UatPlan, UatTestCase, UatCycle, UatExecution, PilotDefect, PilotFeedback, PilotRisk, PilotException, PilotRollbackPlan, PilotPauseRequest, PilotAudit, PilotSavedView, PilotSetting.
Module/feature-flag plans stored as Mixed arrays on PilotProgram (planning metadata only).

## 8. API routes
Programs, staging-simulations (+ run-local-checks), companies, industries, cohorts, module-plans, feature-flag-plans, uat/*, defects (+ retest/close/accept-risk), feedback, metrics, health-dashboard, risks, exceptions, pause/suspension reviews, rollback-plans (+ simulate), success-criteria, closure-reviews, recommendations, settings, controls, saved-views, audit, export.
No deploy / activate-production / rollback-now / backup / restore / migration / git / render endpoints.

## 9. Permissions
`data_extractor.pilot.*` including view/create/update/manage/review/final_review, company/industry/cohort/module/feature plans, uat.*, defect.*, risk.*, accept_risk, feedback.*, evidence.*, pause/suspension_review, rollback_plan, settings, audit, export, saved_views.

## 10–13. Lifecycles
Pilot lifecycle uses ALLOWED_TRANSITIONS (DRAFT → … → READY_FOR_PHASE_26_REVIEW / REJECTED / ARCHIVED).
UAT: plan → cases → cycles → executions (append-only history) → evidence metadata refs.
Defects: NEW → … → CLOSED / ACCEPTED_RISK (reason+expiry; Client Admin cannot accept platform critical).
Risks: scored likelihood×impact; exceptions require expiry; cannot bypass critical isolation.

## 14–15. Isolation
Company-scoped queries from auth context; body companyId/tenantId rejected.
Industry scope is planning metadata only; does not alter live industry config.
Known planning refs: JSK URJA, Handloom, Professional, Healthcare.

## 16–17. Feature-flag / module planning
Proposed states only (OFF, INTERNAL_ONLY, SELECTED_*, PILOT_PERCENTAGE, HOLD, REJECT). Forbidden: GLOBAL_PRODUCTION_ON, AUTO_ENABLE, PRODUCTION_ENABLE.
Module actions: PROPOSE_ENABLE/DISABLE, KEEP_CURRENT, DEFER, REJECT, NEEDS_REVIEW — never executed.

## 18–19. Staging simulation & rollback readiness
Local metadata/orchestration only. Rollback readiness statuses never include ROLLBACK_EXECUTED / PRODUCTION_RESTORED.

## 20–22. Criteria, closure, Phase 26 recommendation
Transparent success/failure criteria evaluation.
READY_FOR_PHASE_26_REVIEW is recommendation only (`phase26Authorized=false`, `phase26Started=false`).
Does not authorize Phase 26 execution or production.

## 23. Tests
`backend/test/dataExtractor/pilotRollout.phase25.test.js` — 10 condensed suites covering A–N mandatory categories.

## 24. Known limitations
- Local simulation ≠ staging proof
- Local UAT ≠ production proof
- Local performance may differ from hosted
- No production traffic/DB/deployment/rollback/backup/restore tested
- No Email/WhatsApp/Render/runtime feature-flag activation
- Successful Phase 25 still requires separate Phase 26 authorization

## 25–26. Files
Created: Phase 25 models, pilotRollout services, controller, UI page, tests, this doc.
Modified (minimal): dataExtractor.routes.js, permissionRegistry.js, paths.js, App.jsx, DataExtractorLayout.jsx, dataExtractorApi.js.

## 27. Protected fingerprints
eligibility.service.js / crmAdapter.service.js — must remain unchanged (verified in tests).

## 28–29. Confirmation
No deployment. No commit/push. Dirty working tree preserved.

## 30. Final statement
Phase 25 is a non-deploying pilot and UAT management center. It only records, simulates, validates and recommends.