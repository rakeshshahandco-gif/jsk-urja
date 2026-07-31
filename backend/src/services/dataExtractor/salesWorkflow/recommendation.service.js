import { Lead } from '../../../models/lead.model.js';
import { Task } from '../../../models/task.model.js';
import { User } from '../../../models/user.model.js';
import { mongooseFilterUsersForCompany } from '../../companyUserAccess.service.js';
import { checkUserPermission } from '../../../utils/permissionUtils.js';
import { normalizeSalesWorkflowSettings } from './settings.service.js';
import { FOLLOWUP_ACTIONS, ENGINE_VERSION } from './constants.js';
import { normText, addWorkingDays, isPastDate } from './normalize.util.js';

const CRM_LEAD_PERMS = ['crm.leads.view', 'crm.leads.edit', 'crm.leads.assign', 'crm.leads.add'];
const OPEN_TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'OVERDUE', 'PENDING'];
const WORKLOAD_CAP = 40;

function userIdOf(user) {
    return user?._id || user?.id || null;
}

function userDisplayName(user) {
    return String(user?.name || user?.username || user?.email || '').trim();
}

function rulePatterns(rule = {}) {
    const raw = [
        ...(Array.isArray(rule.match) ? rule.match : (rule.match != null ? [rule.match] : [])),
        ...(Array.isArray(rule.pattern) ? rule.pattern : (rule.pattern != null ? [rule.pattern] : [])),
        ...(Array.isArray(rule.keywords) ? rule.keywords : (rule.keywords != null ? [rule.keywords] : [])),
        ...(Array.isArray(rule.values) ? rule.values : (rule.values != null ? [rule.values] : [])),
        ...(Array.isArray(rule.tags) ? rule.tags : (rule.tags != null ? [rule.tags] : [])),
        rule.city,
        rule.state,
        rule.stateProvince,
        rule.region,
        rule.territory,
        rule.industry,
        rule.product,
        rule.customerType,
        rule.label,
    ].filter((x) => x != null && x !== '');
    return raw.map((x) => normText(x)).filter(Boolean);
}

function ruleUserIds(rule = {}) {
    const raw = rule.userIds ?? rule.assigneeUserIds ?? rule.userId ?? rule.assigneeId ?? [];
    return (Array.isArray(raw) ? raw : [raw]).map((x) => String(x)).filter((x) => x && x !== 'undefined');
}

function contextHaystack(crmLead = {}, context = {}) {
    const parts = [
        context.territory,
        context.city,
        context.state,
        context.stateProvince,
        context.region,
        context.industry,
        context.businessCategory,
        context.customerType,
        context.product,
        context.products,
        crmLead.city,
        crmLead.state,
        crmLead.stateProvince,
        crmLead.region,
        crmLead.territory,
        crmLead.businessCategory,
        crmLead.customerName,
        crmLead.notes,
        ...(Array.isArray(context.productNames) ? context.productNames : []),
        ...(Array.isArray(context.industries) ? context.industries : []),
        ...(Array.isArray(crmLead.products)
            ? crmLead.products.map((p) => p.requirementNote || p.name || '')
            : []),
    ];
    if (context.companyProfile?.industry) parts.push(context.companyProfile.industry);
    if (context.classification?.industry) parts.push(context.classification.industry);
    return normText(parts.filter(Boolean).join(' '));
}

function dimensionMax(settings, id, fallback) {
    const dim = (settings.dimensions || []).find((d) => d.id === id);
    if (!dim || dim.active === false) return 0;
    return Math.max(0, Number(dim.maxScore) || fallback || 0);
}

function scoreRuleFit(rules, user, haystack, maxScore) {
    if (!maxScore) return { score: 0, matched: [] };
    if (!Array.isArray(rules) || !rules.length) return { score: Math.round(maxScore * 0.25), matched: ['no_rules_neutral'] };
    const uid = String(userIdOf(user) || '');
    const matched = [];
    let best = 0;
    for (const rule of rules) {
        const patterns = rulePatterns(rule);
        const ids = ruleUserIds(rule);
        const patternHit = !patterns.length || patterns.some((p) => haystack.includes(p));
        if (!patternHit) continue;
        if (ids.length && !ids.includes(uid)) continue;
        const weight = Math.min(1, Math.max(0.1, Number(rule.weight ?? rule.score ?? 1) || 1));
        best = Math.max(best, maxScore * weight);
        matched.push(rule.id || rule.label || patterns[0] || 'rule');
    }
    if (!matched.length && !rules.some((r) => ruleUserIds(r).length)) {
        // Rules exist but none scoped to users — give small baseline when pattern hits any rule without user filter
        return { score: Math.round(maxScore * 0.15), matched: ['unmatched_baseline'] };
    }
    return { score: Math.round(best), matched };
}

