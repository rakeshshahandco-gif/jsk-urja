/**
 * Phase 2B-A — RCM accounting simulation (no DB posting).
 * Run: node --test backend/test/rcm/rcmAccountingSimulation.phase2ba.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    canSimulateRcmAccounting,
    simulateRcmAccounting,
} from '../../src/services/rcmAccountingSimulation.service.js';
import {
    RCM_LIFECYCLE,
    PROPOSED_RCM_LEDGERS,
    PHASE_2B_A_BANNER,
    GSTR3B_PREVIEW_BANNER,
    RCM_PERMISSION_IDS,
} from '../../src/config/rcmAccountingDesign.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('RCM Phase 2B-A design constants', () => {
    it('defines lifecycle and proposed ledgers without create flag', () => {
        assert.equal(RCM_LIFECYCLE.TAX_PAYMENT_PENDING, 'TAX_PAYMENT_PENDING');
        assert.equal(RCM_LIFECYCLE.ITC_AVAILABLE, 'ITC_AVAILABLE');
        assert.equal(PROPOSED_RCM_LEDGERS.liability.cgst.name, 'RCM CGST Payable');
        assert.equal(PROPOSED_RCM_LEDGERS.control.recoverable.name, 'RCM GST Recoverable');
        assert.match(PHASE_2B_A_BANNER, /SIMULATION ONLY/i);
        assert.match(GSTR3B_PREVIEW_BANNER, /Not Included in Return/i);
        assert.equal(RCM_PERMISSION_IDS.postLiability, 'gst.rcm.post_liability');
    });
});

describe('RCM Phase 2B-A simulation gates + rent/GTA maths', () => {
    it('1. Forward-charge produces no RCM simulation', async () => {
        const gate = canSimulateRcmAccounting({ treatment: 'FORWARD_CHARGE' }, { rcmConfirmed: true });
        assert.equal(gate.ok, false);
        const out = await simulateRcmAccounting({
            decision: { treatment: 'FORWARD_CHARGE', treatmentLabel: 'Forward Charge' },
            rcmConfirmed: true,
            taxableValue: 100000,
        });
        assert.equal(out.simulationGenerated, false);
        assert.equal(out.postingEnabled, false);
        assert.equal(out.rcmLiability, null);
    });

    it('2. Review-required produces no posting simulation', async () => {
        const out = await simulateRcmAccounting({
            decision: { treatment: 'REVIEW_REQUIRED' },
            rcmConfirmed: true,
            taxableValue: 50000,
        });
        assert.equal(out.simulationGenerated, false);
    });

    it('3–7. Confirmed rent RCM: CGST+SGST, payable excludes GST, ITC pending', async () => {
        const out = await simulateRcmAccounting({
            decision: {
                treatment: 'REVERSE_CHARGE',
                treatmentLabel: 'Reverse Charge',
                rcmCategory: 'RENT',
                suggestedGstRate: 18,
                taxableValue: 100000,
                matchedDraftRule: { ruleCode: 'DRAFT_RENT_COMMERCIAL' },
            },
            rcmConfirmed: true,
            expenseLedgerName: 'Commercial Rent',
            supplierName: 'XYZ Landlord',
            taxableValue: 100000,
            gstType: 'CGST / SGST',
            rate: 18,
            supplierChargedGst: 0,
        });
        assert.equal(out.simulationGenerated, true);
        assert.equal(out.postingEnabled, false);
        assert.equal(out.supplierBooking.supplierPayable, 100000);
        assert.equal(out.supplierBooking.rcmGstAddedToSupplierPayable, false);
        assert.equal(out.rcmLiability.cgst, 9000);
        assert.equal(out.rcmLiability.sgst, 9000);
        assert.equal(out.rcmLiability.igst, 0);
        assert.equal(out.taxPayment.paymentStatus, 'PENDING');
        assert.equal(out.itc.itcAvailableAfterPayment, false);
        assert.equal(out.gstr3bPreview.includedInActualReturn, false);
        assert.ok(out.simulatedEntries.every((e) => e.posted === false));
        assert.match(out.banner, /SIMULATION ONLY/i);
    });

    it('6. Inter-state produces IGST', async () => {
        const out = await simulateRcmAccounting({
            decision: { treatment: 'REVERSE_CHARGE', suggestedGstRate: 18 },
            rcmConfirmed: true,
            taxableValue: 100000,
            gstType: 'IGST',
            rate: 18,
        });
        assert.equal(out.rcmLiability.igst, 18000);
        assert.equal(out.rcmLiability.cgst, 0);
        assert.equal(out.rcmLiability.sgst, 0);
    });

    it('8. Ineligible ITC does not become available after payment', async () => {
        const out = await simulateRcmAccounting({
            decision: { treatment: 'REVERSE_CHARGE', suggestedGstRate: 18 },
            rcmConfirmed: true,
            taxableValue: 100000,
            gstType: 'CGST / SGST',
            taxPayment: { status: 'PAID', challanReference: 'CH-1', taxPeriod: '07-2026' },
            itc: { eligibility: 'Ineligible', authorisedRelease: true },
        });
        assert.equal(out.taxPayment.paymentStatus, 'PAID');
        assert.equal(out.itc.itcAvailableAfterPayment, false);
        assert.equal(out.itc.eligibleAmount, 0);
    });

    it('7b. Payment + eligible + auth releases simulated ITC', async () => {
        const out = await simulateRcmAccounting({
            decision: { treatment: 'REVERSE_CHARGE', suggestedGstRate: 18 },
            rcmConfirmed: true,
            taxableValue: 100000,
            gstType: 'CGST / SGST',
            taxPayment: { paid: true },
            itc: { eligibility: 'Eligible', authorisedRelease: true, supportingDocumentsComplete: true },
        });
        assert.equal(out.itc.itcAvailableAfterPayment, true);
        assert.equal(out.itc.eligibleAmount, 18000);
        assert.ok(out.itc.entries.some((e) => e.ledger === 'Input CGST under RCM'));
    });

    it('9–10. Unconfirmed / draft-only and forward courier block simulation', () => {
        const draftOnly = canSimulateRcmAccounting(
            {
                treatment: 'REVERSE_CHARGE',
                matchedDraftRule: { ruleCode: 'X' },
            },
            { rcmConfirmed: false },
        );
        assert.equal(draftOnly.ok, false);

        const courierFc = canSimulateRcmAccounting(
            { treatment: 'FORWARD_CHARGE', rcmCategory: 'COURIER' },
            { rcmConfirmed: true },
        );
        assert.equal(courierFc.ok, false);
    });

    it('11. Cancellation before posting marks cancelled lifecycle', async () => {
        const out = await simulateRcmAccounting({
            decision: { treatment: 'REVERSE_CHARGE' },
            rcmConfirmed: true,
            taxableValue: 100000,
            rate: 18,
            cancellationScenario: 'A',
        });
        assert.equal(out.lifecycleStatus, 'CANCELLED');
        assert.equal(out.postingEnabled, false);
    });

    it('14–15. Service and routes never create journals / claim ITC', () => {
        const simSrc = fs.readFileSync(
            path.join(__dirname, '../../src/services/rcmAccountingSimulation.service.js'),
            'utf8',
        );
        assert.doesNotMatch(simSrc, /AccountLedger\.create|postToLedger|createJournal/);
        assert.match(simSrc, /postingEnabled: false/);
        assert.match(simSrc, /posted: false/);

        const routes = fs.readFileSync(
            path.join(__dirname, '../../src/routes/v1/rcm.routes.js'),
            'utf8',
        );
        assert.match(routes, /simulate-accounting/);
        assert.match(routes, /ledger-design/);
        assert.doesNotMatch(routes, /postToLedger|createJournal|claimItc/i);

        const ctrl = fs.readFileSync(
            path.join(__dirname, '../../src/controllers/rcm.controller.js'),
            'utf8',
        );
        assert.match(ctrl, /simulateRcmAccounting/);
        assert.doesNotMatch(ctrl, /gstr3bAdjustment|postPurchaseInvoiceToLedger/);
    });
});
