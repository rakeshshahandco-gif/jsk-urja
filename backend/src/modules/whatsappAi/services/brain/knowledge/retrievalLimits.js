/**
 * Phase 1C.2 — Hard limits for approved knowledge retrieval.
 */

export const GROUNDING_PACK_VERSION = 'grounding_pack_v1';

export const KNOWLEDGE_RETRIEVAL_LIMITS = Object.freeze({
    maxInspectKnowledge: 80,
    maxInspectDocuments: 40,
    maxSelectedSources: 8,
    maxSnippetLength: 280,
    maxTotalGroundingChars: 1600,
    maxDocumentReferences: 4,
});

/** Category aliases → bucket for Grounding Pack buckets. */
export const KNOWLEDGE_CATEGORY_BUCKETS = Object.freeze({
    product: 'productFacts',
    product_knowledge: 'productFacts',
    product_enquiry: 'productFacts',
    specification: 'specifications',
    specifications: 'specifications',
    specs: 'specifications',
    faq: 'faqAnswers',
    technical_faq: 'faqAnswers',
    technical_support: 'faqAnswers',
    support: 'faqAnswers',
    company: 'companyFacts',
    company_info: 'companyFacts',
    company_information: 'companyFacts',
    sales_policy: 'commercialPolicies',
    commercial: 'commercialPolicies',
    commercial_policy: 'commercialPolicies',
    price_policy: 'commercialPolicies',
});

/**
 * Exclude by category/subcategory/keyword token (case-insensitive).
 * Compensates for absence of a dedicated confidential/internal schema flag.
 */
export const KNOWLEDGE_EXCLUDE_TOKENS = Object.freeze([
    'confidential',
    'internal',
    'internal-only',
    'internal_only',
    'supplier',
    'cost',
    'margin',
    'password',
    'secret',
    'api_key',
    'apikey',
    'unpublished',
]);

export const CONTENT_EXCLUDE_PATTERNS = Object.freeze([
    /api[_-]?key/i,
    /password\s*[:=]/i,
    /bearer\s+[a-z0-9\-._~+/]+=*/i,
    /\bmargin\s*[:=]/i,
    /\bcost\s+price\b/i,
    /\bsupplier\s+cost\b/i,
]);
