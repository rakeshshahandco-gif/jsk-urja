import { ApiError } from '../../../utils/ApiError.js';
import { SandboxEvaluationRun } from '../../../models/sandboxEvaluationRun.model.js';
import { SandboxEvaluationResult } from '../../../models/sandboxEvaluationResult.model.js';
import { SandboxEvaluationMetric } from '../../../models/sandboxEvaluationMetric.model.js';
import { SandboxEvaluationIssue } from '../../../models/sandboxEvaluationIssue.model.js';
import { SandboxEvaluationRecommendation } from '../../../models/sandboxEvaluationRecommendation.model.js';
import { IntelligenceConfigurationVersion } from '../../../models/intelligenceConfigurationVersion.model.js';
import { IntelligenceConfigurationFamily } from '../../../models/intelligenceConfigurationFamily.model.js';
import { ALLOWED_TRANSITIONS, PERMS } from './constants.js';
import { assertView, assertPerm, isAggregateOnly, canViewRowDetail, hasSb, hasManage } from './permissions.util.js';
import {
    rejectTenantOverrides, assertNoSecrets, notDeleted, snapshotHash, sanitizeError,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { validateRunInputs } from './validation.service.js';
import { evaluateRecord, isFamilySupported } from './adapters.service.js';
import { classifyComparison, computeMetrics } from './compare.service.js';
import { evaluateGates, buildRecommendation } from './gates.service.js';
import { loadDatasetRows, buildSyntheticFixture } from './dataset.service.js';
import { getSettings } from './settings.service.js';

function assertTransition(from, to) {
    const allowed = ALLOWED_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) throw new ApiError(400, `Invalid run transition ${from} -> ${to}`);
}

function redactRun(doc) {
    return {
        ...doc,
        id: String(doc._id),
        runtimeActivation: false,
        sourceMutated: false,
        productionReady: false,
    };
}

function redactResult(row, user) {
    const out = { ...row, id: String(row._id) };
    if (isAggregateOnly(user) || !canViewRowDetail(user)) {
        delete out.baselineOutput;
        delete out.candidateOutput;
        delete out.groundTruth;
        delete out.explanation;
        out.rowDetailRedacted = true;
    }
    return out;
}

export async function listRuns(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { companyId, ...notDeleted() };
    if (query.status) q.status = query.status;
    if (query.familyId) q.familyId = query.familyId;
    const items = await SandboxEvaluationRun.find(q).sort({ createdAt: -1 }).limit(100).lean();
    return { items: items.map(redactRun) };
}

export async function getRun(companyId, id, user = null) {
    assertView(user);
    const doc = await SandboxEvaluationRun.findOne({ _id: id, companyId, ...notDeleted() }).lean();
    if (!doc) throw new ApiError(404, 'Sandbox evaluation run not found');
    return redactRun(doc);
}

export async function createRun(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.create);
    rejectTenantOverrides(body);
    assertNoSecrets(body);

    let familyCode = body.familyCode || '';
    if (body.familyId) {
        const family = await IntelligenceConfigurationFamily.findOne({
            _id: body.familyId, companyId, ...notDeleted(),
        }).lean();
        if (!family) throw new ApiError(404, 'Configuration family not found for this company');
        familyCode = family.code;
    }
    if (!familyCode) throw new ApiError(400, 'familyId or familyCode is required');

    const doc = await SandboxEvaluationRun.create({
        companyId,
        familyId: body.familyId,
        familyCode,
        baselineVersionId: body.baselineVersionId,
        candidateVersionId: body.candidateVersionId,
        datasetId: body.datasetId || null,
        datasetKind: body.datasetId ? 'PHASE19_DATASET' : (body.useSynthetic === false ? 'FIXTURE' : 'SYNTHETIC'),
        evaluationMode: body.evaluationMode || 'DRY_RUN',
        status: 'DRAFT',
        requestedBy: userId,
        isolationMode: 'IN_MEMORY_NON_MUTATING',
        runtimeActivation: false,
        sourceMutated: false,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'run_created', 'RUN', doc._id, {
        evaluationMode: doc.evaluationMode,
        runtimeActivation: false,
    });
    return redactRun(doc.toObject());
}

