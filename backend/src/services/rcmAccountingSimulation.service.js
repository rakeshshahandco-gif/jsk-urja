/**
 * Phase 2B-A — RCM accounting simulation (NO live posting).
 * Builds double-entry preview from a confirmed Phase 2A REVERSE_CHARGE decision.
 */

import {
    PHASE_2B_A_BANNER,
    GSTR3B_PREVIEW_BANNER,
    RCM_LIFECYCLE,
    RCM_LIFECYCLE_LABELS,
    EXISTING_GST_LEDGER_NAMES,
    PROPOSED_RCM_LEDGERS,
} from '../config/rcmAccountingDesign.js';
import { RCM_TREATMENTS, PHASE_2A_BANNER } from './rcmDecisionEngine.service.js';
import mongoose from 'mongoose';
import { AccountLedger } from '../models/accountLedger.model.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function isIgstType(gstType) {
    return String(gstType || '').toUpperCase().includes('IGST');
}

/**
 * Only confirmed / authorised REVERSE_CHARGE may simulate accounting.
 * Draft-rule suggestions and Review Required must NOT simulate liability.
 */
export function canSimulateRcmAccounting(decision = {}, opts = {}) {
    const treatment = decision.treatment;
    const confirmed = opts.rcmConfirmed === true || decision.rcmConfirmed === true;
    const overrideRc =
        Array.isArray(decision.overriddenValues)
        && decision.overriddenValues.some(
            (o) => o?.field === 'treatment' && o?.final === RCM_TREATMENTS.REVERSE_CHARGE,
        );

    if (treatment !== RCM_TREATMENTS.REVERSE_CHARGE && !overrideRc) {
        return {
            ok: false,
            reason: `Treatment is ${treatment || 'unknown'} — accounting simulation requires confirmed Reverse Charge.`,
        };
    }
    // Explicit confirm or authorised override required — draft/candidate alone is not enough.
    if (!confirmed && !overrideRc) {
        return {
            ok: false,
            reason:
                decision.matchedDraftRule && !decision.matchedRule
                    ? 'Only a draft/inactive rule matched. Confirm RCM after authorisation before accounting simulation.'
                    : 'RCM not confirmed. Set rcmConfirmed=true after authorisation to simulate accounting.',
        };
    }
    return { ok: true };
}

async function resolveExistingGstLedgerPresence() {
    const names = [
        ...EXISTING_GST_LEDGER_NAMES.output,
        ...EXISTING_GST_LEDGER_NAMES.input,
    ];
    let found = [];
    // Skip Mongo buffer wait when disconnected (unit tests / offline).
    if (mongoose.connection?.readyState === 1) {
        found = await AccountLedger.find({ name: { $in: names } })
            .select('name currentBalance')
            .lean()
            .catch(() => []);
    }
    const byName = Object.fromEntries((found || []).map((l) => [l.name, l]));
    return {
        existingMatches: names.map((n) => ({
            name: n,
            exists: !!byName[n],
            currentBalance: byName[n]?.currentBalance ?? null,
            role: EXISTING_GST_LEDGER_NAMES.input.includes(n) ? 'normal_input' : 'normal_output',
            useForRcmSimulation: false,
        })),
        proposedLedgers: PROPOSED_RCM_LEDGERS,
        createInThisPhase: false,
        note: 'Phase 2B-A maps proposed RCM ledgers only. No ledger create, no balance change.',
    };
}

function buildSupplierBooking({
    expenseLedgerName,
    supplierName,
    taxableValue,
    supplierChargedGst = 0,
}) {
    const taxable = r2(taxableValue);
    return {
        section: 'A. Supplier Booking',
        supplierPayable: taxable,
        gstChargedBySupplier: r2(supplierChargedGst),
        rcmGstAddedToSupplierPayable: false,
        confirmation:
            'RCM GST is NOT added to supplier payable. Supplier payable equals taxable expense/purchase value only.',
        entries: [
            {
                drCr: 'Dr',
                ledger: expenseLedgerName || 'Expense / Purchase',
                amount: taxable,
                narration: 'Expense / purchase booking (simulation)',
            },
            {
                drCr: 'Cr',
                ledger: supplierName || 'Supplier / Creditor',
                amount: taxable,
                narration: 'Supplier payable — excludes RCM GST (simulation)',
            },
        ],
    };
}

