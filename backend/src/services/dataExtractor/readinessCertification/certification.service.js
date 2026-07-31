import { ApiError } from '../../../utils/ApiError.js';
import { ProductionReadinessCertification } from '../../../models/productionReadinessCertification.model.js';
import { ProductionReadinessHistory } from '../../../models/productionReadinessHistory.model.js';
import { ProductionReadinessReview } from '../../../models/productionReadinessReview.model.js';
import { ProductionReadinessFinding } from '../../../models/productionReadinessFinding.model.js';
import { ProductionReadinessEvidence } from '../../../models/productionReadinessEvidence.model.js';
import { ProductionReadinessAssessment } from '../../../models/productionReadinessAssessment.model.js';
import { ProductionReadinessBenchmark } from '../../../models/productionReadinessBenchmark.model.js';
import { ALLOWED_TRANSITIONS, ASSESSMENT_DOMAINS, PERMS } from './constants.js';
import {
    assertView, assertPerm, assertReviewType, isPlatformAdmin, isClientAdminOnly,
} from './permissions.util.js';
import {
    rejectTenantOverrides, assertNoSecrets, assertSafeText, assertPayloadSafe,
    snapshotHash, notDeleted, forceNonExecutable, assertSafeOutcome, sanitizeFileName,
    sanitizeAbsolutePath, sanitizeExportFormula,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { getSettings } from './settings.service.js';
import { ensureDefaultControls } from './controls.service.js';
import { validateReleasePackage, runLocalChecks, runLocalBenchmark } from './localChecks.service.js';

function assertTransition(from, to) {
    const allowed = ALLOWED_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) throw new ApiError(400, `Invalid certification transition ${from} -> ${to}`);
}

async function writeHistory(companyId, certificationId, action, previousStatus, newStatus, userId, reason = '', metadata = {}) {
    await ProductionReadinessHistory.create({
        companyId, certificationId, action, previousStatus, newStatus, changedBy: userId, reason, metadata,
    });
}

function recomputeChecksum(doc) {
    return snapshotHash({
        certificationNumber: doc.certificationNumber,
        releasePackageId: String(doc.releasePackageId || ''),
        releasePackageChecksum: doc.releasePackageChecksum,
        assessmentDomains: doc.assessmentDomains,
        status: doc.status,
    });
}

function computeReadiness(settings, findings, cert) {
    const open = findings.filter((f) => !['RESOLVED', 'FALSE_POSITIVE', 'ARCHIVED', 'ACCEPTED_RISK'].includes(f.status));
    const critical = open.filter((f) => f.severity === 'CRITICAL');
    const highTenant = open.filter((f) => f.severity === 'HIGH' && f.tenantIsolationRelated);
    const major = open.filter((f) => f.severity === 'HIGH');
    const minor = open.filter((f) => ['MEDIUM', 'LOW'].includes(f.severity));

    let overallReadiness = 'NOT_READY';
    if (settings.blockOnCriticalFinding && critical.length) overallReadiness = 'READY_WITH_CRITICAL_BLOCKERS';
    else if (settings.blockOnHighTenantFinding && highTenant.length) overallReadiness = 'READY_WITH_CRITICAL_BLOCKERS';
    else if (major.length) overallReadiness = 'READY_WITH_MAJOR_BLOCKERS';
    else if (minor.length) overallReadiness = 'READY_WITH_MINOR_CONDITIONS';
    else if (cert.targetEnvironment === 'STAGING') overallReadiness = 'READY_FOR_STAGING_REVIEW';
    else overallReadiness = 'READY_FOR_CONTROLLED_PILOT_REVIEW';

    overallReadiness = assertSafeOutcome(overallReadiness);
    return {
        overallReadiness,
        blockerCount: critical.length + highTenant.length,
        criticalFindingCount: critical.length,
        majorFindingCount: major.length,
        minorFindingCount: minor.length,
        conditionCount: minor.length,
        certificationRecommendation: overallReadiness,
        executable: false,
        deploymentAuthorized: false,
        productionApproved: false,
    };
}