export async function validateRun(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.validate);
    rejectTenantOverrides(body);
    const doc = await SandboxEvaluationRun.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Run not found');
    assertTransition(doc.status, 'VALIDATING');
    doc.status = 'VALIDATING';
    doc.updatedBy = userId;
    await doc.save();

    try {
        const { report, family } = await validateRunInputs(companyId, {
            familyId: doc.familyId,
            familyCode: doc.familyCode,
            baselineVersionId: doc.baselineVersionId,
            candidateVersionId: doc.candidateVersionId,
            datasetId: doc.datasetId,
            expectedDatasetChecksum: body.expectedDatasetChecksum,
        }, user);
        doc.familyCode = family.code;
        doc.validationReport = report;
        doc.configurationSnapshotHashes = report.configurationSnapshotHashes;
        doc.checksum = snapshotHash({
            baseline: report.configurationSnapshotHashes.baseline,
            candidate: report.configurationSnapshotHashes.candidate,
            mode: doc.evaluationMode,
        });
        assertTransition('VALIDATING', 'READY');
        doc.status = 'READY';
        doc.errorSummary = '';
        doc.updatedBy = userId;
        await doc.save();
        await writeAudit(companyId, userId, 'run_validated', 'RUN', doc._id, {
            ok: true, runtimeActivation: false,
        });
        return { run: redactRun(doc.toObject()), validation: report };
    } catch (err) {
        const report = err.validationReport || {
            ok: false,
            errors: [{ code: 'VALIDATION_ERROR', message: sanitizeError(err) }],
            privacyPass: false,
            tenantIsolationPass: false,
            securityPass: false,
        };
        doc.validationReport = report;
        doc.errorSummary = sanitizeError(err);
        doc.status = 'FAILED';
        doc.updatedBy = userId;
        await doc.save();
        await writeAudit(companyId, userId, 'run_validation_failed', 'RUN', doc._id, {
            error: doc.errorSummary, runtimeActivation: false,
        });
        if (report.errors?.some((e) => e.code === 'EVALUATION_NOT_SUPPORTED')) {
            throw new ApiError(400, 'EVALUATION_NOT_SUPPORTED');
        }
        throw new ApiError(err.statusCode || 400, sanitizeError(err));
    }
}

