/**
 * History list hides DATA_DELETED tombstones unless includeDeleted=true.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseIncludeDeleted,
    recentRunsMongoFilter,
    filterRecentMappedRuns,
} from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.runs.service.js';

describe('Simple Lead Search runs deleted-history filter', () => {
    it('defaults includeDeleted to false', () => {
        assert.equal(parseIncludeDeleted(undefined), false);
        assert.equal(parseIncludeDeleted('false'), false);
        assert.equal(parseIncludeDeleted('true'), true);
    });

    it('excludes DATA_DELETED from the default recent Mongo filter', () => {
        const hidden = recentRunsMongoFilter({ companyId: 'c1', ownerFilter: { createdBy: 'u1' } });
        assert.deepEqual(hidden.dataRetentionStatus, { $ne: 'DATA_DELETED' });
        assert.equal(hidden.companyId, 'c1');
        assert.equal(String(hidden.createdBy), 'u1');
        const shown = recentRunsMongoFilter({ companyId: 'c1', includeDeleted: true });
        assert.equal(shown.dataRetentionStatus, undefined);
    });

    it('keeps tombstones out of mapped recent unless Show Deleted is on', () => {
        const mapped = [
            { runId: 'a', dataRetentionStatus: '' },
            { runId: 'd', dataRetentionStatus: 'DATA_DELETED' },
        ];
        const hidden = filterRecentMappedRuns(mapped, [], { includeDeleted: false });
        assert.deepEqual(hidden.map((r) => r.runId), ['a']);
        const shown = filterRecentMappedRuns(mapped, [], { includeDeleted: true });
        assert.deepEqual(shown.map((r) => r.runId), ['a', 'd']);
    });
});
