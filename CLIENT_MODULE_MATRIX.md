# Client / Module Matrix - Multi-Industry CRM

**Purpose:** Which modules are enabled per client and how to change them without code deploy.

**Last updated:** 2026-06-27

---

## 1. How module enable/disable works (existing system)

| Layer | Mechanism | Location |
|-------|-----------|----------|
| Registry | Canonical module codes | backend/src/constants/moduleRegistry.constants.js |
| Industry defaults | Template to default modules | backend/src/constants/industryModuleDefaults.js |
| Company override | enabledModules, disabledModules, moduleGuardEnabled | Company document |
| API gate | Blocks disabled module API paths | gateApiModuleByPath on /api/v1 |
| Menus / routes | Sidebar filter; redirect to /module-disabled | ModuleGuardContext, Sidebar.jsx |
| Industry sidebar | electronicsOnly / textileOnly menus | src/config/menu.config.js |
| Feature toggles | Field-level (GST tabs, KYC, OCR) | Feature Configuration admin |

### JSK URJA legacy behaviour

If moduleGuardEnabled is not true AND moduleAllocationConfigured is not true, all modules stay enabled. This preserves existing JSK full access.

Handloom uses enforceModuleGuard: true - only template modules enabled by default.

### Change modules without deploy

Settings -> Admin -> Company Module Allocation (CompanyModuleAllocationPage.jsx)

---

## 2. Client summary

| Client | Backend | MongoDB | Industry template | Module guard | Admin |
|--------|---------|---------|-------------------|--------------|-------|
| JSK URJA | jsk-urja-backend.onrender.com | jskurja-prod | ELECTRONICS_JSK | Off by default | JSK admin users |
| Handloom | handloom-crm-backend.onrender.com | handloom_crm | TEXTILE / TEXTILE_HANDLOOM | Enforced | admin@handloomcrm.com (seed) |
| Kevin | Not deployed | TBD | TBD | Enforce when configured | TBD |

---

## 3. JSK URJA modules (ELECTRONICS_JSK defaults)

| Module | Default | Notes |
|--------|---------|-------|
| crm, tasks, messenger, whatsapp | ON | |
| sales, purchase, inventory | ON | SO locking + BOM sections (recent deploy) |
| bom, pcb, smd, qc, production, rd | ON | Electronics |
| accounts, fixed_assets, gst, tds, tcs, reports | ON | Finance |
| documents, service, china_sourcing, hr, payroll, admin | ON | |
| whatsapp_bulk, email, email_bulk, data_extractor | Optional | Enable via allocation if needed |
| Textile modules | OFF | Hidden via textileOnly menu filter |

Electronics menus (PCB, SMD, BOM) shown. Textile job-work menus hidden.

---

## 4. Handloom modules (TEXTILE / TEXTILE_HANDLOOM defaults)

| Module | Default |
|--------|---------|
| fabric_purchase, than_meter_stock, dyeing, embroidery, printing, stitching | ON |
| textile_job_work, lot_tracking, multi_uom, production | ON |
| sales, purchase, inventory, accounts, fixed_assets | ON |
| gst, tds, tcs, reports, crm, tasks, messenger, whatsapp | ON |
| documents, china_sourcing, service, hr, admin | ON |
| bom, pcb, smd, qc, rd | OFF | Not in textile defaults; electronicsOnly filter hides |

Module guard enforced - disabled modules blocked on API, menus, routes, permissions.

---

## 5. Kevin (future - not in codebase)

No Kevin deployment or company record exists in repo today.

Suggested templates when onboarded:

| Template | Typical modules |
|----------|-----------------|
| TRADING | crm, tasks, sales, purchase, inventory, accounts, gst, tds, tcs, reports, documents, china_sourcing, admin |
| EXPORTER | crm, sales, purchase, inventory, accounts, gst, reports, china_sourcing, documents, admin |
| MANUFACTURING_GENERAL | crm, tasks, sales, purchase, inventory, production, accounts, gst, tds, reports, service, admin |

Onboarding checklist:

1. Create dedicated MongoDB database (never share with JSK or Handloom)
2. Create Render frontend + backend services (manual deploy only)
3. Create company with chosen industry template
4. Configure Company Module Allocation - set moduleGuardEnabled: true
5. Record URLs and DB in DEPLOYMENT_MATRIX.md

---

## 6. Industry template reference

Source: backend/src/constants/industryModuleDefaults.js

| Template code | enforceModuleGuard | Primary use |
|---------------|-------------------|-------------|
| ELECTRONICS_JSK | false | JSK URJA |
| TEXTILE / TEXTILE_HANDLOOM | true | Handloom |
| TRADING | true | Trading / distributor clients |
| EXPORTER | true | Export-focused clients |
| MANUFACTURING_GENERAL | true | General manufacturing |
| SERVICE | true | Service-only businesses |

---

## 7. When to deploy vs when to configure

| Need | Action | Deploy? |
|------|--------|---------|
| Hide/show module for one company | Company Module Allocation | No |
| Change logo, login branding | Company profile settings | No (unless theme code change) |
| Textile vs electronics menus | Industry template on company | No |
| Client-specific code (BOM, SO, UI) | Push git, deploy target Render service only | Yes |
| GST / invoice / stock logic fix | Staging test, deploy per client | Yes (shared-risk) |
| New module code in registry | Code change + staging + deploy client-by-client | Yes (shared-risk) |

---

## 8. When module disabled (moduleGuardEnabled: true)

Blocked on:

- Sidebar menu items
- Frontend routes (redirect to /module-disabled)
- API endpoints (registry apiPrefixes)
- Permissions UI for that module
- Module-scoped reports and dashboards

---

## 9. Maintenance rules

- Adding a new module: update moduleRegistry.constants.js, staging, deploy client-by-client
- Adding a new client: add rows to this file and DEPLOYMENT_MATRIX.md; never reuse JSK/Handloom DB URIs
- JSK URJA: leave moduleGuardEnabled off until deliberately restricting modules
- Handloom: keep enforceModuleGuard true; verify textile modules only

---

## 10. Related documents

- DEPLOYMENT_MATRIX.md - Render services, DBs, deploy rules
- CRM_ARCHITECTURE.md - system architecture
- backend/src/constants/moduleRegistry.constants.js - full module list with API prefixes and menu IDs
