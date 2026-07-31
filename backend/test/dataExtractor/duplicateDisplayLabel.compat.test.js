/**
 * Focused tests for mapDuplicateDisplayLabel (compatibility contract).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    checkDuplicateForRecord,
    enrichRecordsWithDuplicates,
    mapDuplicateDisplayLabel,
} from '../../src/services/dataExtractor/duplicateChecker.service.js';
import { DUPLICATE_DISPLAY } from '../../src/services/dataExtractor/discovery/providerTypes.js';

describe('mapDuplicateDisplayLabel contract', () => {
    it('1. null/undefined return NEW', () => {
        assert.equal(mapDuplicateDisplayLabel(null), 'NEW');
        assert.equal(mapDuplicateDisplayLabel(undefined), 'NEW');
    });

    it('2-3. empty / no evidence returns NEW', () => {
        assert.equal(mapDuplicateDisplayLabel({}), 'NEW');
        assert.equal(mapDuplicateDisplayLabel({ companyName: 'Acme', duplicateStatus: 'none' }), 'NEW');
    });

    it('4. possible-duplicate returns POSSIBLE_DUPLICATE', () => {
        assert.equal(mapDuplicateDisplayLabel({ duplicateStatus: 'possible_duplicate' }), 'POSSIBLE_DUPLICATE');
        assert.equal(mapDuplicateDisplayLabel({ entityResolution: { decision: 'POSSIBLE_DUPLICATE' } }), 'POSSIBLE_DUPLICATE');
    });

    it('5. confirmed-duplicate returns CONFIRMED_DUPLICATE', () => {
        assert.equal(mapDuplicateDisplayLabel({ duplicateStatus: 'confirmed_duplicate' }), 'CONFIRMED_DUPLICATE');
        assert.equal(mapDuplicateDisplayLabel({ entityResolution: { decision: 'EXACT_DUPLICATE' } }), 'CONFIRMED_DUPLICATE');
    });

    it('6-7. already-converted takes precedence', () => {
        assert.equal(mapDuplicateDisplayLabel({ status: 'converted', duplicateStatus: 'confirmed_duplicate' }), 'ALREADY_CONVERTED');
        assert.equal(mapDuplicateDisplayLabel({ convertedRecordId: 'abc', duplicateStatus: 'possible_duplicate' }), 'ALREADY_CONVERTED');
    });

    it('8. confirmed takes precedence over possible', () => {
        assert.equal(mapDuplicateDisplayLabel({
            duplicateStatus: 'confirmed_duplicate',
            entityResolution: { decision: 'POSSIBLE_DUPLICATE' },
        }), 'CONFIRMED_DUPLICATE');
    });

    it('9. does not mutate input', () => {
        const rec = { duplicateStatus: 'possible_duplicate', companyName: 'X' };
        const freeze = JSON.stringify(rec);
        mapDuplicateDisplayLabel(rec);
        assert.equal(JSON.stringify(rec), freeze);
    });

    it('10. unknown optional status does not crash', () => {
        assert.equal(mapDuplicateDisplayLabel({ duplicateStatus: 'weird_future_status' }), 'NEW');
        assert.equal(mapDuplicateDisplayLabel({ entityResolution: { decision: 'SOMETHING_ELSE' } }), 'NEW');
    });

    it('11. enrichRecordsWithDuplicates-shaped output maps', () => {
        const shaped = {
            companyName: 'Co',
            duplicateStatus: 'possible_duplicate',
            duplicateMatchRefs: [{ type: 'extracted_lead', matchScore: 85 }],
            _isDuplicate: true,
        };
        assert.equal(mapDuplicateDisplayLabel(shaped), 'POSSIBLE_DUPLICATE');
        assert.ok(typeof enrichRecordsWithDuplicates === 'function');
        assert.ok(typeof checkDuplicateForRecord === 'function');
    });

    it('12. Discovery preview record shape maps', () => {
        assert.equal(mapDuplicateDisplayLabel({
            companyName: 'Acme',
            website: 'https://acme.com',
            entityResolution: { decision: 'EXACT_DUPLICATE', matchScore: 98 },
            duplicateStatus: 'confirmed_duplicate',
            _isDuplicate: true,
            _duplicateLabel: null,
        }), 'CONFIRMED_DUPLICATE');
        assert.equal(mapDuplicateDisplayLabel({ _mergedDraft: true }), 'MERGED_DRAFT');
    });

    it('returns only DUPLICATE_DISPLAY constants', () => {
        const samples = [
            null, {}, { duplicateStatus: 'none' },
            { duplicateStatus: 'possible_duplicate' },
            { duplicateStatus: 'confirmed_duplicate' },
            { status: 'converted' },
            { _mergedDraft: true },
            { entityResolution: { decision: 'MANUAL_REVIEW_REQUIRED' } },
        ];
        for (const s of samples) {
            assert.ok(DUPLICATE_DISPLAY.includes(mapDuplicateDisplayLabel(s)));
        }
    });
});
