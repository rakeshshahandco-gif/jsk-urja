/**
 * Phase 1C.0/1C.1 — Entity extractor.
 * 1C.1: delegates structured extraction to JSK Product Intelligence Engine.
 * Keeps the Phase 1C.0 entity map contract for BrainResult.entities.
 */

import { emptyEntityMap } from './entitySchema.js';
import {
    analyzeProductIntelligence,
    productIntelligenceToEntityMap,
} from '../productIntelligence/productIntelligence.service.js';

/** @returns {{ extract: (text: string, hints?: object) => object }} */
export function createEntityExtractor() {
    return {
        extract(text, hints = {}) {
            const pi = analyzeProductIntelligence(text, {
                languageHint: hints.language,
            });
            const mapped = productIntelligenceToEntityMap(pi);
            // Ensure baseline keys always present
            return { ...emptyEntityMap(mapped.language || 'en'), ...mapped };
        },
    };
}

export default createEntityExtractor;
