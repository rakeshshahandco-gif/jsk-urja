# Phase 21 — Intelligence Configuration and Rule Version Manager

## Purpose

Phase 21 provides a controlled **version-management framework** for Data Extractor and AI Lead Intelligence configurations. It allows authorized users to define configuration families, create and review Draft versions, link approved Phase 20 Implementation Specifications, validate schemas/dependencies/compatibility, compare versions, preview metadata impact, select rollback targets, mark versions Ready for Sandbox, and export sandbox packages — while preserving immutable history.

## Critical non-activation boundary

Phase 21 **manages versions only**. It must **not**:

- Switch the currently used production/runtime rule
- Recalculate existing scores
- Reclassify companies
- Regenerate Product Recommendations
- Modify Knowledge Graph relationships
- Modify CRM
- Run campaigns / send messages / deploy / train

READY_FOR_SANDBOX means only that **Phase 22 may evaluate** the version. It does **not** mean active or approved for production.

Runtime engines continue to use the existing baseline (EXISTING_RUNTIME_BASELINE). 
esolveRuntimeConfiguration() always reports that Phase 21 versions are ignored.

## Configuration families

Twenty-four families are supported (company-scoped), including Lead Score dimensions/weights/thresholds/bands, Industry Classification rules/synonyms, Customer Type mappings, Lead Relevance, Product Recommendation mappings/fit thresholds, Similar-company / Duplicate / Entity-resolution thresholds, Contact role/confidence, Source priority, Knowledge Graph rules/thresholds, Assistant and Marketing templates, and Data-quality / Manual-review / Batch thresholds.

Configuration content is stored as validated JSON metadata. **It is never dynamically executed.**

## Version lifecycle

DRAFT → IN_REVIEW → VALIDATED → READY_FOR_SANDBOX → SANDBOX_TESTED (Phase 22 only) → APPROVED_FOR_FUTURE_ACTIVATION (metadata only) → RETIRED | REJECTED | ARCHIVED

In Phase 21:

- DRAFT, IN_REVIEW, VALIDATED, READY_FOR_SANDBOX are usable normally
- SANDBOX_TESTED is blocked on Phase 21 APIs (reserved for Phase 22)
- APPROVED_FOR_FUTURE_ACTIVATION is metadata only — no production activation
- No live ACTIVE runtime transition is permitted

## Immutability

- Drafts may be edited with permission
- Published/validated versions are immutable (immutableAfterPublish)
- Editing an immutable version creates a **new Draft** (history is never overwritten)
- Version number is unique per company + family
- Payload checksum is recorded
- Revision history is append-only
- Soft archive/retire instead of hard delete

## Phase 20 specification linkage

Drafts may be created from:

1. An approved Phase 20 Implementation Specification
2. A permitted existing configuration version (clone/base)
3. An authorized manual Draft when company policy allows

When linked to Phase 20, the system verifies company match, approval case status, checksum integrity, executable: false, implementationRequired: true. Only approved target configuration fields are copied. Request-body proposal payloads are not trusted.

## Validation

Validates family schema, required fields, types/ranges, unique mappings, threshold order, weight totals, negatives, duplicate conditions, circular dependencies, missing product/industry/source references, inactive masters, company/industry scope, unsupported expressions, unsafe operators, and payload size.

Rejects: JavaScript/eval/function text, MongoDB operators, SQL, secrets/credentials, code injection, dynamic imports, filesystem paths, and body/query companyId/tenantId.

## Dependencies

Tracks required configuration families, minimum versions, incompatible versions, missing dependencies, circular dependency, source master dependencies, runtime engine dependency, and rollback dependency. Dependencies are not modified automatically.

## Compatibility

Returns COMPATIBLE | COMPATIBLE_WITH_WARNINGS | INCOMPATIBLE | UNKNOWN.

Checks schema compatibility, engine-supported fields, backend version, required source phase, scope, permissions, aggregate-only/privacy, data availability, rollback availability, and known limitation conflicts.

Compatibility is not granted merely because schema validation passed.

## Comparison

Structured diffs only. Neither version is executed.

## Impact preview

Metadata-only. Does not run historical A/B evaluation (Phase 22).

## Rollback targets

Selecting a rollback target does not perform a rollback.

## Permissions

data_extractor.configuration_manager.* : view, view_payload, create_draft, edit_draft, clone, validate, compare, dependencies, compatibility, review, ready_for_sandbox, export, saved_views, audit, settings, manage

## Security

req.companyId only; authenticated user; company-scoped queries; exact permissions; specification checksum checks; immutable-version checks; safe schema validation; size limits; secret rejection; audit; no dynamic code execution.

## APIs

Base: /api/v1/data-extractor/ai-lead-intelligence/configuration-manager

Not added: /activate, /apply, /use-runtime, /recalculate, /regenerate, /deploy, /train, /execute, /send, /rollback-now

## Known limitations

- No production activation path in Phase 21
- SANDBOX_TESTED requires Phase 22
- Impact preview does not run A/B
- Engines do not consume Phase 21 Draft/validated versions

## Stop

Wait for approval before Phase 22.
