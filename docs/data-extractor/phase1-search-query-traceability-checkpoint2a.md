# SearchQuery Checkpoint 2 / 2A — scenario traceability

Legend: **covered** = dedicated assertion; **combined** = covered inside a broader test; **2A** = added in Checkpoint 2A.

| # | Required scenario | File | Test | Status |
|---|-------------------|------|------|--------|
| 1 | Generate for eligible campaign | searchQuery.phase2.service.test.js | generates queries under authenticated company | covered |
| 2 | Generate uses auth company scope | searchQuery.phase2.service.test.js | generates queries under authenticated company | covered |
| 3 | Cannot generate other company campaign | searchQuery.phase2.service.test.js | cannot generate for another company campaign | covered |
| 4 | Cannot generate closed campaign | searchQuery.phase2.service.test.js | cannot generate for closed or archived campaign | covered |
| 5 | Cannot generate archived campaign | searchQuery.phase2.service.test.js | cannot generate for closed or archived campaign | covered |
| 6 | Generated contains industry | searchQuery.phase2.service.test.js | generates useful varied queries... | covered |
| 7 | Product queries created | searchQuery.phase2.service.test.js / phase2a.hardening | HA batch quality | combined |
| 8 | Business-type queries created | same | HA batch / quality | combined |
| 9 | Geography only when present | searchQuery.phase2.service.test.js | does not invent India when country empty | covered |
| 10 | Empty country not India | searchQuery.phase2.service.test.js | does not invent India when country empty | covered |
| 11 | India when explicit | searchQuery.phase2.service.test.js | includes India when explicitly stored | covered |
| 12 | Google source queries | searchQuery.phase2.service.test.js | IndiaMART/Facebook only when source selected | combined |
| 13 | IndiaMART only when selected | searchQuery.phase2.service.test.js | IndiaMART/Facebook only when source selected | covered |
| 14 | Facebook only when selected | searchQuery.phase2.service.test.js | IndiaMART/Facebook only when source selected | covered |
| 15 | Include keywords without full Cartesian | searchQuery.phase2.service.test.js | generates useful varied... / HA batch | combined |
| 16 | Exclude keywords safe / metadata | searchQuery.phase2a.hardening.test.js | HA batch (FB/IM no negatives) | covered |
| 17 | Requested limit enforced | searchQuery.phase2.service.test.js | enforces generation max limit in candidates | covered |
| 18 | Maximum limit enforced | searchQuery.phase2.service.test.js | enforces max requestedLimit | covered |
| 19 | Exact duplicates skipped | searchQuery.phase2.service.test.js | skips exact duplicates on second generate | covered |
| 20 | Near duplicates skipped | searchQuery.phase2.service.test.js | near-duplicate detection merges... | covered |
| 21 | Different business types retained | searchQuery.phase2.service.test.js | generates useful varied... | covered |
| 22 | Generation statistics accurate | searchQuery.phase2.service.test.js | generates queries under authenticated company | covered |
| 23 | Manual starts draft | searchQuery.phase2.service.test.js | manual query starts draft... | covered |
| 24 | Manual duplicate rejected | searchQuery.phase2.service.test.js | manual query starts draft... | covered |
| 25 | Invalid source rejected | searchQuery.phase2.service.test.js | manual query starts draft... | covered |
| 26 | Unknown fields rejected | searchQuery.phase2.service.test.js / phase2.http | unknown body field... | covered |
| 27 | Body companyId rejected | searchQuery.phase2.service.test.js / phase2.http | body companyId... | covered |
| 28 | Audit fields rejected | searchQuery.phase2.service.test.js | manual query starts draft... | covered |
| 29 | Approve generated | searchQuery.phase2.service.test.js | approve/reject/open/archive lifecycle | covered |
| 30 | Reject generated | searchQuery.phase2.service.test.js | approve/reject/open/archive lifecycle | covered |
| 31 | Rejection preserves reason | searchQuery.phase2.service.test.js | approve/reject/open/archive lifecycle | covered |
| 32 | Approved not silently rewritten | searchQuery.phase2.service.test.js / phase2a.hardening | derived edit | covered |
| 33 | Edit approved → derived draft | searchQuery.phase2a.hardening.test.js | meaning edit derives draft... | covered |
| 34 | Open increments openedCount | searchQuery.phase2.service.test.js | approve/reject/open/archive lifecycle | covered |
| 35 | Open records authenticated user | searchQuery.phase2.service.test.js | approve/reject/open/archive lifecycle | covered |
| 36 | Open does not invoke browser | searchQuery.phase2.service.test.js | approve/reject/open/archive lifecycle (counter-only) | combined |
| 37 | Archive preserves query | searchQuery.phase2.service.test.js / phase2a | archive and recreate | covered |
| 38 | Archived excluded from normal list | searchQuery.phase2.service.test.js / phase2.http | archive lifecycle | covered |
| 39 | Cross-company detail 404 | searchQuery.phase2.service.test.js / phase2.http | cross-company | covered |
| 40 | Cross-company update 404 | searchQuery.phase2.service.test.js / phase2.http | cross-company | covered |
| 41 | Invalid status transition rejected | searchQuery.phase2.service.test.js | invalid status transition rejected | covered |
| 42 | Regeneration preserves old | searchQuery.phase2.service.test.js | regeneration preserves... | covered |
| 43 | Regeneration lineage | searchQuery.phase2.service.test.js | regeneration preserves... | covered |
| 44 | Duplicate regeneration skips | searchQuery.phase2.service.test.js | regeneration preserves... | covered |
| 45 | No hard-delete service | searchQuery.phase2.service.test.js | no hard-delete service exists | covered |
| H1 | No token → 401 | searchQuery.phase2.http.test.js | no token → 401 | covered |
| H2 | Missing view → 403 | searchQuery.phase2.http.test.js | missing view permission | covered |
| H3 | View lists company only | searchQuery.phase2.http.test.js | view permission lists... | covered |
| H4 | Missing generate → 403 | searchQuery.phase2.http.test.js | missing generate permission | covered |
| H5 | Generate under auth company | searchQuery.phase2.http.test.js | generate creates under... | covered |
| H6 | Body companyId cannot override | searchQuery.phase2.http.test.js | generate creates under... | covered |
| H7 | Cannot generate B campaign | searchQuery.phase2.http.test.js | Company A cannot generate... | covered |
| H8 | Cannot read B query | searchQuery.phase2.http.test.js | Company A cannot read... | covered |
| H9 | Cannot update B query | searchQuery.phase2.http.test.js | Company A cannot update... | covered |
| H10 | Missing review → 403 | searchQuery.phase2.http.test.js | missing review... | covered |
| H11 | Review allows approve | searchQuery.phase2.http.test.js | missing review... | covered |
| H12 | Missing open → 403 | searchQuery.phase2.http.test.js | missing open... | covered |
| H13 | Open returns safe URL | searchQuery.phase2.http.test.js | missing open... | covered |
| H14 | Invalid campaign ID | searchQuery.phase2.http.test.js | invalid campaign/query IDs | covered |
| H15 | Invalid query ID | searchQuery.phase2.http.test.js | invalid campaign/query IDs | covered |
| H16 | Unknown body field | searchQuery.phase2.http.test.js | unknown body field... | covered |
| H17 | Mongo operator blocked | searchQuery.phase2.http.test.js | unknown body field... | covered |
| H18 | Archived excluded default | searchQuery.phase2.http.test.js | archived excluded... | covered |
| H19 | DELETE absent | searchQuery.phase2.http.test.js | archived excluded... | covered |
| H20 | No internal stack leak | searchQuery.phase2.http.test.js | assertNoInternalLeak helpers | combined |
| 2A1 | Partial unique index $in | searchQuery.phase2a.hardening.test.js | creates supported partial unique index... | covered |
| 2A2 | Archive-and-recreate | searchQuery.phase2a.hardening.test.js | allows recreation after archive... | covered |
| 2A3 | Cross-campaign/company uniqueness | searchQuery.phase2a.hardening.test.js | creates supported partial unique index... | covered |
| 2A4 | Generation concurrency | searchQuery.phase2a.hardening.test.js | parallel generate... | covered |
| 2A5 | Manual concurrent duplicate | searchQuery.phase2a.hardening.test.js | parallel generate... | covered |
| 2A6 | Notes-only no derive | searchQuery.phase2a.hardening.test.js | meaning edit derives draft... | covered |
| 2A7 | URL encoding / scheme reject | searchQuery.phase2a.hardening.test.js | encodes special/Unicode... | covered |
| 2A8 | Camp view + query generate w/o camp manage | searchQuery.phase2a.http.test.js | permission matrix #1 | covered |
| 2A9 | Camp view + review w/o camp manage | searchQuery.phase2a.http.test.js | permission matrix #2 | covered |
| 2A10 | Camp view + open w/o camp manage | searchQuery.phase2a.http.test.js | permission matrix #3 | covered |
| 2A11 | Camp view + manage w/o camp manage | searchQuery.phase2a.http.test.js | permission matrix #4 | covered |
| 2A12 | Query perms without camp view denied | searchQuery.phase2a.http.test.js | permission matrix #5 | covered |
| 2A13 | Camp manage without query perm denied | searchQuery.phase2a.http.test.js | permission matrix #6 | covered |
| 2A14 | No cross-company exposure | searchQuery.phase2a.http.test.js | permission matrix #7 | covered |
| B1 | Bulk review company isolation | searchQuery.phase2.service / http (per-id loadOwned) | combined via loadOwnedQuery + HTTP cross-company | combined |

All original Checkpoint 2 scenarios are covered or combined. No material gaps remain after 2A.
