/**
 * Search Campaign Phase 1 constants (Checkpoint 1).
 * Campaign master only - no query/capture/AI/enrichment here.
 */

export const SEARCH_CAMPAIGN_STATUSES = Object.freeze([
    'draft',
    'active',
    'paused',
    'closed',
    'archived',
]);

/** Allowed transitions. Archived cannot be reactivated in Checkpoint 1. */
export const SEARCH_CAMPAIGN_STATUS_TRANSITIONS = Object.freeze({
    draft: ['active', 'archived'],
    active: ['paused', 'closed', 'archived'],
    paused: ['active', 'closed', 'archived'],
    closed: ['archived'],
    archived: [],
});

export const SEARCH_CAMPAIGN_SOURCES = Object.freeze([
    'google',
    'facebook',
    'indiamart',
    'official_website',
    'web',
    'manual_url',
    'manual_text',
    'csv',
    'excel',
    'discovery_agent',
]);

export const SEARCH_CAMPAIGN_REQUIRED_CONTACT_FIELDS = Object.freeze([
    'company_name',
    'website',
    'email',
    'phone',
    'whatsapp',
    'address',
    'city',
    'state',
    'country',
]);

export const SEARCH_CAMPAIGN_NAME_MAX = 160;
export const SEARCH_CAMPAIGN_DESCRIPTION_MAX = 2000;
export const SEARCH_CAMPAIGN_STRING_MAX = 200;
export const SEARCH_CAMPAIGN_ARRAY_MAX = 50;

export const SEARCH_CAMPAIGN_LIST_DEFAULT_LIMIT = 20;
export const SEARCH_CAMPAIGN_LIST_MAX_LIMIT = 100;

export const SEARCH_CAMPAIGN_SORT_FIELDS = Object.freeze([
    'updatedAt',
    'createdAt',
    'name',
    'status',
    'targetIndustry',
    'minimumQualificationScore',
]);

/** Writable body fields for create/update (never companyId / audit). */
export const SEARCH_CAMPAIGN_WRITABLE_FIELDS = Object.freeze([
    'name',
    'description',
    'targetIndustry',
    'relatedIndustries',
    'targetProducts',
    'businessTypes',
    'country',
    'state',
    'city',
    'locationScope',
    'relatedKeywords',
    'searchMarket',
    'selectedSources',
    'worldwide',
    'expandCities',
    'expandStates',
    'includeKeywords',
    'excludeKeywords',
    'sources',
    'minimumQualificationScore',
    'requiredContactFields',
]);

export const SEARCH_CAMPAIGN_FORBIDDEN_BODY_FIELDS = Object.freeze([
    'companyId',
    'tenantId',
    'company_id',
    'tenant_id',
    'createdBy',
    'updatedBy',
    'archivedAt',
    'archivedBy',
    'createdAt',
    'updatedAt',
    '_id',
    'id',
    'nameNormalized',
]);

export const PERM_VIEW = 'data_extractor.search_campaign.view';
export const PERM_MANAGE = 'data_extractor.search_campaign.manage';