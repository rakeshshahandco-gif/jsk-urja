/**
 * Phase 2B-C — RCM tax payment gates / allocation (unit, no live journals).
 * Run: node --test backend/test/rcm/rcmTaxPayment.phase2bc.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    buildPaymentIdempotencyKey,
    computeOutstanding,
    derivePaymentStatus,
    RCM_PAYMENT_STATUS,
} from '../../src/services/rcmTaxPayment.service.js';
import { hasActiveRcmTaxPayment } from '../../src/services/rcmLiabilityPostingStore.service.js';
import { RCM_PERMISSION_IDS, RCM_RULE_STORE_POLICY } from '../../src/config/rcmAccountingDesign.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('RCM Phase 2B-C payment allocation', () => {
    it('computes partial then full outstanding component-wise', () => {
        const meta = {
            cgst: 9000,
            sgst: 9000,
            igst: 0,
            cess: 0,
            payments: [
                {
                    cgstPaid: 5000,
                    sgstPaid: 5000,
                    igstPaid: 0,
                    cessPaid: 0,
                    totalPaid: 10000,
                    status: 'RECORDED',
                },
            ],
        };
        const out = computeOutstanding(meta);
        assert.equal(out.cgst, 4000);
        assert.equal(out.sgst, 4000);
        assert.equal(out.total, 8000);
        assert.equal(derivePaymentStatus(meta), RCM_PAYMENT_STATUS.PARTLY_PAID);

        meta.payments.push({
            cgstPaid: 4000,
            sgstPaid: 4000,
            igstPaid: 0,
            cessPaid: 0,
            totalPaid: 8000,
            status: 'RECORDED',
        });
        const out2 = computeOutstanding(meta);
        assert.equal(out2.total, 0);
        assert.equal(derivePaymentStatus(meta), RCM_PAYMENT_STATUS.PAID);
    });

    it('ignores reversed payments in outstanding', () => {
        const meta = {
            cgst: 9000,
            sgst: 9000,
            igst: 0,
            cess: 0,
            payments: [
                {
                    cgstPaid: 9000,
                    sgstPaid: 9000,
                    totalPaid: 18000,
                    status: 'REVERSED',
                },
            ],
        };
        assert.equal(computeOutstanding(meta).total, 18000);
        assert.equal(derivePaymentStatus(meta), RCM_PAYMENT_STATUS.PAYMENT_PENDING);
    });

    it('builds stable payment idempotency keys', () => {
        const a = buildPaymentIdempotencyKey({
            companyId: 'c1',
            liabilityPostingId: 'p1',
            challanReference: 'CPIN-1',
            paymentDate: '2026-07-15',
            cgstPaid: 5000,
            sgstPaid: 5000,
            igstPaid: 0,
            cessPaid: 0,
        });
        const b = buildPaymentIdempotencyKey({
            companyId: 'c1',
            liabilityPostingId: 'p1',
            challanReference: 'cpin-1',
            paymentDate: new Date('2026-07-15'),
            cgstPaid: 5000,
            sgstPaid: 5000,
            igstPaid: 0,
            cessPaid: 0,
        });
        assert.equal(a, b);
        assert.match(a, /RCM_TAX_PAYMENT\|p1\|CPIN-1/);
    });

    it('detects active tax payment for cancel/reverse guards', () => {
        assert.equal(hasActiveRcmTaxPayment({ payments: [], amountPaid: 0, taxPaymentStatus: 'PENDING' }), false);
        assert.equal(hasActiveRcmTaxPayment({
            payments: [{ status: 'RECORDED', totalPaid: 100 }],
            amountPaid: 100,
            taxPaymentStatus: 'PARTLY_PAID',
        }), true);
        assert.equal(hasActiveRcmTaxPayment({
            payments: [{ status: 'REVERSED', totalPaid: 100 }],
            amountPaid: 0,
            taxPaymentStatus: 'PAYMENT_PENDING',
        }), false);
    });

    it('wires payment permissions and Mongo-first rule policy', () => {
        assert.equal(RCM_PERMISSION_IDS.recordPayment, 'gst.rcm.record_payment');
        assert.equal(RCM_PERMISSION_IDS.viewPayment, 'gst.rcm.view_payment');
        assert.equal(RCM_PERMISSION_IDS.reversePayment, 'gst.rcm.reverse_payment');
        assert.equal(RCM_RULE_STORE_POLICY.authoritativeStore, 'mongodb');
        assert.equal(RCM_RULE_STORE_POLICY.silentMigrationForbidden, true);

        const routes = fs.readFileSync(
            path.join(__dirname, '../../src/routes/v1/rcm.routes.js'),
            'utf8',
        );
        assert.match(routes, /record-payment/);
        assert.match(routes, /gst\.rcm\.record_payment/);
        assert.match(routes, /gst\.rcm\.reverse_payment/);
        // Phase 2C/2D: release-itc exists as a SEPARATE explicit endpoint (not auto-called by payment)
        assert.match(routes, /release-itc/);
        assert.match(routes, /gst\.rcm\.release_itc/);
        // Payment route must not share handler with ITC release
        assert.doesNotMatch(routes, /record-payment[^\n]*release/i);
    });

    it('payment leaves ITC pending — release requires separate explicit action', async () => {
        // Architecture contract: tax payment service does not import / call ITC release
        const paySrc = fs.readFileSync(
            path.join(__dirname, '../../src/services/rcmTaxPayment.service.js'),
            'utf8',
        );
        assert.doesNotMatch(paySrc, /releaseRcmItc/);
        assert.doesNotMatch(paySrc, /from ['\"].*rcmItcRelease/);
        assert.match(paySrc, /PENDING_ELIGIBILITY_REVIEW|itcStatus/);
    });
});
