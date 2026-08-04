/**
 * Phase 2C — RCM ITC eligibility / release gates (unit, no live journals).
 * Run: node --test backend/test/rcm/rcmItcRelease.phase2c.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    buildItcReleaseIdempotencyKey,
    computeItcBalances,
    deriveItcStatus,
    RCM_ITC_STATUS,
    RCM_ITC_ELIGIBILITY,
} from '../../src/services/rcmItcRelease.service.js';
import { RCM_PERMISSION_IDS, RCM_INELIGIBLE_TREATMENT } from '../../src/config/rcmAccountingDesign.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('RCM Phase 2C ITC eligibility / release', () => {
    it('computes partial eligible remaining after release', () => {
        const meta = {
            cgst: 9000,
            sgst: 9000,
            igst: 0,
            cess: 0,
            taxPaymentStatus: 'PAID',
            payments: [{
                cgstPaid: 9000, sgstPaid: 9000, igstPaid: 0, cessPaid: 0, totalPaid: 18000, status: 'RECORDED',
            }],
            itcReview: {
                eligibilityDecision: RCM_ITC_ELIGIBILITY.PARTLY_ELIGIBLE,
                eligiblePercent: 50,
                eligibleCgst: 4500,
                eligibleSgst: 4500,
                eligibleIgst: 0,
                eligibleCess: 0,
            },
            itcReleases: [{
                cgstReleased: 4500, sgstReleased: 4500, igstReleased: 0, cessReleased: 0, totalReleased: 9000, status: 'RELEASED',
            }],
        };
        const bal = computeItcBalances(meta);
        assert.equal(bal.eligible.total, 9000);
        assert.equal(bal.released.totalReleased, 9000);
        assert.equal(bal.remaining.total, 0);
        assert.equal(bal.ineligible.total, 9000);
        assert.equal(deriveItcStatus(meta), RCM_ITC_STATUS.RELEASED);
    });

    it('blocks derive release until paid', () => {
        const meta = {
            cgst: 9000, sgst: 9000, igst: 0, cess: 0,
            payments: [],
            taxPaymentStatus: 'PAYMENT_PENDING',
        };
        assert.equal(deriveItcStatus(meta), RCM_ITC_STATUS.NOT_AVAILABLE_YET);
    });

    it('marks ineligible without Input release', () => {
        const meta = {
            cgst: 9000, sgst: 9000, igst: 0, cess: 0,
            payments: [{ cgstPaid: 9000, sgstPaid: 9000, totalPaid: 18000, status: 'RECORDED' }],
            taxPaymentStatus: 'PAID',
            itcReview: { eligibilityDecision: RCM_ITC_ELIGIBILITY.INELIGIBLE, eligibleCgst: 0, eligibleSgst: 0 },
        };
        assert.equal(deriveItcStatus(meta), RCM_ITC_STATUS.INELIGIBLE);
        assert.equal(RCM_INELIGIBLE_TREATMENT.NONE, 'NONE');
    });

    it('builds stable ITC release idempotency keys', () => {
        const a = buildItcReleaseIdempotencyKey({
            companyId: 'c1', liabilityPostingId: 'p1', releaseVersion: 1,
            cgstReleased: 9000, sgstReleased: 9000, igstReleased: 0, cessReleased: 0,
        });
        const b = buildItcReleaseIdempotencyKey({
            companyId: 'c1', liabilityPostingId: 'p1', releaseVersion: 1,
            cgstReleased: 9000, sgstReleased: 9000, igstReleased: 0, cessReleased: 0,
        });
        assert.equal(a, b);
        assert.match(a, /RCM_ITC_RELEASE\|p1\|PAID\|v1/);
    });

    it('wires ITC permissions and routes', () => {
        assert.equal(RCM_PERMISSION_IDS.releaseItc, 'gst.rcm.release_itc');
        assert.equal(RCM_PERMISSION_IDS.reviewItc, 'gst.rcm.review_itc');
        assert.equal(RCM_PERMISSION_IDS.reverseItc, 'gst.rcm.reverse_itc');
        const routes = fs.readFileSync(path.join(__dirname, '../../src/routes/v1/rcm.routes.js'), 'utf8');
        assert.match(routes, /release-itc/);
        assert.match(routes, /itc-review/);
        assert.match(routes, /gst\.rcm\.release_itc/);
        assert.match(routes, /reclassify-ineligible/);
    });
});