/**
 * Reject inactive, foreign-company, superadmin (unless allowSuperadmin),
 * and users lacking any CRM lead view/edit/assign/add permission.
 */
export function validateEligibleSalesperson(user, companyId, { allowSuperadmin = false } = {}) {
    if (!user) return { ok: false, reason: 'missing_user' };
    if (user.isActive === false || user.allowLogin === false) {
        return { ok: false, reason: 'inactive' };
    }
    const roleName = String(user.roleName || user.role?.name || '').toLowerCase();
    if (roleName === 'superadmin' && !allowSuperadmin) {
        return { ok: false, reason: 'superadmin_excluded' };
    }
    if (user.companyAccessConfigured === true) {
        const assigned = (user.assignedCompanyIds || []).map((x) => String(x?._id || x));
        if (companyId && assigned.length && !assigned.includes(String(companyId))) {
            return { ok: false, reason: 'foreign_company' };
        }
    }
    const hasCrmLeadPerm = CRM_LEAD_PERMS.some((p) => checkUserPermission(user, p));
    if (!hasCrmLeadPerm && roleName !== 'superadmin') {
        return { ok: false, reason: 'missing_crm_leads_permission' };
    }
    return { ok: true, reason: '' };
}

export async function listEligibleSalespeople(companyId, options = {}) {
    const filter = {
        ...mongooseFilterUsersForCompany(companyId),
        isActive: { $ne: false },
    };
    const users = await User.find(filter)
        .populate('role')
        .populate('department', 'name')
        .select('-password')
        .lean();
    return users.filter((u) => validateEligibleSalesperson(u, companyId, options).ok);
}

function workloadScore(openLeads, openTasks, maxScore) {
    if (!maxScore) return 0;
    const load = Number(openLeads || 0) + Number(openTasks || 0);
    const ratio = Math.min(1, load / WORKLOAD_CAP);
    return Math.round(maxScore * (1 - ratio));
}

/**
 * Score a salesperson for a lead. Dimensions: territory / industry / product /
 * customer_type / existing_ownership / workload.
 * NEVER uses name similarity between salesperson and company/lead for selection.
 */
export async function scoreSalesperson({
    user,
    crmLead = {},
    context = {},
    settings: rawSettings = {},
    companyId,
} = {}) {
    const settings = normalizeSalesWorkflowSettings(rawSettings);
    const haystack = contextHaystack(crmLead, context);
    const uid = String(userIdOf(user) || '');

    const territoryMax = dimensionMax(settings, 'territory_fit', 25);
    const industryMax = dimensionMax(settings, 'industry_fit', 20);
    const productMax = dimensionMax(settings, 'product_fit', 20);
    const customerTypeMax = dimensionMax(settings, 'customer_type_fit', 10);
    const ownershipMax = dimensionMax(settings, 'existing_ownership', 10);
    const workloadMax = dimensionMax(settings, 'workload', 15);

    const territory = scoreRuleFit(settings.territoryRules, user, haystack, territoryMax);
    const industry = scoreRuleFit(settings.industryRules, user, haystack, industryMax);
    const product = scoreRuleFit(settings.productRules, user, haystack, productMax);
    const customerType = scoreRuleFit(settings.customerTypeRules, user, haystack, customerTypeMax);

    let ownershipScore = 0;
    const ownerIds = [
        crmLead.assignedTo,
        crmLead.assignedToUserId,
        crmLead.ownerUserId,
        context.currentOwnerId,
    ].filter(Boolean).map((x) => String(x._id || x));
    if (settings.existingOwnerPriority !== false && ownershipMax && ownerIds.includes(uid)) {
        ownershipScore = ownershipMax;
    }

    let openLeads = 0;
    let openTasks = 0;
    if (companyId && uid) {
        [openLeads, openTasks] = await Promise.all([
            Lead.countDocuments({
                companyId,
                $or: [{ assignedTo: user._id }, { assignedToUserId: user._id }, { ownerUserId: user._id }],
                status: { $nin: ['won', 'lost'] },
            }),
            Task.countDocuments({
                assigneeIds: user._id,
                status: { $in: OPEN_TASK_STATUSES },
            }),
        ]);
    }
    const workload = workloadScore(openLeads, openTasks, workloadMax);

    const dimensions = [
        { id: 'territory_fit', score: territory.score, max: territoryMax, matched: territory.matched },
        { id: 'industry_fit', score: industry.score, max: industryMax, matched: industry.matched },
        { id: 'product_fit', score: product.score, max: productMax, matched: product.matched },
        { id: 'customer_type_fit', score: customerType.score, max: customerTypeMax, matched: customerType.matched },
        { id: 'existing_ownership', score: ownershipScore, max: ownershipMax, matched: ownershipScore ? ['current_owner'] : [] },
        {
            id: 'workload',
            score: workload,
            max: workloadMax,
            openLeads,
            openTasks,
            matched: [`open_leads=${openLeads}`, `open_tasks=${openTasks}`],
        },
    ];

    const total = dimensions.reduce((s, d) => s + (Number(d.score) || 0), 0);
    const maxTotal = dimensions.reduce((s, d) => s + (Number(d.max) || 0), 0);

    return {
        userId: user._id,
        name: userDisplayName(user),
        totalScore: total,
        assignmentScore: total,
        maxScore: maxTotal,
        confidence: maxTotal ? Math.round((total / maxTotal) * 100) : 0,
        dimensions,
        engineVersion: ENGINE_VERSION,
        // Explicit: name similarity is never a scoring signal
        nameSimilarityUsed: false,
    };
}