export async function startRun(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.run);
    rejectTenantOverrides(body);
    const doc = await SandboxEvaluationRun.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Run not found');
    if (doc.status !== 'READY') throw new ApiError(400, 'Run must be READY before start');
    assertTransition(doc.status, 'RUNNING');

    const settings = await getSettings(companyId);
    const { report, family, baseline, candidate } = await validateRunInputs(companyId, {
        familyId: doc.familyId,
        familyCode: doc.familyCode,
        baselineVersionId: doc.baselineVersionId,
        candidateVersionId: doc.candidateVersionId,
        datasetId: doc.datasetId,
        expectedDatasetChecksum: body.expectedDatasetChecksum,
    }, user);

    doc.status = 'RUNNING';
    doc.startedAt = new Date();
    doc.cancelRequested = false;
    doc.updatedBy = userId;
    doc.runtimeActivation = false;
    doc.sourceMutated = false;
    await doc.save();
    await writeAudit(companyId, userId, 'run_started', 'RUN', doc._id, {
        isolationMode: doc.isolationMode,
        runtimeActivation: false,
        sourceMutated: false,
    });

    const started = Date.now();
    const timeoutMs = settings.timeoutMs || 30000;
    const maxRows = settings.maximumResultRows || 5000;

    try {
        let loaded;
        if (doc.datasetId) {
            loaded = await loadDatasetRows(companyId, doc.datasetId, {
                expectedChecksum: body.expectedDatasetChecksum,
                maxRows,
            });
        } else {
            const synthetic = buildSyntheticFixture(family.code);
            loaded = await loadDatasetRows(companyId, null, { syntheticRows: synthetic, maxRows });
            doc.datasetKind = 'SYNTHETIC';
        }

        if (loaded.rows.length < (settings.minimumDatasetSize || 3) && doc.evaluationMode !== 'SECURITY_VALIDATION') {
            // still allow but gate will fail/inconclusive
        }
        if (loaded.rows.length > maxRows) {
            throw new ApiError(400, 'Result-size limit exceeded');
        }

        // Mode-specific soft checks (all non-mutating)
        if (['SECURITY_VALIDATION', 'TENANT_ISOLATION_VALIDATION', 'AGGREGATE_ONLY_VALIDATION'].includes(doc.evaluationMode)) {
            // still run adapters on fixtures for consistency
        }

        const resultDocs = [];
        const timings = [];
        for (const row of loaded.rows) {
            if (doc.cancelRequested) break;
            if (Date.now() - started > timeoutMs) {
                throw new ApiError(400, 'Evaluation timeout enforced');
            }
            const t0 = Date.now();
            const groundTruth = row.groundTruth || null;
            const groundTruthType = row.groundTruthType || (loaded.kind === 'SYNTHETIC' && groundTruth ? 'REVIEWER_CONSENSUS' : (row.groundTruthType || 'NONE'));

            const baseEval = evaluateRecord(family.code, baseline.configurationPayload, row);
            const candEval = evaluateRecord(family.code, candidate.configurationPayload, row);
            if (!baseEval.supported || !candEval.supported) {
                resultDocs.push({
                    companyId,
                    evaluationRunId: doc._id,
                    sourceRecordReference: String(row._rowId || row.id || ''),
                    baselineOutput: null,
                    candidateOutput: null,
                    comparisonStatus: 'EVALUATION_ERROR',
                    groundTruth,
                    groundTruthType,
                    baselineCorrectness: 'UNKNOWN',
                    candidateCorrectness: 'UNKNOWN',
                    explanation: 'EVALUATION_NOT_SUPPORTED',
                    redactionLevel: loaded.redactionLevel,
                    executionMs: Date.now() - t0,
                    riskFlags: ['UNSUPPORTED'],
                });
                timings.push(Date.now() - t0);
                continue;
            }

            // Isolation assertions on adapter outputs
            if (baseEval.output?.persisted || candEval.output?.persisted
                || baseEval.output?.mutated || candEval.output?.mutated
                || baseEval.output?.graphModified || candEval.output?.graphModified
                || baseEval.output?.sent || candEval.output?.sent) {
                throw new ApiError(500, 'Adapter attempted mutation — aborted');
            }

            const cmp = classifyComparison(
                baseEval.output, candEval.output, groundTruth, groundTruthType, family.code,
            );
            const riskFlags = [];
            if (cmp.comparisonStatus === 'REGRESSED') riskFlags.push('REGRESSION');
            if (candEval.output?.kind === 'KG') riskFlags.push('KG_SUGGESTION_ONLY');
            if (candEval.output?.kind === 'MARKETING_DRAFT') riskFlags.push('NO_SEND');

            resultDocs.push({
                companyId,
                evaluationRunId: doc._id,
                sourceRecordReference: String(row._rowId || row.id || ''),
                baselineOutput: baseEval.output,
                candidateOutput: candEval.output,
                comparisonStatus: cmp.comparisonStatus,
                groundTruth,
                groundTruthType,
                baselineCorrectness: cmp.baselineCorrectness,
                candidateCorrectness: cmp.candidateCorrectness,
                improvementType: cmp.improvementType,
                regressionType: cmp.regressionType,
                riskFlags,
                explanation: `${cmp.comparisonStatus} (sandbox only)`,
                redactionLevel: loaded.redactionLevel,
                executionMs: Date.now() - t0,
            });
            timings.push(Date.now() - t0);
        }

        // Re-read cancel flag
        const fresh = await SandboxEvaluationRun.findById(doc._id);
        if (fresh.cancelRequested) {
            assertTransition('RUNNING', 'CANCELLED');
            fresh.status = 'CANCELLED';
            fresh.completedAt = new Date();
            fresh.recordCount = loaded.rows.length;
            fresh.resultCount = resultDocs.length;
            fresh.updatedBy = userId;
            await fresh.save();
            if (resultDocs.length) await SandboxEvaluationResult.insertMany(resultDocs);
            await writeAudit(companyId, userId, 'run_cancelled', 'RUN', doc._id, { runtimeActivation: false });
            return redactRun(fresh.toObject());
        }

        assertNoSecrets(resultDocs);
        if (resultDocs.length) await SandboxEvaluationResult.insertMany(resultDocs);

        const metrics = computeMetrics(resultDocs, timings);
        // Accuracy must not be reported without verified ground truth
        if (!metrics.accuracyReported) {
            metrics.accuracy = undefined;
            metrics.note = 'Accuracy not reported — verified ground truth unavailable';
        }

        const gate = evaluateGates(metrics, settings, report);
        const recommendation = buildRecommendation(gate.gateResult, metrics, report);

        await SandboxEvaluationMetric.findOneAndUpdate(
            { companyId, evaluationRunId: doc._id },
            {
                companyId,
                evaluationRunId: doc._id,
                metrics,
                sampleSize: metrics.sampleSize,
                verifiedGroundTruthRows: metrics.verifiedGroundTruthRows,
                accuracyReported: metrics.accuracyReported,
            },
            { upsert: true, new: true },
        );

        await SandboxEvaluationIssue.deleteMany({ companyId, evaluationRunId: doc._id });
        if (gate.issues.length) {
            await SandboxEvaluationIssue.insertMany(gate.issues.map((i) => ({
                companyId,
                evaluationRunId: doc._id,
                severity: i.severity,
                code: i.code,
                message: i.message,
            })));
        }

        await SandboxEvaluationRecommendation.findOneAndUpdate(
            { companyId, evaluationRunId: doc._id },
            {
                companyId,
                evaluationRunId: doc._id,
                code: recommendation.code,
                summary: recommendation.summary,
                rationale: recommendation.rationale,
                gateResult: gate.gateResult,
                productionReady: false,
                advisoryOnly: true,
            },
            { upsert: true, new: true },
        );

        const hasWarnings = gate.gateResult === 'PASS_WITH_WARNINGS' || gate.gateResult === 'INCONCLUSIVE' || (report.warnings || []).length;
        const nextStatus = gate.gateResult === 'FAIL' && metrics.evaluationErrors === metrics.sampleSize
            ? 'FAILED'
            : (hasWarnings ? 'COMPLETED_WITH_WARNINGS' : 'COMPLETED');
        assertTransition('RUNNING', nextStatus === 'FAILED' ? 'FAILED' : nextStatus);

        doc.status = nextStatus;
        doc.completedAt = new Date();
        doc.recordCount = loaded.rows.length;
        doc.resultCount = resultDocs.length;
        doc.gateResult = gate.gateResult;
        doc.recommendationCode = recommendation.code;
        doc.validationReport = report;
        doc.runtimeActivation = false;
        doc.sourceMutated = false;
        doc.updatedBy = userId;
        await doc.save();

        // Optional metadata-only mark SANDBOX_TESTED on candidate — never activate runtime
        if (settings.markSandboxTestedOnComplete && ['COMPLETED', 'COMPLETED_WITH_WARNINGS'].includes(nextStatus)) {
            const cand = await IntelligenceConfigurationVersion.findOne({
                _id: candidate._id, companyId, ...notDeleted(),
            });
            if (cand && cand.status === 'READY_FOR_SANDBOX') {
                cand.status = 'SANDBOX_TESTED';
                cand.runtimeActive = false;
                cand.immutableAfterPublish = true;
                cand.updatedBy = userId;
                await cand.save();
                await writeAudit(companyId, userId, 'candidate_marked_sandbox_tested', 'VERSION', cand._id, {
                    runtimeActive: false,
                    productionActivation: false,
                    note: 'Metadata only — not activated',
                });
            }
        }

        await writeAudit(companyId, userId, 'run_completed', 'RUN', doc._id, {
            status: doc.status,
            gateResult: gate.gateResult,
            recommendation: recommendation.code,
            runtimeActivation: false,
            sourceMutated: false,
            productionReady: false,
        });

        return {
            run: redactRun(doc.toObject()),
            metrics,
            recommendation,
            gate,
            isolation: {
                inMemory: true,
                sourceMutated: false,
                runtimeActivation: false,
                crmMutation: false,
            },
        };
    } catch (err) {
        doc.status = 'FAILED';
        doc.completedAt = new Date();
        doc.errorSummary = sanitizeError(err);
        doc.runtimeActivation = false;
        doc.sourceMutated = false;
        doc.updatedBy = userId;
        await doc.save();
        await writeAudit(companyId, userId, 'run_failed', 'RUN', doc._id, {
            error: doc.errorSummary, runtimeActivation: false,
        });
        throw new ApiError(err.statusCode || 500, sanitizeError(err));
    }
}