function buildLiabilityEntries({ taxableValue, rate, gstType, cessAmount = 0 }) {
    const taxable = r2(taxableValue);
    const rateN = Number(rate) || 0;
    const tax = r2((taxable * rateN) / 100);
    const igst = isIgstType(gstType);
    const cgst = igst ? 0 : r2(tax / 2);
    const sgst = igst ? 0 : r2(tax - cgst);
    const igstAmt = igst ? tax : 0;
    const cess = r2(cessAmount);
    const totalLiability = r2(cgst + sgst + igstAmt + cess);
    const control = PROPOSED_RCM_LEDGERS.control.recoverable.name;
    const L = PROPOSED_RCM_LEDGERS.liability;

    const entries = [
        {
            drCr: 'Dr',
            ledger: control,
            amount: totalLiability,
            narration: 'RCM GST recoverable / control (simulation)',
            proposed: true,
        },
    ];
    if (cgst > 0) {
        entries.push({
            drCr: 'Cr',
            ledger: L.cgst.name,
            amount: cgst,
            narration: 'RCM CGST liability (simulation)',
            proposed: true,
        });
    }
    if (sgst > 0) {
        entries.push({
            drCr: 'Cr',
            ledger: L.sgst.name,
            amount: sgst,
            narration: 'RCM SGST liability (simulation)',
            proposed: true,
        });
    }
    if (igstAmt > 0) {
        entries.push({
            drCr: 'Cr',
            ledger: L.igst.name,
            amount: igstAmt,
            narration: 'RCM IGST liability (simulation)',
            proposed: true,
        });
    }
    if (cess > 0) {
        entries.push({
            drCr: 'Cr',
            ledger: L.cess.name,
            amount: cess,
            narration: 'RCM Cess liability (simulation)',
            proposed: true,
        });
    }

    return {
        section: 'B. RCM Liability',
        taxableValue: taxable,
        rate: rateN,
        cgst,
        sgst,
        igst: igstAmt,
        cess,
        totalLiability,
        placeType: igst ? 'INTER_STATE' : 'INTRA_STATE',
        proposedLedgers: igst
            ? [control, L.igst.name]
            : [control, L.cgst.name, L.sgst.name],
        entries,
        lifecycleAfter: RCM_LIFECYCLE.TAX_PAYMENT_PENDING,
    };
}

function buildTaxPaymentSimulation({ liability, taxPayment = {} }) {
    const paid = taxPayment.status === 'PAID' || taxPayment.paid === true;
    const L = PROPOSED_RCM_LEDGERS.liability;
    const entries = [];
    if (paid) {
        if (liability.cgst > 0) {
            entries.push({
                drCr: 'Dr',
                ledger: L.cgst.name,
                amount: liability.cgst,
                narration: 'Clear RCM CGST payable (simulation)',
                proposed: true,
            });
        }
        if (liability.sgst > 0) {
            entries.push({
                drCr: 'Dr',
                ledger: L.sgst.name,
                amount: liability.sgst,
                narration: 'Clear RCM SGST payable (simulation)',
                proposed: true,
            });
        }
        if (liability.igst > 0) {
            entries.push({
                drCr: 'Dr',
                ledger: L.igst.name,
                amount: liability.igst,
                narration: 'Clear RCM IGST payable (simulation)',
                proposed: true,
            });
        }
        entries.push({
            drCr: 'Cr',
            ledger: taxPayment.bankLedgerName || 'Bank / GST Cash Ledger',
            amount: liability.totalLiability,
            narration: 'GST challan / cash ledger (simulation — no real PV)',
            proposed: true,
        });
    }
    return {
        section: 'C. Tax Payment',
        paymentStatus: paid ? 'PAID' : 'PENDING',
        taxPeriod: taxPayment.taxPeriod || null,
        challanReference: taxPayment.challanReference || null,
        paymentDate: taxPayment.paymentDate || null,
        amountPaid: paid ? liability.totalLiability : 0,
        partialOrFull: taxPayment.partialOrFull || (paid ? 'FULL' : null),
        paidBy: taxPayment.paidBy || null,
        note: 'Do not auto-create Payment Vouchers in Phase 2B-A.',
        entries,
        lifecycleAfter: paid ? RCM_LIFECYCLE.TAX_PAID : RCM_LIFECYCLE.TAX_PAYMENT_PENDING,
    };
}

