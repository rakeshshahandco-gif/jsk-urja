# Phase 17 — AI Sales Assistant

Read-only natural-language intelligence over Phase 1–16 Data Extractor data.

## Boundary

- No Lead/Customer/Supplier create/update
- No assignment, Task, follow-up, approve/apply, send, merge, rollback
- No provider discovery execution
- Phase 14 write services are never imported

## Architecture

User question → sanitize → intent → safety → filters → query plan → validate → permissions → allowlisted read tools → evidence → grounded answer

## Protected regression

eligibility.service.js and crmAdapter.service.js fingerprints must remain unchanged unless explicitly justified.