export async function cancelRun(companyId, userId, id, user = null) {
    assertPerm(user, PERMS.cancel);
    const doc = await SandboxEvaluationRun.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Run not found');
    if (!['DRAFT', 'VALIDATING', 'READY', 'RUNNING'].includes(doc.status)) {
        throw new ApiError(400, 'Run cannot be cancelled in current status');
    }
    if (doc.status === 'RUNNING') {
        doc.cancelRequested = true;
        doc.updatedBy = userId;
        await doc.save();
        await writeAudit(companyId, userId, 'run_cancel_requested', 'RUN', doc._id, { runtimeActivation: false });
        return { ...redactRun(doc.toObject()), cancelRequested: true };
    }
    assertTransition(doc.status, 'CANCELLED');
    doc.status = 'CANCELLED';
    doc.completedAt = new Date();
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'run_cancelled', 'RUN', doc._id, { runtimeActivation: false });
    return redactRun(doc.toObject());
}

export async function archiveRun(companyId, userId, id, user = null) {
    assertPerm(user, PERMS.manage);
    const doc = await SandboxEvaluationRun.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Run not found');
    assertTransition(doc.status, 'ARCHIVED');
    doc.status = 'ARCHIVED';
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'run_archived', 'RUN', doc._id, {});
    return redactRun(doc.toObject());
}

