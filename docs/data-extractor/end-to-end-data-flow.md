# End-to-End Data Flow

```
Discovery → Normalization → Entity Resolution → Duplicate Review
→ Industry Classification → Lead Relevance → Product Recommendation
→ Contact Intelligence → Company Intelligence → Lead Scoring
→ Similar Company / Market Intelligence
→ CRM Enrichment Draft → CRM Lead create OR existing CRM link (Phase 13)
→ Sales Workflow Draft → Assignment / Task / Follow-up (Phase 14)
→ Executive Analytics (Phase 15, read-only)
→ Marketing Campaign Draft → Non-executable Handoff (Phase 16)
```

## Transition rules validated in Phase 16.5

| Transition | Must preserve | Must block |
|------------|---------------|------------|
| Discovery → later | companyId, source provenance | foreign company IDs |
| Duplicate → canonical | single entity for conversion | double CRM Lead |
| Rejected/irrelevant → CRM/Sales/Marketing | — | silent progression |
| Lock → regenerate | history | silent overwrite |
| Phase 13 Draft → applied | dual CRM permission | counting Draft as Lead |
| Phase 14 Draft → applied | dual CRM permission | counting Draft as Task/assignment |
| Phase 15 KPI | source models | market share language |
| Phase 16 audience | real ExtractedLead/CRM refs | Phase 15 approximate totals as recipients |
| Handoff | executable:false | Email/WhatsApp/SMTP/Puppeteer calls |