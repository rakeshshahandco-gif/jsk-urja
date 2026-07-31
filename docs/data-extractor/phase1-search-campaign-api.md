# Phase 1 Checkpoint 1 — Search Campaign API

Local-only foundation for the campaign-centric Data Extractor workflow.

**Scope:** SearchCampaign master only. No SearchQuery, RawCapture, enrichment, AI, UI, or CRM conversion.

## Base path

`/api/v1/data-extractor/search-campaigns`

Company scope always comes from authenticated `req.companyId`. Body/query/URL must not supply `companyId`.

## Permissions

| Key | Allows |
|-----|--------|
| `data_extractor.search_campaign.view` | List, get |
| `data_extractor.search_campaign.manage` | Create, update, status change, archive |

## Endpoints

| Method | Path | Permission |
|--------|------|------------|
| POST | `/search-campaigns` | manage |
| GET | `/search-campaigns` | view |
| GET | `/search-campaigns/:campaignId` | view |
| PATCH | `/search-campaigns/:campaignId` | manage |
| PATCH | `/search-campaigns/:campaignId/status` | manage |
| POST | `/search-campaigns/:campaignId/archive` | manage |

No DELETE / hard-delete endpoint.

## Create / update body (writable)

`name`, `description`, `targetIndustry`, `relatedIndustries[]`, `targetProducts[]`, `businessTypes[]`, `country`, `state`, `city`, `includeKeywords[]`, `excludeKeywords[]`, `sources[]`, `minimumQualificationScore` (0–100), `requiredContactFields[]`

Rejected if present: `companyId`, `createdBy`, `updatedBy`, `archivedAt`, `archivedBy`, `status` (use status/archive endpoints), unknown fields.

## Sources

`google`, `facebook`, `indiamart`, `official_website`, `web`, `manual_url`, `manual_text`, `csv`, `excel`, `discovery_agent`

## Required contact fields

`company_name`, `website`, `email`, `phone`, `whatsapp`, `address`, `city`, `state`, `country`

## Status transitions

- draft → active | archived
- active → paused | closed | archived
- paused → active | closed | archived
- closed → archived
- archived → (none in Checkpoint 1)

## List query

`status`, `targetIndustry`, `source`, `q`/`search`, `createdFrom`, `createdTo`, `updatedFrom`, `updatedTo`, `includeArchived`, `page`, `limit` (max 100), `sort`, `sortDir`

Archived excluded by default unless `includeArchived=true`.

## Isolation

Cross-company get/update/list returns **404** / omits foreign rows — never discloses existence.

## Country field

- Backend does **not** default country to India (or any geography).
- Omitted country is stored as empty string.
- Clients should send an explicit country (e.g. India for the Home Automation controlled test).
- Frontend may prefill India later as a visible editable convenience; that must not be a silent backend inference.