export async function listCertifications(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    if (isClientAdminOnly(user)) {
        const items = await ProductionReadinessCertification.find({
            companyId, ...notDeleted(),
            status: {
                $in: [
                    'READY_FOR_STAGING_REVIEW', 'READY_FOR_CONTROLLED_PILOT_REVIEW',
                    'FINAL_REVIEW', 'MANUAL_REVIEW', 'FINDINGS_REVIEW',
                ],
            },
        }).sort({ createdAt: -1 }).limit(50).lean();
        return {
            items: items.map((d) => forceNonExecutable({
                id: String(d._id),
                certificationNumber: d.certificationNumber,
                certificationName: d.certificationName,
                status: d.status,
                overallReadiness: d.overallReadiness,
                clientView: true,
            })),
        };
    }
    const q = { ...notDeleted(), companyId };
    if (query.status) q.status = query.status;
    const items = await ProductionReadinessCertification.find(q).sort({ createdAt: -1 }).limit(100).lean();
    return { items: items.map((d) => forceNonExecutable({ ...d, id: String(d._id) })) };
}

export async function getCertification(companyId, id, user = null) {
    assertView(user);
    const doc = await ProductionReadinessCertification.findOne({ _id: id, ...notDeleted() }).lean();
    if (!doc) throw new ApiError(404, 'Certification not found');
    if (!doc.platformScoped && String(doc.companyId) !== String(companyId)) {
        throw new ApiError(404, 'Certification not found');
    }
    if (isClientAdminOnly(user) && String(doc.companyId) !== String(companyId)) {
        throw new ApiError(404, 'Certification not found');
    }
    return forceNonExecutable({ ...doc, id: String(doc._id) });
}

export async function createCertification(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.create);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    assertPayloadSafe(body);
    if (isClientAdminOnly(user)) throw new ApiError(403, 'Client Admin cannot create certifications');

    const platformScoped = body.platformScoped === true;
    if (platformScoped && !isPlatformAdmin(user)) {
        throw new ApiError(403, 'Platform Admin required for platform certification');
    }

    await ensureDefaultControls(userId);
    const releaseCheck = await validateReleasePackage(companyId, body.releasePackageId, body.releasePackageChecksum || null);

    const certificationNumber = String(body.certificationNumber || `CERT-${Date.now()}`).slice(0, 80);
    const payload = {
        companyId: platformScoped ? null : companyId,
        platformScoped,
        certificationNumber,
        certificationName: assertSafeText(body.certificationName || certificationNumber, 'certificationName'),
        description: assertSafeText(body.description || '', 'description'),
        releasePackageId: body.releasePackageId,
        releasePackageVersion: String(body.releasePackageVersion || releaseCheck.releaseNumber).slice(0, 80),
        releasePackageChecksum: releaseCheck.checksum || String(body.releasePackageChecksum || ''),
        targetEnvironment: body.targetEnvironment || 'STAGING',
        companyScope: body.companyScope || [{ companyId: String(companyId) }],
        industryScope: body.industryScope || [],
        modulesIncluded: body.modulesIncluded || ['data_extractor'],
        configurationVersions: body.configurationVersions || [],
        sandboxEvaluationReferences: body.sandboxEvaluationReferences || [],
        implementationSpecificationReferences: body.implementationSpecificationReferences || [],
        assessmentDomains: body.assessmentDomains || ASSESSMENT_DOMAINS.slice(0, 12),
        status: 'DRAFT',
        overallRisk: 'UNKNOWN',
        overallReadiness: 'NOT_READY',
        requiredReviews: body.requiredReviews || ['SECURITY_REVIEW', 'PERMISSION_REVIEW', 'TENANT_ISOLATION_REVIEW', 'FINAL_READINESS_REVIEW'],
        certificationRecommendation: 'NOT_READY',
        knownLimitations: body.knownLimitations || ['Phase 24 certifies staging/pilot review eligibility only'],
        releaseValidation: releaseCheck,
        executable: false,
        deploymentAuthorized: false,
        productionApproved: false,
        createdBy: userId,
        updatedBy: userId,
    };
    payload.checksum = recomputeChecksum(payload);
    const doc = await ProductionReadinessCertification.create(payload);
    await writeHistory(companyId, doc._id, 'CREATED', '', 'DRAFT', userId, 'Certification draft created');
    await writeAudit(companyId, userId, 'certification_created', 'CERTIFICATION', doc._id, {
        certificationNumber, executable: false, deploymentAuthorized: false, productionApproved: false,
    }, platformScoped);
    return forceNonExecutable({ ...doc.toObject(), id: String(doc._id) });
}

