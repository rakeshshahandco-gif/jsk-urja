# Phase 19 — Controlled AI Feedback, Learning Intelligence & Recommendation Improvement Engine

## Architecture

Phase 19 adds a supervised feedback and recommendation layer for Data Extractor / AI Lead Intelligence.

It collects structured human feedback on AI, rule-based, and relationship-intelligence outputs, produces analytics, draft improvement proposals, and redacted offline evaluation datasets.

It is not an autonomous learning system.

Feedback may produce analysis, trends, recommendations, draft rule/threshold/prompt/mapping changes, and evaluation datasets.

Feedback must not directly produce active rule, threshold, prompt, score, classification, product, or relationship changes, CRM mutations, deployment, training, or fine-tuning.

All proposals remain executable: false and approvedForImplementation: false until a future controlled implementation phase.

## Feedback lifecycle

SUBMITTED -> VALIDATED -> UNDER_REVIEW -> ACCEPTED | REJECTED | DUPLICATE | CONFLICTED -> INCLUDED_IN_ANALYSIS -> PROPOSAL_GENERATED -> ARCHIVED

Also: SOURCE_VERSION_CHANGED, OUTDATED_FEEDBACK when the reviewed source version drifts.

Feedback acceptance is not source-record approval.

## Feedback types

ACCEPT, REJECT, CORRECT, INCORRECT, HELPFUL, NOT_HELPFUL, RELEVANT, NOT_RELEVANT, TOO_HIGH, TOO_LOW, COMPLETE, INCOMPLETE, CONFIRM_RELATIONSHIP, REJECT_RELATIONSHIP, CONFIRM_DUPLICATE, REJECT_DUPLICATE, WRONG_*, STALE_DATA, MISSING_DATA, PRIVACY_CONCERN, OTHER.

## Source-module integration

Read-only adapters load snapshots. Phase 19 does not import Phase 13/14 write/apply services, Task creation, campaign execution, or KG discovery write paths for feedback submission.

## Ground-truth categories

USER_OPINION, REVIEWER_CONSENSUS, VERIFIED_BUSINESS_FACT, APPROVED_MASTER_DATA, CONFIRMED_OUTCOME, UNKNOWN.

Single-user feedback is never verified ground truth. Acceptance rate is not called accuracy without verified ground truth.

## Conflict handling and reviewer agreement

Conflicting polarity creates CONFLICTED status and a review-queue item.

Agreement labels: STRONG_AGREEMENT, MAJORITY_AGREEMENT, SPLIT_REVIEW, LOW_SAMPLE, CONFLICTED, UNRESOLVED.

Default reviewer weighting is EQUAL.

## Analytics definitions

Totals, acceptance/reject rates (not accuracy), module rates, dispute rates, conflict/outdated/privacy counts, proposal counts.

Every metric shows sample size and reliability: PRELIMINARY / LOW_SAMPLE / MODERATE_SAMPLE / RELIABLE_SAMPLE.

## Proposal lifecycle

DRAFT -> UNDER_REVIEW -> NEEDS_MORE_EVIDENCE -> RECOMMENDED | REJECTED | APPROVED_FOR_FUTURE_IMPLEMENTATION -> ARCHIVED

Even APPROVED_FOR_FUTURE_IMPLEMENTATION remains non-executable and not applied.

## Dataset redaction and storage

MongoDB stores metadata only. JSONL files use local storage/ai-learning-datasets/{companyId}/.

Dataset generation does not call AI providers or trigger training.

## Permissions

data_extractor.ai_learning.{view,submit_feedback,review_feedback,resolve_conflict,analytics,review_queue,generate_proposal,review_proposal,export,dataset,saved_views,audit,settings,manage}

Source-module view permissions are still required.

## Security

req.companyId only; reject body/query companyId/tenantId; secret/prompt-injection rejection; aggregate-only privacy; append-only audit.

## Known limitations

No automatic learning into production; small samples labelled preliminary; Phase 17/18 UI feedback writes Phase 19 feedback only.

## Explicit non-autonomous behavior

Never: retrain, fine-tune, activate rules, apply thresholds, recalculate scores, regenerate classifications/recommendations, approve/delete KG relationships, mutate CRM, create Tasks, send email/WhatsApp, or execute provider discovery as part of learning.

## Future implementation boundary

Applying any draft proposal requires a separate controlled development phase after explicit approval.
