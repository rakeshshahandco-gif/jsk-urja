import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    applyLiveFilter,
    buildCurrentHeadline,
    LIVE_STAGES,
    mapLiveActivityRow,
    markDuplicateSourceRows,
} from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/liveActivity.util.js';

function cap(over = {}) {
    return {
        _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        title: 'XYZ Lighting Pvt Ltd',
        source: 'google',
        displayDomain: 'xyzlighting.example',
        firstSeenAt: '2026-08-26T12:10:03.000Z',
        createdAt: '2026-08-26T12:10:04.000Z',
        enrichmentStatus: 'pending',
        duplicateStatus: 'unchecked',
        ...over,
    };
}

describe('liveActivity mapping', () => {
    it('new RawCapture maps to Captured (one row, not duplicate stages)', () => {
        const row = mapLiveActivityRow({ cap: cap() });
        assert.equal(row.stage, LIVE_STAGES.CAPTURED);
        assert.equal(row.companyName, 'XYZ Lighting Pvt Ltd');
        assert.equal(row.source, 'Google');
        assert.equal(row.contact, '—');
        assert.ok(row.journey.some((s) => s.stage === LIVE_STAGES.FOUND));
        assert.ok(row.journey.some((s) => s.stage === LIVE_STAGES.CAPTURED));
    });

    it('processing enrichment maps to Enriching', () => {
        const row = mapLiveActivityRow({
            cap: cap({ enrichmentStatus: 'processing' }),
            enrich: { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', enrichmentStatus: 'processing', canonicalDomain: 'xyzlighting.example' },
        });
        assert.equal(row.stage, LIVE_STAGES.ENRICHING);
    });

    it('enriched contacts update the live row', () => {
        const row = mapLiveActivityRow({
            cap: cap({ enrichmentStatus: 'completed' }),
            enrich: {
                _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
                enrichmentStatus: 'completed',
                companyName: 'XYZ Lighting Pvt Ltd',
                canonicalDomain: 'xyzlighting.example',
                websiteUrl: 'https://xyzlighting.example',
                phones: [{ original: '9820000111', normalized: '+919820000111' }],
                emails: [{ value: 'sales@xyzlighting.example' }],
                whatsappNumbers: [],
            },
        });
        assert.equal(row.stage, LIVE_STAGES.ENRICHED);
        assert.match(row.result, /Phone/i);
        assert.match(row.result, /Email/i);
        assert.ok(row.phone.includes('9820000111') || row.phone.includes('+919820000111'));
        assert.equal(row.email, 'sales@xyzlighting.example');
    });

    it('qualification shows manufacturer / location from stored fields', () => {
        const row = mapLiveActivityRow({
            cap: cap({ enrichmentStatus: 'completed' }),
            enrich: { _id: 'b'.repeat(24), enrichmentStatus: 'completed', companyName: 'XYZ Lighting', canonicalDomain: 'xyzlighting.example' },
            qual: {
                _id: 'c'.repeat(24),
                enrichmentId: 'b'.repeat(24),
                systemDecision: 'strong_match',
                businessType: 'manufacturer',
                locationMatch: 'match',
                selectedState: 'MAHARASHTRA',
                productMatchStrength: 'Strong',
                qualifiedAt: '2026-08-26T12:10:12.000Z',
            },
        });
        assert.equal(row.stage, LIVE_STAGES.QUALIFIED);
        assert.match(row.result, /Manufacturer/i);
        assert.match(row.result, /MAHARASHTRA/i);
    });

    it('in-flight CP8 maps to Verifying then Verified on genuineness doc', () => {
        const base = {
            cap: cap({ enrichmentStatus: 'completed' }),
            enrich: { _id: 'b'.repeat(24), enrichmentStatus: 'completed', canonicalDomain: 'xyzlighting.example', companyName: 'XYZ Lighting' },
            qual: { _id: 'c'.repeat(24), enrichmentId: 'b'.repeat(24), systemDecision: 'strong_match' },
        };
        const verifying = mapLiveActivityRow({
            ...base,
            jobs: { verifying: { qualificationIds: new Set(['c'.repeat(24)]), domains: new Set(), currentDomain: 'xyzlighting.example' } },
        });
        assert.equal(verifying.stage, LIVE_STAGES.VERIFYING);

        const verified = mapLiveActivityRow({
            ...base,
            gen: {
                _id: 'd'.repeat(24),
                qualificationId: 'c'.repeat(24),
                systemDecision: 'verified_genuine',
                verificationStatus: 'verified',
                verifiedAt: '2026-08-26T12:10:16.000Z',
            },
        });
        assert.equal(verified.stage, LIVE_STAGES.VERIFIED);
        assert.match(verified.result, /Genuine/i);
    });

    it('review required / directory / rejected stay distinct', () => {
        const base = {
            cap: cap({ enrichmentStatus: 'completed' }),
            enrich: { _id: 'b'.repeat(24), enrichmentStatus: 'completed', canonicalDomain: 'xyzlighting.example' },
            qual: { _id: 'c'.repeat(24), enrichmentId: 'b'.repeat(24), systemDecision: 'strong_match' },
        };
        assert.equal(mapLiveActivityRow({
            ...base,
            gen: { systemDecision: 'human_review_required' },
        }).stage, LIVE_STAGES.REVIEW_REQUIRED);
        assert.equal(mapLiveActivityRow({
            ...base,
            enrich: { ...base.enrich, isDirectorySource: true, entityType: 'DIRECTORY' },
            gen: { systemDecision: 'directory_or_marketplace_only' },
        }).stage, LIVE_STAGES.DIRECTORY);
        assert.equal(mapLiveActivityRow({
            cap: cap({ enrichmentStatus: 'completed' }),
            enrich: { _id: 'b'.repeat(24), enrichmentStatus: 'completed' },
            qual: { systemDecision: 'not_relevant', decisionReason: 'Job/career page' },
        }).stage, LIVE_STAGES.REJECTED);
    });

    it('same-domain extra source rows mark consolidatedInto without extra unique companies', () => {
        const a = mapLiveActivityRow({
            cap: cap({ _id: '1'.repeat(24), title: 'XYZ Lighting' }),
            enrich: { _id: 'b'.repeat(24), enrichmentStatus: 'completed', canonicalDomain: 'xyzlighting.example', companyName: 'XYZ Lighting' },
            qual: { _id: 'c'.repeat(24), systemDecision: 'strong_match' },
            gen: { systemDecision: 'verified_genuine' },
        });
        const b = mapLiveActivityRow({
            cap: cap({ _id: '2'.repeat(24), title: 'XYZ Lighting contact' }),
            enrich: { _id: 'e'.repeat(24), enrichmentStatus: 'completed', canonicalDomain: 'xyzlighting.example', companyName: 'XYZ Lighting' },
            qual: { _id: 'f'.repeat(24), systemDecision: 'strong_match' },
            gen: { systemDecision: 'verified_genuine' },
        });
        markDuplicateSourceRows([a, b]);
        assert.equal(a.duplicateSource, false);
        assert.equal(b.duplicateSource, true);
        assert.equal(b.consolidatedInto, 'XYZ Lighting');
    });

    it('filters split processing vs verified vs review', () => {
        const rows = [
            { filterKey: 'processing' },
            { filterKey: 'verified' },
            { filterKey: 'review' },
        ];
        assert.equal(applyLiveFilter(rows, 'verified').length, 1);
        assert.equal(applyLiveFilter(rows, 'all').length, 3);
    });

    it('headline uses in-flight stage, never invents a name', () => {
        const rows = [mapLiveActivityRow({
            cap: cap({ enrichmentStatus: 'processing', title: 'ABC Luminaires' }),
        })];
        assert.equal(buildCurrentHeadline(rows, {}), 'Currently: Enriching ABC Luminaires');
        assert.equal(buildCurrentHeadline([], {}), '');
    });
});
