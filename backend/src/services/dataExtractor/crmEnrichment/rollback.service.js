import { AiCrmEnrichmentTransaction } from '../../../models/aiCrmEnrichmentTransaction.model.js';
import { AiCrmEnrichmentDraft } from '../../../models/aiCrmEnrichmentDraft.model.js';
import { Lead } from '../../../models/lead.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { checkUserPermission } from '../../../utils/permissionUtils.js';
import { loadCrmEntity, applyCrmEnrichment } from './crmAdapter.service.js';
import {
    CRM_EDIT_LEAD_PERM, CRM_EDIT_CUSTOMER_PERM, CRM_EDIT_SUPPLIER_PERM,
} from './constants.js';

function requirePerm(user, key) {
    if (!checkUserPermission(user, key)) throw new ApiError(403, `Missing permission: ${key}`);
}

/**
 * Rollback only when current CRM values still match Phase-13-applied values.
 * Later CRM edits => ROLLBACK_CONFLICT (no silent overwrite).
 * New Leads: soft-cancel via status=hold (no hard delete).
 */
export async function rollbackTransaction(companyId, userId, transactionId, payload = {}, user = null) {
    if (payload.companyId != null || payload.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
    requirePerm(user, 'data_extractor.crm_enrichment.rollback');

    const tx = await AiCrmEnrichmentTransaction.findOne({ _id: transactionId, companyId, isDeleted: { $ne: true } });
    if (!tx) throw new ApiError(404, 'Enrichment transaction not found');
    if (['ROLLED_BACK', 'ROLLBACK_CONFLICT'].includes(tx.status)) {
        return { status: tx.status, transaction: tx.toObject() };
    }
    if (tx.status !== 'APPLIED' && tx.status !== 'PARTIALLY_APPLIED') {
        throw new ApiError(400, 'Only applied transactions can be rolled back');
    }

    if (tx.crmEntityType === 'LEAD') requirePerm(user, CRM_EDIT_LEAD_PERM);
    if (tx.crmEntityType === 'CUSTOMER') requirePerm(user, CRM_EDIT_CUSTOMER_PERM);
    if (tx.crmEntityType === 'SUPPLIER') requirePerm(user, CRM_EDIT_SUPPLIER_PERM);

    const current = await loadCrmEntity(companyId, tx.crmEntityType, tx.crmEntityId);
    const applied = tx.appliedValues || {};
    const before = tx.beforeValues || {};

    // Create-lead path: soft cancel
    if (tx.actionType === 'CREATE_LEAD_DRAFT') {
        await Lead.updateOne(
            { _id: tx.crmEntityId, companyId },
            { $set: { status: 'hold', updatedBy: userId, notes: `${current.notes || ''}\n[Phase13] Lead creation rolled back / held`.trim() } },
        );
        tx.status = 'ROLLED_BACK';
        tx.rollbackResult = 'lead_set_to_hold';
        tx.rollbackAt = new Date();
        tx.rollbackBy = userId;
        tx.auditEntries = [...(tx.auditEntries || []), { at: new Date().toISOString(), action: 'rollback_lead_hold' }];
        await tx.save();
        await AiCrmEnrichmentDraft.updateOne(
            { _id: tx.draftId, companyId },
            { $set: { conversionStatus: 'rolled_back', updatedBy: userId } },
        );
        return { status: 'ROLLED_BACK', transaction: tx.toObject() };
    }

    const conflicts = [];
    const restorePatch = {};
    for (const [key, appliedVal] of Object.entries(applied)) {
        if (key.endsWith('_alternate')) continue;
        const mapKey = key === 'customerEmail' ? (tx.crmEntityType === 'CUSTOMER' ? 'companyEmail' : tx.crmEntityType === 'SUPPLIER' ? 'email' : 'customerEmail')
            : key === 'customerMobile' ? (tx.crmEntityType === 'SUPPLIER' ? 'phone' : 'customerMobile')
            : key === 'customerName' ? (tx.crmEntityType === 'SUPPLIER' ? 'supplierName' : tx.crmEntityType === 'CUSTOMER' ? 'customerName' : 'customerName')
            : key === 'notes' && tx.crmEntityType === 'SUPPLIER' ? 'remarks'
            : key;
        const currentVal = current[mapKey];
        if (String(currentVal ?? '') !== String(appliedVal ?? '') && String(currentVal ?? '') !== String(before[key] ?? before[mapKey] ?? '')) {
            // Value changed after enrichment
            if (String(currentVal ?? '') !== String(appliedVal ?? '')) {
                conflicts.push({ field: key, current: currentVal, applied: appliedVal, before: before[key] ?? before[mapKey] });
                continue;
            }
        }
        if (Object.prototype.hasOwnProperty.call(before, key) || Object.prototype.hasOwnProperty.call(before, mapKey)) {
            restorePatch[mapKey] = before[key] ?? before[mapKey] ?? '';
        }
    }

    if (conflicts.length) {
        tx.status = 'ROLLBACK_CONFLICT';
        tx.rollbackResult = 'ROLLBACK_CONFLICT';
        tx.rollbackAt = new Date();
        tx.rollbackBy = userId;
        tx.auditEntries = [...(tx.auditEntries || []), { at: new Date().toISOString(), action: 'rollback_conflict', conflicts }];
        await tx.save();
        return { status: 'ROLLBACK_CONFLICT', conflicts, transaction: tx.toObject() };
    }

    try {
        await applyCrmEnrichment(companyId, userId, {
            entityType: tx.crmEntityType,
            entityId: tx.crmEntityId,
            patch: restorePatch,
            user,
            settings: {},
        });
        tx.status = 'ROLLED_BACK';
        tx.rollbackResult = 'restored_before_values';
        tx.rollbackAt = new Date();
        tx.rollbackBy = userId;
        tx.auditEntries = [...(tx.auditEntries || []), { at: new Date().toISOString(), action: 'rollback_applied', restorePatch }];
        await tx.save();
        return { status: 'ROLLED_BACK', transaction: tx.toObject() };
    } catch (err) {
        tx.status = 'ROLLBACK_FAILED';
        tx.rollbackResult = err?.message || 'failed';
        tx.rollbackAt = new Date();
        tx.rollbackBy = userId;
        await tx.save();
        throw err;
    }
}

export async function getTransaction(companyId, id) {
    const tx = await AiCrmEnrichmentTransaction.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean();
    if (!tx) throw new ApiError(404, 'Transaction not found');
    return tx;
}
