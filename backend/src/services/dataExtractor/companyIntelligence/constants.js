export const ENGINE_VERSION = 'company-intelligence-v1';

export const FORBIDDEN_CLAIM_PATTERNS = Object.freeze([
    /\brevenue\b/i,
    /\bturnover\b/i,
    /\bemployee[s]?\b/i,
    /\bstaff\s+count\b/i,
    /\bfactory\s+size\b/i,
    /\bproduction\s+capacit/i,
    /\bcertification[s]?\b/i,
    /\biso\s*\d/i,
    /\bgstin\b/i,
    /\byears?\s+in\s+business\b/i,
    /\bawards?\b/i,
    /\bcustomer\s+names?\b/i,
    /\bclients?\s+include\b/i,
]);

export const NEXT_ACTIONS = Object.freeze([
    'Review public contact',
    'Call primary contact',
    'Send company profile',
    'Send product brochure',
    'Send product catalog',
    'Request technical requirement',
    'Request purchase contact',
    'Create lead draft',
    'Manual research required',
    'No action / low relevance',
]);

export const CLAIM_LABELS = Object.freeze({
    POSSIBLE: 'POSSIBLE',
    INFERRED: 'INFERRED',
    UNVERIFIED: 'UNVERIFIED',
    NOT_AVAILABLE: 'NOT AVAILABLE',
});
