/**
 * Phase 2B-B — RCM liability posting gates (no live journal in these unit tests).
 * Run: node --test backend/test/rcm/rcmLiabilityPosting.phase2bb.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    assertApprovedRuleForPosting,
    assertPostingTreatmentGate,
    buildIdempotencyKey,
} from '../../src/services/rcmLiabilityPosting.service.js';
import { PHASE_2B_B_BANNER, RCM_PERMISSION_IDS } from '../../src/config/rcmAccountingDesign.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('RCM Phase 2B-B posting gates', () => {
    it('blocks forward charge / review / unconfirmed', () => {
        assert.equal(assertPostingTreatmentGate({ treatment: 'FORWARD_CHARGE' }, { rcmConfirmed: true }).ok, false);
        assert.equal(assertPostingTreatmentGate({ treatment: 'REVIEW_REQUIRED' }, { rcmConfirmed: true }).ok, false);
        assert.equal(assertPostingTreatmentGate({ treatment: 'REVERSE_CHARGE' }, { rcmConfirmed: false }).ok, false);
        assert.equal(assertPostingTreatmentGate({ treatment: 'REVERSE_CHARGE' }, { rcmConfirmed: true }).ok, true);
    });

    it('blocks draft / unapproved rules', () => {
        assert.equal(
            assertApprovedRuleForPosting({
                matchedDraftRule: { ruleCode: 'RENT_DRAFT' },
                matchedRule: null,
            }).ok,
            false,
        );
        assert.equal(
            assertApprovedRuleForPosting({
                matchedRule: {
                    ruleCode: 'RENT_X',
                    status: 'draft',
                    approvedBy: 'u1',
                    approvedAt: new Date(),
                    effectiveFrom: new Date(),
                    statutoryReference: 'NN',
                    version: 1,
                },
            }).ok,
            false,
        );
        assert.equal(
            assertApprovedRuleForPosting({
                matchedRule: {
                    _id: 'abc',
                    ruleCode: 'RENT_X',
                    status: 'active',
                    approvedBy: 'u1',
                    approvedAt: new Date(),
                    effectiveFrom: new Date(),
                    statutoryReference: 'NN-13',
                    version: 1,
                },
            }).ok,
            true,
        );
        assert.equal(
            assertApprovedRuleForPosting({
                matchedRule: {
                    _id: 'abc',
                    ruleCode: 'RENT_X',
                    status: 'active',
                    approvedBy: null,
                    approvedAt: null,
                    effectiveFrom: new Date(),
                    statutoryReference: 'NN',
                    version: 1,
                },
            }).ok,
            false,
        );
    });

    it('builds stable idempotency keys', () => {
        const a = buildIdempotencyKey({
            companyId: 'c1',
            sourceModule: 'ExpenseVoucher',
            sourceVoucherId: 'v1',
            sourceLineId: 'header',
        });
        const b = buildIdempotencyKey({
            companyId: 'c1',
            sourceModule: 'ExpenseVoucher',
            sourceVoucherId: 'v1',
        });
        assert.equal(a, b);
        assert.match(a, /ExpenseVoucher\|v1\|header/);
    });

    it('routes wire post/reverse permissions and never auto-post on evaluate', () => {
        const routes = fs.readFileSync(
            path.join(__dirname, '../../src/routes/v1/rcm.routes.js'),
            'utf8',
        );
        assert.match(routes, /post-liability/);
        assert.match(routes, /gst\.rcm\.post_liability/);
        assert.match(routes, /gst\.rcm\.reverse/);
        assert.match(routes, /ensure-ledgers/);
        // Liability posting route must not claim ITC; payment is a separate Phase 2B-C route
        assert.doesNotMatch(routes, /claimItc|postToLedger/i);
        assert.match(routes, /record-payment/);

        const svc = fs.readFileSync(
            path.join(__dirname, '../../src/services/rcmLiabilityPosting.service.js'),
            'utf8',
        );
        assert.match(svc, /postBalancedBatch/);
        assert.match(svc, /ALREADY_POSTED/);
        assert.match(svc, /NOT_AVAILABLE_YET/);
        assert.match(svc, /PENDING_REVIEW/);
        assert.match(svc, /findSemanticDuplicateLiability|Duplicate RCM Liability Review Required/);
        assert.doesNotMatch(svc, /CGST Input|SGST Input|Input GST Credit/);
        assert.match(PHASE_2B_B_BANNER, /Return Mapping Pending/i);
        assert.equal(RCM_PERMISSION_IDS.postLiability, 'gst.rcm.post_liability');
    });

    it('scanEntryEnabled remains defined on ExpenseEntryPage', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '../../../src/features/accounts/ExpenseEntryPage.jsx'),
            'utf8',
        );
        assert.match(src, /const scanEntryEnabled = isFeatureEnabled/);
        assert.match(src, /scanEntryEnabled &&/);
    });
});
