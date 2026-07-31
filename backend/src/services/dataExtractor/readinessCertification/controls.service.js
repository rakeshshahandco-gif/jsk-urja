import { ApiError } from '../../../utils/ApiError.js';
import { ProductionReadinessControl } from '../../../models/productionReadinessControl.model.js';
import { DEFAULT_CONTROLS, PERMS } from './constants.js';
import { assertPerm, assertView, isPlatformAdmin } from './permissions.util.js';
import {
    rejectTenantOverrides, assertNoSecrets, assertSafeText, notDeleted,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';

export async function ensureDefaultControls(userId = null) {
    for (const c of DEFAULT_CONTROLS) {
        const exists = await ProductionReadinessControl.findOne({
            controlCode: c.controlCode, version: '1.0.0', ...notDeleted(),
        }).lean();
        if (exists) continue;
        await ProductionReadinessControl.create({
            ...c,
            platformScoped: true,
            companyId: null,
            description: c.objective || '',
            automatedOrManual: 'AUTOMATED',
            evidenceRequired: ['local_check_result'],
            remediationGuidance: 'Remediate in a future controlled phase; Phase 24 does not auto-fix.',
            applicableModules: ['data_extractor'],
            applicableEnvironments: ['LOCALHOST', 'TESTING', 'STAGING'],
            companyScoped: true,
            industryScoped: c.domain === 'INDUSTRY_ISOLATION',
            mandatory: true,
            version: '1.0.0',
            active: true,
            createdBy: userId,
            updatedBy: userId,
        });
    }
}

export async function listControls(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    await ensureDefaultControls(user?.id || user?._id);
    const q = { ...notDeleted(), active: true };
    if (query.domain) q.domain = query.domain;
    const items = await ProductionReadinessControl.find(q).sort({ controlCode: 1 }).lean();
    return { items };
}

export async function getControl(companyId, id, user = null) {
    assertView(user);
    const doc = await ProductionReadinessControl.findOne({ _id: id, ...notDeleted() }).lean();
    if (!doc) throw new ApiError(404, 'Control not found');
    return doc;
}

export async function createControl(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.manage);
    assertPlatformScoped(user);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const doc = await ProductionReadinessControl.create({
        companyId: null,
        platformScoped: true,
        controlCode: String(body.controlCode || '').slice(0, 40),
        domain: String(body.domain || '').slice(0, 60),
        title: assertSafeText(body.title || body.controlCode, 'title'),
        objective: assertSafeText(body.objective || '', 'objective'),
        description: assertSafeText(body.description || '', 'description'),
        severityIfFailed: body.severityIfFailed || 'HIGH',
        automatedOrManual: body.automatedOrManual || 'MANUAL',
        testMethod: String(body.testMethod || '').slice(0, 80),
        evidenceRequired: body.evidenceRequired || [],
        remediationGuidance: assertSafeText(body.remediationGuidance || '', 'remediationGuidance'),
        applicableModules: body.applicableModules || [],
        applicableEnvironments: body.applicableEnvironments || [],
        companyScoped: body.companyScoped !== false,
        industryScoped: !!body.industryScoped,
        mandatory: body.mandatory !== false,
        version: String(body.version || '1.0.0').slice(0, 20),
        active: true,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'control_created', 'CONTROL', doc._id, { controlCode: doc.controlCode }, true);
    return doc.toObject();
}

export async function updateControl(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.manage);
    assertPlatformScoped(user);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const doc = await ProductionReadinessControl.findOne({ _id: id, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Control not found');
    if (body.title != null) doc.title = assertSafeText(body.title, 'title');
    if (body.description != null) doc.description = assertSafeText(body.description, 'description');
    if (body.active != null) doc.active = !!body.active;
    if (body.severityIfFailed != null) doc.severityIfFailed = body.severityIfFailed;
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'control_updated', 'CONTROL', doc._id, { controlCode: doc.controlCode }, true);
    return doc.toObject();
}

export async function archiveControl(companyId, userId, id, user = null) {
    assertPerm(user, PERMS.manage);
    assertPlatformScoped(user);
    const doc = await ProductionReadinessControl.findOne({ _id: id, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Control not found');
    doc.active = false;
    doc.isDeleted = true;
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'control_archived', 'CONTROL', doc._id, { controlCode: doc.controlCode }, true);
    return { archived: true, hardDelete: false };
}

function assertPlatformScoped(user) {
    if (!isPlatformAdmin(user)) throw new ApiError(403, 'Platform Admin required for control library');
}
