/**
 * RawCapture Checkpoint 3 constants.
 */
export const RAW_CAPTURE_SOURCES = Object.freeze([
    'google', 'facebook', 'instagram', 'linkedin', 'x', 'indiamart', 'web', 'manual', 'discovery_agent', 'baidu', '1688', 'sogou', 'so360',
]);

export const RAW_CAPTURE_QUERY_SOURCE_HINTS = Object.freeze([
    'google', 'facebook', 'instagram', 'linkedin', 'x', 'indiamart', 'official_website', 'web', 'manual', 'baidu', '1688', 'sogou', 'so360',
]);

export const RAW_CAPTURE_METHODS = Object.freeze([
    'assisted_visible', 'manual_url', 'manual_text', 'api_batch',
    'discovery_agent', 'csv_import', 'excel_import',
]);

/** Checkpoint 3 direct ingest allow-list (kept for compatibility). */
export const RAW_CAPTURE_ALLOWED_METHODS_CP3 = Object.freeze(['assisted_visible', 'manual_url', 'manual_text', 'api_batch']);

/** Checkpoint 3–4 ingest methods (adapters use csv_import / excel_import / manual_*). */
export const RAW_CAPTURE_ALLOWED_INGEST_METHODS = Object.freeze([...RAW_CAPTURE_METHODS]);

export const RAW_CAPTURE_RESULT_TYPE_HINTS = Object.freeze([
    'company', 'product_listing', 'marketplace_supplier', 'facebook_page', 'facebook_group', 'facebook_profile',
    'instagram_profile', 'instagram_hashtag',
    'linkedin_company', 'linkedin_profile', 'x_profile', 'x_post',
    'article', 'job', 'course', 'directory', 'unknown',
]);

export const RAW_CAPTURE_INBOX_STATUSES = Object.freeze([
    'new', 'processing', 'enriched', 'qualified', 'possible_match', 'rejected',
    'duplicate', 'review_required', 'approved', 'converted', 'archived',
]);

export const RAW_CAPTURE_ENRICHMENT_STATUSES = Object.freeze([
    'not_started', 'pending', 'completed', 'failed', 'blocked',
]);

export const RAW_CAPTURE_QUALIFICATION_STATUSES = Object.freeze([
    'not_started', 'pending', 'completed', 'failed',
]);

export const RAW_CAPTURE_DUPLICATE_STATUSES = Object.freeze([
    'unchecked', 'possible', 'duplicate', 'unique',
]);

export const RAW_CAPTURE_BATCH_STATUSES = Object.freeze([
    'received', 'processing', 'completed', 'partially_completed', 'failed',
]);

export const CAMPAIGN_ELIGIBLE_FOR_CAPTURE = Object.freeze(['draft', 'active', 'paused']);
export const QUERY_ELIGIBLE_FOR_CAPTURE = Object.freeze(['approved', 'opened', 'captured']);

export const RAW_CAPTURE_CAMPAIGN_MANUAL_SCOPE = 'campaign_manual';

export const RAW_CAPTURE_TITLE_MAX = 500;
export const RAW_CAPTURE_SNIPPET_MAX = 5000;
export const RAW_CAPTURE_URL_MAX = 2048;
export const RAW_CAPTURE_SOURCE_RECORD_ID_MAX = 300;
export const RAW_CAPTURE_IDEMPOTENCY_KEY_MAX = 200;
export const RAW_CAPTURE_NOTES_MAX = 2000;
export const RAW_CAPTURE_BATCH_MAX = 100;
export const RAW_CAPTURE_VALIDATION_ERRORS_MAX = 25;
export const RAW_CAPTURE_LIST_DEFAULT_LIMIT = 20;
export const RAW_CAPTURE_LIST_MAX_LIMIT = 100;

export const RAW_CAPTURE_SORT_FIELDS = Object.freeze([
    'lastSeenAt', 'firstSeenAt', 'createdAt', 'updatedAt', 'seenCount', 'resultPosition', 'title',
]);

export const RAW_CAPTURE_IDENTITY_INDEX_NAME = 'uniq_raw_capture_identity';
export const RAW_CAPTURE_BATCH_IDEMPOTENCY_INDEX_NAME = 'uniq_raw_capture_batch_idempotency';
export const RAW_CAPTURE_IDEMPOTENCY_REUSED_CODE = 'IDEMPOTENCY_KEY_REUSED';
export const RAW_CAPTURE_FAILURE_CODE_MAX = 80;
export const RAW_CAPTURE_FAILURE_MESSAGE_MAX = 500;


export const PERM_RAW_VIEW = 'data_extractor.raw_capture.view';
export const PERM_RAW_INGEST = 'data_extractor.raw_capture.ingest';
export const PERM_RAW_MANAGE = 'data_extractor.raw_capture.manage';
export const PERM_RAW_ARCHIVE = 'data_extractor.raw_capture.archive';

export const RAW_CAPTURE_FORBIDDEN_BODY = Object.freeze([
    'companyId', 'tenantId', 'company_id', 'tenant_id',
    'createdBy', 'updatedBy', 'firstCapturedBy', 'lastCapturedBy',
    'archivedAt', 'archivedBy', 'firstSeenAt', 'lastSeenAt', 'seenCount',
    'captureFingerprint', 'requestFingerprint', 'queryScopeKey', 'titleNormalized', 'resultUrlNormalized',
    'displayDomain', 'inboxStatus', 'enrichmentStatus', 'qualificationStatus',
    'duplicateStatus', 'promotedExtractedLeadId', 'enrichmentEligible',
    'enrichmentBlockedReason', 'captureBatchId', '_id', 'id',
]);

export const RAW_CAPTURE_RECORD_FORBIDDEN = Object.freeze([
    ...RAW_CAPTURE_FORBIDDEN_BODY,
    'campaignId', 'queryId', 'source', 'captureMethod', 'querySourceHint',
]);