function buildItcSimulation({ liability, taxPayment, itc = {} }) {
    const paid = taxPayment.paymentStatus === 'PAID';
    const eligibility = itc.eligibility || 'Pending Review';
    const eligibleRatio = Math.min(1, Math.max(0, Number(itc.eligibleRatio ?? 1)));
    const authorised = itc.authorisedRelease === true;
    const supportingOk = itc.supportingDocumentsComplete !== false;

    let lifecycle = RCM_LIFECYCLE.ITC_PENDING_ELIGIBILITY;
    let available = false;
    let reason = 'ITC remains pending until tax is paid, eligibility confirmed, and authorised release.';

    if (!paid) {
        lifecycle = RCM_LIFECYCLE.TAX_PAYMENT_PENDING;
        reason = 'ITC not available — RCM tax payment still pending.';
    } else if (/ineligible|blocked/i.test(eligibility)) {
        lifecycle = RCM_LIFECYCLE.ITC_INELIGIBLE;
        reason = `ITC status: ${eligibility}. Paid liability does not auto-claim ITC.`;
    } else if (!supportingOk) {
        reason = 'Supporting document / self-invoice conditions incomplete.';
    } else if (!authorised) {
        reason = 'Tax paid; ITC pending authorised release (Phase 2B-A simulation).';
        lifecycle = RCM_LIFECYCLE.ITC_PENDING_ELIGIBILITY;
    } else if (/eligible|partly/i.test(eligibility)) {
        available = true;
        lifecycle = RCM_LIFECYCLE.ITC_AVAILABLE;
        reason = 'Simulated ITC available after payment + eligibility + authorisation.';
    }

    const I = PROPOSED_RCM_LEDGERS.input;
    const control = PROPOSED_RCM_LEDGERS.control.recoverable.name;
    const eligCgst = available ? r2(liability.cgst * eligibleRatio) : 0;
    const eligSgst = available ? r2(liability.sgst * eligibleRatio) : 0;
    const eligIgst = available ? r2(liability.igst * eligibleRatio) : 0;
    const eligTotal = r2(eligCgst + eligSgst + eligIgst);
    const ineligible = r2(liability.totalLiability - eligTotal);

    const entries = [];
    if (available && eligTotal > 0) {
        if (eligCgst > 0) {
            entries.push({
                drCr: 'Dr',
                ledger: I.cgst.name,
                amount: eligCgst,
                narration: 'Input CGST under RCM (simulation)',
                proposed: true,
            });
        }
        if (eligSgst > 0) {
            entries.push({
                drCr: 'Dr',
                ledger: I.sgst.name,
                amount: eligSgst,
                narration: 'Input SGST under RCM (simulation)',
                proposed: true,
            });
        }
        if (eligIgst > 0) {
            entries.push({
                drCr: 'Dr',
                ledger: I.igst.name,
                amount: eligIgst,
                narration: 'Input IGST under RCM (simulation)',
                proposed: true,
            });
        }
        entries.push({
            drCr: 'Cr',
            ledger: control,
            amount: eligTotal,
            narration: 'Clear RCM recoverable (simulation)',
            proposed: true,
        });
    }

    return {
        section: 'D. ITC',
        eligibility,
        itcAvailableAfterPayment: available,
        eligibleAmount: eligTotal,
        ineligibleOrBlockedAmount: ineligible,
        proposedInputLedgers: [I.cgst.name, I.sgst.name, I.igst.name],
        note: 'RCM Tax Paid and RCM ITC Eligible remain separate statuses.',
        entries,
        lifecycleAfter: lifecycle,
    };
}