export async function updateCertification(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.define_scope);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const doc = await ProductionReadinessCertification.findOne({ _id: id, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Certification not found');
    if (!doc.platformScoped && String(doc.companyId) !== String(companyId)) throw new ApiError(404, 'Certification not found');
    if (!['DRAFT', 'SCOPE_DEFINED', 'EVIDENCE_COLLECTION'].includes(doc.status)) {
        throw new ApiError(400, 'Certification locked for current status');
    }
    if (body.certificationName != null) doc.certificationName = assertSafeText(body.certificationName, 'certificationName');
    if (body.description != null) doc.description = assertSafeText(body.description, 'description');
    if (body.industryScope != null) doc.industryScope = body.industryScope;
    if (body.modulesIncluded != null) doc.modulesIncluded = body.modulesIncluded;
    if (body.assessmentDomains != null) doc.assessmentDomains = body.assessmentDomains;
    if (body.knownLimitations != null) doc.knownLimitations = body.knownLimitations;
    if (body.targetEnvironment != null) doc.targetEnvironment = body.targetEnvironment;
    doc.executable = false;
    doc.deploymentAuthorized = false;
    doc.productionApproved = false;
    doc.checksum = recomputeChecksum(doc);
    doc.updatedBy = userId;
    await doc.save();
    return forceNonExecutable({ ...doc.toObject(), id: String(doc._id) });
}

export async function defineScope(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.define_scope);
    rejectTenantOverrides(body);
    const doc = await ProductionReadinessCertification.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Certification not found');
    assertTransition(doc.status, 'SCOPE_DEFINED');
    if (body.industryScope) doc.industryScope = body.industryScope;
    if (body.modulesIncluded) doc.modulesIncluded = body.modulesIncluded;
    if (body.assessmentDomains) doc.assessmentDomains = body.assessmentDomains;
    if (body.companyScope) {
        for (const c of body.companyScope) {
            if (c.companyId && String(c.companyId) !== String(companyId) && !isPlatformAdmin(user)) {
                throw new ApiError(403, 'Cross-company certification scope requires Platform Admin');
            }
        }
        doc.companyScope = body.companyScope;
    }
    const prev = doc.status;
    doc.status = 'SCOPE_DEFINED';
    doc.updatedBy = userId;
    await doc.save();
    await writeHistory(companyId, doc._id, 'SCOPE_DEFINED', prev, doc.status, userId, body.reason || '');
    await writeAudit(companyId, userId, 'scope_defined', 'CERTIFICATION', doc._id, {});
    return forceNonExecutable({ ...doc.toObject(), id: String(doc._id) });
}

