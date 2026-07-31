import { Lead } from '../../../models/lead.model.js';
import { Task } from '../../../models/task.model.js';
import { updateLead } from '../../lead.service.js';
import { companyScopeAls } from '../../../utils/companyScopeContext.js';
import { ApiError } from '../../../utils/ApiError.js';
import { assertNoSecrets } from './normalize.util.js';
import { ENGINE_VERSION } from './constants.js';

async function withCompanyScope(companyId, fn) {
    return companyScopeAls.run({ companyId: String(companyId) }, fn);
}

/**
 * Load CRM lead by id and verify tenant companyId.
 * Does not rely solely on ALS tenant plugins.
 */
export async function loadLead(companyId, leadId) {
    if (!leadId) throw new ApiError(400, 'leadId required');
    const doc = await Lead.findById(leadId).lean();
    if (!doc || String(doc.companyId || '') !== String(companyId)) {
        throw new ApiError(404, 'CRM Lead not found in company scope');
    }
    return doc;
}

/**
 * Apply lead assignment via lead.service updateLead.
 * actingUser must be the real request user (with assign rights).
 * No email / WhatsApp / customer / supplier / quotation side-effects.
 */
export async function applyLeadAssignment(companyId, userId, leadId, assignedToUserId, actingUser = null, settings = null) {
    assertNoSecrets({ assignedToUserId });
    await loadLead(companyId, leadId);
    const patch = { assignedTo: assignedToUserId || null };
    assertNoSecrets(patch);
    const updated = await withCompanyScope(companyId, () =>
        updateLead(leadId, patch, userId, actingUser, settings),
    );
    return updated?.toObject?.() || updated;
}

/**
 * Create a CRM task linked to the lead.
 * Uses Task.create directly (same fields as createTaskFromLead) to avoid
 * LeadActivity enum gaps and own-only visibility denials — without modifying lead.model.js.
 * Phase 14 dual-perm is enforced before this adapter is called.
 */
export async function createLeadTask(companyId, leadId, taskDraft = {}, actingUser = null, settings = null) {
    assertNoSecrets(taskDraft);
    const lead = await loadLead(companyId, leadId);
    const body = {
        title: taskDraft.title || 'Follow-up',
        description: taskDraft.description || '',
        dueDate: taskDraft.dueDate || undefined,
        priority: taskDraft.priority || 'MEDIUM',
        status: taskDraft.status || 'OPEN',
        assigneeId: taskDraft.assigneeId || undefined,
        remarks: taskDraft.remarks || 'Phase 14 Sales Workflow',
    };
    assertNoSecrets(body);
    const assigneeId = body.assigneeId
        || lead.ownerUserId
        || lead.assignedToUserId
        || lead.assignedTo
        || actingUser?._id
        || actingUser?.id;
    const dueDate = body.dueDate
        ? new Date(body.dueDate)
        : lead.nextFollowUpDate
            ? new Date(lead.nextFollowUpDate)
            : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const task = await withCompanyScope(companyId, () => Task.create({
        title: String(body.title).trim(),
        description: String(body.description || '').trim(),
        priority: body.priority || 'MEDIUM',
        status: body.status || 'OPEN',
        assignmentMode: 'SINGLE',
        assigneeIds: assigneeId ? [assigneeId] : [],
        assignToAll: false,
        dueDate,
        createdBy: actingUser?._id || actingUser?.id || null,
        customerId: lead.customerId || null,
        leadId: lead._id,
        referenceNumber: `LEAD:${lead._id}`,
        remarks: body.remarks || 'Phase 14 Sales Workflow',
    }));
    return task?.toObject?.() || task;
}

/**
 * Update lead nextFollowUpDate only.
 */
export async function applyLeadFollowUp(companyId, userId, leadId, dueDate, actingUser = null, settings = null) {
    assertNoSecrets({ dueDate });
    await loadLead(companyId, leadId);
    const patch = { nextFollowUpDate: dueDate ? new Date(dueDate) : null };
    assertNoSecrets(patch);
    const updated = await withCompanyScope(companyId, () =>
        updateLead(leadId, patch, userId, actingUser, settings),
    );
    return updated?.toObject?.() || updated;
}

export function engineMeta() {
    return {
        engineVersion: ENGINE_VERSION,
        noAutoCommunications: true,
        noAutoCustomerCreate: true,
        noAutoSupplierCreate: true,
        noAutoQuotationCreate: true,
        noAutoSalesOrderCreate: true,
    };
}

/** Soft-cancel Task — never hard-delete; skip completed. */
export async function softCancelTask(companyId, taskId) {
    const task = await Task.findById(taskId);
    if (!task) throw new ApiError(404, 'Task not found');
    const status = String(task.status || '').toUpperCase();
    if (status === 'COMPLETED') {
        return { cancelled: false, reason: 'completed_task_manual_review', task: task.toObject() };
    }
    if (status === 'CANCELLED') {
        return { cancelled: true, reason: 'already_cancelled', task: task.toObject() };
    }
    task.status = 'CANCELLED';
    await task.save();
    return { cancelled: true, task: task.toObject() };
}
