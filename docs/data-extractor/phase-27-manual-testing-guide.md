# Phase 27 Manual Testing Guide (Localhost Only)

**Audience:** Non-technical owner / staff  
**Workspace:** `D:\JSK-DATA-EXTRACTOR-DEV`  
**Branch:** `feature/data-extractor-serpapi-places`  
**Database:** `mongodb://127.0.0.1:27017/crm_test` only  
**Frontend:** `http://localhost:4000`  
**Backend health:** `http://localhost:5000/api/v1/health`

**Safety:** Local testing only. Do not deploy, commit, push, access Render, access production MongoDB, run backup/restore/rollback/migration, send Email/WhatsApp, or start Phase 28.

**UI honesty:** Phases 23-27 screens support overview/create/list/audit. Many extra tabs show planning text + selected JSON. Full Phase 27 gate actions are in the backend API and automated tests. Where there is no button, this guide says **Not currently available in the UI**.

---

## A. How to start the CRM locally

1. Cursor → File → Open Folder → `D:\JSK-DATA-EXTRACTOR-DEV`
2. Terminal → New Terminal (PowerShell)
3. Confirm folder: `Get-Location` → must show `D:\JSK-DATA-EXTRACTOR-DEV`
4. Confirm branch: `git rev-parse --abbrev-ref HEAD` → `feature/data-extractor-serpapi-places`
5. Status only: `git status` → dirty tree OK; never clean/reset/stash/discard
6. MongoDB: `Test-NetConnection 127.0.0.1 -Port 27017` → TcpTestSucceeded True
7. Port 5000: `Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue`
8. If PID exists: `Get-Process -Id <PID>` — reuse it; do not start a second backend
9. Avoid duplicates: one backend only (EADDRINUSE if two)
10. Start backend:
```powershell
Set-Location D:\JSK-DATA-EXTRACTOR-DEV\backend
npm run dev
```
11. Start frontend (second terminal):
```powershell
Set-Location D:\JSK-DATA-EXTRACTOR-DEV
npm run build
npm run dev
```
(`npm run dev` serves port 4000 from dist. Optional if ports free: `npm run dev:safe`)
12. Open `http://localhost:4000`
13. Health: `Invoke-RestMethod http://127.0.0.1:5000/api/v1/health`
14. Success: status OK
15. Frontend fail: check port 4000, rebuild, try 127.0.0.1:4000, Ctrl+F5
16. EADDRINUSE: reuse/stop only the known local Node on 5000, then start one backend
17. Mongo fail: start local Mongo; keep crm_test; never production URI
18. Login fail: health OK? Ask admin for local crm_test user + permissions; enable Data Extractor module. Passwords are not in this guide.

---

## B. Which URL to open

| Purpose | URL |
|--------|-----|
| Login | http://localhost:4000/login |
| Data Extractor | http://localhost:4000/data-extractor |
| Phase 27 | http://localhost:4000/data-extractor/ai-lead-intelligence/activation-readiness |
| Health | http://localhost:5000/api/v1/health |

---

## C. How to log in

1. Open `/login`
2. Use administrator-provided **local** user (no passwords published here)
3. Select local test **Company**
4. Select **Financial Year** if asked
5. Login

Admin once: Company Module Allocation → Data Extractor; then Data Extractor → Settings → enable → Save → re-login if menu missing.

Permissions: `data_extractor.extractor.view` for DE; Phase 27 needs `data_extractor.activation_readiness.view` (+ create/final_review/audit as needed). View-only sees list; no permission sees denial message; other company must be invisible.

---

## D. Where Data Extractor is located

**Sidebar:** Data Extractor → Discovery, Keyword Search, Manual URL, Import, History, Extracted Leads, AI Lead Intelligence, Scoring, Settings, etc.