export async function recommendSalespeople(companyId, {
    crmLead = {},
    context = {},
    settings: rawSettings = {},
    mode = 'HYBRID',
    limit = 5,
    allowSuperadmin = false,
} = {}) {
    const settings = normalizeSalesWorkflowSettings(rawSettings);
    const assignmentMode = String(mode || settings.assignmentMode || 'HYBRID').toUpperCase();
    const candidates = await listEligibleSalespeople(companyId, { allowSuperadmin });
    const scored = [];
    for (const user of candidates) {
        // eslint-disable-next-line no-await-in-loop
        const result = await scoreSalesperson({ user, crmLead, context, settings, companyId });
        scored.push({
            userId: result.userId,
            name: result.name,
            totalScore: result.totalScore,
            confidence: result.confidence,
            dimensions: result.dimensions,
            email: user.email || '',
            designation: user.designation || '',
            roleName: user.roleName || '',
        });
    }
    scored.sort((a, b) => b.totalScore - a.totalScore || String(a.name).localeCompare(String(b.name)));

    let ordered = scored;
    const ownerIds = [
        crmLead.assignedTo,
        crmLead.assignedToUserId,
        crmLead.ownerUserId,
        context.currentOwnerId,
    ].filter(Boolean).map((x) => String(x._id || x));

    if (assignmentMode === 'EXISTING_OWNER' && settings.existingOwnerPriority !== false && ownerIds.length) {
        const owners = ordered.filter((r) => ownerIds.includes(String(r.userId)));
        const rest = ordered.filter((r) => !ownerIds.includes(String(r.userId)));
        ordered = owners.length ? [...owners, ...rest] : ordered;
    } else if (assignmentMode === 'TERRITORY_BASED') {
        ordered = [...ordered].sort((a, b) => {
            const at = (a.dimensions || []).find((d) => d.id === 'territory_fit')?.score || 0;
            const bt = (b.dimensions || []).find((d) => d.id === 'territory_fit')?.score || 0;
            return bt - at || b.totalScore - a.totalScore;
        });
    } else if (assignmentMode === 'ROUND_ROBIN' || (assignmentMode === 'HYBRID' && settings.roundRobinEnabled)) {
        const cursor = Math.max(0, Number(settings.roundRobinCursor) || 0);
        if (ordered.length) {
            const idx = cursor % ordered.length;
            ordered = [...ordered.slice(idx), ...ordered.slice(0, idx)];
        }
    }

    const top = ordered.slice(0, Math.max(1, Math.min(20, Number(limit) || 5))).map((r, i) => ({
        ...r,
        assignmentScore: r.totalScore,
        recommendedRank: i + 1,
    }));
    const suggested = top[0] || null;
    return {
        assignmentMode,
        suggested,
        recommendations: top,
        suggestedOwnerId: suggested?.userId || null,
        suggestedOwnerName: suggested?.name || '',
        alternatives: top.slice(1),
        ranking: top,
        assignmentScoreBreakdown: suggested?.dimensions || null,
        candidateCount: scored.length,
        engineVersion: ENGINE_VERSION,
        nameSimilarityUsed: false,
    };
}

function priorityKey(crmLead = {}, context = {}) {
    const raw = String(
        context.priority
        || context.leadScore?.priority
        || context.leadScoreSnapshot?.priority
        || crmLead.priority
        || 'MEDIUM',
    ).toUpperCase();
    const map = {
        CRITICAL: 'CRITICAL',
        HIGH: 'HIGH',
        MEDIUM: 'MEDIUM',
        LOW: 'LOW',
        NO_PRIORITY: 'NO_PRIORITY',
        // CRM lead enum is lowercase medium/high/low
    };
    return map[raw] || 'MEDIUM';
}

