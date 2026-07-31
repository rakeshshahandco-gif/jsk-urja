/**
 * Checkpoint 4 — RawCapture import adapter constants.
 */
export const IMPORT_ADAPTER_TYPES = Object.freeze([
    'manual_url', 'pasted_text', 'csv', 'excel_xlsx',
]);

export const ADAPTER_TO_CAPTURE_METHOD = Object.freeze({
    manual_url: 'manual_url',
    pasted_text: 'manual_text',
    csv: 'csv_import',
    excel_xlsx: 'excel_import',
});

export const IMPORT_RUN_STATUSES = Object.freeze([
    'received', 'previewed', 'processing', 'completed', 'partially_completed', 'failed', 'expired',
]);

export const IMPORT_MAP_TARGETS = Object.freeze([
    'title', 'snippet', 'resultUrl', 'resultPosition', 'sourceRecordId', 'resultTypeHint',
]);

export const IMPORT_COLUMN_ALIASES = Object.freeze({
    title: ['title', 'company', 'company name', 'business name', 'supplier name', 'page title', 'name'],
    resultUrl: ['url', 'website', 'website url', 'link', 'company website', 'source url', 'profile url', 'result url'],
    snippet: ['snippet', 'description', 'business description', 'about', 'details', 'summary', 'products', 'services'],
    resultPosition: ['position', 'rank', 'result position', 'search position'],
    sourceRecordId: ['source id', 'record id', 'listing id', 'supplier id', 'source record id'],
    resultTypeHint: ['type', 'result type', 'category'],
});

export const IMPORT_PREVIEW_ROWS = 20;
export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_MAX_COLUMNS = 100;
export const IMPORT_MAX_MANUAL_RECORDS = 100;
export const IMPORT_PASTED_MAX_BYTES = 1 * 1024 * 1024;
export const IMPORT_CSV_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_XLSX_MAX_BYTES = 10 * 1024 * 1024;
export const IMPORT_XLSX_MAX_UNCOMPRESSED = 50 * 1024 * 1024;
export const IMPORT_XLSX_MAX_ENTRIES = 2000;
export const IMPORT_XLSX_MAX_ENTRY_UNCOMPRESSED = 20 * 1024 * 1024;
export const IMPORT_XLSX_MAX_COMPRESSION_RATIO = 100;
export const IMPORT_XLSX_MAX_SHEETS = 50;
export const IMPORT_XLSX_MAX_ENTRY_NAME_LEN = 260;
export const IMPORT_XLSX_MAX_PATH_DEPTH = 20;
export const IMPORT_CSV_MAX_RECORD_SIZE = 64 * 1024;
export const IMPORT_CSV_MAX_CELL_SIZE = 32 * 1024;
export const IMPORT_VALIDATION_ERRORS_MAX = 100;
export const IMPORT_IDEMPOTENCY_KEY_MAX = 200;
export const IMPORT_FILENAME_MAX = 200;
export const IMPORT_CHUNK_SIZE = 100;

export const IMPORT_IDEMPOTENCY_REUSED_CODE = 'IDEMPOTENCY_KEY_REUSED';
export const IMPORT_RUN_IDEMPOTENCY_INDEX_NAME = 'uniq_raw_capture_import_run_idempotency';

export const PERM_RAW_IMPORT = 'data_extractor.raw_capture.import';

export const IMPORT_FORBIDDEN_BODY = Object.freeze([
    'companyId', 'tenantId', 'company_id', 'tenant_id',
    'createdBy', 'updatedBy', 'captureFingerprint', 'requestFingerprint',
    'queryScopeKey', 'titleNormalized', 'resultUrlNormalized', 'displayDomain',
    'inboxStatus', 'enrichmentStatus', 'qualificationStatus', 'duplicateStatus',
    'promotedExtractedLeadId', '_id', 'id', 'status', 'rawCaptureBatchIds',
    'insertedCount', 'updatedExistingCount', 'acceptedRows', 'rejectedRows',
    'reviewOverrideBy', 'reviewOverrideAt', 'reviewRequiredAcceptedCount',
]);

export const REVIEW_REQUIRED_REASONS = Object.freeze({
    MULTIPLE_URLS: 'MULTIPLE_URLS',
    NO_CLEAR_URL: 'NO_CLEAR_URL',
    AMBIGUOUS_COLUMNS: 'AMBIGUOUS_COLUMNS',
    URL_WITH_EXTRA: 'URL_WITH_EXTRA',
    LINE_UNCERTAIN: 'LINE_UNCERTAIN',
    BLOCK_UNCERTAIN: 'BLOCK_UNCERTAIN',
});
