# Phase 1 Checkpoint 3 / 3A — Raw Capture Ingestion & Inbox API

**Scope:** RawCapture + RawCaptureBatch ingestion and inbox. No website fetch, AI, CompanyCandidate, ExtractedLead promotion, CSV/Excel parsers, or frontend.

**Checkpoint 3A** hardens idempotency, concurrency, failure recovery, counter source-of-truth, fingerprint stability, and focused HTTP security coverage. No new product adapters.

## Index safety

See `phase1-index-safety.md`. `syncIndexes()` is test-only; no production auto-sync. `requestFingerprint` is stored but **not** separately indexed.

## Base paths

- `POST /api/v1/data-extractor/search-campaigns/:campaignId/raw-captures/ingest`
- `GET  .../raw-captures`
- `GET  .../raw-captures/:rawCaptureId`
- `PATCH .../raw-captures/:rawCaptureId/notes`
- `POST .../raw-captures/:rawCaptureId/archive`
- `GET  .../raw-capture-batches/:batchId`

No DELETE.

## Permissions

| Action | Required |
|--------|----------|
| List/detail/batch | `search_campaign.view` + `raw_capture.view` |
| Query-linked ingest | `search_campaign.view` + `search_query.view` + `raw_capture.ingest` |
| Campaign-level ingest | `search_campaign.view` + `raw_capture.ingest` |
| Notes | `search_campaign.view` + `raw_capture.manage` |
| Archive | `search_campaign.view` + `raw_capture.archive` |

## Eligibility

Campaigns: draft | active | paused  
Queries (when linked): approved | opened | captured  

## Capture identity

Unique: `{ companyId, campaignId, queryScopeKey, source, captureFingerprint }`

Fingerprint priority (SHA-256):

1. Normalized result URL when available (tracking params + fragment stripped)
2. `sourceRecordId` when URL is absent (non-empty, length/charset validated; not treated as verified business data)
3. Normalized title + snippet fallback

`resultPosition` is **not** part of identity. Position changes update `resultPosition` / `seenCount` / `lastSeenAt` only.

**Limitation:** records without URL and without `sourceRecordId` may create a new identity when title/snippet change materially.

## Batch idempotency (Checkpoint 3A)

Unique: `{ companyId, idempotencyKey }` (company-scoped; keys may be reused by another company).

Server-generated `requestFingerprint` (SHA-256, never accepted from client) covers:

- authenticated `companyId`, `campaignId`, query scope (`queryId` or `campaign_manual`)
- `source`, `captureMethod`
- normalized submitted record identity fields (title, snippet, normalized URL, resultPosition, sourceRecordId, resultTypeHint)

| Same key + same fingerprint | HTTP **200**, `idempotentReplay: true`, no reprocess, counters unchanged |
| Same key + different fingerprint | HTTP **409**, `errorCode: IDEMPOTENCY_KEY_REUSED` |
| Concurrent same key/payload | One batch; loser gets existing state (**200**); `processingInFlight: true` if status is `processing` |
| Same key, batch still `received` (create-before-process failure) | Safe retry **resumes** the same batch (no second batch) |

## Failure / recovery

1. Create batch as `received`
2. Claim → `processing`
3. Upsert RawCaptures one record at a time; store accepted IDs
4. Final counts from processing results → `completed` | `partially_completed` | `failed`
5. Recalculate SearchQuery stats from DB source of truth (not `$inc`-only)

Internal helpers (not public endpoints): `recalculateSearchQueryCaptureStats`, `reconcileRawCaptureBatch`.

Successfully captured evidence is never deleted on failure.

## SearchQuery counters

| Field | Definition |
|-------|------------|
| `resultCount` | Unique RawCaptures for the query (including archived); excludes campaign-manual / other company/campaign/query |
| `captureCount` | Distinct batches for the query with status `completed` or `partially_completed` (excludes received/processing/failed and replays) |
| `lastCapturedAt` / `lastCapturedBy` | From latest eligible completed/partially_completed batch; null when none |

Status: approved/opened → `captured` after a successful batch with ≥1 accepted record; failed zero-accept does not promote; replay does not change status.

## Archived repeat sightings

Stay archived; `seenCount`/`lastSeenAt` may update; `firstSeenAt`/`archivedAt`/`archivedBy` preserved; not restored to Inbox; `resultCount` unchanged; new non-idempotent batch may still increase `captureCount`.

## Partial batches

Valid records accepted; invalid rejected per-index. Status: completed | partially_completed | failed.

## Stored-data bounds

Batch never stores full request payload, HTML/DOM, cookies, browser headers, tokens, base64/binary, env data, or stack traces.

Limits: `rawCaptureIds` ≤ batch max (100); `validationErrors` ≤ 25; message ≤ 300; failureCode ≤ 80; failureMessage ≤ 500; idempotencyKey ≤ 200; `requestFingerprint` = 64 hex chars.

HTTP RawCapture controllers return sanitized errors (no stack / Mongo internals).
