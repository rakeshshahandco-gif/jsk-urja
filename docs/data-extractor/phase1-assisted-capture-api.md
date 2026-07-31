# Phase 1 Assisted Visible Google Capture — API

## Purpose

Operator-driven capture of **visible Google organic results** into RawCapture inbox.
No HTML/DOM/cookies/screenshots are uploaded. No ExtractedLead/CRM Lead creation.

## User JWT routes

Base: `/api/v1/data-extractor/search-campaigns/:campaignId/queries/:queryId/assisted-captures`

| Method | Path | Permission |
|--------|------|------------|
| POST | `/` | `data_extractor.assisted_capture.start` (+ campaign view, query view/open, raw ingest) |
| GET | `/` | `data_extractor.assisted_capture.view` |
| GET | `/:sessionId` | view |
| POST | `/:sessionId/cancel` | manage |
| POST | `/:sessionId/complete` | manage |

### Create body

Allowed: `idempotencyKey`, `sourceHint`, `sessionTtlMinutes`, `financialYear` (or `X-Financial-Year`).

Forbidden: `searchUrl`, `companyId`, HTML/DOM/cookies.

`searchUrl` is taken from SearchQuery (`https://www.google.com/search?q=...`).

Response session **never** includes plain token or `tokenHash`.

## Agent token routes (public DE router)

Base: `/api/v1/data-extractor/discovery/agent/assisted-captures`

Header: `X-Discovery-Agent-Token`  
Session header (all except claim): `X-Assisted-Session-Token`

| Method | Path | Notes |
|--------|------|-------|
| POST | `/claim` | body `{ sessionId, agentInstanceId }` — returns `sessionToken` once |
| POST | `/:sessionId/browser-opened` | idempotent ack → `awaiting_user` |
| POST | `/:sessionId/heartbeat` | statuses: opening, awaiting_user, manual_action_required, ready_to_capture, capturing |
| POST | `/:sessionId/manual-action` | consent/captcha/login wait — no bypass |
| POST | `/:sessionId/events` | organic results only, max 100, no HTML |
| POST | `/:sessionId/complete` | terminal |
| POST | `/:sessionId/fail` | terminal |

## Event payload

```json
{
  "agentInstanceId": "agent-...",
  "eventIdempotencyKey": "evt-...",
  "eventSequence": 1,
  "visibleResultCount": 2,
  "results": [
    {
      "title": "...",
      "snippet": "...",
      "resultUrl": "https://...",
      "resultPosition": 1,
      "resultTypeHint": "unknown"
    }
  ]
}
```

Ingest path: Assisted event → RawCapture (`captureMethod: assisted_visible`).
