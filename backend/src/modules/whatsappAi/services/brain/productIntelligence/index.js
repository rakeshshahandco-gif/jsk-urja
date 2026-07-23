/**
 * Phase 1C.1 — Product Intelligence public exports.
 */

export { JSK_PRODUCT_FAMILIES, getProductFamilyById } from './productFamilyTaxonomy.js';
export { JSK_PRODUCT_ALIASES } from './productAliasDictionary.js';
export { detectLanguageDetailed, detectPrimaryLanguageCode } from './languageDetect.js';
export {
    createProductIntelligenceEngine,
    analyzeProductIntelligence,
    productIntelligenceToEntityMap,
    JSK_PRODUCT_INTELLIGENCE_VERSION,
} from './productIntelligence.service.js';
