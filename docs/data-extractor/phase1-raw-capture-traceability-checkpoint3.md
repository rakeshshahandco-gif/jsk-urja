# RawCapture Checkpoint 3 / 3A — scenario traceability

Legend: **covered** | **combined** | **not covered**

## Checkpoint 3 (baseline) → tests

| Scenario | Test file | Test name | Assertion focus | Status |
|----------|-----------|-----------|-----------------|--------|
| Index identity + batch idempotency | rawCapture.phase3.service.test.js | creates identity and idempotency unique indexes | index names / unique | covered |
| URL normalize / reject bad protocols | rawCapture.phase3.service.test.js | strips tracking params… | normalizeResultUrl | covered |
| Query eligibility statuses | rawCapture.phase3.service.test.js | accepts approved/opened/captured… | status gates | covered |
| Campaign eligibility / cross-company | rawCapture.phase3.service.test.js | rejects closed/archived… | 404/400 | covered |
| Forbidden body fields / batch max | rawCapture.phase3.service.test.js | rejects companyId/audit… | 400 | covered |
| Query + campaign ingest, partial, counters | rawCapture.phase3.service.test.js | ingests query-linked… | insert/reject/status | covered (3A: same-payload replay + mismatch 409) |
| Scope isolation / archive stays archived | rawCapture.phase3.service.test.js | same URL under different… | separate rows | covered |
| Concurrency same key + upsert race | rawCapture.phase3.service.test.js | concurrency: same idempotency… | one batch | covered |
| Notes/archive/list/open captured / no EL | rawCapture.phase3.service.test.js | captured query can still… | inbox + ExtractedLead | covered |

## Checkpoint 3A integrity

| Scenario | Test file | Test name | Assertion focus | Status |
|----------|-----------|-----------|-----------------|--------|
| Runtime indexes in crm_test | rawCapture.phase3a.hardening.test.js | confirms RawCapture and RawCaptureBatch indexes exist | RC + batch indexes | covered |
| Same key + same fingerprint replay | hardening + HTTP #22 | same key + same payload… / same-key/same-payload replay | no double counters | covered |
| Same key + different fingerprint 409 | hardening + HTTP #23 | same key + different payload… / conflict | IDEMPOTENCY_KEY_REUSED | covered |
| Cross-company same key allowed | hardening | same key may be used independently… | 2 batches | covered |
| Concurrent same key/payload | hardening | parallel same key/payload… | one batch, counters=1 | covered |
| URL identity ignores title/snippet/pos/tracking/fragment | hardening | URL identity ignores… | same RawCapture | covered |
| sourceRecordId / title+snippet fallback | hardening | (same test) | sid match + text diverge | covered |
| Archived repeat sighting | hardening | archived stays archived… | stay archived, captureCount↑ | covered |
| Failed zero-accept no status promote | hardening | failed batch with zero accepted… | status stays approved | covered |
| Fail after batch create + resume | hardening | fail after batch create… | received → resume completed | covered |
| Fail after first upsert | hardening | (same) | failed auditable, evidence kept | covered |
| Fail before query stats | hardening | (same) | reconcile restores | covered |
| Fail during query stats | hardening | (same) | batch terminal, reconcile | covered |
| Counter reconcile helpers | hardening | archived stays… / failure injection | recalculateSearchQueryCaptureStats | covered |
| No ExtractedLead on failure path | hardening | failure injection | count unchanged | covered |

## Checkpoint 3A focused HTTP (rawCapture.phase3.http.test.js)

| # | Scenario | Test name | Status |
|---|----------|-----------|--------|
| 1 | No auth → 401 | 1. no authentication → 401 | covered |
| 2 | Missing view → 403 | 2. missing RawCapture view → 403 | covered |
| 3 | Missing ingest → 403 | 3. missing ingest permission → 403 | covered |
| 4 | Query ingest without SQ view → 403 | 4. query-linked ingest without SearchQuery view → 403 | covered |
| 5 | Valid query-linked ingest | 5. valid query-linked ingestion | covered |
| 6 | Valid campaign-level ingest | 6. valid campaign-level ingestion | covered |
| 7 | Body companyId rejected | 7. body companyId rejected | covered |
| 8 | Cross-company campaign → 404 | 8. cross-company campaign → 404 | covered |
| 9 | Cross-company query → 404 | 9. cross-company query → 404 | covered |
| 10 | Cross-company RawCapture detail → 404 | 10. cross-company RawCapture detail → 404 | covered |
| 11 | Cross-company batch detail → 404 | 11. cross-company batch detail → 404 | covered |
| 12–15 | Invalid IDs → 404 | 12-15. invalid campaign/query/raw/batch IDs → 404 | combined |
| 16 | Unknown top-level field | 16. unknown top-level field rejected | covered |
| 17 | Unknown record field | 17. unknown record field rejected | covered (per-record fail) |
| 18 | Operator/pollution | 18. operator / prototype-pollution… | covered |
| 19 | Oversized batch | 19. oversized batch rejected | covered |
| 20 | Partial batch | 20. partial batch response | covered |
| 21 | Fully invalid batch | 21. fully invalid batch response | covered |
| 22 | Same-key/same-payload replay | 22. same-key/same-payload replay… | covered |
| 23 | Same-key/different-payload 409 | 23. same-key/different-payload conflict… | covered |
| 24 | Notes permission | 24. notes permission enforcement | covered |
| 25 | Notes only notes | 25. notes endpoint changes only notes | covered |
| 26 | Archive permission | 26. archive permission enforcement | covered |
| 27 | Archive preserves evidence | 27. archive succeeds and preserves evidence | covered |
| 28 | Archived excluded default | 28. archived excluded by default | covered |
| 29 | DELETE absent | 29. DELETE route absent | covered |
| 30 | No stack / Mongo leak | 30. no stack trace or raw MongoDB error | covered |
| 31 | No ExtractedLead / CRM Lead | 31. no ExtractedLead or CRM Lead side effect | covered |

## Intentionally not covered in 3A

| Item | Reason |
|------|--------|
| CSV/Excel/manual URL adapters | Checkpoint 4 |
| Website enrichment / AI | Later |
| Public repair endpoint | Explicitly deferred |
| Background worker / long poll | Explicitly deferred |
| Production/Render index migration | Documented only |

All original Checkpoint 3 scenarios remain covered; materially new 3A risks have dedicated tests.
