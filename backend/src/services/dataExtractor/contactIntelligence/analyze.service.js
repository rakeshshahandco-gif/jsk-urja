import { ENGINE_VERSION } from './constants.js';
import { extractPublicContacts } from './extractContacts.js';
import { rankContacts } from './rankingEngine.js';

export function analyzeCompanyContacts({
    record = {},
    roles = [],
    classification = null,
    relevance = null,
    recommendation = null,
    options = {},
} = {}) {
    const contacts = extractPublicContacts(record, options);
    const opportunityType = options.opportunityType
        || recommendation?.recommendedSalesStrategy
        || recommendation?.primaryRecommendation?.salesStrategy
        || relevance?.selectedProduct
        || classification?.customerType
        || '';

    const ranked = rankContacts(contacts, {
        roles,
        opportunityType,
        recommendation,
    });

    // Never promote inferred as verified
    const all = ranked.contacts || [];
    for (const c of all) {
        if (c.verificationStatus === 'INFERRED_UNVERIFIED' && (c.isPrimaryContact || c.isDecisionMakerCandidate)) {
            c.isPrimaryContact = false;
            c.isDecisionMakerCandidate = false;
            c.warnings = [...(c.warnings || []), 'Inferred contact cannot be primary/verified decision-maker'];
        }
    }

    return {
        companyName: record.companyName || classification?.companyName || '',
        parentIndustry: classification?.parentIndustry || '',
        customerType: classification?.customerType || '',
        opportunityType,
        recommendedProduct: recommendation?.primaryRecommendation?.productName || '',
        ...ranked,
        engineUsed: 'rule_based',
        modelVersion: ENGINE_VERSION,
        analysisTimestamp: new Date().toISOString(),
    };
}