**Horizontal tabs** (inside DE): AI Lead Intelligence, Classifications, Lead Relevance, Product Recommendations, Contact/Company Intelligence, Lead Scoring, Sales Workflow, Learning Intelligence (P19), Improvement Approval (P20), Configuration Manager (P21), Sandbox Evaluation (P22), Release Manager (P23), Readiness Certification (P24), Pilot & UAT Center (P25), Enterprise Operations (P26), **Production Activation Readiness (P27)**, Settings.

P19–P27 may be missing from sidebar; use horizontal tabs or direct URL. Hidden if permission/module off.

---

## E. Basic Data Extractor test

Sample: LED Lighting Manufacturer · Mumbai, Maharashtra · LED driver / smart lighting / lighting OEM.

If SerpAPI missing, Keyword Search shows red banner — use Manual URL / Excel.

**Manual URL:** tab Manual URL → paste public URLs → Run Extract → Preview toast. Pass: preview opens. Must not auto-create Customer/Invoice.

**Keyword Search (if configured):** Keyword* `LED driver manufacturer`, City Mumbai, State Maharashtra, Country India, max≤10 → submit → Preview.

Then Save Draft → Extracted Leads. Evidence: preview + leads screenshots.

---

## F. AI lead scoring

Tab **Lead Scoring**. Use filters / sample score if permitted.

- TEST A high-quality (website + strong fit): higher score/priority
- TEST B incomplete (no phone/email/website): lower score
- TEST C duplicate: section G

Pass: scores visible; no auto CRM create. Evidence: `10-lead-quality-score.png`

---

## G. Duplicate detection

**Duplicate Review** → open/resolved/ignored → side-by-side → Keep A/B / merge / separate / link / ignore. Pass: manual resolve. Fail: silent auto-merge. Evidence: `11-duplicate-warning.png`

---

## H. CRM conversion safety

**Sales Workflow:** CRM Lead ID → Prepare recommendation / Recommend only; approval flags; Export if allowed. Banner: no assignment without approval; no Email/WhatsApp.

Confirm no auto Customer/Supplier/accounting/GST/stock/invoice/quotation/SO/production/Email/WhatsApp. Tag test records `P27-MANUAL-TEST-`. Do not mass-delete.

---

## I. Phase 23 Release Manager

Tabs: dashboard, wizard, environments, detail, audit.  
wizard → REL-MANUAL-P27-001 / name / LOCALHOST→TESTING|STAGING → Create Draft Release → Validate Plan / Run Simulation. Pass: listed; **no Deploy/Activate/Push**. Evidence: `13-phase23-release.png`

---

## J. Phase 24 Readiness Certification

wizard → number/name + releasePackageId + STAGING → Create → Open → Validate / Run Local Checks. Confirm executable=false, deploymentAuthorized=false, productionApproved=false. Bad ID = fail toast. Evidence: `14-phase24-certification.png`

---

## K. Phase 25 Pilot & UAT

Working UI: Overview, Programs (Record plan, Open, Submit for review), Monitoring JSON, Audit. Other tabs = planning text (**Not currently available in the UI** for full forms). Confirm simulationOnly=true, productionActivated=false. Evidence: `15-phase25-pilot.png`

---

## L. Phase 26 Enterprise Operations

Working UI: Overview, Programs (Record plan, Submit for review, Recommend Phase 27 review), Audit. Other tabs planning text. Keep PRODUCTION_PLANNING_ONLY. Evidence: `16-phase26-operations.png`

---

## M. Phase 27 Production Activation Readiness

URL: `/data-extractor/ai-lead-intelligence/activation-readiness`  
Must see yellow banner: planning/readiness only; deployment/activation not available.

**32 tabs exist.** Working buttons: Create readiness program, Select, Validate lineage, View recommendation, Audit list. Create fields: programCode, programName, releasePackageId, readinessCertificationId, pilotProgramId, operationsProgramId.

Most other tabs after Select: JSON + “via API” — gate forms **Not currently available in the UI**.  
Safety: no Deploy/Go Live/Activate/Render/Commit/Push/Backup/Restore/Migration buttons; all *Executed and productionActivated false.

---

## N. Passing scenario (recommendation only)

