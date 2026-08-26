import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    INSTAGRAM_BATCH_SIZE,
    INSTAGRAM_STOP_REASONS,
    addSeenKey,
    instagramCaptureKey,
    instagramSessionExpiredFromUrl,
    isAlreadySeen,
    listingPageSizeIsNotExtractCap,
    nextUnseenBatch,
    resolveInstagramStopReason,
    splitIntoBatches,
    summarizeInstagramRun,
} from '../src/services/dataExtractor/socialSources/instagramBatch.util.js';
import {
    beginInstagramExtract,
    endInstagramExtract,
    requestInstagramExtractStop,
} from '../src/services/dataExtractor/socialSources/instagramExtractControl.util.js';
import { EXPORT_HEADERS } from '../src/services/dataExtractor/socialSources/socialCaptureDisplay.util.js';

function rec(handle) {
    return {
        title: handle,
        resultUrl: `https://www.instagram.com/${handle}/`,
        sourceRecordId: `instagram:${handle}`,
    };
}

function handles(list) {
    return list.map((r) => instagramCaptureKey(r).split('/').filter(Boolean).pop());
}

describe('instagram batch vs total cap', () => {
    it('uses 5 as batch size and does not cap total at 5', () => {
        const twelve = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'].map(rec);
        const batches = splitIntoBatches(twelve, INSTAGRAM_BATCH_SIZE);
        assert.equal(INSTAGRAM_BATCH_SIZE, 5);
        assert.equal(batches.length, 3);
        assert.equal(batches[0].newCount, 5);
        assert.equal(batches[1].newCount, 5);
        assert.equal(batches[2].newCount, 2);
        assert.equal(twelve.length, 12);
        assert.ok(twelve.length > 5);
        const summary = summarizeInstagramRun({
            batchSize: INSTAGRAM_BATCH_SIZE,
            batches,
            newThisRun: twelve.length,
            alreadyKnown: 0,
            totalCaptured: twelve.length,
            stopReason: INSTAGRAM_STOP_REASONS.SOURCE_EXHAUSTED,
        });
        assert.equal(summary.totalCaptured, 12);
        assert.notEqual(summary.totalCaptured, INSTAGRAM_BATCH_SIZE);
    });

    it('second pass continues from already-seen profiles and adds more', () => {
        const seen = new Set();
        const firstVisible = ['a', 'b', 'c', 'd', 'e'].map(rec);
        const first = nextUnseenBatch(firstVisible, seen, 5);
        first.batch.forEach((r) => addSeenKey(seen, r));
        assert.deepEqual(handles(first.batch), ['a', 'b', 'c', 'd', 'e']);

        const nextVisible = ['c', 'd', 'e', 'f', 'g', 'h', 'i'].map(rec);
        const second = nextUnseenBatch(nextVisible, seen, 5);
        assert.equal(second.alreadyKnown, 3);
        assert.deepEqual(handles(second.batch), ['f', 'g', 'h', 'i']);
        second.batch.forEach((r) => addSeenKey(seen, r));
        assert.equal(seen.size, 9);
        assert.ok(seen.size > 5);
    });

    it('skips duplicate profiles', () => {
        const seen = new Set();
        addSeenKey(seen, rec('home_automation'));
        const mixed = ['home_automation', 'tuyasmarthome', 'home_automation'].map(rec);
        const out = nextUnseenBatch(mixed, seen, 5);
        assert.equal(out.alreadyKnown, 2);
        assert.deepEqual(handles(out.batch), ['tuyasmarthome']);
        assert.equal(isAlreadySeen(seen, rec('home_automation')), true);
    });

    it('total can exceed 5 when the source exposes more', () => {
        const seen = new Set();
        const all = [];
        const pool = Array.from({ length: 17 }, (_, i) => rec(`acct${i + 1}`));
        let pass = 0;
        while (all.length < pool.length) {
            pass += 1;
            const { batch } = nextUnseenBatch(pool, seen, INSTAGRAM_BATCH_SIZE);
            assert.ok(batch.length <= 5);
            if (!batch.length) break;
            batch.forEach((r) => {
                addSeenKey(seen, r);
                all.push(r);
            });
        }
        assert.ok(pass >= 4);
        assert.equal(all.length, 17);
        assert.ok(all.length > 5);
    });

    it('genuine exhaustion stops safely', () => {
        assert.equal(
            resolveInstagramStopReason({ queueEmpty: true, noNewAfterScroll: true }),
            INSTAGRAM_STOP_REASONS.SOURCE_EXHAUSTED,
        );
        assert.equal(
            resolveInstagramStopReason({ queriesExhausted: true }),
            INSTAGRAM_STOP_REASONS.SOURCE_EXHAUSTED,
        );
        const empty = nextUnseenBatch(['a', 'b'].map(rec), new Set(['https://www.instagram.com/a', 'https://www.instagram.com/b']), 5);
        assert.equal(empty.batch.length, 0);
        assert.equal(empty.alreadyKnown, 2);
    });

    it('session expiry and user stop and safety pause stop safely', () => {
        assert.equal(
            resolveInstagramStopReason({ sessionExpired: true }),
            INSTAGRAM_STOP_REASONS.SESSION_EXPIRED,
        );
        assert.equal(
            instagramSessionExpiredFromUrl('https://www.instagram.com/accounts/login/?next=%2F'),
            true,
        );
        assert.equal(
            resolveInstagramStopReason({ stopRequested: true, queueEmpty: true }),
            INSTAGRAM_STOP_REASONS.USER_STOP,
        );
        assert.equal(
            resolveInstagramStopReason({ challenge: 'platform_challenge' }),
            INSTAGRAM_STOP_REASONS.SOURCE_SAFETY_PAUSE,
        );
        assert.equal(
            resolveInstagramStopReason({ technicalError: 'Chrome crashed' }),
            INSTAGRAM_STOP_REASONS.TECHNICAL_FAILURE,
        );
        const ctl = beginInstagramExtract('test-co');
        assert.equal(ctl.shouldStop(), false);
        const stop = requestInstagramExtractStop('test-co');
        assert.equal(stop.stopRequested, true);
        assert.equal(ctl.shouldStop(), true);
        endInstagramExtract('test-co');
    });

    it('table pagination page size is not an extraction total', () => {
        assert.equal(listingPageSizeIsNotExtractCap(20, 27), true);
        assert.equal(listingPageSizeIsNotExtractCap(100, 17), true);
        const extracted = 27;
        const pageSize = 20;
        assert.ok(extracted > pageSize);
    });

    it('keeps Full Data / Export header fields working', () => {
        const required = [
            'Company Name',
            'Instagram Username',
            'Instagram URL',
            'Description',
            'Website',
            'Email',
            'Phone',
            'Search Keyword',
            'Search Location',
            'RawCapture ID',
            'Enrichment Status',
        ];
        for (const col of required) {
            assert.ok(EXPORT_HEADERS.includes(col), `missing export column ${col}`);
        }
        assert.ok(EXPORT_HEADERS.length >= 20);
    });
});