function buildCancellationScenarios() {
    return {
        section: 'Cancellation / Reversal Design (simulation)',
        scenarios: [
            {
                id: 'A',
                title: 'Cancelled before RCM liability posting',
                outcome: 'No RCM accounting entry. Evaluation retained in history. Simulation marked Cancelled.',
                lifecycle: RCM_LIFECYCLE.CANCELLED,
            },
            {
                id: 'B',
                title: 'Cancelled after liability, before payment',
                outcome: 'Authorised reversal of simulated liability; audit history retained. No silent delete.',
                lifecycle: RCM_LIFECYCLE.REVERSED,
            },
            {
                id: 'C',
                title: 'Cancelled after tax payment',
                outcome: 'Do not silently reverse paid tax. Raise review/reconciliation requirement.',
                lifecycle: RCM_LIFECYCLE.REVIEW_REQUIRED,
            },
            {
                id: 'D',
                title: 'ITC already claimed',
                outcome: 'Require authorised ITC reversal workflow. Never silently delete claimed ITC.',
                lifecycle: RCM_LIFECYCLE.REVERSED,
            },
        ],
    };
}

function buildGstr3bPreview({ liability, itc }) {
    return {
        section: 'GSTR-3B Preview Mapping',
        banner: GSTR3B_PREVIEW_BANNER,
        includedInActualReturn: false,
        conceptualMapping: [
            {
                table: '3.1(d)',
                description: 'Inward supplies liable to reverse charge',
                taxableValue: liability.taxableValue,
                tax: liability.totalLiability,
            },
            {
                table: '4(A)(3)',
                description: 'ITC on inward supplies liable to reverse charge',
                amount: itc.itcAvailableAfterPayment ? itc.eligibleAmount : 0,
                note: itc.itcAvailableAfterPayment
                    ? 'Would be eligible ITC after payment (preview only)'
                    : 'Not yet available — pending payment/eligibility',
            },
            {
                table: '4(B)/ineligible',
                description: 'ITC ineligible / reversal where applicable',
                amount: itc.ineligibleOrBlockedAmount,
            },
        ],
    };
}

/**
 * @param {object} input
 * @param {object} input.decision — Phase 2A evaluate result
 * @param {boolean} [input.rcmConfirmed]
 * @param {string} [input.expenseLedgerName]
 * @param {string} [input.supplierName]
 * @param {number} [input.taxableValue]
 * @param {string} [input.gstType]
 * @param {object} [input.taxPayment]
 * @param {object} [input.itc]
 * @param {string} [input.cancellationScenario] — A|B|C|D for simulated cancel outcome
 */
