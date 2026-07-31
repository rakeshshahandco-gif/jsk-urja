import { AiSalesWorkflowTransaction } from '../../../models/aiSalesWorkflowTransaction.model.js';
import { AiSalesWorkflowDraft } from '../../../models/aiSalesWorkflowDraft.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { checkUserPermission } from '../../../utils/permissionUtils.js';
import { loadLead, applyLeadAssignment, applyLeadFollowUp, softCancelTask } from './crmAdapter.service.js';
import { CRM_LEAD_ASSIGN_PERM, CRM_LEAD_EDIT_PERM } from './constants.js';

function requirePerm(user, key) {
    if (!checkUserPermission(user, key)) throw new ApiError(403, `Missing permission: ${key}`);
}

/**
 * Rollback a Phase 14 sales workflow transaction.
 * - Restore prior owner only if current still equals Phase14-applied owner; else ROLLBACK_CONFLICT.
 * - Tasks: CANCELLED only if not COMPLETED; else manual review.
 * - Follow-up: restore prior nextFollowUpDate only if unchanged since apply.
 */
export async function rollbackTransaction(companyId, userId, transactionId, payload = {}, user = null) {
    if (payload.companyId != null || payload.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
    requirePerm(user, 'data_extractor.sales_workflow.rollback');

    const tx = await AiSalesWorkflowTransaction.findOne({
        _id: transactionId,
        companyId,
        isDeleted: { $ne: true },
    });
    if (!tx) throw new ApiError(404, 'Sales workflow transaction not found');
    if (['ROLLED_BACK', 'ROLLBACK_CONFLICT'].includes(tx.status)) {
        return { status: tx.status, transaction: tx.toObject() };
    }
    if (!['APPLIED', 'PARTIALLY_APPLIED'].includes(tx.status)) {
        throw new ApiError(400, 'Only applied transactions can be rolled back');
    }

    const current = await loadLead(companyId, tx.crmLeadId);
    const before = tx.beforeValues || {};
    const applied = tx.appliedValues || {};
    const conflicts = [];
    const audit = [];
    let manualReview = false;
    let ownerConflict = false;
    let followUpConflict = false;

    if (applied.assignment?.assignedTo) {
        requirePerm(user, CRM_LEAD_ASSIGN_PERM);
        const currentOwner = String(current.assignedTo || current.assignedToUserId || current.ownerUserId || '');
        const appliedOwner = String(applied.assignment.assignedTo);
        if (currentOwner && currentOwner !== appliedOwner) {
            ownerConflict = true;
            conflicts.push({
                field: 'assignedTo',
                current: currentOwner,
                applied: appliedOwner,
                before: before.assignedTo,
            });
        } else {
            await applyLeadAssignment(
                companyId,
                userId,
                tx.crmLeadId,
                before.assignedTo || null,
                user,
                payload.settings || null,
            );
            audit.push({
                at: new Date().toISOString(),
                action: 'rollback_assignment',
                restoredTo: before.assignedTo || null,
            });
        }
    }

    if (ownerConflict) {
        tx.status = 'ROLLBACK_CONFLICT';
        tx.rollbackResult = 'ROLLBACK_CONFLICT';
        tx.rollbackAt = new Date();
        tx.rollbackBy = userId;
        tx.auditEntries = [...(tx.auditEntries || []), ...audit, {
            at: new Date().toISOString(),
            action: 'rollback_conflict',
            conflicts,
        }];
        await tx.save();
        return { status: 'ROLLBACK_CONFLICT', conflicts, transaction: tx.toObject() };
    }

    const taskIds = [...(tx.appliedTaskIds || []), ...(applied.taskIds || [])]
        .map((id) => String(id))
        .filter((v, i, a) => a.indexOf(v) === i);
    for (const taskId of taskIds) {
        // eslint-disable-next-line no-await-in-loop
        const result = await softCancelTask(companyId, taskId);
        if (!result.cancelled && result.reason === 'completed_task_manual_review') {
            manualReview = true;
            conflicts.push({
                field: 'task',
                taskId,
                status: 'COMPLETED',
                reason: 'COMPLETED_TASK_REQUIRES_MANUAL_REVIEW',
            });
            audit.push({ at: new Date().toISOString(), action: 'task_manual_review', taskId });
        } else {
            audit.push({ at: new Date().toISOString(), action: 'task_cancelled', taskId, reason: result.reason });
        }
    }

    if (applied.followUp || tx.followUpApplied) {
        requirePerm(user, CRM_LEAD_EDIT_PERM);
        const appliedDue = applied.followUp?.nextFollowUpDate || tx.followUpApplied?.nextFollowUpDate;
        const currentDue = current.nextFollowUpDate ? new Date(current.nextFollowUpDate).toISOString() : '';
        const appliedDueIso = appliedDue ? new Date(appliedDue).toISOString() : '';
        if (currentDue && appliedDueIso && currentDue !== appliedDueIso) {
            followUpConflict = true;
            conflicts.push({
                field: 'nextFollowUpDate',
                current: currentDue,
                applied: appliedDueIso,
                before: before.nextFollowUpDate,
            });
        } else {
            await applyLeadFollowUp(
                companyId,
                userId,
                tx.crmLeadId,
                before.nextFollowUpDate || null,
                user,
                payload.settings || null,
            );
            audit.push({
                at: new Date().toISOString(),
                action: 'rollback_followup',
                restoredTo: before.nextFollowUpDate || null,
            });
        }
    }

    if (followUpConflict) {
        tx.status = 'ROLLBACK_CONFLICT';
        tx.rollbackResult = 'ROLLBACK_CONFLICT';
        tx.rollbackAt = new Date();
        tx.rollbackBy = userId;
        tx.auditEntries = [...(tx.auditEntries || []), ...audit, {
            at: new Date().toISOString(),
            action: 'rollback_conflict',
            conflicts,
        }];
        await tx.save();
        return { status: 'ROLLBACK_CONFLICT', conflicts, manualReview, transaction: tx.toObject() };
    }

    try {
        tx.status = 'ROLLED_BACK';
        tx.rollbackResult = manualReview
            ? 'rolled_back_with_task_manual_review'
            : 'restored_before_values';
        tx.rollbackAt = new Date();
        tx.rollbackBy = userId;
        tx.auditEntries = [...(tx.auditEntries || []), ...audit, {
            at: new Date().toISOString(),
            action: 'rollback_applied',
            manualReview,
            conflicts,
        }];
        await tx.save();

        await AiSalesWorkflowDraft.updateOne(
            { _id: tx.draftId, companyId },
            { $set: { updatedBy: userId } },
        );

        return {
            status: 'ROLLED_BACK',
            manualReview,
            conflicts: conflicts.length ? conflicts : undefined,
            transaction: tx.toObject(),
        };
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
    const tx = await AiSalesWorkflowTransaction.findOne({
        _id: id,
        companyId,
        isDeleted: { $ne: true },
    }).lean();
    if (!tx) throw new ApiError(404, 'Transaction not found');
    return tx;
}