export async function getStatus(companyId, id, user = null) {
    const run = await getRun(companyId, id, user);
    return {
        id: run.id,
        status: run.status,
        recordCount: run.recordCount,
        resultCount: run.resultCount,
        gateResult: run.gateResult,
        recommendationCode: run.recommendationCode,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        runtimeActivation: false,
        sourceMutated: false,
    };
}

export async function listResults(companyId, id, query = {}, user = null) {
    assertView(user);
    if (!hasSb(user, PERMS.view_results) && !hasManage(user) && !hasSb(user, PERMS.view)) {
        assertPerm(user, PERMS.view_results);
    }
    // Prefer view_results; aggregate-only view still allowed with redaction
    const run = await SandboxEvaluationRun.findOne({ _id: id, companyId, ...notDeleted() }).lean();
    if (!run) throw new ApiError(404, 'Run not found');
    const q = { companyId, evaluationRunId: run._id, ...notDeleted() };
    if (query.comparisonStatus) q.comparisonStatus = query.comparisonStatus;
    const items = await SandboxEvaluationResult.find(q).sort({ createdAt: 1 }).limit(500).lean();
    return {
        items: items.map((r) => redactResult(r, user)),
        sampleSize: items.length,
        storedIn: 'sandbox_evaluation_results',
    };
}

export async function getResult(companyId, runId, resultId, user = null) {
    assertPerm(user, PERMS.view_row_detail);
    const row = await SandboxEvaluationResult.findOne({
        _id: resultId, evaluationRunId: runId, companyId, ...notDeleted(),
    }).lean();
    if (!row) throw new ApiError(404, 'Result not found');
    return redactResult(row, user);
}

export async function getMetrics(companyId, id, user = null) {
    assertPerm(user, PERMS.view_results);
    const doc = await SandboxEvaluationMetric.findOne({ companyId, evaluationRunId: id, ...notDeleted() }).lean();
    if (!doc) throw new ApiError(404, 'Metrics not found');
    return {
        ...doc.metrics,
        sampleSize: doc.sampleSize,
        verifiedGroundTruthRows: doc.verifiedGroundTruthRows,
        accuracyReported: doc.accuracyReported,
    };
}

export async function getIssues(companyId, id, user = null) {
    assertView(user);
    const items = await SandboxEvaluationIssue.find({
        companyId, evaluationRunId: id, ...notDeleted(),
    }).sort({ createdAt: 1 }).lean();
    return { items };
}

