/**
 * SearchQuery Checkpoint 2 constants.
 */
export const SEARCH_QUERY_STATUSES = Object.freeze([
    'generated', 'draft', 'approved', 'rejected', 'opened', 'captured', 'archived',
]);

export const SEARCH_QUERY_STATUS_TRANSITIONS = Object.freeze({
    generated: ['approved', 'rejected', 'draft', 'archived'],
    draft: ['approved', 'rejected', 'archived'],
    approved: ['opened', 'captured', 'archived'],
    opened: ['opened', 'captured', 'archived'],
    rejected: ['archived'],
    captured: ['captured', 'archived'],
    archived: [],
});

export const SEARCH_QUERY_EDITABLE_STATUSES = Object.freeze(['generated', 'draft', 'rejected']);

/** Non-archived statuses included in the partial unique index (MongoDB $in — not $ne). */
export const SEARCH_QUERY_ACTIVE_STATUSES = Object.freeze([
    'generated', 'draft', 'approved', 'rejected', 'opened', 'captured',
]);

export const SEARCH_QUERY_UNIQUE_INDEX_NAME = 'uniq_active_query_normalized';

/** Fields that change search meaning (approved/opened → derived draft). */
export const SEARCH_QUERY_MEANING_FIELDS = Object.freeze(['queryText', 'sourceHint', 'queryType']);

/** Metadata-only updatable without derivation on approved/opened. */
export const SEARCH_QUERY_METADATA_FIELDS = Object.freeze(['notes']);

export const SEARCH_QUERY_SOURCE_HINTS = Object.freeze([
    'google', 'facebook', 'indiamart', 'official_website', 'web', 'manual',
]);

export const SEARCH_QUERY_TYPES = Object.freeze([
    'general', 'industry', 'product', 'business_type', 'geography',
    'source_specific', 'site_operator', 'technical', 'manual', 'regenerated',
]);

export const SEARCH_QUERY_GENERATION_METHODS = Object.freeze([
    'automatic', 'manual', 'regenerated',
]);

export const SEARCH_QUERY_TEXT_MIN = 2;
export const SEARCH_QUERY_TEXT_MAX = 500;
export const SEARCH_QUERY_NOTES_MAX = 2000;
export const SEARCH_QUERY_REJECTION_MAX = 500;

export const SEARCH_QUERY_GEN_DEFAULT_LIMIT = 30;
export const SEARCH_QUERY_GEN_MIN_LIMIT = 1;
export const SEARCH_QUERY_GEN_MAX_LIMIT = 100;
export const SEARCH_QUERY_BULK_MAX = 100;
export const SEARCH_QUERY_LIST_DEFAULT_LIMIT = 20;
export const SEARCH_QUERY_LIST_MAX_LIMIT = 100;

export const SEARCH_QUERY_SORT_FIELDS = Object.freeze([
    'updatedAt', 'createdAt', 'priorityScore', 'status', 'sourceHint', 'queryType', 'openedCount',
]);

export const CAMPAIGN_ELIGIBLE_FOR_GENERATE = Object.freeze(['draft', 'active', 'paused']);
export const CAMPAIGN_READONLY_STATUSES = Object.freeze(['closed', 'archived']);

export const PERM_QUERY_VIEW = 'data_extractor.search_query.view';
export const PERM_QUERY_MANAGE = 'data_extractor.search_query.manage';
export const PERM_QUERY_GENERATE = 'data_extractor.search_query.generate';
export const PERM_QUERY_REVIEW = 'data_extractor.search_query.review';
export const PERM_QUERY_OPEN = 'data_extractor.search_query.open';

export const SEARCH_QUERY_FORBIDDEN_BODY = Object.freeze([
    'companyId', 'tenantId', 'company_id', 'tenant_id',
    'createdBy', 'updatedBy', 'approvedAt', 'approvedBy', 'rejectedAt', 'rejectedBy',
    'archivedAt', 'archivedBy', 'lastOpenedAt', 'lastOpenedBy', 'openedCount', 'lastCapturedAt', 'lastCapturedBy',
    'captureCount', 'resultCount', 'status', 'generationGroupId', 'generationSequence',
    'parentQueryId', 'generationMethod', 'queryNormalized', 'searchUrl', 'campaignId', '_id', 'id',
]);
