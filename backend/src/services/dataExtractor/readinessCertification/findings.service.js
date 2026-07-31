import { ApiError } from '../../../utils/ApiError.js';
import { ProductionReadinessFinding } from '../../../models/productionReadinessFinding.model.js';
import { ProductionReadinessCertification } from '../../../models/productionReadinessCertification.model.js';
import { PERMS } from './constants.js';
import { assertPerm, assertView, isPlatformAdmin, isClientAdminOnly, hasManage } from './permissions.util.js';
import {
    rejectTenantOverrides, assertNoSecrets, assertSafeText, notDeleted, assertPayloadSafe,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { getSettings } from './settings.service.js';
import { getCertification } from './certification.service.js';

async function loadFinding(companyId, findingId, user) {
    assertView(user);
    const doc = await ProductionReadinessFinding.findOne({ _id: findingId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Finding not found');
    if (String(doc.companyId) !== String(companyId) && !isPlatformAdmin(user)) {
        throw new ApiError(404, 'Finding not found');
    }
    return doc;
}

export async function listFindings(companyId, certificationId, user = null) {
    await getCertification(companyId, certificationId, user);
    const items = await ProductionReadinessFinding.find({ certificationId, ...notDeleted() })
        .sort({ severity: 1, createdAt: -1 }).lean();
    return { items };
}

export async function createFinding(companyId, userId, certificationId, body = {}, user = null) {
    assertPerm(user, PERMS.create_finding);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    assertPayloadSafe(body);
    await getCertification(companyId, certificationId, user);
    // Prompt-injected evidence text cannot close findings
    assertSafeText(body.description || '', 'description');
    const doc = await ProductionReadinessFinding.create({
        companyId,
        certificationId,
        findingCode: String(body.findingCode || `MAN-${Date.now()}`).slice(0, 40),
        domain: String(body.domain || 'GENERAL').slice(0, 60),
        controlCode: String(body.controlCode || '').slice(0, 40),
        title: assertSafeText(body.title || 'Finding', 'title'),
        description: assertSafeText(body.description || '', 'description'),
        severity: body.severity || 'MEDIUM',
        status: 'OPEN',
        blocksReadiness: body.severity === 'CRITICAL'
            || !!body.blocksReadiness
            || (body.severity === 'HIGH' && !!body.tenantIsolationRelated),
        tenantIsolationRelated: !!body.tenantIsolationRelated,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'finding_created', 'FINDING', doc._id, { severity: doc.severity });
    return doc.toObject();
}

export async function getFinding(companyId, findingId, user = null) {
    const doc = await loadFinding(companyId, findingId, user);
    return doc.toObject();
}

export async function updateFinding(companyId, userId, findingId, body = {}, user = null) {
    assertPerm(user, PERMS.review_finding);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const doc = await loadFinding(companyId, findingId, user);
    if (body.title != null) doc.title = assertSafeText(body.title, 'title');
    if (body.description != null) doc.description = assertSafeText(body.description, 'description');
    if (body.status != null && body.status !== 'RESOLVED' && body.status !== 'ACCEPTED_RISK') {
        doc.status = body.status;
    }
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'finding_updated', 'FINDING', doc._id, { status: doc.status });
    return doc.toObject();
}

export async function acknowledgeFinding(companyId, userId, findingId, user = null) {
    assertPerm(user, PERMS.review_finding);
    const doc = await loadFinding(companyId, findingId, user);
    doc.status = 'ACKNOWLEDGED';
    doc.updatedBy = userId;
    await doc.save();
    return doc.toObject();
}

export async function createRemediation(companyId, userId, findingId, body = {}, user = null) {
    assertPerm(user, PERMS.create_remediation);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const doc = await loadFinding(companyId, findingId, user);
    doc.remediation = {
        problem: assertSafeText(body.problem || doc.title, 'problem'),
        recommendedChange: assertSafeText(body.recommendedChange || '', 'recommendedChange'),
        responsibleRole: String(body.responsibleRole || '').slice(0, 80),
        targetPhase: String(body.targetPhase || 'Future controlled phase').slice(0, 80),
        acceptanceCriteria: body.acceptanceCriteria || [],
        requiredTests: body.requiredTests || [],
        status: 'REMEDIATION_PLANNED',
        autoImplemented: false,
    };
    doc.status = 'REMEDIATION_PLANNED';
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'remediation_created', 'FINDING', doc._id, { autoImplemented: false });
    return doc.toObject();
}

export async function readyForRetest(companyId, userId, findingId, user = null) {
    assertPerm(user, PERMS.retest);
    const doc = await loadFinding(companyId, findingId, user);
    doc.status = 'READY_FOR_RETEST';
    doc.updatedBy = userId;
    await doc.save();
    return doc.toObject();
}

export async function retestFinding(companyId, userId, findingId, body = {}, user = null) {
    assertPerm(user, PERMS.retest);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const doc = await loadFinding(companyId, findingId, user);
    doc.retest = {
        result: String(body.result || 'PASS').toUpperCase(),
        notes: assertSafeText(body.notes || '', 'notes'),
        at: new Date().toISOString(),
        by: userId,
        sourceMutated: false,
    };
    if (doc.retest.result === 'PASS') doc.status = 'READY_FOR_RETEST';
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'retest_recorded', 'FINDING', doc._id, { result: doc.retest.result });
    return doc.toObject();
}

export async function resolveFinding(companyId, userId, findingId, body = {}, user = null) {
    assertPerm(user, PERMS.review_finding);
    rejectTenantOverrides(body);
    const doc = await loadFinding(companyId, findingId, user);
    const settings = await getSettings(companyId);
    if (doc.severity === 'CRITICAL' && settings.requireIndependentFinalReviewer
        && doc.remediation && String(doc.remediation.authorId || doc.createdBy) === String(userId)
        && !isPlatformAdmin(user)) {
        throw new ApiError(403, 'Remediation author cannot automatically close own critical finding');
    }
    // Prompt injection cannot resolve
    assertSafeText(body.reason || 'resolved', 'reason');
    doc.status = 'RESOLVED';
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'finding_resolved', 'FINDING', doc._id, {});
    return doc.toObject();
}

