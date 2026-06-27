/** WhatsApp Bulk Message Utility - isolated from existing WhatsApp chat module. */

export const WHATSAPP_BULK_CAMPAIGN_STATUSES = [
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

export const WHATSAPP_BULK_SEND_MODES = ['SAFE', 'FAST'];

export const WHATSAPP_BULK_RECIPIENT_SOURCES = [
    'customer_master',
    'lead_master',
    'excel_upload',
    'csv_upload',
    'txt_upload',
    'manual',
];

export const WHATSAPP_BULK_RECIPIENT_STATUSES = [
    'pending',
    'sent',
    'failed',
    'skipped',
    'blacklisted',
];

export const WHATSAPP_BULK_CUSTOMER_TYPES = [
    'LED Light Manufacturer',
    'Home Automation',
    'System Integrator',
    'Dealer',
    'Contractor',
    'OEM',
    'Trader',
    'Textile',
    'Handloom',
    'Exporter',
];

/** Default business categories for bulk recipient filter (merged with master + DB values). */
export const WHATSAPP_BULK_DEFAULT_BUSINESS_CATEGORIES = [
    ...WHATSAPP_BULK_CUSTOMER_TYPES,
];

export const WHATSAPP_BULK_INDUSTRY_TYPES = [
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

export const WHATSAPP_BULK_ATTACHMENT_TYPES = [
    'none',
    'pdf',
    'brochure',
    'catalog',
    'datasheet',
    'image',
];

/** How a campaign/matter message is sent. */
export const WHATSAPP_BULK_SEND_CONTENT_TYPES = [
    'text_only',
    'image_only',
    'image_with_caption',
];

export const WHATSAPP_BULK_IMAGE_MIMES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
];

export const WHATSAPP_BULK_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

/** Align with CRM customer-document upload limit (20 MB). */
export const WHATSAPP_BULK_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

export const WHATSAPP_BULK_DEFAULT_SETTINGS = {
    enabled: false,
    enableFastMode: false,
    safeDelayMinMs: 8000,
    safeDelayMaxMs: 15000,
    pauseAfterMessages: 25,
    pauseDurationMs: 120000,
    dailyLimit: 100,
    retryFailedMessages: true,
    sendWindowStart: '09:00',
    sendWindowEnd: '19:00',
    defaultSendMode: 'SAFE',
    defaultBatchSize: 25,
    defaultTimezone: 'Asia/Kolkata',
};

export const WHATSAPP_BULK_UPLOAD_DIR = 'uploads/whatsapp-bulk/';
