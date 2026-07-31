# Phase 22 — Sandbox Evaluation, Historical Simulation and A/B Comparison

## Architecture

Phase 22 provides an isolated Sandbox Evaluation Engine that compares a **baseline** configuration version against a **candidate** Phase 21 version using approved datasets or marked SYNTHETIC fixtures.

Execution is **in-memory** via deterministic adapters. Outputs are stored only in Phase 22 collections (`sandbox_evaluation_*`).

## Isolation

The sandbox must not:

- Update source records
- Save live Lead Scores / classifications / product recommendations
- Modify Knowledge Graph relationships
- Modify CRM / create Leads / create Tasks
- Send messages
- Activate the candidate configuration
- Deploy anything

Adapters always return `mutated:false`, `persisted:false`. Gate PASS does **not** activate configuration.

Optionally, a completed evaluation may mark the candidate version `SANDBOX_TESTED` as **metadata only** (`runtimeActive` remains false).

## Evaluation modes

DRY_RUN, HISTORICAL_SIMULATION, FIXTURE_COMPARISON, FEEDBACK_ALIGNMENT, OUTCOME_ALIGNMENT, PERFORMANCE_BENCHMARK, SECURITY_VALIDATION, TENANT_ISOLATION_VALIDATION, AGGREGATE_ONLY_VALIDATION — all non-mutating.

## Data sources

Phase 19 Evaluation Datasets, approved fixtures, and SYNTHETIC fixtures (explicitly labelled). Synthetic and production-like results are not mixed without labels. Live production DB is not used for writes.

## Pre-run validation

Company scope, candidate READY_FOR_SANDBOX, baseline/candidate validity, same family, schema/deps, dataset scope/checksum/redaction, min size, permissions, result-size/timeout, unsafe config rejection, supported adapter, rollback target where required.

Unsupported families return **EVALUATION_NOT_SUPPORTED** (no pretended evaluation).

## Comparison classifications

UNCHANGED_CORRECT, UNCHANGED_INCORRECT, IMPROVED, REGRESSED, BASELINE_ONLY, CANDIDATE_ONLY, CHANGED_UNVERIFIED, INSUFFICIENT_GROUND_TRUTH, NOT_APPLICABLE, EVALUATION_ERROR.

Candidates are never labelled “better” without a valid comparison basis.

## Metrics / ground truth

Precision/Recall/F1 and accuracy-like rates are only reported when verified ground truth exists. Sample size is always shown.

## Regression gates

Company settings define non-executable gates (max regression %, min improvement, FP/FN, sample size, privacy/tenant/security passes). Results: PASS / PASS_WITH_WARNINGS / FAIL / INCONCLUSIVE. **PASS does not activate.**

## Recommendations (advisory)

READY_FOR_FURTHER_REVIEW, NEEDS_CONFIGURATION_CHANGE, NEEDS_MORE_DATA, NEEDS_MORE_GROUND_TRUTH, HIGH_REGRESSION_RISK, PERFORMANCE_RISK, PRIVACY_RISK, SECURITY_RISK, NOT_RECOMMENDED, INCONCLUSIVE.

Never production-ready.

## Permissions / APIs

`data_extractor.sandbox_evaluation.*` under `/api/v1/data-extractor/ai-lead-intelligence/sandbox-evaluation`.

No `/activate|/apply|/deploy|/promote-production|/update-live-records|/recalculate-live|/regenerate-live|/train|/send|/create-lead|/assign`.

## Known limitations

- Deterministic adapters approximate module behavior; they do not call live engines.
- Some families are unsupported by design.
- Historical A/B uses approved/synthetic rows only.
- SANDBOX_TESTED is metadata, not activation.

## Stop

Wait for approval before Phase 23.
