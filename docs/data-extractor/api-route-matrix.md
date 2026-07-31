# API Route Matrix (summary)

Mount: `routes/v1/index.js` → `/data-extractor`  
File: `backend/src/routes/v1/dataExtractor.routes.js` (~277 route entries)

## Feature prefixes

| Feature | Prefix |
|---------|--------|
| Extractor core | `/settings`, `/jobs/*`, `/leads/*`, `/sources`, … |
| Discovery | `/ai-lead-intelligence/discovery*` |
| Classifications | `/ai-lead-intelligence/classifications*` |
| Relevance | `/ai-lead-intelligence/relevance*` |
| Product | `/ai-lead-intelligence/recommendations*` |
| Contacts | `/ai-lead-intelligence/contacts*` |
| Profiles | `/ai-lead-intelligence/profiles*` |
| Scores | `/ai-lead-intelligence/scores*` |
| Similar/Market | `/ai-lead-intelligence/similar*`, `/market*` |
| CRM Enrichment | `/ai-lead-intelligence/crm-enrichment*` |
| Sales Workflow | `/ai-lead-intelligence/sales-workflow*` |
| Analytics | `/ai-lead-intelligence/analytics/*` |
| Marketing | `/ai-lead-intelligence/marketing-intelligence/*` |

## Phase 16.5 contract checks

- Frontend `dataExtractorApi.js` Phase 15–16 helpers align with above prefixes.
- Marketing helpers: list/create/build/recipients/message/review/final-approve/handoff/export/settings only.
- Analytics helpers: executive/funnel/sections/refresh/export/saved-views/settings only.
- Observed local: unauthenticated marketing list → HTTP 400 (auth/company middleware), not 404.