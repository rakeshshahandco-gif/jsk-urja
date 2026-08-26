import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    bestContactChannel,
    isDiscoveryOnly,
    outreachPriority,
    scoreContactability,
    whatsappNumber,
} from '../src/services/dataExtractor/discovery/phase5/contactability.util.js';

describe('contactable prospect scoring', () => {
    it('does not treat a Facebook group name as a contactable prospect', () => {
        const group = {
            canonicalName: 'Home automation',
            social: { facebookUrl: 'https://www.facebook.com/groups/123' },
            primaryPhone: '',
            primaryEmail: '',
            website: '',
        };
        assert.equal(isDiscoveryOnly(group), true);
        assert.equal(scoreContactability(group), 0);
        assert.equal(bestContactChannel(group), 'Facebook group (source only)');
    });

    it('scores phone + whatsapp + email separately from AI relevance', () => {
        const row = {
            canonicalName: 'ABC Home Automation',
            primaryPhone: '+91 98765 43210',
            primaryEmail: 'sales@abc-ha.com',
            website: 'https://abc-ha.com',
            social: { facebookUrl: 'https://www.facebook.com/abcautomation' },
            qualificationCategory: 'Highly Relevant',
            qualificationScore: 92,
        };
        assert.equal(whatsappNumber(row), '9876543210');
        assert.ok(scoreContactability(row) >= 80);
        assert.equal(bestContactChannel(row), 'WhatsApp / Call');
        assert.equal(outreachPriority(row, scoreContactability(row)), 'A');
        assert.notEqual(scoreContactability(row), 92);
    });

    it('keeps Instagram-only as possible contact, not a lead', () => {
        const row = {
            canonicalName: 'Inhaus',
            social: { instagramUrl: 'https://www.instagram.com/inhaus/' },
            qualificationCategory: 'Relevant',
        };
        assert.equal(isDiscoveryOnly(row), false);
        assert.equal(bestContactChannel(row), 'Instagram Profile');
        assert.ok(scoreContactability(row) < 50);
        assert.equal(outreachPriority(row, scoreContactability(row)), 'D');
    });

    it('treats Instagram post/reel URLs as discovery, not prospects', () => {
        const row = {
            canonicalName: 'Gretsch G2622 Streamliner',
            social: { instagramUrl: 'https://www.instagram.com/p/DZHiraCmC6s/' },
        };
        assert.equal(isDiscoveryOnly(row), true);
        assert.equal(bestContactChannel(row), 'None');
    });

    it('does not invent missing phone or email', () => {
        const row = { canonicalName: 'Nexinn', website: 'https://nexinn.example' };
        assert.equal(whatsappNumber(row), '');
        assert.equal(row.primaryPhone || '', '');
        assert.equal(bestContactChannel(row), 'Website');
    });
});
