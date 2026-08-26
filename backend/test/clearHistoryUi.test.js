import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildHistoryClearPayload,
    facebookClearLabel,
    historyClearErrorMessage,
    isClearConfirmEnabled,
    validateClearConfirm,
} from '../../src/features/dataExtractor/clearHistoryUi.util.js';

describe('clear history UI contract', () => {
    it('does not treat the red button as ready until CLEAR is typed', () => {
        assert.equal(isClearConfirmEnabled({ busy: '', confirmText: '' }), false);
        assert.equal(isClearConfirmEnabled({ busy: '', confirmText: 'CLEAR' }), true);
        assert.equal(isClearConfirmEnabled({ busy: 'clear', confirmText: 'CLEAR' }), false);
    });

    it('requires CLEAR confirmation before API execute payload is valid', () => {
        const miss = validateClearConfirm({ confirmText: 'clear now', scope: 'facebook_all' });
        assert.equal(miss.ok, false);
        const ok = validateClearConfirm({ confirmText: 'CLEAR', scope: 'facebook_all', includeProtected: false });
        assert.equal(ok.ok, true);
    });

    it('defaults includeProtected to false in the API payload', () => {
        const payload = buildHistoryClearPayload({ scope: 'facebook_all', keyword: 'Home Automation' });
        assert.equal(payload.includeProtected, false);
        assert.equal(payload.matchKeyword, false);
        assert.equal(payload.matchLocation, false);
    });

    it('renames All Facebook when keyword/location filters are on', () => {
        assert.equal(facebookClearLabel('facebook_all', false, false), 'All Facebook extraction history');
        assert.equal(facebookClearLabel('facebook_all', true, false), 'Clear matching Facebook history');
    });

    it('shows a visible error string after failure', () => {
        const msg = historyClearErrorMessage({ response: { data: { message: 'Only admin can clear Data Extractor history' } } });
        assert.match(msg, /^Unable to clear history:/);
        assert.match(msg, /Only admin/);
    });

    it('blocks protected-record deletion without extra confirmation', () => {
        const blocked = validateClearConfirm({
            confirmText: 'CLEAR',
            scope: 'facebook_all',
            includeProtected: true,
            confirmProtected: false,
        });
        assert.equal(blocked.ok, false);
    });
});
