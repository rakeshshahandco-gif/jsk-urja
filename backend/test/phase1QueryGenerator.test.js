import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generatePhase1Queries, parseLocationInput } from '../src/services/dataExtractor/discovery/queryGenerator.util.js';

describe('phase1 query generator', () => {
    it('builds generic modifier + directory queries for Home Automation / Mumbai', () => {
        const queries = generatePhase1Queries({ keyword: 'Home Automation', location: 'Mumbai' });
        const texts = queries.map((q) => q.queryText.toLowerCase());
        assert.ok(queries.length >= 10);
        assert.ok(texts.some((t) => t.includes('home automation mumbai')));
        assert.ok(texts.some((t) => t.includes('manufacturer') && t.includes('mumbai')));
        assert.ok(texts.some((t) => t.includes('system integrator')));
        assert.ok(texts.some((t) => t.includes('site:indiamart.com')));
        assert.ok(texts.some((t) => t.includes('smart home')));
        assert.equal(queries.filter((q) => q.recommended).length, 1);
    });

    it('is not hard-coded — LED Driver also generates modifiers and directories', () => {
        const queries = generatePhase1Queries({ keyword: 'LED Driver', location: 'Mumbai' });
        const texts = queries.map((q) => q.queryText.toLowerCase());
        assert.ok(texts.some((t) => t.includes('led driver manufacturer mumbai')));
        assert.ok(texts.some((t) => t.includes('site:tradeindia.com')));
        assert.ok(!texts.some((t) => t.includes('home automation')));
        assert.ok(!texts.some((t) => t.includes('knx')));
    });

    it('parses location city vs state vs country', () => {
        assert.equal(parseLocationInput('Mumbai').city, 'Mumbai');
        assert.equal(parseLocationInput('Maharashtra').state, 'Maharashtra');
        assert.equal(parseLocationInput('India').country, 'India');
    });
});
