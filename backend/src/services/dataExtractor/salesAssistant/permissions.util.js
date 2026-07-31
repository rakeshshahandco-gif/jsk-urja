import { ApiError } from '../../../utils/ApiError.js';
import { checkUserPermission } from '../../../utils/permissionUtils.js';
import { PERMS, SOURCE_PERMS } from './constants.js';

export function hasManage(user) {
    return checkUserPermission(user, PERMS.manage);
}

export function hasAssistant(user, key) {
    return checkUserPermission(user, key) || hasManage(user);
}

export function assertAsk(user) {
    if (!hasAssistant(user, PERMS.ask)) {
        throw new ApiError(403, `Missing permission: ${PERMS.ask}`);
    }
}

export function assertView(user) {
    if (!hasAssistant(user, PERMS.view) && !hasAssistant(user, PERMS.ask)) {
        throw new ApiError(403, `Missing permission: ${PERMS.view}`);
    }
}

export function assertExport(user) {
    if (!hasAssistant(user, PERMS.export)) {
        throw new ApiError(403, `Missing permission: ${PERMS.export}`);
    }
}

export function assertAudit(user) {
    if (!hasAssistant(user, PERMS.audit) && !hasAssistant(user, PERMS.history)) {
        throw new ApiError(403, `Missing permission: ${PERMS.audit}`);
    }
}

export function assertSavedPrompts(user) {
    if (!hasAssistant(user, PERMS.saved_prompts) && !hasAssistant(user, PERMS.view)) {
        throw new ApiError(403, `Missing permission: ${PERMS.saved_prompts}`);
    }
}

export function canManageSharedPrompts(user) {
    return hasAssistant(user, PERMS.manage_prompts);
}

export function hasSource(user, key) {
    if (!key) return true;
    return checkUserPermission(user, key) || hasManage(user);
}

export function canSeeContactDetails(user) {
    return hasSource(user, SOURCE_PERMS.contactDetailStrict)
        || hasSource(user, SOURCE_PERMS.contactDetail)
        || hasAssistant(user, PERMS.contact);
}

export function canSeeCrmDetails(user) {
    return hasSource(user, SOURCE_PERMS.crmLeadView) || hasAssistant(user, PERMS.crm_conversion);
}

export function canSeeSalesWorkflow(user) {
    return hasSource(user, SOURCE_PERMS.salesWorkflowView) || hasAssistant(user, PERMS.sales_workflow);
}

export function canSeeMarketing(user) {
    return hasSource(user, SOURCE_PERMS.marketingView) || hasAssistant(user, PERMS.marketing);
}

export function canSeeAnalytics(user) {
    return hasSource(user, SOURCE_PERMS.analyticsView) || hasAssistant(user, PERMS.executive);
}

export function canSeeLeadScores(user) {
    return hasSource(user, SOURCE_PERMS.leadScoringView) || hasAssistant(user, PERMS.sales);
}

export function canSeeProducts(user) {
    return hasSource(user, SOURCE_PERMS.productView) || hasAssistant(user, PERMS.product);
}

export function canSeeSimilar(user) {
    return hasSource(user, SOURCE_PERMS.similarView) || hasAssistant(user, PERMS.market);
}

export function canSeeMarket(user) {
    return hasSource(user, SOURCE_PERMS.marketView) || hasAssistant(user, PERMS.market);
}

export function canSeeCompanyResearch(user) {
    return hasSource(user, SOURCE_PERMS.companyIntelView)
        || hasAssistant(user, PERMS.company_research)
        || hasAssistant(user, PERMS.sales);
}

export function isAggregateOnly(user) {
    if (hasManage(user)) return false;
    // Aggregate-only: has view/executive but lacks sales/contact/company_research drill-down
    const hasView = hasAssistant(user, PERMS.view) || hasAssistant(user, PERMS.executive);
    const hasDetail = hasAssistant(user, PERMS.sales)
        || hasAssistant(user, PERMS.contact)
        || hasAssistant(user, PERMS.company_research)
        || hasAssistant(user, PERMS.ask);
    return hasView && !hasDetail && !hasAssistant(user, PERMS.ask);
}

export function resolveEffectivePermissions(user) {
    return {
        assistant: Object.fromEntries(Object.entries(PERMS).map(([k, v]) => [k, hasAssistant(user, v)])),
        source: {
            contactDetail: canSeeContactDetails(user),
            crmLeadView: canSeeCrmDetails(user),
            salesWorkflowView: canSeeSalesWorkflow(user),
            marketingView: canSeeMarketing(user),
            analyticsView: canSeeAnalytics(user),
            leadScoringView: canSeeLeadScores(user),
            productView: canSeeProducts(user),
            similarView: canSeeSimilar(user),
            marketView: canSeeMarket(user),
            companyResearch: canSeeCompanyResearch(user),
        },
        aggregateOnly: isAggregateOnly(user),
    };
}
