export const ENGINE_VERSION = 'marketing-intelligence-v1';
export const SETTINGS_VERSION = 'marketing-intelligence-settings-v1';

export const CAMPAIGN_TYPES = Object.freeze([
    'PRODUCT_INTRODUCTION', 'NEW_PRODUCT_LAUNCH', 'PRODUCT_CATALOGUE', 'PRODUCT_DATASHEET',
    'TECHNICAL_INFORMATION', 'DEALER_DEVELOPMENT', 'OEM_OUTREACH', 'DISTRIBUTOR_OUTREACH',
    'MARKET_EXPANSION', 'INDUSTRY_SPECIFIC', 'GEOGRAPHY_SPECIFIC', 'EXISTING_LEAD_NURTURE',
    'DORMANT_LEAD_REACTIVATION', 'EVENT_INVITATION_DRAFT', 'FOLLOW_UP_INFORMATION', 'MANUAL_CUSTOM',
]);

export const CHANNEL_DRAFT_TYPES = Object.freeze([
    'EMAIL_DRAFT', 'WHATSAPP_DRAFT', 'EMAIL_AND_WHATSAPP_DRAFT',
    'EXPORT_ONLY', 'MANUAL_CALL_LIST', 'MANUAL_REVIEW_ONLY',
]);

export const CAMPAIGN_STATUSES = Object.freeze([
    'DRAFT', 'AUDIENCE_PREPARING', 'AUDIENCE_REVIEW_REQUIRED', 'RECIPIENT_REVIEW_REQUIRED',
    'MESSAGE_REVIEW_REQUIRED', 'CONTENT_REVIEW_REQUIRED', 'READY_FOR_APPROVAL',
    'APPROVED_FOR_HANDOFF', 'PARTIALLY_APPROVED', 'REJECTED', 'CANCELLED', 'LOCKED',
    'OUTDATED', 'FAILED',
]);

export const ELIGIBILITY_STATUSES = Object.freeze([
    'ELIGIBLE', 'ELIGIBLE_EMAIL_ONLY', 'ELIGIBLE_WHATSAPP_ONLY', 'ELIGIBLE_MANUAL_ONLY',
    'NO_APPROVED_CONTACT', 'INVALID_EMAIL', 'INVALID_PHONE', 'UNVERIFIED_CONTACT',
    'OPTED_OUT', 'BLACKLISTED', 'DUPLICATE_CONTACT', 'RECENTLY_CONTACTED',
    'CAMPAIGN_FREQUENCY_LIMIT', 'LOW_CONFIDENCE', 'OUTDATED_DATA', 'REJECTED_LEAD',
    'BLOCKED_ENTITY', 'RELATED_COMPANY_REVIEW', 'BRANCH_REVIEW', 'FOREIGN_COMPANY',
    'MANUAL_REVIEW_REQUIRED',
]);

export const DUPLICATE_STATUSES = Object.freeze([
    'UNIQUE', 'SAME_CONTACT_DUPLICATE', 'SAME_COMPANY_DUPLICATE', 'CROSS_SOURCE_DUPLICATE',
    'POSSIBLE_RELATED_COMPANY_DUPLICATE', 'MANUAL_REVIEW_REQUIRED',
]);

export const FREQUENCY_STATUSES = Object.freeze([
    'SAFE_TO_CONTACT', 'RECENTLY_CONTACTED', 'SAME_CAMPAIGN_RECENTLY_SENT',
    'FREQUENCY_LIMIT_REACHED', 'HISTORY_UNAVAILABLE', 'MANUAL_REVIEW_REQUIRED',
]);

export const ROLE_MATCH_LEVELS = Object.freeze([
    'BEST_MATCH', 'ACCEPTABLE_MATCH', 'GENERIC_CONTACT', 'WEAK_MATCH', 'MANUAL_REVIEW_REQUIRED',
]);

export const MESSAGE_STATUSES = Object.freeze([
    'DRAFT', 'TEMPLATE_BASED', 'AI_ASSISTED_REVIEW_REQUIRED', 'APPROVED_FOR_HANDOFF',
    'REJECTED', 'OUTDATED', 'LOCKED',
]);

export const HANDOFF_STATUSES = Object.freeze([
    'NOT_READY', 'READY_FOR_HANDOFF', 'EXPORTED', 'IMPORTED_MANUALLY', 'CANCELLED', 'OUTDATED',
]);

export const BATCH_STATUSES = Object.freeze([
    'QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'STOPPED',
]);

export const ALLOWED_FILTER_KEYS = Object.freeze([
    'industry', 'subIndustry', 'customerType', 'country', 'state', 'district', 'city', 'pinCode',
    'industrialEstate', 'productInterest', 'leadScoreMin', 'leadScoreMax', 'priority', 'grade',
    'relevanceStatus', 'contactAvailability', 'decisionMakerAvailable', 'contactRole',
    'contactDepartment', 'emailVerified', 'phoneVerified', 'crmStatus', 'crmLeadStatus',
    'isExistingCustomer', 'isExistingSupplier', 'assignmentStatus', 'ownerUserId',
    'outdated', 'approved', 'locked', 'discoverySource', 'approvedForEnrichment',
    'manualTags', 'exclusionTags', 'extractedLeadStatus',
]);

/** Campaign purpose → preferred contact roles (explainable, weak evidence → WEAK_MATCH). */
export const PURPOSE_ROLE_PRIORITY = Object.freeze({
    PRODUCT_CATALOGUE: ['purchase', 'procurement', 'owner', 'business development', 'sales'],
    PRODUCT_DATASHEET: ['technical', 'engineering', 'r&d', 'product development'],
    TECHNICAL_INFORMATION: ['technical', 'engineering', 'r&d', 'product development'],
    DEALER_DEVELOPMENT: ['owner', 'director', 'business development', 'sales'],
    OEM_OUTREACH: ['purchase', 'procurement', 'owner', 'director'],
    DISTRIBUTOR_OUTREACH: ['owner', 'director', 'business development', 'sales'],
    DEFAULT: ['decision maker', 'owner', 'director', 'purchase', 'sales', 'general'],
});

export const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    version: SETTINGS_VERSION,
    allowedCampaignTypes: [...CAMPAIGN_TYPES],
    allowedDraftChannels: [...CHANNEL_DRAFT_TYPES],
    defaultLanguage: 'en',
    requireVerifiedEmail: true,
    requireVerifiedPhone: true,
    allowGenericContacts: false,
    allowUnverifiedManualReview: true,
    minimumDaysBetweenCampaigns: 7,
    sameCampaignCooldownDays: 30,
    maximumCampaignsPer7Days: 2,
    maximumCampaignsPer30Days: 6,
    audiencePreviewLimit: 200,
    maximumDraftAudience: 5000,
    maximumExportRows: 5000,
    duplicatePolicy: 'KEEP_PRIMARY',
    relatedCompanyPolicy: 'MANUAL_REVIEW',
    branchPolicy: 'MANUAL_REVIEW',
    optOutRequired: true,
    frequencyCheckRequired: true,
    AIMessageDraftEnabled: false,
    allowBatchPrepare: true,
    approvedDocumentRequired: false,
    finalApprovalRequired: true,
    previewConfirmThreshold: 500,
    safeModeSuggestionDefaults: {
        batchSize: 50,
        dailyLimit: 200,
        delaySeconds: 30,
        note: 'Safe-mode settings reduce risk but cannot guarantee WhatsApp will not restrict or block the number.',
    },
});
