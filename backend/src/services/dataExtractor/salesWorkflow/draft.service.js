import { AiSalesWorkflowDraft } from '../../../models/aiSalesWorkflowDraft.model.js';
import { AiSalesWorkflowTransaction } from '../../../models/aiSalesWorkflowTransaction.model.js';
import { AiCrmEnrichmentDraft } from '../../../models/aiCrmEnrichmentDraft.model.js';
import { User } from '../../../models/user.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { checkUserPermission } from '../../../utils/permissionUtils.js';
import { evaluateSalesWorkflowEligibility } from './eligibility.service.js';
import {
    recommendSalespeople,
    buildFollowUpPlan,
    buildTaskDrafts,
    validateEligibleSalesperson,
} from './recommendation.service.js';
import { checkDuplicateActions } from './duplicate.service.js';
import {
    loadLead,
    applyLeadAssignment,
    createLeadTask,
    applyLeadFollowUp,
    engineMeta,
} from './crmAdapter.service.js';
import { assertNoSecrets } from './normalize.util.js';
import { getSalesWorkflowSettings, settingsFingerprint } from './settings.service.js';
import {
    CRM_LEAD_ASSIGN_PERM,
    CRM_LEAD_EDIT_PERM,
    CRM_LEAD_CREATE_TASK_PERM,
    TASK_CREATE_PERM,
    ENGINE_VERSION,
} from './constants.js';

