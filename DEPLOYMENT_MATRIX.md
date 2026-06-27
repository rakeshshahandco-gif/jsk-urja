# Deployment Matrix - Multi-Client CRM/ERP

**Purpose:** Client-wise deployment separation. One production deploy must not affect all clients unless the change is shared core and each client is deployed individually after staging.

**Last updated:** 2026-06-27  
**Repo:** rakeshshahandco-gif/jsk-urja  
**Default branch:** development

---

## 1. Current deployment structure (as found in code)

### Architecture summary

| Layer | How it works today |
|-------|-------------------|
| Codebase | Single monorepo - one React frontend + one Node backend |
| Client separation | Separate Render services + separate MongoDB databases |
| Multi-company within JSK | Single DB (jskurja-prod), scoped by companyId |
| Module on/off | Company-level config in MongoDB - no redeploy required |
| Industry menus | Sidebar filters by industry template - runtime, not deploy |

### Render services

| Client | Frontend | Frontend URL | Backend | Backend URL | Build command | Start |
|--------|----------|--------------|---------|---------------|---------------|-------|
| JSK URJA | Combined (jsk-urja-backend) | https://jsk-urja-backend.onrender.com | jsk-urja-backend | https://jsk-urja-backend.onrender.com | cd backend && npm install | node backend/src/index.js |
| JSK legacy | Redirect only | https://jsk-urja.onrender.com | - | - | - | - |
| Handloom | handloom-crm-frontend | https://handloom-crm-frontend.onrender.com | handloom-crm-backend | https://handloom-crm-backend.onrender.com | FE: npm install --include=dev && npm run build; BE: cd backend && npm install | node backend/src/index.js |
| Kevin | Not deployed | - | Not deployed | - | - | - |

Only jsk-urja-backend is defined in render.yaml. Handloom services are configured manually on Render.

### MongoDB databases

| Client | Database name | Connection |
|--------|---------------|------------|
| JSK URJA (prod) | jskurja-prod | MONGODB_URL on jsk-urja-backend |
| JSK dev/staging | jskurja-dev | Local .env / staging Render env |
| Handloom | handloom_crm (exact name) | Handloom backend MONGODB_URL; seed uses HANDLOOM_MONGODB_URL |
| Kevin | TBD | TBD |

### Environment / config

| Client | Production config | Local dev | Routing |
|--------|-------------------|-----------|---------|
| JSK URJA | Render env on jsk-urja-backend | backend/.env, npm run dev:safe | src/config/env.js same-origin API |
| Handloom | Separate Render env per service | Same repo | Frontend calls Handloom backend API |

### Git branches

| Branch | Use |
|--------|-----|
| development | JSK URJA primary deploy |
| staging | Pre-production testing |
| origin/jay/workspace, origin/raj/workspace | Dev only - do not deploy to production |

No separate handloom or kevin branch. Client separation = Render service + env + DB.

### Mobile (JSK only)

- API: https://jsk-urja-backend.onrender.com/api/v1
- WebView: https://jsk-urja.onrender.com

---

## 2. Deployment status tracker

Update after each production deploy.

| Client | Last live commit | Deploy date | Frontend | Backend | Notes |
|--------|------------------|-------------|----------|---------|-------|
| JSK URJA | f2ac41a0 | 2026-06-27 | dist/assets/index-TZF8hFwB.js when dist committed | Check /api/v1/health | SO lock + BOM sections |
| Handloom | Record after deploy | - | Static frontend service | Handloom backend health | Do not deploy unless scoped |
| Kevin | Not deployed | - | - | - | Future client |

---

## 3. Deployment principles

### Rule A - Client-specific change

| Change type | Deploy target |
|-------------|---------------|
| JSK-only UI / logo / workflow | jsk-urja-backend only |
| Handloom-only textile workflow | handloom-crm-frontend + handloom-crm-backend |
| Module enable/disable for one company | No deploy - Admin Company Module Allocation |
| Shared core (GST, stock, invoice, PDF, permissions) | Staging then deploy one client at a time |

### Rule B - JSK URJA build command

```
cd backend && npm install
```

Uses committed dist/ from git. Do not run npm run build on Render unless dist/ was rebuilt and committed first.

### Rule C - Handloom build commands

| Service | Build command |
|---------|---------------|
| handloom-crm-frontend | npm install --include=dev && npm run build |
| handloom-crm-backend | cd backend && npm install |

### Rule D - Auto-deploy

| Service | Recommendation |
|---------|----------------|
| JSK URJA | Manual deploy or hook scoped to jsk-urja-backend only |
| Handloom | Auto-deploy OFF on shared branch |
| Future clients | Separate services; manual deploy per client |

### Rule E - Shared-risk changes

Mark as shared-risk if touching: GST/accounting/stock services, invoice/PDF, permissions, series, global search, sidebar core, moduleRegistry.constants.js.

Process: local test, staging, JSK deploy, verify, Handloom deploy, verify.

---

## 4. Deploy decision flow

```
Client-only change?  -> Deploy that client Render service(s) only
Module on/off?       -> Company Module Allocation (no deploy)
Shared core?         -> Staging then deploy client-by-client
```

---

## 5. Pre-deploy checklist

- Scope: client name + files changed
- Correct Render service (not all clients)
- Build command from section 3
- Clear build cache if frontend bundle changed
- MongoDB URI unchanged unless intentional
- /api/v1/health OK after deploy
- Update section 2 status tracker

---

## 6. Key code references

| Concern | Location |
|---------|----------|
| Module registry | backend/src/constants/moduleRegistry.constants.js |
| Industry defaults | backend/src/constants/industryModuleDefaults.js |
| Module guard | backend/src/services/moduleGuard.service.js |
| Admin module UI | src/features/settings/CompanyModuleAllocationPage.jsx |
| Hostname routing | src/config/env.js |
| Handloom redirect | backend/src/app.js |
| Company deployment metadata | Company.deploymentConfig in company model |
| Render blueprint | render.yaml |

---

## 7. Do not disturb without explicit approval

- Live CRM data (no bulk delete/reset/migrate on production)
- GST, accounting, stock, invoice series, reports, permissions
- PDF/print formats, WhatsApp/email workflows
- Handloom unless Handloom-scoped; JSK unless JSK-scoped

See CURSOR_SAFE_CHANGE_RULES.md and .cursor/rules/safe-change-guard.mdc.

---

## 8. Related documents

- CLIENT_MODULE_MATRIX.md - modules per client
- CRM_ARCHITECTURE.md - system architecture
