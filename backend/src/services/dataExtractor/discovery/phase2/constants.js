/** Phase 2 Data Extractor — AI qualification & smart merge. Isolated from WhatsApp AI. */

export const PHASE2_ENGINE_VERSION = 'extractor-phase2-v1';

export const QUALIFICATION_CATEGORIES = Object.freeze([
    'Highly Relevant',
    'Relevant',
    'Possibly Relevant',
    'Not Relevant',
    'Insufficient Information',
]);

export const QUALIFICATION_STATUSES = Object.freeze([
    'Pending',
    'Processing',
    'Qualified',
    'Failed',
    'Manual Override',
]);

export const DEFAULT_THRESHOLDS = Object.freeze({
    highlyRelevantMin: 90,
    relevantMin: 70,
    possiblyRelevantMin: 40,
    autoMergeMin: 95,
    reviewMin: 75,
});

export const COMPANY_TYPES = Object.freeze([
    'Manufacturer',
    'OEM',
    'Distributor',
    'Dealer',
    'Wholesaler',
    'Retailer',
    'System Integrator',
    'Installer',
    'Contractor',
    'Consultant',
    'Service Provider',
    'Exporter',
    'Importer',
    'Architect/Designer',
    'Project Company',
    'Brand',
    'Marketplace/Directory',
    'Other',
]);

export const FUTURE_SOURCE_KEYS = Object.freeze([
    'web_search',
    'indiamart',
    'tradeindia',
    'justdial',
    'exportersindia',
    'facebook',
    'instagram',
    'linkedin',
    'x',
]);

export const CONSUMER_EMAIL_DOMAINS = Object.freeze([
    'gmail.com', 'yahoo.com', 'yahoo.co.in', 'hotmail.com', 'outlook.com',
    'rediffmail.com', 'live.com', 'icloud.com', 'aol.com',
]);

export const NON_COMPANY_HOST_HINTS = Object.freeze([
    'amazon.', 'flipkart.', 'wikipedia.', 'youtube.', 'youtu.be',
    'reddit.', 'quora.', 'medium.com', 'blogspot.', 'wordpress.com',
    'news.', 'timesofindia.', 'ndtv.', 'hindustantimes.',
    'facebook.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com',
]);

export const ARTICLE_TITLE_HINTS = Object.freeze([
    'what is', 'how to', 'guide to', 'blog', 'news', 'article',
    'top 10', 'best ', 'vs ', 'comparison', 'wikipedia',
]);

export const COMPETING_SENSE_HINTS = Object.freeze([
    'industrial', 'factory', 'plant automation', 'plc', 'scada',
    'robotic', 'rpa', 'workflow automation', 'marketing automation',
    'software automation', 'test automation', 'devops',
]);

export const COMPANY_TYPE_PATTERNS = Object.freeze([
    { type: 'Manufacturer', re: /\bmanufactur(?:er|ing|e[ds]?)\b/i },
    { type: 'OEM', re: /\boem\b/i },
    { type: 'Distributor', re: /\bdistribut(?:or|ion|ing)\b/i },
    { type: 'Dealer', re: /\bdealers?\b/i },
    { type: 'Wholesaler', re: /\bwholesal(?:er|e)\b/i },
    { type: 'Retailer', re: /\bretail(?:er|ing)?\b/i },
    { type: 'System Integrator', re: /\bsystem integrat(?:or|ion)|si\b/i },
    { type: 'Installer', re: /\binstallers?\b|\binstallation\b/i },
    { type: 'Contractor', re: /\bcontractors?\b/i },
    { type: 'Consultant', re: /\bconsultants?\b|\bconsultancy\b/i },
    { type: 'Service Provider', re: /\bservice providers?\b/i },
    { type: 'Exporter', re: /\bexporters?\b|\bexporting\b/i },
    { type: 'Importer', re: /\bimporters?\b|\bimporting\b/i },
    { type: 'Architect/Designer', re: /\barchitects?\b|\binterior design/i },
    { type: 'Project Company', re: /\bproject(?:s)? company\b|\bepc\b/i },
    { type: 'Brand', re: /\bbrand\b|\bbranded\b/i },
    { type: 'Marketplace/Directory', re: /\bmarketplace\b|\bdirectory\b|\bindiamart\b|\btradeindia\b|\bjustdial\b/i },
]);

export function categoryFromScore(score, thresholds = DEFAULT_THRESHOLDS) {
    const n = Number(score);
    if (!Number.isFinite(n)) return 'Insufficient Information';
    if (n >= thresholds.highlyRelevantMin) return 'Highly Relevant';
    if (n >= thresholds.relevantMin) return 'Relevant';
    if (n >= thresholds.possiblyRelevantMin) return 'Possibly Relevant';
    return 'Not Relevant';
}

export function mapCategoryToLegacyStatus(category) {
    if (category === 'Highly Relevant' || category === 'Relevant') return 'RELEVANT';
    if (category === 'Possibly Relevant') return 'POSSIBLY_RELEVANT';
    if (category === 'Not Relevant') return 'IRRELEVANT';
    return 'MANUAL_REVIEW';
}
