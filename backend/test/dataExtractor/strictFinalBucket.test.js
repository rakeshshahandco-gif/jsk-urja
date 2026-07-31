import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    classifyStrictFinalBucket,
    countStrictFinalBuckets,
    STRICT_FINAL_BUCKETS,
} from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/strictFinalBucket.util.js';
import { normalizeCampaignCity } from '../../src/services/dataExtractor/searchCampaign/rawCaptureQualification/locationMatch.util.js';

describe('strictFinalBucket exclusive totals', () => {
    it('assigns exactly one bucket per row and totals N', () => {
        const rows = [
            { exclusiveStatus: 'failed', flags: {} },
            { productMatchStrength: 'Job/Course/Training', flags: {} },
            { productMatchStrength: 'Directory Only', flags: {} },
            { productMatchStrength: 'Unrelated Product', flags: {} },
            { locationMatch: 'mismatch', flags: { isLocationMismatch: true }, productMatchStrength: 'Strong Product Match' },
            { locationClassification: 'Address Missing', flags: { hasEnrichDone: true }, addressCount: 0 },
            { servesSelectedCity: true, officeInSelectedCity: false, locationClassification: 'Serves Selected City — No Office Confirmed', productMatchStrength: 'Strong Product Match', flags: {} },
            { officeInSelectedCity: true, locationMatch: 'match', productMatchStrength: 'Strong Product Match', qualificationStatus: 'strong_match', flags: {} },
            { flags: { hasEnrichDone: false }, exclusiveStatus: 'waiting' },
        ];
        const classified = rows.map((r) => ({ ...r, strictFinalBucket: classifyStrictFinalBucket(r) }));
        const counts = countStrictFinalBuckets(classified);
        assert.equal(counts.total, rows.length);
        assert.equal(STRICT_FINAL_BUCKETS.reduce((s, k) => s + counts[k], 0), rows.length);
        assert.equal(counts.failed_retryable, 1);
        assert.equal(counts.job_course_training, 1);
        assert.equal(counts.directory_only, 1);
        assert.equal(counts.unrelated_product, 1);
        assert.equal(counts.location_mismatch, 1);
        assert.equal(counts.address_missing, 1);
        assert.equal(counts.serves_city, 1);
        assert.equal(counts.strict_prospect, 1);
        assert.equal(counts.location_not_confirmed, 1);
    });

    it('normalizes BANGLORE to Bangalore / Bengaluru', () => {
        const n = normalizeCampaignCity('BANGLORE');
        assert.equal(n.canonical, 'Bangalore');
        assert.equal(n.display, 'Bangalore / Bengaluru');
        assert.equal(n.wasCorrected, true);
        assert.equal(n.entered, 'BANGLORE');
    });
});
