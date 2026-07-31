# Phase 1 Checkpoint 2 — Search Query API

Local-only SearchQuery layer for approved SearchCampaign records.

**Scope:** SearchQuery model, rule-based generation, CRUD/lifecycle, permissions, tests.  
**Out of scope:** RawCapture, browser automation, enrichment, AI, frontend, CRM conversion.

## Base path

`/api/v1/data-extractor/search-campaigns/:campaignId/queries`

Company scope always comes from authenticated `req.companyId`. Body/query must not supply `companyId`.

## Permissions

| Key | Allows |
|-----|--------|
| `data_extractor.search_query.view` | List, get |
| `data_extractor.search_query.manage` | Manual create, edit (editable statuses), archive |
| `data_extractor.search_query.generate` | Generate, regenerate |
| `data_extractor.search_query.review` | Approve, reject, bulk approve/reject |
| `data_extractor.search_query.open` | Record open action / receive searchUrl |

Caller must also have SearchCampaign view (or manage) for the parent campaign.

## Endpoints

| Method | Path | Permission |
|--------|------|------------|
| POST | `.../queries/generate` | generate |
| POST | `.../queries/regenerate` | generate |
| POST | `.../queries` | manage |
| GET | `.../queries` | view |
| GET | `.../queries/:queryId` | view |
| PATCH | `.../queries/:queryId` | manage |
| POST | `.../queries/:queryId/approve` | review |
| POST | `.../queries/:queryId/reject` | review |
| POST | `.../queries/:queryId/open` | open |
| POST | `.../queries/:queryId/archive` | manage |
| POST | `.../queries/bulk-approve` | review |
| POST | `.../queries/bulk-reject` | review |

No DELETE / hard-delete endpoint.

## Statuses and transitions

Statuses: `generated`, `draft`, `approved`, `rejected`, `opened`, `captured` (reserved), `archived`

| From | To |
|------|-----|
| generated | approved, rejected, draft, archived |
| draft | approved, rejected, archived |
| approved | opened, archived |
| opened | opened, captured (reserved), archived |
| rejected | archived |
| captured | archived |
| archived | (none in Checkpoint 2) |

Edit in place only for `generated` / `draft` / `rejected`.  
Editing search meaning of `approved` / `opened` creates a **derived draft** with `parentQueryId` (preferred).

## Campaign eligibility

| Campaign status | Queries |
|-----------------|---------|
| draft, active | Generate + manual + review allowed |
| paused | Manual/review allowed; generate only with `explicitGenerateWhilePaused=true` |
| closed, archived | Read-only (no generate/manual create) |

## Generation

Rule-based templates only (no AI). Defaults: limit 30, min 1, max 100.

Body options: `requestedLimit`, `selectedSources`, `selectedQueryTypes`, `includeTechnicalQueries`, `includeSiteOperators`, `includeNegativeKeywords`, `explicitGenerateWhilePaused`.

Stats returned: `requested`, `generated`, `inserted`, `exactDuplicatesSkipped`, `nearDuplicatesSkipped`, `rejectedAsLowQuality`, `generationGroupId`.

Empty country/state/city does **not** become India.

## Duplicate control

- Exact: `queryNormalized` scoped by `companyId` + `campaignId`
- Near: order-insensitive token signature (plurals / filler words normalized)
- DB: partial unique index `{ companyId, campaignId, queryNormalized }` where `status != archived`
- Concurrent inserts: duplicate-key handled as skip, not 500

## Search URL

Google / web / official_website / manual → `https://www.google.com/search?q=<encoded>`  
Facebook / IndiaMART → empty URL in Checkpoint 2 (queryText + sourceHint only; no unstable public URL invented).

Open action records `openedCount` / `lastOpenedAt` / `lastOpenedBy` only — no Playwright/Puppeteer/Discovery Agent.

## Collection

`search_queries` — see model `backend/src/models/searchQuery.model.js`.


## Checkpoint 2A hardening notes

### Unique index (MongoDB-supported)

Index name: `uniq_active_query_normalized`

```js
{
  keys: { companyId: 1, campaignId: 1, queryNormalized: 1 },
  unique: true,
  partialFilterExpression: {
    status: { $in: ['generated', 'draft', 'approved', 'rejected', 'opened', 'captured'] }
  }
}
```

Do **not** use `{ status: { $ne: 'archived' } }` — `$ne` is not supported in MongoDB partial filters.

**Sync:** Mongoose `syncIndexes()` / model init creates the index automatically in app/test environments.
**Production:** No production index migration is run in Checkpoint 2A. Before creating this index on a populated production collection, run a duplicate-detection report for active `(companyId, campaignId, queryNormalized)` groups with `count > 1` and resolve them first. If duplicates exist, index creation fails with E11000.

**Archive-and-recreate:** Archiving removes a document from the partial unique set. A new active query with the same normalized text may then be inserted. Archived history is preserved (no hard delete).

### Permission matrix

| Action | Required |
|--------|----------|
| List / read query | `search_campaign.view` + `search_query.view` |
| Generate / regenerate | `search_campaign.view` + `search_query.generate` |
| Manual create / edit / archive | `search_campaign.view` + `search_query.manage` |
| Approve / reject | `search_campaign.view` + `search_query.review` |
| Open | `search_campaign.view` + `search_query.open` |

`search_campaign.manage` is **not** required for query operations (only for campaign master changes).
`search_campaign.manage` alone (without the matching query permission) does **not** grant query actions.

### Meaning vs metadata on update

**Meaning-changing** (approved/opened → derived draft with `parentQueryId`): `queryText`, `sourceHint`
**Classification** (in-place on approved/opened when text/source unchanged): `queryType`
**Metadata-only** (in-place on approved/opened): `notes`
Note: `queryType`-only cannot create a derived active row because it would share `queryNormalized` and violate the active unique index.
`selectedCriteria` is not writable via PATCH (unknown field).
`searchUrl` is never accepted from the client — generated server-side only.

### Search URL

- Google / web / official_website / manual → `https://www.google.com/search?q=<encodeURIComponent(queryText)>`
- Facebook / IndiaMART → empty string until a stable public format is approved
- No cookies, tokens, sessions, `javascript:`, `data:`, or client-supplied URLs
