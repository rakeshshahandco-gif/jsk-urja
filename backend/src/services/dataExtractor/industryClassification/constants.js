export const ENGINE_VERSION = 'industry-classification-v1';

export const CLASSIFICATION_STATUSES = [
    'CLASSIFIED',
    'LOW_CONFIDENCE',
    'MULTIPLE_POSSIBILITIES',
    'IRRELEVANT',
    'MANUAL_REVIEW_REQUIRED',
    'FAILED',
];

/** Configurable default weights — company settings may override. */
export const DEFAULT_WEIGHTS = {
    exactIndustryKeyword: 22,
    parentIndustryKeyword: 12,
    subIndustryKeyword: 16,
    productKeyword: 20,
    websiteKeyword: 14,
    directoryCategory: 15,
    businessDescription: 10,
    customerTypeSignal: 8,
    multiSourceAgreement: 8,
    negativeKeywordPenalty: 18,
    exclusionTermPenalty: 30,
    ambiguousKeywordPenalty: 20,
    conflictingIndustryPenalty: 12,
};

/**
 * Generic ambiguous commercial phrases (not product-specific).
 * Used to avoid false positives like driver meaning recruitment/taxi.
 */
export const AMBIGUOUS_CONTEXT_RULES = [
    {
        id: 'driver_recruitment',
        tokens: ['driver'],
        negativeContexts: ['recruitment', 'hiring', 'agency', 'staffing', 'placement', 'job', 'vacancy'],
        forceIrrelevantUnless: ['led', 'electronics', 'lighting', 'pcb', 'motor driver', 'led driver'],
        detail: 'Driver appears in recruitment/staffing context',
    },
    {
        id: 'taxi_driver',
        tokens: ['driver', 'taxi'],
        negativeContexts: ['taxi', 'cab', 'ride', 'transport service', 'chauffeur'],
        forceIrrelevantUnless: ['led driver', 'motor driver', 'gate driver'],
        detail: 'Taxi/transport driver context',
    },
    {
        id: 'automation_staffing',
        tokens: ['automation'],
        negativeContexts: ['staffing', 'recruitment', 'hiring', 'payroll', 'workforce'],
        forceIrrelevantUnless: ['plc', 'scada', 'industrial automation', 'home automation', 'smart home', 'building automation'],
        detail: 'Automation staffing/recruitment without technical evidence',
    },
];