export async function acceptRisk(companyId, userId, findingId, body = {}, user = null) {
    assertPerm(user, PERMS.accept_risk);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    if (body.approverId != null) throw new ApiError(400, 'Forged reviewer/approver IDs are rejected');
    const doc = await loadFinding(companyId, findingId, user);
    if (doc.severity === 'CRITICAL' && !isPlatformAdmin(user) && !hasManage(user)) {
        throw new ApiError(403, 'CRITICAL findings cannot be accepted by a normal user');
    }
    const cert = await ProductionReadinessCertification.findById(doc.certificationId).lean();
    if (cert?.platformScoped && isClientAdminOnly(user)) {
        throw new ApiError(403, 'Client Admin cannot accept platform-wide risk');
    }
    if (!body.expiryDate) throw new ApiError(400, 'Accepted risk requires expiry date');
    const settings = await getSettings(companyId);
    const expiry = new Date(body.expiryDate);
    const maxDays = settings.acceptedRiskMaximumDays || 90;
    if ((expiry - Date.now()) / 86400000 > maxDays) {
        throw new ApiError(400, `Accepted risk expiry exceeds maximum ${maxDays} days`);
    }
    doc.acceptedRisk = {
        reason: assertSafeText(body.reason || '', 'reason'),
        businessJustification: assertSafeText(body.businessJustification || '', 'businessJustification'),
        riskOwner: String(body.riskOwner || '').slice(0, 120),
        approverUserId: userId,
        compensatingControl: assertSafeText(body.compensatingControl || '', 'compensatingControl'),
        scope: String(body.scope || 'COMPANY').slice(0, 40),
        startDate: new Date().toISOString(),
        expiryDate: expiry.toISOString(),
        reviewDate: body.reviewDate || expiry.toISOString(),
        revocationCondition: assertSafeText(body.revocationCondition || '', 'revocationCondition'),
    };
    doc.status = 'ACCEPTED_RISK';
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'risk_accepted', 'FINDING', doc._id, {
        expiryDate: doc.acceptedRisk.expiryDate, severity: doc.severity,
    });
    return doc.toObject();
}