function pickFollowUpActions(crmLead = {}, context = {}) {
    const actions = [];
    const contact = context.contact || context.contactSnapshot || {};
    const hasPrimary = !!(contact.primaryContact || contact.name || crmLead.customerMobile || crmLead.customerEmail);
    const products = context.products || context.productOpportunity || context.productOpportunitySnapshot || crmLead.products || [];
    const hasProducts = Array.isArray(products) ? products.length > 0 : !!products;

    if (hasPrimary) actions.push('Call primary contact');
    else actions.push('Request purchase contact');

    if (hasProducts) {
        actions.push('Send product catalog');
        actions.push('Request technical requirements');
    } else {
        actions.push('Send company introduction');
        actions.push('Manual research');
    }

    const priority = priorityKey(crmLead, context);
    if (['CRITICAL', 'HIGH'].includes(priority)) {
        actions.push('Schedule meeting');
    } else if (priority === 'LOW' || priority === 'NO_PRIORITY') {
        actions.push('Nurture later');
    }

    const unique = [];
    for (const a of actions) {
        if (FOLLOWUP_ACTIONS.includes(a) && !unique.includes(a)) unique.push(a);
    }
    if (!unique.length) unique.push('No immediate action');
    return unique.slice(0, 5);
}

/**
 * Build a follow-up plan. Due dates never land in the past.
 * executeCommunication is always false (no auto email/WhatsApp).
 */
export function buildFollowUpPlan({
    crmLead = {},
    context = {},
    settings: rawSettings = {},
    assigneeName = '',
} = {}) {
    const settings = normalizeSalesWorkflowSettings(rawSettings);
    const priority = priorityKey(crmLead, context);
    const daysMap = settings.priorityFollowupDays || {};
    const days = Number(daysMap[priority] ?? daysMap.MEDIUM ?? 3) || 0;
    const skipWeekends = settings.workingDayRules?.skipWeekends !== false;
    let dueDate = addWorkingDays(new Date(), days, { skipWeekends });
    if (isPastDate(dueDate)) {
        dueDate = addWorkingDays(new Date(), 0, { skipWeekends });
    }

    const actions = pickFollowUpActions(crmLead, context);
    const plan = {
        priority,
        dueDate: dueDate.toISOString(),
        assigneeName: assigneeName || '',
        actions,
        recommendedAction: actions[0] || 'No immediate action',
        notes: `Phase 14 follow-up plan for ${crmLead.customerName || context.companyName || 'lead'}`,
        executeCommunication: false,
        noAutoEmail: true,
        noAutoWhatsApp: true,
        engineVersion: ENGINE_VERSION,
    };
    return plan;
}

export function buildTaskDrafts({
    followUpPlan = {},
    crmLead = {},
    selectedOwnerId = null,
    selectedOwnerName = '',
} = {}) {
    const actions = Array.isArray(followUpPlan.actions) && followUpPlan.actions.length
        ? followUpPlan.actions
        : ['Call primary contact'];
    const companyLabel = crmLead.customerName || 'Lead';
    const dueDate = followUpPlan.dueDate || addWorkingDays(new Date(), 1).toISOString();
    const priority = String(followUpPlan.priority || 'MEDIUM').toUpperCase();
    const taskPriority = priority === 'CRITICAL' ? 'CRITICAL'
        : priority === 'HIGH' ? 'HIGH'
            : priority === 'LOW' || priority === 'NO_PRIORITY' ? 'LOW'
                : 'MEDIUM';

    return actions
        .filter((a) => a && a !== 'No immediate action')
        .map((action, index) => ({
            key: `sw-task-${index + 1}`,
            title: `${action} — ${companyLabel}`.slice(0, 200),
            description: [
                `Action: ${action}`,
                `Lead: ${companyLabel}`,
                selectedOwnerName ? `Owner: ${selectedOwnerName}` : '',
                'Source: Phase 14 Sales Workflow (draft only — not executed until approved)',
            ].filter(Boolean).join('\n'),
            dueDate,
            priority: taskPriority,
            status: 'OPEN',
            assigneeId: selectedOwnerId || null,
            assigneeName: selectedOwnerName || followUpPlan.assigneeName || '',
            action,
            leadId: crmLead._id || crmLead.id || null,
            executeCommunication: false,
            source: 'sales_workflow',
        }));
}