export async function getRecommendation(companyId, id, user = null) {
    assertView(user);
    const doc = await SandboxEvaluationRecommendation.findOne({
        companyId, evaluationRunId: id, ...notDeleted(),
    }).lean();
    if (!doc) throw new ApiError(404, 'Recommendation not found');
    return {
        ...doc,
        productionReady: false,
        advisoryOnly: true,
        activatesConfiguration: false,
    };
}

export async function getCompare(companyId, id, user = null) {
    assertPerm(user, PERMS.compare);
    const run = await getRun(companyId, id, user);
    const metrics = await SandboxEvaluationMetric.findOne({ companyId, evaluationRunId: id, ...notDeleted() }).lean();
    const recommendation = await SandboxEvaluationRecommendation.findOne({ companyId, evaluationRunId: id, ...notDeleted() }).lean();
    const issues = await SandboxEvaluationIssue.find({ companyId, evaluationRunId: id, ...notDeleted() }).lean();
    const improvements = await SandboxEvaluationResult.find({
        companyId, evaluationRunId: id, comparisonStatus: 'IMPROVED', ...notDeleted(),
    }).limit(10).lean();
    const regressions = await SandboxEvaluationResult.find({
        companyId, evaluationRunId: id, comparisonStatus: 'REGRESSED', ...notDeleted(),
    }).limit(10).lean();
    const fps = await SandboxEvaluationResult.find({
        companyId, evaluationRunId: id, candidateCorrectness: 'INCORRECT', baselineCorrectness: 'CORRECT', ...notDeleted(),
    }).limit(10).lean();
    const fns = await SandboxEvaluationResult.find({
        companyId, evaluationRunId: id, candidateCorrectness: 'INCORRECT', baselineCorrectness: 'INCORRECT', ...notDeleted(),
    }).limit(5).lean();

    return {
        baselineVersionId: run.baselineVersionId,
        candidateVersionId: run.candidateVersionId,
        datasetId: run.datasetId,
        datasetKind: run.datasetKind,
        scope: 'OWN_COMPANY',
        metrics: metrics?.metrics || null,
        sampleSize: metrics?.sampleSize || 0,
        changedRecords: metrics?.metrics?.totalChanged || 0,
        improvementExamples: improvements.map((r) => redactResult(r, user)),
        regressionExamples: regressions.map((r) => redactResult(r, user)),
        falsePositiveExamples: fps.map((r) => redactResult(r, user)),
        falseNegativeExamples: fns.map((r) => redactResult(r, user)),
        riskDistribution: issues.map((i) => ({ code: i.code, severity: i.severity })),
        dataGaps: {
            insufficientGroundTruth: metrics?.metrics?.insufficientGroundTruth || 0,
            verifiedGroundTruthRows: metrics?.verifiedGroundTruthRows || 0,
        },
        performance: {
            averageExecutionTimeMs: metrics?.metrics?.averageExecutionTimeMs,
            p95ExecutionTimeMs: metrics?.metrics?.p95ExecutionTimeMs,
        },
        securityChecks: run.validationReport?.securityPass === true,
        tenantIsolationResult: run.validationReport?.tenantIsolationPass === true,
        aggregateOnlyResult: isAggregateOnly(user),
        gateResult: run.gateResult,
        recommendation: recommendation ? {
            code: recommendation.code,
            summary: recommendation.summary,
            advisoryOnly: true,
            productionReady: false,
        } : null,
        runtimeActivation: false,
        note: 'A/B comparison is advisory. No version is production-ready from Phase 22.',
    };
}

export async function exportRun(companyId, id, user = null) {
    assertPerm(user, PERMS.export);
    const compare = await getCompare(companyId, id, user);
    const payload = {
        packageType: 'SANDBOX_EVALUATION_EXPORT',
        exportedAt: new Date().toISOString(),
        compare,
        runtimeActivation: false,
        sourceMutated: false,
        redacted: isAggregateOnly(user) || !canViewRowDetail(user),
    };
    assertNoSecrets(payload);
    await writeAudit(companyId, user?.id || user?._id, 'run_exported', 'RUN', id, {
        redacted: payload.redacted, runtimeActivation: false,
    });
    return payload;
}