export async function simulateRcmAccounting(input = {}) {
    const decision = input.decision || {};
    const gate = canSimulateRcmAccounting(decision, { rcmConfirmed: input.rcmConfirmed });

    const ledgerMap = await resolveExistingGstLedgerPresence();

    if (!gate.ok) {
        return {
            phase: '2B_A_SIMULATION_ONLY',
            postingEnabled: false,
            simulationGenerated: false,
            banner: PHASE_2B_A_BANNER,
            phase2aBanner: PHASE_2A_BANNER,
            skipReason: gate.reason,
            lifecycleStatus: decision.treatment === RCM_TREATMENTS.FORWARD_CHARGE
                ? RCM_LIFECYCLE.NOT_APPLICABLE
                : RCM_LIFECYCLE.REVIEW_REQUIRED,
            lifecycleLabel:
                decision.treatment === RCM_TREATMENTS.FORWARD_CHARGE
                    ? RCM_LIFECYCLE_LABELS.NOT_APPLICABLE
                    : RCM_LIFECYCLE_LABELS.REVIEW_REQUIRED,
            ledgerDesign: ledgerMap,
            supplierBooking: null,
            rcmLiability: null,
            taxPayment: null,
            itc: null,
            simulatedEntries: [],
            gstr3bPreview: null,
            cancellationDesign: buildCancellationScenarios(),
        };
    }

    const taxableValue =
        Number(input.taxableValue) || Number(decision.taxableValue) || 0;
    const rate =
        decision.suggestedGstRate != null
            ? Number(decision.suggestedGstRate)
            : Number(input.rate) || 18;
    const gstType = input.gstType || 'CGST / SGST';

    const supplierBooking = buildSupplierBooking({
        expenseLedgerName: input.expenseLedgerName,
        supplierName: input.supplierName,
        taxableValue,
        supplierChargedGst: input.supplierChargedGst || 0,
    });

    const rcmLiability = buildLiabilityEntries({
        taxableValue,
        rate,
        gstType,
        cessAmount: input.cessAmount || 0,
    });
    rcmLiability.rcmCategory = decision.rcmCategory || input.rcmCategory || null;

    const taxPayment = buildTaxPaymentSimulation({
        liability: rcmLiability,
        taxPayment: input.taxPayment || {},
    });

    const itc = buildItcSimulation({
        liability: rcmLiability,
        taxPayment,
        itc: input.itc || {},
    });

    let lifecycleStatus = RCM_LIFECYCLE.RCM_CONFIRMED;
    if (taxPayment.paymentStatus === 'PAID') {
        lifecycleStatus = itc.lifecycleAfter;
    } else {
        lifecycleStatus = RCM_LIFECYCLE.TAX_PAYMENT_PENDING;
    }

    if (input.cancellationScenario) {
        const scen = buildCancellationScenarios().scenarios.find(
            (s) => s.id === String(input.cancellationScenario).toUpperCase(),
        );
        if (scen) {
            lifecycleStatus = scen.lifecycle;
        }
    }

    const simulatedEntries = [
        ...supplierBooking.entries,
        ...rcmLiability.entries,
        ...taxPayment.entries,
        ...itc.entries,
    ].map((e, idx) => ({ seq: idx + 1, ...e, posted: false }));

    return {
        phase: '2B_A_SIMULATION_ONLY',
        postingEnabled: false,
        simulationGenerated: true,
        banner: PHASE_2B_A_BANNER,
        phase2aBanner: PHASE_2A_BANNER,
        lifecycleStatus,
        lifecycleLabel: RCM_LIFECYCLE_LABELS[lifecycleStatus] || lifecycleStatus,
        decisionSummary: {
            treatment: decision.treatment,
            treatmentLabel: decision.treatmentLabel,
            matchedRule: decision.matchedRule || null,
            confidence: decision.confidence,
            decisionReason: decision.decisionReason,
        },
        ledgerDesign: ledgerMap,
        supplierBooking,
        rcmLiability,
        taxPayment,
        itc,
        simulatedEntries,
        gstr3bPreview: buildGstr3bPreview({ liability: rcmLiability, itc }),
        cancellationDesign: buildCancellationScenarios(),
        documentSupport: {
            selfInvoice: {
                supportedInCrm: false,
                note: 'Design only — do not auto-generate self-invoice numbers until series approved.',
            },
            paymentVoucher: {
                autoCreate: false,
                note: 'Owner records GST payment through approved GST payment workflow later.',
            },
            fields: [
                'supplierBillReference',
                'rcmDocumentNumber',
                'rcmDocumentDate',
                'taxPeriod',
                'supportingAttachment',
            ],
        },
        registerPreviewColumns: {
            rcmEvaluationStatus: decision.treatmentLabel,
            rcmConfirmationStatus: 'RCM Confirmed (simulation)',
            rcmTaxableValue: rcmLiability.taxableValue,
            rcmCgst: rcmLiability.cgst,
            rcmSgst: rcmLiability.sgst,
            rcmIgst: rcmLiability.igst,
            liabilityPostingStatus: 'SIMULATED_NOT_POSTED',
            rcmLiabilityVoucherNumber: null,
            rcmTotalLiability: rcmLiability.totalLiability ?? (
                (Number(rcmLiability.cgst) || 0)
                + (Number(rcmLiability.sgst) || 0)
                + (Number(rcmLiability.igst) || 0)
                + (Number(rcmLiability.cess) || 0)
            ),
            rcmAmountPaid: 0,
            rcmOutstanding: null,
            taxPaymentStatus: taxPayment.paymentStatus,
            rcmTaxPaymentStatus: taxPayment.paymentStatus,
            rcmChallanReference: null,
            rcmPaymentDate: null,
            itcEligibility: itc.eligibility,
            itcAvailabilityStatus: 'Pending Eligibility Review',
            gstr3bMappingStatus: 'Not Automatically Updated',
            selfInvoiceStatus: 'NOT_GENERATED',
            gstr3bPreviewSection: '3.1(d) / 4(A)(3) — preview only',
        },
    };
}

export default {
    simulateRcmAccounting,
    canSimulateRcmAccounting,
};
