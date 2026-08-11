/** Shared constants for common File Storage foundation (no CRM module wiring). */

export const STORAGE_PROVIDERS = Object.freeze({
    LOCAL: 'local',
    S3: 's3',
});

/** Default when FILE_STORAGE_PROVIDER is unset — preserves existing local CRM behaviour. */
export const DEFAULT_STORAGE_PROVIDER = STORAGE_PROVIDERS.LOCAL;

/** Short-lived signed URL default (seconds). */
export const DEFAULT_SIGNED_URL_EXPIRES_SECONDS = 5 * 60;

/** Soft default max size (25 MB). Callers may tighten further. */
export const DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024;

export const DEFAULT_ALLOWED_EXTENSIONS = Object.freeze([
    '.pdf',
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.xls',
    '.xlsx',
    '.csv',
    '.doc',
    '.docx',
    '.txt',
]);

export const DEFAULT_ALLOWED_MIME_TYPES = Object.freeze([
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
]);

/** Block obvious executables / scripts by extension. */
export const BLOCKED_EXTENSIONS = Object.freeze([
    '.exe',
    '.bat',
    '.cmd',
    '.com',
    '.msi',
    '.dll',
    '.scr',
    '.ps1',
    '.vbs',
    '.js',
    '.mjs',
    '.cjs',
    '.sh',
    '.bash',
    '.jar',
    '.apk',
    '.dmg',
    '.pkg',
]);

export const BLOCKED_MIME_TYPES = Object.freeze([
    'application/x-msdownload',
    'application/x-msdos-program',
    'application/x-executable',
    'application/x-sh',
    'application/javascript',
    'text/javascript',
]);
