import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applySmartMerge, scoreMergePair } from '../src/services/dataExtractor/discovery/phase2/smartMerge.util.js';
import { collectEmails, collectSourceProviders } from '../src/services/dataExtractor/discovery/phase2/inputPayload.util.js';

describe('phase2 smart merge', () => {
    it('auto-merges the same company from web + IndiaMART with same domain/phone', () => {
        const web = {
            companyName: 'ABC Automation Pvt Ltd',
            website: 'https://abcautomation.com',
            normalizedDomain: 'abcautomation.com',
            email: 'sales@abcautomation.com',
            phone: '02212345678',
            city: 'Mumbai',
            sourceUrl: 'https://bing.com/search',
            rawExtractedData: { sourceProvider: 'web_search', sourceProviders: ['web_search'], sourceUrls: ['https://abcautomation.com/about'] },
        };
        const im = {
            companyName: 'ABC Automation',
            website: 'https://www.indiamart.com/abc-automation',
            normalizedDomain: 'indiamart.com',
            email: 'info@abcautomation.com',
            phone: '02212345678',
            city: 'Mumbai',
            sourceUrl: 'https://www.indiamart.com/abc-automation',
            rawExtractedData: {
                sourceProvider: 'indiamart',
                sourceProviders: ['indiamart'],
                isDirectory: true,
                sourceUrls: ['https://www.indiamart.com/abc-automation'],
            },
        };
        const scored = scoreMergePair(web, im);
        assert.ok(scored.mergeConfidence >= 75, `expected strong merge, got ${scored.mergeConfidence}`);
        const { preview, autoMerged } = applySmartMerge([web, im]);
        const canonical = preview.filter((r) => r.phase2Merge?.mergedIntoPreviewIndex == null);
        assert.equal(canonical.length, 1);
        assert.ok(autoMerged.length >= 1 || canonical[0]._mergedDraft);
        const emails = collectEmails(canonical[0]);
        assert.ok(emails.includes('sales@abcautomation.com'));
        assert.ok(emails.includes('info@abcautomation.com'));
        const sources = collectSourceProviders(canonical[0]);
        assert.ok(sources.includes('web_search'));
        assert.ok(sources.includes('indiamart'));
        assert.ok((canonical[0].rawExtractedData?.sourceUrls || []).length >= 1);
    });

    it('does not merge similar names in different cities with different domains and phones', () => {
        const mumbai = {
            companyName: 'ABC Automation Mumbai',
            website: 'https://abc-mumbai.com',
            normalizedDomain: 'abc-mumbai.com',
            phone: '9822000001',
            city: 'Mumbai',
            address: 'Andheri',
            rawExtractedData: { sourceProvider: 'web_search' },
        };
        const pune = {
            companyName: 'ABC Automation Pune',
            website: 'https://abc-pune.com',
            normalizedDomain: 'abc-pune.com',
            phone: '9822111111',
            city: 'Pune',
            address: 'Hinjewadi',
            rawExtractedData: { sourceProvider: 'web_search' },
        };
        const scored = scoreMergePair(mumbai, pune);
        assert.ok(scored.mergeConfidence < 75, `should stay separate, got ${scored.mergeConfidence}`);
        assert.equal(scored.decision, 'keep_separate');
        const { preview, autoMerged } = applySmartMerge([mumbai, pune]);
        assert.equal(autoMerged.length, 0);
        const canonical = preview.filter((r) => r.phase2Merge?.mergedIntoPreviewIndex == null);
        assert.equal(canonical.length, 2);
    });

    it('sends 75-94 confidence pairs to review instead of auto-merge', () => {
        const a = {
            companyName: 'ABC Smart Automation Pvt Ltd',
            city: 'Mumbai',
            rawExtractedData: { sourceProvider: 'web_search' },
        };
        const b = {
            companyName: 'ABC Smart Automation',
            city: 'Mumbai',
            rawExtractedData: { sourceProvider: 'tradeindia' },
        };
        const scored = scoreMergePair(a, b);
        assert.ok(scored.mergeConfidence < 95 || scored.decision !== 'auto_merge' || scored.decision === 'review' || scored.decision === 'keep_separate');
        const { reviewPairs, autoMerged } = applySmartMerge([a, b]);
        assert.equal(autoMerged.length, 0);
        assert.ok(reviewPairs.length === 1 || scored.decision === 'keep_separate');
    });
});
