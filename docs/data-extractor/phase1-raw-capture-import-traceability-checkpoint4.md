# RawCapture Import Checkpoint 4 / 4A — scenario traceability

Legend: **covered** | **combined** | **not covered**

## Checkpoint 4A hardening (`rawCaptureImport.phase4a.hardening.test.js`)

| Scenario group | Status |
|----------------|--------|
| Multipart auth/permission/campaign before Multer | covered |
| XLSX ZIP preflight before ExcelJS (25 malicious fixtures) | covered |
| CSV limits / prototype headers / formula-as-text | covered |
| review_required default exclude + override audit | covered |
| Child-chunk reconciliation / same-key 409 | covered |
| Crash windows (before_child, after_first_chunk) + concurrency | covered |
| Preview fingerprint mismatch | covered |
| Count equation `parsed = accepted + rejected + dupWithin` | covered |
| Multer file-size limit | covered |

## Adapter / service (`rawCaptureImport.phase4.service.test.js`)

| Scenario group | Status |
|----------------|--------|
| Import indexes | covered |
| Manual / pasted / CSV / Excel adapters | covered |
| 250-row chunking / no ExtractedLead | covered |

## HTTP Checkpoint 4 (`rawCaptureImport.phase4.http.test.js`)

| # | Scenario | Status |
|---|----------|--------|
| 1–4 | Auth / import / ingest / query-view | covered |
| 5–12 | Manual / pasted / CSV / XLSX preview+commit | covered |
| 13–26 | Isolation / IDs / multipart / replay | covered/combined |
| 27–31 | No DELETE / no leak / no CRM side effects | covered |

## HTTP Checkpoint 4A (`rawCaptureImport.phase4a.http.test.js`)

| # | Scenario | Status |
|---|----------|--------|
| 1 | No authentication before Multer | covered |
| 2 | Module disabled before Multer | covered |
| 3 | No import permission before Multer | covered |
| 4 | No ingest permission | covered |
| 5 | Query-linked without SQ view | covered |
| 14–15 | companyId JSON / multipart rejected | covered |
| 16–18 | Cross-company campaign/query/ImportRun | covered |
| 24–26 | Unexpected field / multi-file / oversized | covered |
| 34–35 | Tampered mapping / preview fingerprint | covered |
| 36–37 | review_required default / override | covered |
| 38–42 | No leak / no DELETE / preview+commit side effects | covered |

## Intentionally deferred

| Item | Reason |
|------|--------|
| Discovery Agent / Checkpoint 5 | Not started |
| Website enrichment / AI / frontend | Forbidden in CP4A |
| Background workers | Forbidden |
| Production index migration | Documented only |
