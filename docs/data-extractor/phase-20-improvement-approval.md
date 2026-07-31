# Phase 20 — Controlled Improvement Proposal Approval Center

## Architecture

Phase 20 adds an administrative Approval Center for Phase 19 draft Improvement Proposals.

Authorized reviewers can review proposals, supporting feedback, sample size, agreement, ground truth, risk, impact, and configuration comparisons; request more evidence; approve for Implementation Specification creation; reject; archive; and generate a non-executable developer handoff package.

## Critical rule

"Approved" means **APPROVED FOR IMPLEMENTATION SPECIFICATION** only.

It does not mean active, applied, deployed, implemented, enabled, or used by scoring / classification / recommendations / Assistant / KG / CRM.

Every Phase 20 output remains executable: false.

## Approval lifecycle

DRAFT -> SUBMITTED_FOR_REVIEW -> UNDER_BUSINESS_REVIEW -> UNDER_TECHNICAL_REVIEW -> UNDER_RISK_REVIEW -> NEEDS_MORE_EVIDENCE -> RECOMMENDED -> REJECTED | APPROVED_FOR_IMPLEMENTATION_SPEC -> IMPLEMENTATION_SPEC_GENERATED -> ARCHIVED

No ACTIVE / APPLIED / DEPLOYED / EXECUTED statuses.

## Review types

BUSINESS_REVIEW, TECHNICAL_REVIEW, RISK_REVIEW, DATA_QUALITY_REVIEW, PRIVACY_REVIEW, SECURITY_REVIEW, COMPLIANCE_REVIEW, FINAL_REVIEW.

Decisions: APPROVE, REJECT, NEEDS_MORE_EVIDENCE, APPROVE_WITH_CONDITIONS, ABSTAIN.

## Separation of duties

Configurable defaults:
- Creator cannot final-approve
- Business approver cannot also satisfy required technical approval
- HIGH/CRITICAL risk requires risk review
- Authenticated user identity only (forged reviewerId rejected)

## Evidence / eligibility

Checks sample size, agreement, conflicts, outdated feedback, ground truth, checksum/version, source permissions, executable:false.

Explicit reason codes: INSUFFICIENT_SAMPLE, LOW_REVIEWER_AGREEMENT, UNRESOLVED_CONFLICT, OUTDATED_SOURCE, MISSING_GROUND_TRUTH, MISSING_TECHNICAL_REVIEW, MISSING_RISK_REVIEW, FOREIGN_COMPANY, PROPOSAL_VERSION_CHANGED, PERMISSION_DENIED, etc.

## Risk and impact

Risk levels LOW/MEDIUM/HIGH/CRITICAL inform required reviews only.
Impact analysis is descriptive and read-only. No historical simulation (Phase 22).

## Implementation Specification

Generated only after required approvals. Documentation/metadata only.
Always executable:false, implementationRequired:true.
Does not change active configuration, scores, CRM, or KG.

## Permissions

data_extractor.improvement_approval.{view,submit,business_review,technical_review,risk_review,privacy_review,security_review,request_evidence,approve,reject,generate_spec,export,saved_views,audit,settings,manage}

## Security

req.companyId only; reject body/query companyId/tenantId; assertNoSecrets; prompt-injection comment rejection; append-only audit; company-scoped indexes.

## Non-executable boundary / known limitations

Phase 20 never activates, applies, deploys, trains, recalculates scores, regenerates recommendations, mutates CRM, creates Tasks, or sends communications.
Future implementation/activation requires separate controlled phases after explicit approval.