export async function validateRelease(companyId, userId, id, user = null) {
    assertPerm(user, PERMS.run_local_checks);
    const doc = await ProductionReadinessCertification.findOne({ _id: id, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Certification not found');
    if (!doc.platformScoped && String(doc.companyId) !== String(companyId)) throw new ApiError(404, 'Certification not found');
    const result = await validateReleasePackage(companyId, doc.releasePackageId, doc.releasePackageChecksum || null);
    doc.releaseValidation = result;
    doc.releasePackageChecksum = result.checksum || doc.releasePackageChecksum;
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'release_validated', 'CERTIFICATION', doc._id, { valid: result.valid });
    return { certification: forceNonExecutable({ ...doc.toObject(), id: String(doc._id) }), validation: result };
}

export async function startAssessment(companyId, userId, id, user = null) {
    assertPerm(user, PERMS.collect_evidence);
    const doc = await ProductionReadinessCertification.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Certification not found');
    const next = doc.status === 'SCOPE_DEFINED' ? 'EVIDENCE_COLLECTION' : 'AUTOMATED_LOCAL_CHECKS';
    assertTransition(doc.status, next);
    const prev = doc.status;
    doc.status = next;
    doc.updatedBy = userId;
    await doc.save();
    await writeHistory(companyId, doc._id, 'ASSESSMENT_STARTED', prev, next, userId, '');
    await writeAudit(companyId, userId, 'assessment_started', 'CERTIFICATION', doc._id, { to: next });
    return forceNonExecutable({ ...doc.toObject(), id: String(doc._id) });
}

export async function runChecks(companyId, userId, id, user = null) {
    const doc = await ProductionReadinessCertification.findOne({ _id: id, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Certification not found');
    if (!doc.platformScoped && String(doc.companyId) !== String(companyId)) throw new ApiError(404, 'Certification not found');
    if (!['SCOPE_DEFINED', 'EVIDENCE_COLLECTION', 'AUTOMATED_LOCAL_CHECKS', 'MANUAL_REVIEW', 'FINDINGS_REVIEW', 'REMEDIATION_REVIEW'].includes(doc.status)) {
        if (['DRAFT'].includes(doc.status)) {
            assertTransition(doc.status, 'SCOPE_DEFINED');
            doc.status = 'SCOPE_DEFINED';
            await doc.save();
        }
    }
    if (['SCOPE_DEFINED', 'EVIDENCE_COLLECTION'].includes(doc.status)) {
        assertTransition(doc.status, 'AUTOMATED_LOCAL_CHECKS');
        const prev = doc.status;
        doc.status = 'AUTOMATED_LOCAL_CHECKS';
        await doc.save();
        await writeHistory(companyId, doc._id, 'LOCAL_CHECKS', prev, doc.status, userId, '');
    }

    const result = await runLocalChecks(companyId, userId, doc.toObject(), user);
    const findings = await ProductionReadinessFinding.find({ certificationId: doc._id, ...notDeleted() }).lean();
    const settings = await getSettings(companyId);
    const readiness = computeReadiness(settings, findings, doc.toObject());
    Object.assign(doc, readiness);
    doc.localCheckSummary = {
        checkCount: result.checks.length,
        findingCount: result.findings.length,
        integrityUnchanged: result.integrity.unchanged,
        at: new Date().toISOString(),
    };
    doc.exceptionCount = findings.filter((f) => f.status === 'ACCEPTED_RISK').length;
    doc.status = readiness.blockerCount ? 'REMEDIATION_REQUIRED' : 'FINDINGS_REVIEW';
    doc.executable = false;
    doc.deploymentAuthorized = false;
    doc.productionApproved = false;
    doc.checksum = recomputeChecksum(doc);
    doc.updatedBy = userId;
    await doc.save();
    return {
        certification: forceNonExecutable({ ...doc.toObject(), id: String(doc._id) }),
        localChecks: result,
    };
}

export async function submitReview(companyId, userId, id, body = {}, user = null) {
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    if (body.reviewerId != null || body.approverId != null) {
        throw new ApiError(400, 'Forged reviewer/approver IDs are rejected');
    }
    const reviewType = body.reviewType || 'QA_REVIEW';
    assertReviewType(user, reviewType);
    const decision = String(body.decision || '').toUpperCase();
    if (!['PASS', 'PASS_WITH_CONDITIONS', 'FAIL', 'NEEDS_EVIDENCE', 'NEEDS_REMEDIATION', 'ABSTAIN'].includes(decision)) {
        throw new ApiError(400, 'Invalid decision');
    }
    const doc = await ProductionReadinessCertification.findOne({ _id: id, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Certification not found');
    if (!doc.platformScoped && String(doc.companyId) !== String(companyId)) throw new ApiError(404, 'Certification not found');

    const comment = assertSafeText(body.comment || '', 'comment');
    await ProductionReadinessReview.create({
        companyId: doc.companyId,
        certificationId: doc._id,
        reviewType,
        decision,
        comment,
        conditions: body.conditions || [],
        reviewedBy: userId,
    });

    const settings = await getSettings(companyId);
    if (reviewType === 'FINAL_READINESS_REVIEW') {
        assertPerm(user, PERMS.final_review);
        if (settings.requireIndependentFinalReviewer && String(doc.createdBy) === String(userId)) {
            throw new ApiError(403, 'Creator cannot be the sole final readiness reviewer');
        }
        const findings = await ProductionReadinessFinding.find({ certificationId: doc._id, ...notDeleted() }).lean();
        const readiness = computeReadiness(settings, findings, doc.toObject());
        Object.assign(doc, readiness);
        const prev = doc.status;
        if (decision === 'FAIL' || decision === 'NEEDS_REMEDIATION') {
            assertTransition(doc.status === 'FINAL_REVIEW' ? doc.status : 'FINDINGS_REVIEW', 'REMEDIATION_REQUIRED');
            doc.status = 'REMEDIATION_REQUIRED';
        } else if (readiness.overallReadiness === 'READY_FOR_CONTROLLED_PILOT_REVIEW') {
            if (doc.status !== 'FINAL_REVIEW') {
                if (ALLOWED_TRANSITIONS[doc.status]?.includes('FINAL_REVIEW')) {
                    doc.status = 'FINAL_REVIEW';
                }
            }
            assertTransition(doc.status, 'READY_FOR_CONTROLLED_PILOT_REVIEW');
            doc.status = 'READY_FOR_CONTROLLED_PILOT_REVIEW';
        } else if (readiness.overallReadiness === 'READY_FOR_STAGING_REVIEW' || decision === 'PASS' || decision === 'PASS_WITH_CONDITIONS') {
            if (doc.status !== 'FINAL_REVIEW' && ALLOWED_TRANSITIONS[doc.status]?.includes('FINAL_REVIEW')) {
                doc.status = 'FINAL_REVIEW';
            }
            if (doc.status === 'FINDINGS_REVIEW') doc.status = 'FINAL_REVIEW';
            assertTransition(doc.status, 'READY_FOR_STAGING_REVIEW');
            doc.status = 'READY_FOR_STAGING_REVIEW';
            doc.certificationRecommendation = 'READY_FOR_STAGING_REVIEW';
            doc.overallReadiness = 'READY_FOR_STAGING_REVIEW';
        }
        await writeHistory(companyId, doc._id, 'FINAL_REVIEW', prev, doc.status, userId, `${reviewType}:${decision}`);
    } else if (['FAIL', 'NEEDS_REMEDIATION'].includes(decision)) {
        if (ALLOWED_TRANSITIONS[doc.status]?.includes('REMEDIATION_REQUIRED')) {
            const prev = doc.status;
            doc.status = 'REMEDIATION_REQUIRED';
            await writeHistory(companyId, doc._id, 'REVIEW', prev, doc.status, userId, `${reviewType}:${decision}`);
        }
    } else if (doc.status === 'FINDINGS_REVIEW' || doc.status === 'MANUAL_REVIEW') {
        if (ALLOWED_TRANSITIONS[doc.status]?.includes('FINAL_REVIEW')) {
            const prev = doc.status;
            doc.status = 'FINAL_REVIEW';
            await writeHistory(companyId, doc._id, 'REVIEW', prev, doc.status, userId, `${reviewType}:${decision}`);
        }
    }

    doc.executable = false;
    doc.deploymentAuthorized = false;
    doc.productionApproved = false;
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'review_submitted', 'CERTIFICATION', doc._id, { reviewType, decision });
    return forceNonExecutable({ ...doc.toObject(), id: String(doc._id) });
}

export async function finalReview(companyId, userId, id, body = {}, user = null) {
    return submitReview(companyId, userId, id, { ...body, reviewType: 'FINAL_READINESS_REVIEW' }, user);
}

export async function archiveCertification(companyId, userId, id, user = null) {
    assertPerm(user, PERMS.manage);
    const doc = await ProductionReadinessCertification.findOne({ _id: id, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Certification not found');
    if (!doc.platformScoped && String(doc.companyId) !== String(companyId)) throw new ApiError(404, 'Certification not found');
    assertTransition(doc.status, 'ARCHIVED');
    const prev = doc.status;
    doc.status = 'ARCHIVED';
    doc.isDeleted = true;
    doc.updatedBy = userId;
    await doc.save();
    await writeHistory(companyId, doc._id, 'ARCHIVED', prev, 'ARCHIVED', userId, '');
    await writeAudit(companyId, userId, 'certification_archived', 'CERTIFICATION', doc._id, {});
    return { archived: true, hardDelete: false };
}

export async function getHistory(companyId, id, user = null) {
    assertView(user);
    await getCertification(companyId, id, user);
    const items = await ProductionReadinessHistory.find({ certificationId: id }).sort({ createdAt: -1 }).lean();
    return { items };
}

export async function getSummary(companyId, id, user = null) {
    const cert = await getCertification(companyId, id, user);
    const findings = await ProductionReadinessFinding.find({ certificationId: id, ...notDeleted() }).lean();
    const assessments = await ProductionReadinessAssessment.find({ certificationId: id, ...notDeleted() }).lean();
    return forceNonExecutable({
        certification: cert,
        findingsSummary: {
            total: findings.length,
            critical: findings.filter((f) => f.severity === 'CRITICAL' && f.status === 'OPEN').length,
            high: findings.filter((f) => f.severity === 'HIGH' && f.status === 'OPEN').length,
        },
        assessments: assessments.map((a) => ({ domain: a.domain, status: a.status })),
        recommendation: cert.certificationRecommendation,
        executable: false,
        deploymentAuthorized: false,
        productionApproved: false,
    });
}

export async function exportCertification(companyId, id, user = null) {
    assertPerm(user, PERMS.export);
    const summary = await getSummary(companyId, id, user);
    const findings = await ProductionReadinessFinding.find({ certificationId: id, ...notDeleted() }).lean();
    const payload = {
        packageType: 'READINESS_CERTIFICATION_REPORT',
        exportedAt: new Date().toISOString(),
        summary: {
            id: summary.certification?.id,
            certificationNumber: summary.certification?.certificationNumber,
            status: summary.certification?.status,
            overallReadiness: summary.certification?.overallReadiness,
            recommendation: summary.recommendation,
            findingsSummary: summary.findingsSummary,
            assessments: summary.assessments,
            executable: false,
            deploymentAuthorized: false,
            productionApproved: false,
        },
        rows: findings.slice(0, 500).map((f) => ({
            title: sanitizeExportFormula(String(f.title || '').replace(/api[_-]?key|token|password|secret|authorization/gi, '[redacted]')),
            severity: f.severity,
            status: f.status,
            domain: f.domain,
        })),
        instructions: [
            'Phase 24 certifies eligibility for staging/pilot review only.',
            'Never automatic production approval or deployment.',
        ],
        executable: false,
        deploymentAuthorized: false,
        productionApproved: false,
    };
    assertNoSecrets(payload);
    await writeAudit(companyId, user?.id || user?._id, 'certification_exported', 'CERTIFICATION', id, {
        executable: false,
    });
    return payload;
}

export async function listAssessments(companyId, id, user = null) {
    await getCertification(companyId, id, user);
    const items = await ProductionReadinessAssessment.find({ certificationId: id, ...notDeleted() }).lean();
    return { items };
}

export async function addEvidence(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.collect_evidence);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    assertSafeText(body.summary || '', 'summary');
    // Prompt injection in evidence must not close findings / mark readiness
    await getCertification(companyId, id, user);
    if (body.contentBase64 || body.binary || body.fileBase64) {
        throw new ApiError(400, 'Base64/binary evidence must not be stored in MongoDB');
    }
    const fileAlias = body.storageReferenceAlias
        ? sanitizeFileName(String(body.storageReferenceAlias))
        : 'evidence-meta';
    const doc = await ProductionReadinessEvidence.create({
        companyId,
        certificationId: id,
        evidenceType: String(body.evidenceType || 'NOTE').slice(0, 60),
        title: assertSafeText(body.title || 'Evidence', 'title'),
        summary: assertSafeText(body.summary || '', 'summary'),
        storageReferenceAlias: fileAlias,
        externalPathAlias: sanitizeAbsolutePath(body.externalPathAlias || ''),
        checksum: snapshotHash({ title: body.title, summary: body.summary }),
        metadata: body.metadata || {},
        containsSecrets: false,
        createdBy: userId,
    });
    await writeAudit(companyId, userId, 'evidence_added', 'EVIDENCE', doc._id, { certificationId: id });
    return doc.toObject();
}

export async function listEvidence(companyId, id, user = null) {
    await getCertification(companyId, id, user);
    const items = await ProductionReadinessEvidence.find({ certificationId: id, ...notDeleted() }).lean();
    return { items };
}

export async function listBenchmarks(companyId, id, user = null) {
    await getCertification(companyId, id, user);
    const items = await ProductionReadinessBenchmark.find({ certificationId: id }).sort({ createdAt: -1 }).lean();
    return { items };
}

export async function runBenchmark(companyId, userId, id, body = {}, user = null) {
    const cert = await getCertification(companyId, id, user);
    const result = await runLocalBenchmark(companyId, userId, cert, body, user);
    await ProductionReadinessCertification.updateOne({ _id: id }, {
        $set: { lastBenchmark: result.metrics, updatedBy: userId },
    });
    return result;
}

export { validateReleasePackage };