Name: JSK Data Extractor Manual Production Readiness Test · Version DE-PILOT-1.0.0 · manual planning only · simulationOnly yes · productionExecutionAllowed no.

UI: P23→P24→P25→P26→P27 Create → Validate lineage → View recommendation.  
Full READY_FOR_MANUAL_PRODUCTION_DEPLOYMENT with all gates: use automated Phase 27 tests or localhost API (full UI path not available). Recommendation must warn manual deployment not performed; all execution flags false. Evidence: `30-final-recommendation.png`

---

## O. Blocking scenarios

1 Missing P26 · 2 Open critical defect · 3 Open critical risk · 4 Checksum mismatch · 5 Expired cert · 6–9 Missing rollback/backup/restore/monitoring · 10 Missing final approval · 11 Self final-approval · 12 Body companyId/tenantId · 13 Client Admin other company · 14–15 Unsafe execution fields true → all must block/reject. Prefer UI; else API/tests. Evidence: `31-blocked-negative-scenario.png`

---

## P. Permission matrix

View-only: view yes, create/final no. Manager: create if granted. Final reviewer: final yes (not own if SoD). Client Admin: own company only, no platform-wide. Platform Admin: full within rules. Other company: always denied for Client Admin. Evidence: `32-permission-denied-scenario.png`

---

## Q. Isolation

Create in Company A → switch Company B → hidden → direct ID fails. Repeat for views/export/audit when used. Local companies only. Evidence: `33-company-isolation.png`

---

## R. Export, saved views, audit

Phase 27 Audit tab works (append-only). Saved Views/Export buttons largely **Not currently available in the UI** (APIs exist; must exclude secrets). Evidence: 34–36.

---

## S. Error testing

Backend/Mongo down → error toast. Unauthorized → permission message. Missing fields → validation fail. Empty list → “No readiness programs yet.” Refresh/back → no deploy. Session timeout → login.

---

## T. Automated commands

```powershell
Set-Location D:\JSK-DATA-EXTRACTOR-DEV\backend
$env:MONGODB_URL='mongodb://127.0.0.1:27017/crm_test'
node --test --test-concurrency=1 test/dataExtractor/activationReadiness.phase27.test.js
# expect 10/10
node --test --test-concurrency=1 test/dataExtractor/enterpriseOperations.phase26.test.js
node --test --test-concurrency=1 test/dataExtractor/pilotRollout.phase25.test.js
node --test --test-concurrency=1 test/dataExtractor/*.test.js
# expect 411/411
Set-Location D:\JSK-DATA-EXTRACTOR-DEV
npm run build
Invoke-RestMethod http://127.0.0.1:5000/api/v1/health
Get-FileHash backend\src\services\dataExtractor\salesWorkflow\eligibility.service.js -Algorithm SHA256
Get-FileHash backend\src\services\dataExtractor\salesWorkflow\crmAdapter.service.js -Algorithm SHA256
```
Fingerprints must match:  
eligibility `66B7BA1E4F6E914714076ACC23968EE43559E456C523A27449221E6A61735F96`  
crmAdapter `08D6BB214E943BA67DC19808BFAB4875549A99D256C190492609560A33DE8E55`

---

## U. Screenshot checklist

01-branch-status.png · 02-git-dirty-preserved.png · 03-backend-health.png · 04-login-page.png · 05-data-extractor-menu.png · 06-ai-lead-intelligence-tabs.png · 07-basic-extraction-or-manual-url.png · 08-search-or-preview-results.png · 09-extracted-leads.png · 10-lead-quality-score.png · 11-duplicate-warning.png · 12-crm-conversion-sales-workflow.png · 13-phase23-release.png · 14-phase24-certification.png · 15-phase25-pilot.png · 16-phase26-operations.png · 17-phase27-readiness-program.png · 18-release-lineage.png · 19-package-integrity-or-json.png · 20-phase-dependency-or-json.png · 21-defect-gate-or-blocked.png · 22-risk-gate-or-blocked.png · 23-approval-or-json.png · 24-monitoring-or-json.png · 25-backup-review-or-json.png · 26-restore-review-or-json.png · 27-rollback-review-or-json.png · 28-smoke-test-plan-or-json.png · 29-manual-checklist-or-json.png · 30-handover-or-recommendation.png · 31-blocked-negative-scenario.png · 32-permission-denied-scenario.png · 33-company-isolation.png · 34-saved-view-or-placeholder.png · 35-export-or-api-note.png · 36-audit-history.png · 37-full-suite-411.png · 38-frontend-build.png · 39-final-git-status.png · 40-protected-fingerprints.png  

