import { Task } from '../../../models/task.model.js';
import { Lead } from '../../../models/lead.model.js';
import { normText } from './normalize.util.js';
import { normalizeSalesWorkflowSettings } from './settings.service.js';

const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS', 'OVERDUE', 'PENDING'];

function dayMs(days) {
    return Math.max(0, Number(days) || 0) * 24 * 60 * 60 * 1000;
}

function titlesSimilar(a, b) {
    const na = normText(a);
    const nb = normText(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (na.includes(nb) || nb.includes(na)) return true;
    const wa = new Set(na.split(' ').filter((w) => w.length > 2));
    const wb = nb.split(' ').filter((w) => w.length > 2);
    if (!wa.size || !wb.length) return false;
    const overlap = wb.filter((w) => wa.has(w)).length;
    return overlap >= Math.min(2, wb.length) && overlap / Math.max(wa.size, wb.length) >= 0.4;
}

function withinWindow(dateA, dateB, windowDays) {
    if (!dateA || !dateB) return false;
    const a = new Date(dateA).getTime();
    const b = new Date(dateB).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return Math.abs(a - b) <= dayMs(windowDays);
}

/**
 * Detect duplicate / conflicting follow-up and task actions for a CRM lead.
 */
export async function checkDuplicateActions({
    companyId,
    crmLeadId,
    taskDrafts = [],
    followUpPlan = {},
    settings: rawSettings = {},
} = {}) {
    const settings = normalizeSalesWorkflowSettings(rawSettings);
    const windowDays = Math.max(0, Number(settings.duplicateTaskWindowDays) || 3);
    const evidence = [];

    if (!crmLeadId) {
        return { status: 'MANUAL_REVIEW_REQUIRED', evidence: [{ signal: 'missing_crm_lead_id' }] };
    }

    const lead = await Lead.findOne({ _id: crmLeadId, companyId }).lean();
    if (!lead) {
        return { status: 'MANUAL_REVIEW_REQUIRED', evidence: [{ signal: 'crm_lead_not_found' }] };
    }

    const openTasks = await Task.find({
        leadId: crmLeadId,
        status: { $in: OPEN_STATUSES },
    }).select('title dueDate status assigneeIds createdAt').lean();

    if (openTasks.length) {
        evidence.push({
            signal: 'existing_open_tasks',
            count: openTasks.length,
            taskIds: openTasks.map((t) => t._id),
        });
    }

    let exactTitle = false;
    let possibleTitle = false;
    for (const draft of taskDrafts || []) {
        for (const existing of openTasks) {
            if (!titlesSimilar(draft.title, existing.title)) continue;
            const dueClose = withinWindow(draft.dueDate, existing.dueDate, windowDays);
            if (normText(draft.title) === normText(existing.title) && dueClose) {
                exactTitle = true;
                evidence.push({
                    signal: 'exact_task_title_due',
                    draftTitle: draft.title,
                    existingTaskId: existing._id,
                    existingDueDate: existing.dueDate,
                });
            } else {
                possibleTitle = true;
                evidence.push({
                    signal: 'similar_open_task',
                    draftTitle: draft.title,
                    existingTitle: existing.title,
                    existingTaskId: existing._id,
                    dueClose,
                });
            }
        }
    }

    const planDue = followUpPlan?.dueDate || null;
    if (lead.nextFollowUpDate && planDue && withinWindow(lead.nextFollowUpDate, planDue, windowDays)) {
        evidence.push({
            signal: 'next_followup_proximity',
            leadNextFollowUpDate: lead.nextFollowUpDate,
            planDueDate: planDue,
            windowDays,
        });
        possibleTitle = true;
    }

    if (lead.nextFollowUpDate) {
        const now = Date.now();
        const followTs = new Date(lead.nextFollowUpDate).getTime();
        if (Number.isFinite(followTs) && followTs >= now - dayMs(1) && followTs <= now + dayMs(windowDays)) {
            evidence.push({
                signal: 'existing_pending_followup',
                leadNextFollowUpDate: lead.nextFollowUpDate,
            });
        }
    }

    if (exactTitle) {
        return { status: 'EXACT_DUPLICATE', evidence };
    }
    if (openTasks.length && (taskDrafts || []).length && possibleTitle) {
        return { status: 'POSSIBLE_DUPLICATE', evidence };
    }
    if (openTasks.length && evidence.some((e) => e.signal === 'existing_pending_followup')) {
        return { status: 'EXISTING_PENDING_ACTION', evidence };
    }
    if (openTasks.length && !(taskDrafts || []).length) {
        return { status: 'EXISTING_PENDING_ACTION', evidence };
    }
    if (evidence.some((e) => e.signal === 'next_followup_proximity') && !openTasks.length) {
        return { status: 'POSSIBLE_DUPLICATE', evidence };
    }
    if (evidence.length && !exactTitle && possibleTitle) {
        return { status: 'MANUAL_REVIEW_REQUIRED', evidence };
    }
    return { status: 'NO_DUPLICATE', evidence };
}
