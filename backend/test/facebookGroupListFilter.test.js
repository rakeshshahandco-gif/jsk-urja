import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    filterFacebookGroupRows,
    parseExactFacebookGroupSeek,
    exactLookupSucceeded,
    selectedGroupFromExactLookup,
    formatExactGroupLookupError,
} from '../../src/features/dataExtractor/facebookGroupListFilter.util.js';

const rows = [
    {
        groupName: 'SMART HOME AUTOMATION',
        groupId: '806id',
        groupUrl: 'https://www.facebook.com/groups/806id',
    },
    {
        groupName: 'Smart Home Automation India',
        groupId: 'india17k',
        groupUrl: 'https://www.facebook.com/groups/india17k',
    },
    {
        groupName: 'Smart Home Automation',
        groupId: '510207536124194',
        groupUrl: 'https://www.facebook.com/groups/510207536124194',
    },
    {
        groupName: 'SmartHome Devices',
        groupId: 'devices',
        groupUrl: 'https://www.facebook.com/groups/devices',
    },
];

describe('facebook joined groups search filter', () => {
    it('isolates the exact group by ID without treating similar names as the same group', () => {
        const found = filterFacebookGroupRows(rows, '510207536124194');
        assert.equal(found.length, 1);
        assert.equal(found[0].groupId, '510207536124194');
        assert.equal(found[0].groupUrl, 'https://www.facebook.com/groups/510207536124194');
    });

    it('isolates exact group name Smart Home Automation from similarly named groups', () => {
        const found = filterFacebookGroupRows(rows, 'Smart Home Automation');
        const ids = found.map((g) => g.groupId);
        assert.equal(ids.includes('india17k'), false);
        assert.equal(ids.includes('devices'), false);
        assert.equal(ids.includes('510207536124194'), true);
        assert.ok(found.every((g) => String(g.groupName).trim().toLowerCase() === 'smart home automation'));
    });

    it('parses an exact numeric Group ID for joined-group continuation', () => {
        assert.equal(parseExactFacebookGroupSeek('510207536124194'), '510207536124194');
        assert.equal(parseExactFacebookGroupSeek('https://www.facebook.com/groups/510207536124194'), '510207536124194');
        assert.equal(parseExactFacebookGroupSeek('510207', { minDigits: 10 }), '');
        assert.equal(parseExactFacebookGroupSeek('Smart Home'), '');
    });

    it('matches URL fragments and does not start extraction', () => {
        const found = filterFacebookGroupRows(rows, 'facebook.com/groups/510207536124194');
        assert.equal(found.length, 1);
        assert.equal(found[0].groupId, '510207536124194');
        assert.equal(filterFacebookGroupRows(rows, '').length, 4);
    });

    it('maps exact-group API success onto Selected Group without using the joined-groups table', () => {
        const data = {
            found: true,
            ok: true,
            startedExtract: false,
            groupName: 'Smart Home Automation',
            groupId: '510207536124194',
            canonicalUrl: 'https://www.facebook.com/groups/510207536124194',
            membership: 'Joined',
            displayedMembers: '11.0K',
            peopleTabAvailable: true,
            group: {
                groupName: 'Smart Home Automation',
                groupId: '510207536124194',
                groupUrl: 'https://www.facebook.com/groups/510207536124194',
                joinedStatus: 'Joined',
                members: '11.0K',
                peopleTabAvailable: true,
                peopleTabStatus: 'Available',
            },
        };
        assert.equal(exactLookupSucceeded(data), true);
        const selected = selectedGroupFromExactLookup(data);
        assert.equal(selected.groupId, '510207536124194');
        assert.equal(selected.groupName, 'Smart Home Automation');
        assert.equal(selected.joinedStatus, 'Joined');
        assert.equal(selected.peopleTabStatus, 'Available');
        assert.equal(selected.members, '11.0K');
        assert.equal(exactLookupSucceeded({ ok: false, group: null }), false);
        assert.match(formatExactGroupLookupError({ reason: 'session expired', error: 'Connect first' }), /session expired/);
    });
});
