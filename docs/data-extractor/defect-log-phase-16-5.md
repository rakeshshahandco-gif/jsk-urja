# Phase 16.5 Defect Log

| ID | Module | Severity | Description | Fix / defer |
|----|--------|----------|-------------|-------------|
| D165-01 | Analytics KPI | DOCUMENTATION_ONLY | uniqueCompanies is approximation | Documented in known-limitations; no broad logic change |
| D165-02 | Early phases secrets | LOW | assertNoSecrets sparse before Phase 13 | Deferred — avoid mass churn; providerSecrets + response sanitization remain |
| D165-03 | crmEnrichment crmAdapter | MEDIUM | Lead.updateOne({_id}) without company in filter (post-create company fixup) | Deferred — intentional adapter path; regression risk if rewritten blindly |
| D165-04 | Marketing/Analytics | — | No send/execute routes or UI Send | Confirmed OK |
| D165-05 | Tenant isolation | — | Phase 13–16 reject body/query companyId/tenantId | Confirmed OK via tests |
| D165-06 | Indexes | — | No missing index blocker for local crm_test lists | No index added |