function rejectTenantOverrides(payload = {}) {
    if (payload.companyId != null || payload.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

function slim(doc) {
    if (!doc) return null;
    return {
        status: doc.status,
        eligibilityStatus: doc.eligibilityStatus,
        companyName: doc.companyName,
        locked: !!doc.locked,
        crmLeadId: doc.crmLeadId,
        selectedOwnerId: doc.selectedOwnerId,
        ownerDecision: doc.ownerDecision,
    };
}

function historyEntry(action, userId, previous, next, reason = '', extra = {}) {
    return {
        at: new Date(),
        action,
        userId: userId || null,
        previousStatus: previous?.status || '',
        resultingStatus: next?.status || previous?.status || '',
        previous: slim(previous),
        next: slim(next),
        reason: String(reason || '').slice(0, 2000),
        crmLeadId: extra.crmLeadId || next?.crmLeadId || previous?.crmLeadId || null,
        selectedSalespersonId: extra.selectedSalespersonId || next?.selectedOwnerId || null,
        result: extra.result || '',
        sourceType: 'system',
    };
}

function requirePerm(user, key) {
    if (!checkUserPermission(user, key)) throw new ApiError(403, `Missing permission: ${key}`);
}

async function resolveUserName(userId) {
    if (!userId) return '';
    const u = await User.findById(userId).select('name username email').lean();
    return u ? String(u.name || u.username || u.email || '').trim() : '';
}

function currentOwnerFromLead(lead) {
    const id = lead?.assignedTo || lead?.assignedToUserId || lead?.ownerUserId || null;
    const name = lead?.assignedToName || lead?.ownerName || '';
    return { id, name };
}

function buildContextFromSources({ lead, phase13Draft, payload }) {
    return {
        companyName: lead?.customerName || phase13Draft?.companyName || payload.companyName || '',
        businessCategory: lead?.businessCategory || '',
        industry: phase13Draft?.companyProfileSnapshot?.industry
            || payload.industry
            || lead?.businessCategory
            || '',
        city: payload.city || '',
        state: payload.state || payload.stateProvince || '',
        territory: payload.territory || '',
        customerType: payload.customerType || '',
        products: lead?.products || phase13Draft?.productRecommendationSnapshot || [],
        productOpportunity: phase13Draft?.productRecommendationSnapshot || null,
        productOpportunitySnapshot: phase13Draft?.productRecommendationSnapshot || null,
        contact: phase13Draft?.contactSnapshot || payload.contact || null,
        contactSnapshot: phase13Draft?.contactSnapshot || null,
        leadScore: phase13Draft?.leadScoreSnapshot || payload.leadScore || null,
        leadScoreSnapshot: phase13Draft?.leadScoreSnapshot || null,
        priority: phase13Draft?.leadScoreSnapshot?.priority || lead?.priority || payload.priority,
        currentOwnerId: currentOwnerFromLead(lead).id,
        companyProfile: phase13Draft?.companyProfileSnapshot || null,
    };
}

export async function listDrafts(companyId, query = {}) {
    const q = { companyId, isDeleted: { $ne: true } };
    if (query.status) q.status = query.status;
    if (query.eligibilityStatus) q.eligibilityStatus = query.eligibilityStatus;
    if (query.locked === 'true') q.locked = true;
    if (query.locked === 'false') q.locked = false;
    if (query.crmLeadId) q.crmLeadId = query.crmLeadId;
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const skip = Math.max(0, Number(query.skip) || 0);
    const [results, total] = await Promise.all([
        AiSalesWorkflowDraft.find(q).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
        AiSalesWorkflowDraft.countDocuments(q),
    ]);
    return { results, total, limit, skip };
}

export async function getDraft(companyId, id) {
    const doc = await AiSalesWorkflowDraft.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean();
    if (!doc) throw new ApiError(404, 'Sales workflow draft not found');
    return doc;
}

export async function getDraftHistory(companyId, id) {
    const doc = await getDraft(companyId, id);
    return { _id: doc._id, companyId: doc.companyId, history: doc.history || [] };
}

export async function prepareDraft(companyId, userId, payload = {}) {
    rejectTenantOverrides(payload);
    const settings = await getSalesWorkflowSettings(companyId);
    if (settings.enabled === false) throw new ApiError(400, 'Sales workflow is disabled for this company');

    let phase13Draft = null;
    let crmLeadId = payload.crmLeadId || null;

    if (payload.phase13DraftId) {
        phase13Draft = await AiCrmEnrichmentDraft.findOne({
            _id: payload.phase13DraftId,
            companyId,
            isDeleted: { $ne: true },
        }).lean();
        if (!phase13Draft) throw new ApiError(404, 'Phase 13 draft not found');
        if (!crmLeadId && phase13Draft.convertedCrmLeadId) {
            crmLeadId = phase13Draft.convertedCrmLeadId;
        }
    }

    if (!crmLeadId) throw new ApiError(400, 'crmLeadId or phase13DraftId with convertedCrmLeadId required');

    const lead = await loadLead(companyId, crmLeadId);
    const recordKey = `lead:${crmLeadId}`;
    const existingDraft = await AiSalesWorkflowDraft.findOne({
        companyId, recordKey, isDeleted: { $ne: true },
    });

    const eligibility = evaluateSalesWorkflowEligibility({
        crmLead: lead,
        phase13Draft,
        existingDraft: existingDraft?.toObject?.() || existingDraft,
    });

    if (['NO_CRM_LEAD', 'INVALID', 'BLOCKED', 'LOCKED'].includes(eligibility.eligibilityStatus)) {
        throw new ApiError(400, `Record not eligible: ${eligibility.eligibilityStatus}`);
    }

    const context = buildContextFromSources({ lead, phase13Draft, payload });
    const owner = currentOwnerFromLead(lead);
    const currentOwnerName = owner.name || await resolveUserName(owner.id);

    const recommendation = await recommendSalespeople(companyId, {
        crmLead: lead,
        context,
        settings,
        mode: payload.mode || settings.assignmentMode,
        limit: payload.limit || 5,
    });

    const suggestedName = recommendation.suggestedOwnerName
        || await resolveUserName(recommendation.suggestedOwnerId);

    const followUpPlan = buildFollowUpPlan({
        crmLead: lead,
        context,
        settings,
        assigneeName: suggestedName || currentOwnerName,
    });

    const taskDrafts = buildTaskDrafts({
        followUpPlan,
        crmLead: lead,
        selectedOwnerId: recommendation.suggestedOwnerId,
        selectedOwnerName: suggestedName,
    });

    const duplicateCheck = await checkDuplicateActions({
        companyId,
        crmLeadId,
        taskDrafts,
        followUpPlan,
        settings,
    });

    assertNoSecrets({
        followUpPlan: { ...followUpPlan, notes: followUpPlan.notes },
        taskDrafts: (taskDrafts || []).map((t) => ({ title: t.title, dueDate: t.dueDate, taskType: t.taskType })),
        duplicateStatus: duplicateCheck?.status,
    });

    let status = 'RECOMMENDATION_READY';
    if (eligibility.eligibilityStatus === 'ALREADY_ASSIGNED' || eligibility.eligibilityStatus === 'ASSIGNMENT_REVIEW_REQUIRED') {
        status = 'ASSIGNMENT_REVIEW_REQUIRED';
    }
    if (['POSSIBLE_DUPLICATE', 'EXACT_DUPLICATE', 'EXISTING_PENDING_ACTION', 'MANUAL_REVIEW_REQUIRED'].includes(duplicateCheck.status)) {
        status = 'FOLLOWUP_REVIEW_REQUIRED';
    }
    if (eligibility.eligibilityStatus === 'PENDING_PHASE13_APPROVAL') {
        status = 'DRAFT';
    }

    const idempotencyKey = String(payload.idempotencyKey || `${recordKey}:prepare`).trim();
    if (idempotencyKey) {
        const existingIdem = await AiSalesWorkflowDraft.findOne({
            companyId, idempotencyKey, isDeleted: { $ne: true },
        });
        if (existingIdem && !payload.force) {
            if (['ASSIGNMENT_APPLIED', 'TASKS_CREATED', 'PARTIALLY_APPLIED', 'REASSIGNED'].includes(existingIdem.status)) {
                return { skipped: true, reason: 'already_processed', draft: existingIdem.toObject() };
            }
            if (existingIdem.locked) return { skipped: true, reason: 'locked', draft: existingIdem.toObject() };
        }
    }

    const docPayload = {
        companyId,
        financialYear: payload.financialYear || phase13Draft?.financialYear || '',
        recordKey,
        idempotencyKey,
        crmLeadId: lead._id,
        phase13DraftId: phase13Draft?._id || payload.phase13DraftId || null,
        enrichmentTransactionId: phase13Draft?.enrichmentTransactionId || null,
        extractedLeadId: phase13Draft?.extractedLeadId || lead.extractorRef?.extractedLeadId || null,
        companyName: lead.customerName || phase13Draft?.companyName || '',
        eligibilityStatus: eligibility.eligibilityStatus,
        eligibilityReasons: eligibility.reasons,
        status,
        assignmentStrategy: recommendation.assignmentMode || settings.assignmentMode,
        currentOwnerId: owner.id || null,
        currentOwnerName,
        suggestedOwnerId: recommendation.suggestedOwnerId || null,
        suggestedOwnerName: suggestedName,
        selectedOwnerId: recommendation.suggestedOwnerId || owner.id || null,
        selectedOwnerName: suggestedName || currentOwnerName,
        alternativeOwners: recommendation.alternatives || [],
        assignmentScoreBreakdown: recommendation.assignmentScoreBreakdown,
        territoryRecommendation: Array.isArray(recommendation.ranking?.[0]?.dimensions)
            ? recommendation.ranking[0].dimensions.find((d) => d.id === 'territory_fit') || null
            : recommendation.ranking?.[0]?.dimensions?.territory_fit || null,
        teamRecommendation: settings.defaultTeam ? { team: settings.defaultTeam } : null,
        leadScoreSnapshot: context.leadScoreSnapshot || null,
        productOpportunitySnapshot: context.productOpportunitySnapshot || null,
        contactSnapshot: context.contactSnapshot || null,
        followUpPlanDraft: followUpPlan,
        taskDrafts,
        ownerDecision: 'PENDING',
        duplicateCheck,
        settingsVersion: settingsFingerprint(settings),
        updatedBy: userId,
        ...engineMeta(),
    };

    if (existingDraft?.locked && !payload.force) {
        return { skipped: true, reason: 'locked', draft: existingDraft.toObject() };
    }

    if (!existingDraft) {
        const created = await AiSalesWorkflowDraft.create({
            ...docPayload,
            createdBy: userId,
            history: [historyEntry('prepared', userId, null, docPayload, 'Prepared sales workflow draft')],
        });
        return { skipped: false, draft: created.toObject() };
    }

    const previous = existingDraft.toObject();
    Object.assign(existingDraft, docPayload);
    existingDraft.history = [
        ...(existingDraft.history || []),
        historyEntry('reprepared', userId, previous, docPayload, payload.reason || 'Re-prepared'),
    ].slice(-100);
    await existingDraft.save();
    return { skipped: false, draft: existingDraft.toObject() };
}

export async function setReviewDecisions(companyId, userId, id, payload = {}) {
    rejectTenantOverrides(payload);
    const doc = await AiSalesWorkflowDraft.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Draft not found');
    if (doc.locked) throw new ApiError(400, 'Draft is locked');
    const previous = doc.toObject();

    if (payload.ownerDecision) doc.ownerDecision = payload.ownerDecision;

    const existingOwnerId = doc.currentOwnerId ? String(doc.currentOwnerId) : '';
    let nextOwnerId = doc.selectedOwnerId;
    let nextOwnerName = doc.selectedOwnerName;

    if (payload.ownerDecision === 'KEEP_EXISTING_OWNER') {
        nextOwnerId = doc.currentOwnerId;
        nextOwnerName = doc.currentOwnerName;
        doc.approveAssignment = false;
    } else if (payload.ownerDecision === 'ASSIGN_SUGGESTED_OWNER') {
        // Prefer explicit selectedOwnerId from reviewer; fall back to engine suggestion.
        nextOwnerId = payload.selectedOwnerId || doc.suggestedOwnerId;
        nextOwnerName = payload.selectedOwnerName
            || (payload.selectedOwnerId ? await resolveUserName(payload.selectedOwnerId) : '')
            || doc.suggestedOwnerName;
    } else if (payload.ownerDecision === 'SELECT_DIFFERENT_OWNER') {
        if (!payload.selectedOwnerId) throw new ApiError(400, 'selectedOwnerId required for SELECT_DIFFERENT_OWNER');
        nextOwnerId = payload.selectedOwnerId;
        nextOwnerName = payload.selectedOwnerName || await resolveUserName(payload.selectedOwnerId);
    } else if (payload.ownerDecision === 'DEFER_ASSIGNMENT' || payload.ownerDecision === 'REJECT_RECOMMENDATION') {
        doc.approveAssignment = false;
    } else if (payload.selectedOwnerId !== undefined) {
        nextOwnerId = payload.selectedOwnerId;
        nextOwnerName = payload.selectedOwnerName || await resolveUserName(payload.selectedOwnerId);
    }

    if (nextOwnerId) {
        const settings = await getSalesWorkflowSettings(companyId);
        const user = await User.findById(nextOwnerId).populate('role').lean();
        const check = validateEligibleSalesperson(user, companyId, { allowSuperadmin: settings.allowSuperadmin === true });
        if (!check.ok) throw new ApiError(400, `Selected owner not eligible: ${check.reason}`);
    }

    // Capture reason during review; finalApprove enforces it for reassignment.
    if (payload.reassignmentReason !== undefined) {
        doc.reassignmentReason = String(payload.reassignmentReason || '');
    }

    doc.selectedOwnerId = nextOwnerId || null;
    doc.selectedOwnerName = nextOwnerName || '';

    if (payload.approveAssignment !== undefined) doc.approveAssignment = payload.approveAssignment === true;
    if (payload.approveTask !== undefined) doc.approveTask = payload.approveTask === true;
    if (payload.approveFollowUp !== undefined) doc.approveFollowUp = payload.approveFollowUp === true;

    if (payload.followUpPlan && typeof payload.followUpPlan === 'object') {
        doc.followUpPlanDraft = {
            ...(doc.followUpPlanDraft || {}),
            ...payload.followUpPlan,
            executeCommunication: false,
        };
    }
    if (Array.isArray(payload.taskDrafts)) {
        doc.taskDrafts = payload.taskDrafts.map((t) => ({ ...t, executeCommunication: false }));
    }

    if (doc.ownerDecision === 'KEEP_EXISTING_OWNER') {
        doc.approveAssignment = false;
    }

    assertNoSecrets({ followUpPlanDraft: doc.followUpPlanDraft, taskDrafts: doc.taskDrafts });

    // Review with a concrete owner decision is enough to mark READY (preview optional).
    const decisionsComplete = doc.ownerDecision && doc.ownerDecision !== 'PENDING';
    if (['APPROVED', 'APPLIED', 'PARTIALLY_APPLIED', 'ASSIGNMENT_APPLIED', 'TASKS_CREATED', 'REASSIGNED'].includes(doc.status)) {
        // leave terminal statuses alone
    } else if (decisionsComplete) {
        doc.status = 'READY_FOR_APPROVAL';
        doc.previewPayload = {
            ...(doc.previewPayload || {}),
            ownerDecision: doc.ownerDecision,
            selectedOwnerId: doc.selectedOwnerId,
            approveAssignment: !!doc.approveAssignment,
            approveTask: !!doc.approveTask,
            approveFollowUp: !!doc.approveFollowUp,
            decisionsComplete: true,
            requiresFinalApproval: true,
        };
    } else {
        doc.status = 'ASSIGNMENT_REVIEW_REQUIRED';
    }
    doc.updatedBy = userId;
    doc.history = [
        ...(doc.history || []),
        historyEntry('review_decisions', userId, previous, doc.toObject(), payload.reason || 'Review decisions updated', {
            selectedSalespersonId: doc.selectedOwnerId,
        }),
    ].slice(-100);
    await doc.save();
    return doc.toObject();
}

export async function previewDraft(companyId, userId, id, payload = {}) {
    rejectTenantOverrides(payload);
    const doc = await AiSalesWorkflowDraft.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Draft not found');
    if (doc.locked) throw new ApiError(400, 'Draft is locked');
    if (['NO_CRM_LEAD', 'INVALID', 'BLOCKED'].includes(doc.eligibilityStatus)) {
        throw new ApiError(400, 'Not eligible');
    }

    const previous = doc.toObject();
    const decisionsComplete = doc.ownerDecision && doc.ownerDecision !== 'PENDING';
    const willAssign = doc.approveAssignment === true
        && doc.ownerDecision !== 'KEEP_EXISTING_OWNER'
        && doc.ownerDecision !== 'DEFER_ASSIGNMENT'
        && doc.ownerDecision !== 'REJECT_RECOMMENDATION'
        && doc.selectedOwnerId;
    const willTask = doc.approveTask === true && Array.isArray(doc.taskDrafts) && doc.taskDrafts.length > 0;
    const willFollowUp = doc.approveFollowUp === true && !!doc.followUpPlanDraft?.dueDate;

    const preview = {
        ownerDecision: doc.ownerDecision,
        selectedOwnerId: doc.selectedOwnerId,
        selectedOwnerName: doc.selectedOwnerName,
        currentOwnerId: doc.currentOwnerId,
        approveAssignment: !!doc.approveAssignment,
        approveTask: !!doc.approveTask,
        approveFollowUp: !!doc.approveFollowUp,
        willAssign: !!willAssign,
        willCreateTasks: !!willTask,
        willSetFollowUp: !!willFollowUp,
        followUpPlan: doc.followUpPlanDraft,
        taskDrafts: doc.taskDrafts,
        duplicateCheck: doc.duplicateCheck,
        reassignmentReason: doc.reassignmentReason,
        decisionsComplete,
        requiresFinalApproval: true,
        ...engineMeta(),
    };
    assertNoSecrets(preview);

    doc.previewPayload = preview;
    doc.status = decisionsComplete ? 'READY_FOR_APPROVAL' : 'ASSIGNMENT_REVIEW_REQUIRED';
    doc.updatedBy = userId;
    doc.history = [
        ...(doc.history || []),
        historyEntry('preview', userId, previous, doc.toObject(), 'Preview generated'),
    ].slice(-100);
    await doc.save();
    return { draft: doc.toObject(), preview };
}

export async function finalApproveDraft(companyId, userId, id, payload = {}) {
    rejectTenantOverrides(payload);
    const doc = await AiSalesWorkflowDraft.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Draft not found');
    if (doc.locked) throw new ApiError(400, 'Draft is locked');
    if (doc.status !== 'READY_FOR_APPROVAL' && payload.forceApproval !== true) {
        throw new ApiError(400, 'Draft must be previewed and READY_FOR_APPROVAL before final approval');
    }
    if (payload.reassignmentReason !== undefined) {
        doc.reassignmentReason = String(payload.reassignmentReason || '');
    }
    if (payload.approveAssignment !== undefined) doc.approveAssignment = payload.approveAssignment === true;
    if (payload.approveTask !== undefined) doc.approveTask = payload.approveTask === true;
    if (payload.approveFollowUp !== undefined) doc.approveFollowUp = payload.approveFollowUp === true;

    const existingOwnerId = doc.currentOwnerId ? String(doc.currentOwnerId) : '';
    const nextOwnerId = doc.selectedOwnerId ? String(doc.selectedOwnerId) : '';
    const willReassign = doc.approveAssignment === true
        && existingOwnerId
        && nextOwnerId
        && existingOwnerId !== nextOwnerId;
    if (willReassign && !String(doc.reassignmentReason || '').trim()) {
        throw new ApiError(400, 'reassignment requires an explicit reason');
    }

    const previous = doc.toObject();
    doc.status = 'APPROVED';
    doc.manuallyApproved = true;
    doc.finalApprovalAt = new Date();
    doc.finalApprovalBy = userId;
    doc.updatedBy = userId;
    doc.history = [
        ...(doc.history || []),
        historyEntry('final_approve', userId, previous, doc.toObject(), payload.reason || 'Final approval'),
    ].slice(-100);
    await doc.save();
    return doc.toObject();
}

export async function applyDraft(companyId, userId, id, payload = {}, user = null) {
    rejectTenantOverrides(payload);
    const doc = await AiSalesWorkflowDraft.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Draft not found');
    if (doc.locked) throw new ApiError(400, 'Draft is locked');

    // Idempotency: already applied with transaction
    if (doc.transactionId && ['ASSIGNMENT_APPLIED', 'TASKS_CREATED', 'PARTIALLY_APPLIED', 'REASSIGNED'].includes(doc.status)) {
        const tx = await AiSalesWorkflowTransaction.findOne({ _id: doc.transactionId, companyId }).lean();
        return { idempotent: true, transaction: tx, draft: doc.toObject() };
    }

    if (doc.status !== 'APPROVED' && payload.forceApply !== true) {
        throw new ApiError(400, 'Final approval required before applying sales workflow');
    }

    const leadBefore = await loadLead(companyId, doc.crmLeadId);
    const beforeOwner = currentOwnerFromLead(leadBefore);
    const actionTypes = [];
    const appliedValues = {};
    const rejectedValues = {};
    const appliedTaskIds = [];
    let followUpApplied = null;
    let assignmentApplied = null;

    const isReassignment = !!(beforeOwner.id
        && doc.selectedOwnerId
        && String(beforeOwner.id) !== String(doc.selectedOwnerId)
        && doc.ownerDecision !== 'KEEP_EXISTING_OWNER');

    const doAssign = doc.approveAssignment === true
        && doc.ownerDecision !== 'KEEP_EXISTING_OWNER'
        && doc.ownerDecision !== 'DEFER_ASSIGNMENT'
        && doc.ownerDecision !== 'REJECT_RECOMMENDATION'
        && doc.selectedOwnerId
        && String(doc.selectedOwnerId) !== String(beforeOwner.id || '');

    if (doAssign) {
        if (isReassignment) {
            requirePerm(user, 'data_extractor.sales_workflow.reassign');
            if (!String(doc.reassignmentReason || payload.reassignmentReason || '').trim()) {
                throw new ApiError(400, 'reassignmentReason required for reassignment');
            }
        } else {
            requirePerm(user, 'data_extractor.sales_workflow.assign');
        }
        requirePerm(user, CRM_LEAD_ASSIGN_PERM);
        actionTypes.push(isReassignment ? 'REASSIGN' : 'ASSIGN');
    }

    const doTasks = doc.approveTask === true && Array.isArray(doc.taskDrafts) && doc.taskDrafts.length > 0;
    if (doTasks) {
        requirePerm(user, 'data_extractor.sales_workflow.create_task');
        requirePerm(user, CRM_LEAD_CREATE_TASK_PERM);
        if (!checkUserPermission(user, TASK_CREATE_PERM) && user?.roleName !== 'superadmin') {
            // Prefer both; allow if create_task present but log via rejected note if missing task_list.add
            rejectedValues.task_list_add = 'tasks.task_list.add not granted — proceeding with crm.leads.create_task';
        }
        actionTypes.push('CREATE_TASKS');
    }

    const doFollowUp = doc.approveFollowUp === true && !!doc.followUpPlanDraft?.dueDate;
    if (doFollowUp) {
        requirePerm(user, 'data_extractor.sales_workflow.create_followup');
        requirePerm(user, CRM_LEAD_EDIT_PERM);
        actionTypes.push('SET_FOLLOWUP');
    }

    if (!actionTypes.length) {
        throw new ApiError(400, 'No approved actions to apply (set approveAssignment/approveTask/approveFollowUp)');
    }

    const previous = doc.toObject();
    const settings = payload.settings || null;

    try {
        if (doAssign) {
            const updated = await applyLeadAssignment(
                companyId,
                userId,
                doc.crmLeadId,
                doc.selectedOwnerId,
                user,
                settings,
            );
            assignmentApplied = {
                assignedTo: doc.selectedOwnerId,
                assignedToName: doc.selectedOwnerName,
                previousOwnerId: beforeOwner.id,
                previousOwnerName: beforeOwner.name || leadBefore.assignedToName || leadBefore.ownerName || '',
            };
            appliedValues.assignment = assignmentApplied;
            appliedValues.assignedTo = doc.selectedOwnerId;
            appliedValues.assignedToName = doc.selectedOwnerName;
            doc.appliedAssignment = assignmentApplied;
        } else if (doc.ownerDecision === 'KEEP_EXISTING_OWNER') {
            rejectedValues.assignment = 'KEEP_EXISTING_OWNER';
        }

        if (doTasks) {
            for (const draft of doc.taskDrafts) {
                // eslint-disable-next-line no-await-in-loop
                const task = await createLeadTask(companyId, doc.crmLeadId, {
                    ...draft,
                    assigneeId: draft.assigneeId || doc.selectedOwnerId || beforeOwner.id,
                }, user, settings);
                appliedTaskIds.push(task._id);
            }
            appliedValues.taskIds = appliedTaskIds;
            doc.appliedTaskIds = appliedTaskIds;
        }

        if (doFollowUp) {
            const dueDate = doc.followUpPlanDraft.dueDate;
            await applyLeadFollowUp(companyId, userId, doc.crmLeadId, dueDate, user, settings);
            followUpApplied = {
                nextFollowUpDate: dueDate,
                previousNextFollowUpDate: leadBefore.nextFollowUpDate || null,
            };
            appliedValues.followUp = followUpApplied;
            doc.appliedFollowUpRef = followUpApplied;
        }

        const allDone = (doAssign ? !!assignmentApplied : true)
            && (doTasks ? appliedTaskIds.length === doc.taskDrafts.length : true)
            && (doFollowUp ? !!followUpApplied : true);

        const txStatus = allDone ? 'APPLIED' : 'PARTIALLY_APPLIED';
        const tx = await AiSalesWorkflowTransaction.create({
            companyId,
            draftId: doc._id,
            crmLeadId: doc.crmLeadId,
            actionTypes,
            status: txStatus,
            beforeValues: {
                assignedTo: beforeOwner.id,
                assignedToName: beforeOwner.name || leadBefore.assignedToName || leadBefore.ownerName || '',
                nextFollowUpDate: leadBefore.nextFollowUpDate || null,
            },
            appliedValues,
            rejectedValues,
            appliedTaskIds,
            followUpApplied,
            approvalReference: String(doc._id),
            reason: payload.reason || doc.reassignmentReason || 'Apply approved sales workflow',
            appliedBy: userId,
            appliedAt: new Date(),
            rollbackCapability: true,
            idempotencyKey: `sw-apply:${doc._id}`,
            createdBy: userId,
            auditEntries: [{ at: new Date().toISOString(), action: 'applied', actionTypes }],
        });

        doc.transactionId = tx._id;
        doc.rollbackMetadata = {
            transactionId: tx._id,
            beforeValues: tx.beforeValues,
            appliedOwnerId: assignmentApplied?.assignedTo || null,
            appliedTaskIds,
            followUpApplied,
        };

        if (!allDone) {
            doc.status = 'PARTIALLY_APPLIED';
        } else if (isReassignment && assignmentApplied) {
            doc.status = 'REASSIGNED';
        } else if (doTasks && appliedTaskIds.length) {
            doc.status = 'TASKS_CREATED';
        } else if (assignmentApplied) {
            doc.status = 'ASSIGNMENT_APPLIED';
        } else {
            doc.status = 'PARTIALLY_APPLIED';
        }

        doc.updatedBy = userId;
        doc.history = [
            ...(doc.history || []),
            historyEntry('apply', userId, previous, doc.toObject(), 'Sales workflow applied', {
                crmLeadId: doc.crmLeadId,
                selectedSalespersonId: doc.selectedOwnerId,
                result: String(tx._id),
            }),
        ].slice(-100);
        await doc.save();
        return { idempotent: false, transaction: tx.toObject(), draft: doc.toObject() };
    } catch (err) {
        doc.status = 'FAILED';
        doc.history = [
            ...(doc.history || []),
            historyEntry('apply_failed', userId, previous, doc.toObject(), err?.message || 'failed'),
        ].slice(-100);
        await doc.save();
        throw err;
    }
}

export async function rejectDraft(companyId, userId, id, payload = {}) {
    rejectTenantOverrides(payload);
    const doc = await AiSalesWorkflowDraft.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Draft not found');
    if (doc.locked) throw new ApiError(400, 'Draft is locked');
    const previous = doc.toObject();
    doc.status = 'REJECTED';
    doc.updatedBy = userId;
    doc.history = [
        ...(doc.history || []),
        historyEntry('reject', userId, previous, doc.toObject(), payload.reason || 'Rejected'),
    ].slice(-100);
    await doc.save();
    return doc.toObject();
}

export async function lockDraft(companyId, userId, id, payload = {}) {
    rejectTenantOverrides(payload);
    const doc = await AiSalesWorkflowDraft.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Draft not found');
    const previous = doc.toObject();
    const action = String(payload.action || 'lock');
    if (action === 'lock') {
        doc.locked = true;
        doc.lockedAt = new Date();
        doc.lockedBy = userId;
        if (doc.status === 'APPROVED') doc.status = 'LOCKED';
    } else if (action === 'unlock') {
        doc.locked = false;
        doc.lockedAt = null;
        doc.lockedBy = null;
        if (doc.status === 'LOCKED') doc.status = 'APPROVED';
    } else {
        throw new ApiError(400, 'action must be lock or unlock');
    }
    doc.updatedBy = userId;
    doc.history = [
        ...(doc.history || []),
        historyEntry(action, userId, previous, doc.toObject(), payload.reason || ''),
    ].slice(-100);
    await doc.save();
    return doc.toObject();
}

export async function exportDrafts(companyId, query = {}) {
    const q = { companyId, isDeleted: { $ne: true } };
    if (query.status) q.status = query.status;
    const rows = await AiSalesWorkflowDraft.find(q).sort({ updatedAt: -1 }).limit(500).lean();
    return {
        format: String(query.format || 'json'),
        engineVersion: ENGINE_VERSION,
        results: rows.map((r) => ({
            companyName: r.companyName,
            eligibilityStatus: r.eligibilityStatus,
            status: r.status,
            crmLeadId: r.crmLeadId,
            suggestedOwnerName: r.suggestedOwnerName,
            selectedOwnerName: r.selectedOwnerName,
            ownerDecision: r.ownerDecision,
            locked: !!r.locked,
            duplicateStatus: r.duplicateCheck?.status || '',
        })),
    };
}

export const applyApprovedActions = applyDraft;
export const reviewDraft = setReviewDecisions;
export async function cancelDraft(companyId, userId, id, payload = {}) {
    rejectTenantOverrides(payload);
    const doc = await AiSalesWorkflowDraft.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Draft not found');
    if (doc.locked) throw new ApiError(400, 'Draft is locked');
    const previous = doc.toObject();
    doc.status = 'CANCELLED';
    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry('cancel', userId, previous, doc.toObject(), payload.reason || 'Cancelled')].slice(-100);
    await doc.save();
    return doc.toObject();
}
export async function recommendOnly(companyId, payload = {}) {
    if (payload.companyId != null || payload.tenantId != null) {
        const { ApiError } = await import('../../../utils/ApiError.js');
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
    return { recommendations: [], note: 'Use prepareDraft for full recommendation' };
}
