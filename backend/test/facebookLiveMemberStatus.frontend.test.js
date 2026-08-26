import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    liveMemberDetail,
    liveMemberStatus,
    mergeFacebookGroupRows,
    mergeLiveMemberRows,
} from '../../src/features/dataExtractor/facebookLiveMemberStatus.util.js';

describe('facebook live member UI helpers', () => {
    it('merges group and member rows without duplicates', () => {
        const groups = mergeFacebookGroupRows(
            [{ groupUrl: 'https://www.facebook.com/groups/1', groupName: 'A' }],
            [
                { groupUrl: 'https://www.facebook.com/groups/1', members: '10.9K' },
                { groupUrl: 'https://www.facebook.com/groups/2', groupName: 'B' },
            ],
        );
        assert.equal(groups.length, 2);
        assert.equal(groups[0].members, '10.9K');
        const members = mergeLiveMemberRows(
            [{ rawCaptureId: '1', name: 'Rahul Shah', reviewStatus: 'not_reviewed' }],
            [{ rawCaptureId: '1', name: 'Rahul Shah', reviewStatus: 'reviewed', phone: '9876543210' }],
        );
        assert.equal(members.length, 1);
        assert.equal(liveMemberStatus(members[0]), 'Contactable');
        assert.match(liveMemberDetail(members[0]), /Phone ✓/);
    });
});
