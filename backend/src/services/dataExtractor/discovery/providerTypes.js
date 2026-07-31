export const PROVIDER_TYPES = {
    SEARCH_PROVIDER: 'SEARCH_PROVIDER',
    PLACE_PROVIDER: 'PLACE_PROVIDER',
    WEBSITE_ENRICHMENT: 'WEBSITE_ENRICHMENT',
    SOCIAL_PUBLIC_PROFILE: 'SOCIAL_PUBLIC_PROFILE',
    MANUAL_IMPORT: 'MANUAL_IMPORT',
    FILE_IMPORT: 'FILE_IMPORT',
    BUSINESS_DIRECTORY: 'BUSINESS_DIRECTORY',
    FUTURE_PROVIDER: 'FUTURE_PROVIDER',
};

export const JOB_STATUSES = [
    'DRAFT',
    'QUEUED',
    'RUNNING',
    'PAUSED',
    'COMPLETED',
    'COMPLETED_WITH_WARNINGS',
    'STOPPED',
    'FAILED',
];

export const SOURCE_TASK_STATUSES = [
    'PENDING',
    'RUNNING',
    'COMPLETED',
    'EXHAUSTED',
    'FAILED',
    'DISABLED',
    'NOT_CONFIGURED',
    'PAUSED',
];

export const DUPLICATE_DISPLAY = [
    'NEW',
    'POSSIBLE_DUPLICATE',
    'CONFIRMED_DUPLICATE',
    'MERGED_DRAFT',
    'ALREADY_CONVERTED',
];

export const DISCLAIMER =
    'Results depend on publicly available information and configured providers. The requested target is not guaranteed.';
