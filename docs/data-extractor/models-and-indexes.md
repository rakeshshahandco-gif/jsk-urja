# Models and Indexes (Phase 16.5 review)

## Useful existing compounds

- ExtractedLead: `{companyId, status, createdAt}`, `{companyId, normalizedDomain}`
- Most AI result models: `{companyId, status, createdAt|-updatedAt}`
- AiLeadScore: `{companyId, finalScore, updatedAt}`
- Unique keys: `{companyId, recordKey}` / `{companyId, idempotencyKey}` on drafts
- Blacklists: unique `(companyId, email|mobile)`
- CommunicationHistory: `{companyId, recipientAddress}`, `{companyId, channel, sentAt}`

## Query patterns audited

| Pattern | Risk | Action in 16.5 |
|---------|------|----------------|
| List by company+status+date | Covered on most Phase 6–12 models | None (indexes exist) |
| Marketing recipients by campaign | `{companyId, campaignDraftId, recipientKey}` unique | None |
| Analytics aggregations | Always match companyId first | Document only |
| Batch job cursor | company + status | Document; heartbeat sparse except DiscoveryAgentJob |
| findById then company check (CRM adapters) | Acceptable if post-check throws | Documented; no mass rewrite |
| Lead.updateOne({_id}) company fixup (crmAdapter) | Post-create | Deferred MEDIUM — do not broaden |

## Indexes added in Phase 16.5

**None.** No production-style index rebuilds; existing coverage sufficient for local crm_test validation.