Folder suggestion: `_phase_tmp/p27/manual-screenshots/`

---

## V. Staff sheet (45 cases)

Fill: Actual | Pass/Fail | Screenshot | Tester | Date | Remarks | Defect ID

| No. | Module | Case | Expected |
|-----|--------|------|----------|
| T01 | Startup | Folder | D:\JSK-DATA-EXTRACTOR-DEV |
| T02 | Startup | Branch | feature/data-extractor-serpapi-places |
| T03 | Startup | Dirty tree | Preserved |
| T04 | Startup | Mongo | 27017 up |
| T05 | Startup | Backend | One PID :5000 |
| T06 | Startup | Health | OK |
| T07 | Startup | Frontend | :4000 |
| T08 | Auth | Login | Success |
| T09 | Auth | Company | Local test |
| T10 | DE | Menu | Visible |
| T11 | DE | Enabled | Not blocked |
| T12 | DE | Manual URL | Preview |
| T13 | DE | Keyword/banner | Clear |
| T14 | DE | Draft | Extracted Leads |
| T15 | DE | No auto CRM | No surprise customer |
| T16 | Scoring | Open | Loads |
| T17 | Scoring | High quality | Higher score |
| T18 | Scoring | Incomplete | Lower score |
| T19 | Duplicate | Resolve | Manual toast |
| T20 | Sales WF | Prepare | Draft; no email |
| T21 | P19 | Feedback | No auto train |
| T22 | P20 | Case | Non-executable |
| T23 | P21 | Draft | No runtime activate |
| T24 | P22 | Sandbox | Advisory |
| T25 | P23 | Release | No Deploy |
| T26 | P23 | Validate | Plan only |
| T27 | P24 | Cert | executable=false |
| T28 | P24 | Checks | Local only |
| T29 | P25 | Pilot | simulationOnly |
| T30 | P26 | Ops | Planning only |
| T31 | P26 | P27 rec | Metadata only |
| T32 | P27 | Open | Yellow warning |
| T33 | P27 | Create | Listed |
| T34 | P27 | Lineage | PASS/OK |
| T35 | P27 | Recommend | Status shown |
| T36 | P27 | No deploy btn | None |
| T37 | P27 | Flags | All false |
| T38 | P27 | Perm deny | Message |
| T39 | P27 | Isolation | Hidden |
| T40 | P27 | Audit | Entries |
| T41 | Auto | P27 tests | 10/10 |
| T42 | Auto | Full suite | 411/411 |
| T43 | Auto | Build | Pass |
| T44 | Auto | Fingerprints | Match |
| T45 | Git | Status | No commit/push |

---

## W. Defect template

Defect ID / Date / Tester / Company (local) / Role / Module / Screen / Test case / Expected / Actual / Steps / Severity Critical|High|Medium|Low / Screenshot / Console / Network / Status / Assigned / Retest  

Critical: cross-company visible or production action possible. High: READY with open critical defect/risk. Medium: filter/export wrong. Low: wording.

---

## X. Final Pass/Fail

PASS only if positives pass; blockers block; no isolation leak; no production action; unsafe flags rejected; audit OK; P27 10/10; suite 411/411; build pass; health OK; fingerprints unchanged; git uncommitted/unpushed; no Phase 28. FAIL if Critical/High safety defect open.

---

## STOP

Documentation only. Do not deploy, commit, push, or start Phase 28.