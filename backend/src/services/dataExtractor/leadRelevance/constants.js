export const ENGINE_VERSION = 'lead-relevance-v1';

export const RELEVANCE_STATUSES = ['RELEVANT', 'POSSIBLY_RELEVANT', 'IRRELEVANT', 'MANUAL_REVIEW'];

export const DEFAULT_WEIGHTS = Object.freeze({
    searchKeywordMatch: 22,
    selectedIndustryMatch: 18,
    classificationIndustryMatch: 20,
    targetIndustryMatch: 16,
    selectedProductMatch: 14,
    opportunityProductMatch: 16,
    locationMatch: 10,
    multiSignalAgreement: 8,
    negativeKeywordPenalty: 18,
    exclusionKeywordPenalty: 25,
    ambiguousContextPenalty: 40,
    classificationIrrelevantPenalty: 50,
    conflictingIntentPenalty: 30,
});

/** Generic ambiguous commercial contexts — configurable overrides may extend these. */
export const DEFAULT_AMBIGUOUS_CONTEXTS = Object.freeze([
    {
        id: 'driver_recruitment',
        triggerTokens: ['driver'],
        negativeContexts: ['recruitment', 'recruit', 'hiring', 'agency', 'staffing', 'job', 'jobs', 'vacancy'],
        positiveContexts: ['led', 'lighting', 'electronics', 'power supply', 'smps', 'pcb'],
        reason: 'Driver refers to employment/recruitment, not electronics/LED drivers',
    },
    {
        id: 'taxi_driver',
        triggerTokens: ['driver'],
        negativeContexts: ['taxi', 'cab', 'uber', 'ola', 'transport service'],
        positiveContexts: ['led', 'lighting', 'electronics'],
        reason: 'Driver refers to taxi/transport service, not product manufacturing',
    },
    {
        id: 'automation_staffing',
        triggerTokens: ['automation'],
        negativeContexts: ['staffing', 'recruitment', 'hiring', 'manpower', 'payroll'],
        positiveContexts: ['smart home', 'zigbee', 'plc', 'industrial automation', 'bms', 'building'],
        reason: 'Automation appears in staffing/recruitment context without industrial/home automation evidence',
    },
]);
