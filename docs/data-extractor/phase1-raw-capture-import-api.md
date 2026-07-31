# Phase 1 Checkpoint 4 / 4A — Raw Capture Import Adapters API

**Scope:** Manual URL, pasted text, CSV, Excel `.xlsx` adapters feeding RawCapture ingestion. Checkpoint 4A hardens upload order, ZIP preflight, recovery, and review_required.

## Dependency review

| Dependency | Decision |
|------------|----------|
| `exceljs@4.4.0` | Reused — workbook load only **after** ZIP preflight |
| `multer@2.0.2` | Reused — route-specific memory upload **after** auth/permission/campaign |
| `csv-parse@5.6.0` | Direct — bounded parse options |
| `adm-zip@0.5.17` | **Direct existing** — ZIP entry metadata preflight (no extract / no `getData`) |

No temporary files are used for XLSX (in-memory `ExcelJS.Workbook.xlsx.load(buffer)`).

## Multipart middleware order (file preview/commit)

1. `protect` (router)
2. Company scope + module guard (app)
3. `checkPermission(raw_capture.import)`
4. `assertImportCampaignAccessMiddleware` (campaignId from **route params**)
5. `multerSingleFile`
6. Controller
7. Error handling

Unauthenticated / unauthorized / cross-company campaign requests must not increment Multer invoke counters.

`queryId` remains a multipart/JSON field and is validated after parse (cannot be checked before Multer without restructuring).

## XLSX preflight (before ExcelJS)

1. Bound buffer (10 MB)
2. Extension/MIME
3. ZIP signature
4. `adm-zip` entry metadata (no payload extract)
5. Entry name safety (no `..`, absolute paths, nulls, depth/length limits)
6. Entry count ≤ 2000
7. Uncompressed totals ≤ 50 MB; single entry ≤ 20 MB
8. Compression ratio ≤ 100 (when material)
9. Forbidden entries: `vbaProject.bin`, ActiveX, embeddings, EncryptionInfo/EncryptedPackage, externalLinks, executables
10. Require `[Content_Types].xml` + `xl/workbook.xml`
11. Then ExcelJS `load(buffer)`

## Review-required pasted text

Default commit **excludes** `review_required` rows (partial when others succeed).  
`allowReviewRequired: true` accepts them after normal RawCapture validation and records `allowReviewRequired`, `reviewOverrideBy`, `reviewOverrideAt`, `reviewRequiredAcceptedCount` server-side (never from client audit fields).

## Import counts

`parsedRows = acceptedRows + rejectedRows + duplicateWithinImportCount` (adapter contract).  
Child chunks ≤ 100; recovery discovers completed `RawCaptureBatch` by child idempotency key via `reconcileImportRunFromChildBatches`.

## Limits (summary)

CSV 5 MB / 5k×100 / cell 32 KB / record 64 KB.  
XLSX 10 MB / 50 MB uncompressed / 50 sheets / 5k rows / 100 cols.


## MIME / extension / signature acceptance

### CSV
- Extension: `.csv` only (double extensions like `.exe.csv` rejected when executable pattern matches)
- MIME advisory only: `text/csv`, `application/csv`, `text/plain`, `application/octet-stream`
- Signature: not ZIP (`PK\x03\x04`), not MZ executable, not HTML; UTF-8 / UTF-8 BOM; null bytes rejected
- Delimiters: `,` `;` `\t` via detection; formula-like cells (`=`,`+`,`-`,`@`) kept as plain text

### XLSX
- Extension: `.xlsx` required; `.xls` / `.xlsm` / `.xlsb` rejected
- MIME advisory; ZIP/XLSX signature required
- Required entries: `[Content_Types].xml`, `xl/workbook.xml`
- Preflight (adm-zip metadata, no extract) before ExcelJS load
- No temporary files; buffers not stored on ImportRun

### Formula / links
- Excel: never evaluate; cached result only; missing cache → reject mapped row
- External/file hyperlinks blocked; externalLinks package entries rejected at ZIP preflight
- Later CSV/Excel **export** must separately protect against spreadsheet formula injection
