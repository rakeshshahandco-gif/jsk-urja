/** Platform Email Bulk - isolated from WhatsApp chat/bulk modules. */

export const EMAIL_BULK_CAMPAIGN_STATUSES = [
    'Draft',
    'Scheduled',
    'Pending',
    'Sending',
    'Sent',
    'Failed',
    'Paused',
    'Stopped',
    'Completed',
];

export const EMAIL_BULK_SEND_MODES = ['SAFE', 'FAST'];

export const EMAIL_BULK_RECIPIENT_SOURCES = [
    'customer_master',
    'lead_master',
    'supplier_master',
    'excel_upload',
    'csv_upload',
    'txt_upload',
    'manual',
];

export const EMAIL_BULK_CUSTOMER_TYPES = [
    'LED Manufacturer',
    'Home Automation',
    'System Integrator',
    'Lighting Dealer',
    'Electrical Contractor',
    'OEM',
    'Trader',
    'Architect',
    'Consultant',
    'Custom Types',
];

export const EMAIL_BULK_INDUSTRY_TYPES = [
    'Electronics Manufacturer',
    'Home Automation',
    'LED Industry',
    'Textile',
    'Handloom',
    'Exporter',
    'Trading',
    'OEM',
    'Custom Industry',
];

export const EMAIL_BULK_RECIPIENT_STATUSES = [
    'pending',
    'sent',
    'failed',
    'skipped',
    'blacklisted',
];

export const EMAIL_BULK_ATTACHMENT_TYPES = [
    'none',
    'pdf',
    'brochure',
    'catalog',
    'datasheet',
    'image',
    'document',
];

export const EMAIL_BULK_SEND_CONTENT_TYPES = [
    'text_only',
    'html',
    'html_with_attachment',
];

export const EMAIL_BULK_ALLOWED_MIMES = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/plain',
    'text/csv',
];

export const EMAIL_BULK_MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export const EMAIL_BULK_DEFAULT_SETTINGS = {
    enabled: false,
    enableFastMode: false,
    safeDelayMinMs: 5000,
    safeDelayMaxMs: 12000,
    pauseAfterMessages: 20,
    pauseDurationMs: 60000,
    dailyLimit: 200,
    retryFailedMessages: true,
    sendWindowStart: '09:00',
    sendWindowEnd: '19:00',
    defaultSendMode: 'SAFE',
    defaultBatchSize: 20,
    defaultTimezone: 'Asia/Kolkata',
};

export const EMAIL_BULK_UPLOAD_DIR = 'uploads/email-bulk/';
