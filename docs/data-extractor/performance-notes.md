# Performance Notes (local crm_test — Phase 16.5)

Observed on localhost against `mongodb://127.0.0.1:27017/crm_test` (small dataset in the measured company scope):

| Endpoint / query | Observed ms | Notes |
|------------------|------------:|-------|
| ExtractedLead list limit 50 | 62 | company-scoped find+sort |
| ExtractedLead countDocuments | 39 | company-scoped |
| Executive Analytics summary | 126 | aggregate service, read-only |

These are **local observed** timings, not production SLAs. No Redis introduced. No new indexes added in 16.5.