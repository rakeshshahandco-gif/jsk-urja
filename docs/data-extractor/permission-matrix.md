# Permission Matrix (Phase 1–16 consolidated)

Prefix: `/api/v1/data-extractor`  
Authority: backend `checkPermission` / custom dual-perm gates. Frontend hide ≠ security.

## Submodules → actions

See `permissionRegistry.js` module `data_extractor`.

### High-risk write gates

| Action | Permission(s) | Also requires existing CRM/comms? |
|--------|---------------|-----------------------------------|
| Create CRM Lead (Phase 13) | `crm_enrichment.create_lead` | `crm.leads.add` (service-level) |
| Enrich existing CRM | `crm_enrichment.apply` | CRM edit perms as implemented |
| Assign Lead (Phase 14) | `sales_workflow.assign` | `crm.leads.assign` |
| Reassign | `sales_workflow.reassign` + reason | `crm.leads.assign` |
| Create Task | `sales_workflow.create_task` | `crm.leads.create_task` (+ `tasks.task_list.add` preferred) |
| Set follow-up | `sales_workflow.create_followup` | `crm.leads.edit` |
| Marketing handoff | `marketing_intelligence.prepare_handoff` | Contact detail needs `review_recipients` / `crm.leads.view` |
| Analytics export | `analytics.export` | Aggregate-only strips restricted rows |
| Company saved views | `analytics.manage_views` | — |

### Aggregate-only rule

- `analytics.view` / `analytics.executive` → totals/trends only
- Module analytics permission → drill-down
- Marketing without `review_recipients` / `crm.leads.view` → recipients stripped of email/phone/names

### Routes without `checkPermission` (by design)

| Route | Gate |
|-------|------|
| JustDial webhook | Public token |
| Sales workflow apply | Custom OR of assign/create_task/create_followup |
| Discovery agent connect/claim/heartbeat/records | `protectDiscoveryAgent` |

### Marketing / Analytics

- **No** `/send` or `/execute` routes under analytics or marketing-intelligence.