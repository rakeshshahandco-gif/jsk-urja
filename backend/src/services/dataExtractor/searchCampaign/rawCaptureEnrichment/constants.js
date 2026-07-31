/** Checkpoint 6A — RawCapture website enrichment constants (isolated from AI qualification). */
export const ENRICHMENT_STATUSES = Object.freeze([
    'queued', 'processing', 'completed', 'partial', 'failed', 'blocked', 'review_required', 'stopped',
]);

export const ENRICHMENT_JOB_STATUSES = Object.freeze([
    'queued', 'processing', 'completed', 'partial', 'failed', 'stopped',
]);

export const BUSINESS_TYPES = Object.freeze([
    'manufacturer', 'oem_odm', 'brand_owner', 'distributor', 'dealer', 'supplier',
    'system_integrator', 'service_provider', 'marketplace_directory', 'unknown',
]);

export const MAX_PAGES_PER_DOMAIN = 5;
export const PAGE_FETCH_TIMEOUT_MS = 12000;
export const DOMAIN_ENRICH_TIMEOUT_MS = 45000;
export const MAX_CONCURRENCY = 2;
export const MAX_REDIRECTS = 5;

export const DIRECTORY_HOSTS = Object.freeze([
    'indiamart.com', 'dir.indiamart.com', 'tradeindia.com', 'dial4trade.com',
    'justdial.com', 'exportersindia.com', 'yellowpages.co.in',
]);

export const CONTACT_PATH_HINTS = Object.freeze([
    '/contact', '/contact-us', '/contactus', '/about', '/about-us', '/aboutus',
    '/company', '/company-profile', '/profile', '/team', '/management',
    '/products', '/product', '/services', '/service', '/solutions', '/solution',
]);

export const SOCIAL_HOSTS = Object.freeze({
    facebook: ['facebook.com', 'fb.com', 'fb.me', 'm.facebook.com'],
    instagram: ['instagram.com'],
    linkedin: ['linkedin.com'],
    youtube: ['youtube.com', 'youtu.be'],
    whatsapp: ['wa.me', 'api.whatsapp.com', 'whatsapp.com'],
});