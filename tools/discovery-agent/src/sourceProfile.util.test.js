import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import {
    isolatedSourceProfileDir,
    normalizeExtractionSource,
    safeProfileUserId,
} from './sourceProfile.util.js';

describe('extraction agent source profiles', () => {
    it('keeps facebook and instagram folders separate for the same user', () => {
        const uid = '6999b6dac75af08da97fd366';
        const fb = isolatedSourceProfileDir('P', uid, 'facebook');
        const ig = isolatedSourceProfileDir('P', uid, 'instagram');
        assert.equal(path.basename(fb), 'facebook');
        assert.equal(path.basename(ig), 'instagram');
        assert.notEqual(fb, ig);
        assert.ok(fb.includes(uid));
        assert.ok(ig.includes(uid));
    });

    it('does not accept display names as profile ids', () => {
        assert.equal(safeProfileUserId('Jatin Thakkar'), '');
        assert.equal(normalizeExtractionSource('facebook'), 'facebook');
    });
});
