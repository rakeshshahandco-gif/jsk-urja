# Index synchronization safety (Checkpoint 3 / 3A)

## Finding

`SearchQuery.syncIndexes()` is invoked **only** in Checkpoint 2A hardening tests
(`backend/test/dataExtractor/searchQuery.phase2a.hardening.test.js`).

RawCapture / RawCaptureBatch `syncIndexes()` is invoked **only** in Checkpoint 3 / 3A tests
(`rawCapture.phase3.service.test.js`, `rawCapture.phase3a.hardening.test.js`).

It is **not** called from application startup, `app.js`, server boot, or production paths.

## RawCapture indexes (expected in crm_test)

RawCapture:

- list/status (`inboxStatus` + date)
- query/date
- source/date
- domain
- unique capture identity (`uniq_raw_capture_identity` or project constant name)

RawCaptureBatch:

- unique company/idempotency (`uniq_raw_capture_batch_idempotency`)
- campaign/date
- query/date
- status/date

`requestFingerprint` is required on batches but does **not** need a separate index.

## Policy

| Environment | Behavior |
|-------------|----------|
| Tests | May call `Model.syncIndexes()` explicitly for the models under test |
| Local development | Prefer explicit controlled command / migration script when needed |
| Production / Render | Must **not** auto-run `syncIndexes()` on startup |
| Production index changes | Reviewed migration + duplicate preflight only — **not executed in Checkpoint 3A** |

Mongoose may still create missing indexes via `autoIndex` in non-production if enabled by
framework defaults; that does **not** drop or replace indexes the way `syncIndexes()` can.

Checkpoint 3A does **not** run any production or Render index migration.

## RawCaptureImportRun indexes (Checkpoint 4)

- unique company/idempotency (`uniq_raw_capture_import_run_idempotency`)
- campaign/date list index
- query/date list index
- status/date index

`syncIndexes()` for import runs is test-only. Production/Render index migration remains unexecuted.
