/**
 * Phase 2D — RCM GSTR-3B mapping + period reconciliation + controlled draft inclusion.
 * Does NOT create accounting JVs, supplier/bank postings, or file the return.
 * Does NOT silently alter non-RCM GSTR-3B figures or filed/locked periods.
 */
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { Voucher } from '../models/voucher.model.js';
import { Gstr3bAdjustment } from '../models/gstr3bAdjustment.model.js';
import { computeOutstanding, derivePaymentStatus, RCM_PAYMENT_STATUS } from './rcmTaxPayment.service.js';
import { computeItcBalances, deriveItcStatus } from './rcmItcRelease.service.js';
import {
    PHASE_2D_BANNER,
    PHASE_2D_INCLUDED_BANNER,
    RCM_LIABILITY_RETURN_STATUS,
    RCM_ITC_RETURN_STATUS,
    RCM_RETURN_WORKFLOW,
    RCM_MANUAL_ADJ_OPTIONS,
    RCM_ITC_ELIGIBILITY,
} from '../config/rcmAccountingDesign.js';

export { PHASE_2D_BANNER, PHASE_2D_INCLUDED_BANNER };

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const EPS = 0.009;
const zeroTax = () => ({ taxableValue: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 });

function periodKey(d) {
    if (!d) return null;
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return null;
    return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthFromPeriod(period) {
    // period YYYY-MM
    const m = String(period || '').slice(5, 7);
    return m || null;
}

function fyFromPeriod(period) {
    const y = Number(String(period || '').slice(0, 4));
    const m = Number(String(period || '').slice(5, 7));
    if (!y || !m) return null;
    // Indian FY Apr-Mar
    if (m >= 4) return `${y}-${y + 1}`;
    return `${y - 1}-${y}`;
}

function addTax(a, b) {
    return {
        taxableValue: r2((a.taxableValue || 0) + (b.taxableValue || 0)),
        cgst: r2((a.cgst || 0) + (b.cgst || 0)),
        sgst: r2((a.sgst || 0) + (b.sgst || 0)),
        igst: r2((a.igst || 0) + (b.igst || 0)),
        cess: r2((a.cess || 0) + (b.cess || 0)),
    };
}

function toAdjEntry(t = {}) {
    return {
        taxableValue: r2(t.taxableValue),
        centralTax: r2(t.cgst),
        stateUtTax: r2(t.sgst),
        integratedTax: r2(t.igst),
        cess: r2(t.cess),
    };
}

function fromAdjEntry(e = {}) {
    return {
        taxableValue: r2(e.taxableValue),
        cgst: r2(e.centralTax),
        sgst: r2(e.stateUtTax),
        igst: r2(e.integratedTax),
        cess: r2(e.cess),
    };
}

export function buildInclusionIdempotencyKey({
    companyId,
    returnPeriod,
    reconciliationVersion,
    liabilityIds,
    itcReleaseIds,
}) {
    const liab = [...(liabilityIds || [])].map(String).sort().join(',');
    const itc = [...(itcReleaseIds || [])].map(String).sort().join(',');
    return [
        String(companyId || ''),
        'RCM_GSTR3B_INCLUSION',
        String(returnPeriod || ''),
        `v${Number(reconciliationVersion) || 1}`,
        liab,
        itc,
    ].join('|');
}

function assertPeriodOpen(adjDoc) {
    const st = String(adjDoc?.status || 'Draft');
    if (['Finalized', 'Filed', 'Locked'].includes(st) || adjDoc?.rcmPhase2?.workflowStatus === RCM_RETURN_WORKFLOW.FILED_LOCKED) {
        throw new ApiError(
            400,
            `Return period is ${st === 'Draft' ? 'FILED/LOCKED' : st} — direct RCM mapping changes are prohibited. Use amendment workflow.`,
        );
    }
}

async function loadOrCreateAdjustment({ companyId, financialYear, month }) {
    let doc = await Gstr3bAdjustment.findOne({ financialYear, month, companyId });
    // Unique index is (financialYear, month) only — fall back if companyId type/filter misses.
    if (!doc) {
        doc = await Gstr3bAdjustment.findOne({ financialYear, month });
    }
    if (!doc) {
        try {
            doc = await Gstr3bAdjustment.create({
                financialYear,
                month,
                companyId,
                status: 'Draft',
                rcmPhase2: null,
            });
        } catch (e) {
            // Race / unique index: re-load
            doc = await Gstr3bAdjustment.findOne({ financialYear, month });
            if (!doc) throw e;
        }
    }
    if (companyId && !doc.companyId) {
        doc.companyId = companyId;
    }
    return doc;
}

/**
 * Build transaction-level RCM reconciliation rows for a return period.
 * Period membership: liability posting period OR payment period OR ITC release period matches returnPeriod.
 */
export async function buildRcmReconciliationRegister({
    companyId,
    returnPeriod,
    financialYear,
} = {}) {
    if (!companyId) throw new ApiError(400, 'companyId is required');
    if (!returnPeriod || !/^\d{4}-\d{2}$/.test(returnPeriod)) {
        throw new ApiError(400, 'returnPeriod must be YYYY-MM');
    }
    const fy = financialYear || fyFromPeriod(returnPeriod);
    const month = monthFromPeriod(returnPeriod);

    const liabilities = await Voucher.find({
        companyId,
        isSystemGenerated: true,
        'rcmLiabilityMeta.kind': 'RCM_LIABILITY',
    }).lean();

    const rows = [];
    const summary = {
        liability: {
            evaluated: 0,
            confirmed: 0,
            posted: 0,
            paid: 0,
            unpaid: 0,
            reversed: 0,
            proposed: 0,
            included: 0,
            totals: zeroTax(),
            paidTotals: zeroTax(),
            unpaidTotals: zeroTax(),
        },
        itc: {
            taxPaid: zeroTax(),
            fullyEligible: zeroTax(),
            partlyEligible: zeroTax(),
            ineligible: zeroTax(),
            blocked: zeroTax(),
            releasedInBooks: zeroTax(),
            reversed: zeroTax(),
            proposed: zeroTax(),
            included: zeroTax(),
            pending: zeroTax(),
        },
    };

    for (const v of liabilities) {
        const m = v.rcmLiabilityMeta || {};
        const liabilityPeriod = periodKey(v.date || m.postedAt);
        const lastPay = (m.payments || []).filter((p) => p.status !== 'REVERSED').slice(-1)[0];
        const paymentPeriod = periodKey(lastPay?.paymentDate || m.lastPaymentDate);
        const lastRelease = (m.itcReleases || []).filter((r) => r.status !== 'REVERSED').slice(-1)[0];
        const itcReleasePeriod = periodKey(lastRelease?.releaseDate || lastRelease?.releasedAt);
        const proposedItcClaimPeriod = itcReleasePeriod || paymentPeriod || liabilityPeriod;

        const inScope = [liabilityPeriod, paymentPeriod, itcReleasePeriod, proposedItcClaimPeriod]
            .includes(returnPeriod);
        if (!inScope) continue;

        const outstanding = computeOutstanding(m);
        const payStatus = derivePaymentStatus(m);
        const itcBal = computeItcBalances(m);
        const itcStatus = deriveItcStatus(m);
        const decision = m.itcReview?.eligibilityDecision;

        const exceptions = [];
        if (m.postingStatus === 'POSTED' && payStatus !== RCM_PAYMENT_STATUS.PAID) {
            exceptions.push({
                code: 'LIABILITY_UNPAID',
                message: 'RCM liability posted but not fully paid',
                action: 'Record full RCM tax payment before return inclusion',
            });
        }
        if (payStatus === RCM_PAYMENT_STATUS.PAID && outstanding.totalPaid + EPS < r2(m.totalLiability || 0)) {
            exceptions.push({
                code: 'PAID_LESS_THAN_LIABILITY',
                message: 'Paid amount lower than liability',
                action: 'Reconcile payment components',
            });
        }
        if (outstanding.totalPaid > r2(m.totalLiability || 0) + EPS) {
            exceptions.push({
                code: 'PAID_MORE_THAN_LIABILITY',
                message: 'Paid amount higher than liability',
                action: 'Review overpayment / challan allocation',
            });
        }
        if (itcBal.released.totalReleased > EPS && payStatus !== RCM_PAYMENT_STATUS.PAID) {
            exceptions.push({
                code: 'ITC_BEFORE_FULL_PAYMENT',
                message: 'ITC released before full payment',
                action: 'Investigate — should not occur under Phase 2C gates',
            });
        }
        if (itcBal.released.totalReleased > itcBal.paid.totalPaid + EPS) {
            exceptions.push({
                code: 'ITC_EXCEEDS_TAX_PAID',
                message: 'ITC released more than tax paid',
                action: 'Reverse excess ITC release',
            });
        }
        if (!lastPay?.challanReference && !m.lastChallanReference && payStatus === RCM_PAYMENT_STATUS.PAID) {
            exceptions.push({
                code: 'MISSING_CHALLAN',
                message: 'Missing challan reference',
                action: 'Capture challan on payment record',
            });
        }
        if (!m.ruleId && !m.ruleCode) {
            exceptions.push({
                code: 'MISSING_RULE_SNAPSHOT',
                message: 'Missing approved rule snapshot',
                action: 'Review liability posting audit',
            });
        }
        if (!m.ledgerMap?.recoverableId) {
            exceptions.push({
                code: 'MISSING_LEDGER_MAP',
                message: 'Missing RCM ledger mapping',
                action: 'Ensure RCM ledgers before inclusion',
            });
        }
        if ([liabilityPeriod, paymentPeriod, itcReleasePeriod].filter(Boolean).length > 1) {
            const distinct = [...new Set([liabilityPeriod, paymentPeriod, itcReleasePeriod].filter(Boolean))];
            if (distinct.length > 1) {
                exceptions.push({
                    code: 'MULTI_PERIOD_DATES',
                    message: `Dates span periods: ${distinct.join(', ')}`,
                    action: 'Review Liability / Payment / ITC Availability / Proposed Claim periods',
                });
            }
        }
        if (m.postingStatus === 'REVERSED') {
            exceptions.push({
                code: 'LIABILITY_REVERSED',
                message: 'Liability reversed',
                action: 'Exclude from proposed return figures',
            });
        }

        let liabilityReturnStatus = RCM_LIABILITY_RETURN_STATUS.POSTED;
        if (m.postingStatus === 'REVERSED') liabilityReturnStatus = RCM_LIABILITY_RETURN_STATUS.REVERSED;
        else if (payStatus === RCM_PAYMENT_STATUS.PAID) liabilityReturnStatus = RCM_LIABILITY_RETURN_STATUS.PAID;
        else if (payStatus === RCM_PAYMENT_STATUS.PARTLY_PAID) liabilityReturnStatus = RCM_LIABILITY_RETURN_STATUS.PARTLY_PAID;

        let itcReturnStatus = RCM_ITC_RETURN_STATUS.NOT_ELIGIBLE_YET;
        if (decision === RCM_ITC_ELIGIBILITY.INELIGIBLE) itcReturnStatus = RCM_ITC_RETURN_STATUS.INELIGIBLE;
        else if (decision === RCM_ITC_ELIGIBILITY.BLOCKED) itcReturnStatus = RCM_ITC_RETURN_STATUS.BLOCKED;
        else if (itcBal.released.totalReleased > EPS) itcReturnStatus = RCM_ITC_RETURN_STATUS.RELEASED_IN_BOOKS;
        else if (decision === RCM_ITC_ELIGIBILITY.PARTLY_ELIGIBLE) itcReturnStatus = RCM_ITC_RETURN_STATUS.PARTLY_ELIGIBLE;
        else if (decision === RCM_ITC_ELIGIBILITY.FULLY_ELIGIBLE) itcReturnStatus = RCM_ITC_RETURN_STATUS.ELIGIBLE;
        else if (payStatus === RCM_PAYMENT_STATUS.PAID) itcReturnStatus = RCM_ITC_RETURN_STATUS.PENDING_REVIEW;

        const includeLiability = m.postingStatus === 'POSTED'
            && payStatus === RCM_PAYMENT_STATUS.PAID
            && liabilityPeriod === returnPeriod;
        const includeItc = m.postingStatus === 'POSTED'
            && itcBal.released.totalReleased > EPS
            && (itcReleasePeriod === returnPeriod || (!itcReleasePeriod && paymentPeriod === returnPeriod));

        if (exceptions.some((e) => e.code === 'LIABILITY_REVERSED')) {
            // excluded
        }

        const row = {
            liabilityId: v._id,
            sourceModule: m.sourceModule,
            sourceVoucherNumber: m.sourceVoucherNumber,
            sourceVoucherId: m.sourceVoucherId,
            sourceVoucherDate: m.sourceVoucherDate,
            supplier: m.supplierName,
            supplierGstStatus: m.supplierGstStatus || '—',
            expensePurchaseLedger: m.expensePurchaseLedgerName,
            rcmCategory: m.rcmCategory,
            ruleId: m.ruleId,
            ruleCode: m.ruleCode,
            ruleVersion: m.ruleVersion,
            taxableValue: m.taxableValue,
            cgstLiability: m.cgst,
            sgstLiability: m.sgst,
            igstLiability: m.igst,
            cessLiability: m.cess,
            liabilityPostingVoucher: v.voucherNo,
            liabilityStatus: m.postingStatus,
            amountPaid: outstanding.totalPaid,
            outstanding: outstanding.total,
            challanReference: lastPay?.challanReference || m.lastChallanReference,
            paymentDate: lastPay?.paymentDate || m.lastPaymentDate,
            itcEligibility: decision || itcStatus,
            eligibleItc: itcBal.eligible.total,
            itcReleasedInBooks: itcBal.released.totalReleased,
            itcReversed: itcBal.reversed.totalReversed,
            itcProposedForGstr3b: includeItc ? itcBal.released.totalReleased : 0,
            itcIncludedInGstr3b: 0,
            liabilityReturnStatus,
            itcReturnStatus,
            periods: {
                liabilityPeriod,
                paymentPeriod,
                itcAvailabilityPeriod: itcReleasePeriod,
                proposedItcClaimPeriod,
                periodBasis: {
                    liability: 'liability posting voucher date',
                    payment: 'last RCM tax payment date',
                    itc: 'last ITC release date',
                    proposedClaim: 'ITC release date, else payment date, else liability date',
                },
            },
            proposedLiability: includeLiability
                ? {
                    taxableValue: r2(m.taxableValue),
                    cgst: r2(m.cgst),
                    sgst: r2(m.sgst),
                    igst: r2(m.igst),
                    cess: r2(m.cess),
                }
                : zeroTax(),
            proposedItc: includeItc
                ? {
                    taxableValue: 0,
                    cgst: r2(itcBal.released.cgstReleased),
                    sgst: r2(itcBal.released.sgstReleased),
                    igst: r2(itcBal.released.igstReleased),
                    cess: r2(itcBal.released.cessReleased),
                }
                : zeroTax(),
            exceptions,
            exception: exceptions.map((e) => e.code).join(', ') || null,
            approvalStatus: 'PENDING',
            difference: exceptions.length ? 'HAS_EXCEPTIONS' : 'OK',
            gstr3bBatchVersion: null,
            itcReleaseVoucher: lastRelease?.releaseVoucherNumber || m.lastItcReleaseVoucherNumber,
            paymentVoucher: lastPay?.paymentVoucherNumber,
            reviewer: m.itcReview?.reviewerId || null,
            reviewDate: m.itcReview?.reviewedAt || null,
        };

        // Summary tallies
        summary.liability.evaluated += 1;
        if (m.postingStatus === 'POSTED') summary.liability.posted += 1;
        if (m.postingStatus === 'REVERSED') summary.liability.reversed += 1;
        if (payStatus === RCM_PAYMENT_STATUS.PAID) summary.liability.paid += 1;
        else if (m.postingStatus === 'POSTED') summary.liability.unpaid += 1;
        if (includeLiability) {
            summary.liability.proposed += 1;
            summary.liability.totals = addTax(summary.liability.totals, row.proposedLiability);
        }
        summary.itc.taxPaid = addTax(summary.itc.taxPaid, {
            taxableValue: 0,
            cgst: itcBal.paid.cgstPaid,
            sgst: itcBal.paid.sgstPaid,
            igst: itcBal.paid.igstPaid,
            cess: itcBal.paid.cessPaid,
        });
        if (decision === RCM_ITC_ELIGIBILITY.FULLY_ELIGIBLE) {
            summary.itc.fullyEligible = addTax(summary.itc.fullyEligible, {
                ...itcBal.eligible,
                taxableValue: 0,
            });
        }
        if (decision === RCM_ITC_ELIGIBILITY.PARTLY_ELIGIBLE) {
            summary.itc.partlyEligible = addTax(summary.itc.partlyEligible, {
                ...itcBal.eligible,
                taxableValue: 0,
            });
        }
        if (decision === RCM_ITC_ELIGIBILITY.INELIGIBLE) {
            summary.itc.ineligible = addTax(summary.itc.ineligible, {
                ...itcBal.ineligible,
                taxableValue: 0,
            });
        }
        if (decision === RCM_ITC_ELIGIBILITY.BLOCKED) {
            summary.itc.blocked = addTax(summary.itc.blocked, {
                taxableValue: 0,
                cgst: itcBal.paid.cgstPaid,
                sgst: itcBal.paid.sgstPaid,
                igst: itcBal.paid.igstPaid,
                cess: itcBal.paid.cessPaid,
            });
        }
        summary.itc.releasedInBooks = addTax(summary.itc.releasedInBooks, {
            taxableValue: 0,
            cgst: itcBal.released.cgstReleased,
            sgst: itcBal.released.sgstReleased,
            igst: itcBal.released.igstReleased,
            cess: itcBal.released.cessReleased,
        });
        if (includeItc) {
            summary.itc.proposed = addTax(summary.itc.proposed, row.proposedItc);
        } else if (payStatus === RCM_PAYMENT_STATUS.PAID && itcBal.released.totalReleased <= EPS) {
            summary.itc.pending = addTax(summary.itc.pending, {
                taxableValue: 0,
                cgst: itcBal.paid.cgstPaid,
                sgst: itcBal.paid.sgstPaid,
                igst: itcBal.paid.igstPaid,
                cess: itcBal.paid.cessPaid,
            });
        }

        rows.push(row);
    }

    const adj = await Gstr3bAdjustment.findOne({ companyId, financialYear: fy, month }).lean();
    const phase2 = adj?.rcmPhase2 || null;
    if (phase2?.inclusion?.includedLiabilityIds?.length) {
        const set = new Set(phase2.inclusion.includedLiabilityIds.map(String));
        for (const row of rows) {
            if (set.has(String(row.liabilityId))) {
                row.liabilityReturnStatus = RCM_LIABILITY_RETURN_STATUS.INCLUDED_IN_RETURN;
                row.itcIncludedInGstr3b = row.itcProposedForGstr3b;
                if (row.itcProposedForGstr3b > EPS) {
                    row.itcReturnStatus = RCM_ITC_RETURN_STATUS.INCLUDED_IN_RETURN;
                }
                row.approvalStatus = phase2.workflowStatus || 'INCLUDED';
                row.gstr3bBatchVersion = phase2.inclusion?.version || phase2.version;
            }
        }
        summary.liability.included = phase2.inclusion.includedLiabilityIds.length;
        if (phase2.inclusion.liabilityTotals) {
            summary.liability.totals = phase2.inclusion.liabilityTotals;
        }
        if (phase2.inclusion.itcTotals) {
            summary.itc.included = phase2.inclusion.itcTotals;
        }
    }

    const excluded = {
        unpaidLiability: rows.filter((r) => r.exceptions.some((e) => e.code === 'LIABILITY_UNPAID')),
        unresolvedExceptions: rows.filter((r) => r.exceptions.length && r.liabilityReturnStatus !== RCM_LIABILITY_RETURN_STATUS.REVERSED),
        blockedIneligibleItc: rows.filter((r) => ['BLOCKED', 'INELIGIBLE'].includes(r.itcReturnStatus)),
        reversed: rows.filter((r) => r.liabilityReturnStatus === RCM_LIABILITY_RETURN_STATUS.REVERSED),
        reviewRequired: rows.filter((r) => r.itcReturnStatus === RCM_ITC_RETURN_STATUS.PENDING_REVIEW),
    };

    return {
        banner: PHASE_2D_BANNER,
        returnPeriod,
        financialYear: fy,
        month,
        companyId,
        rows,
        summary,
        preview: {
            label: PHASE_2D_BANNER,
            liabilityProposed: summary.liability.totals,
            itcProposed: summary.itc.proposed,
            excluded,
            mapping: {
                liabilityTable: '3.1(d) — Inward supplies liable to reverse charge',
                itcTable: '4(A)(3) — ITC on inward supplies liable to reverse charge',
            },
        },
        workflow: phase2 || {
            workflowStatus: RCM_RETURN_WORKFLOW.DRAFT,
            version: 0,
        },
        existingManual: {
            table4InwardRcm: fromAdjEntry(adj?.table4?.inwardRcm || {}),
            manualRcmLiability: fromAdjEntry(adj?.manualAdjustments?.rcmLiability || {}),
            status: adj?.status || 'Draft',
        },
        periodLocked: ['Finalized', 'Filed', 'Locked'].includes(String(adj?.status || 'Draft'))
            || phase2?.workflowStatus === RCM_RETURN_WORKFLOW.FILED_LOCKED,
    };
}

function eligibleProposedRows(rows) {
    return rows.filter((r) => {
        if (r.liabilityReturnStatus === RCM_LIABILITY_RETURN_STATUS.REVERSED) return false;
        const hard = r.exceptions.some((e) =>
            ['LIABILITY_UNPAID', 'ITC_BEFORE_FULL_PAYMENT', 'ITC_EXCEEDS_TAX_PAID', 'LIABILITY_REVERSED'].includes(e.code));
        return !hard && (r.proposedLiability.cgst + r.proposedLiability.sgst + r.proposedLiability.igst > EPS
            || r.proposedItc.cgst + r.proposedItc.sgst + r.proposedItc.igst > EPS
            || r.proposedLiability.taxableValue > EPS);
    });
}

/**
 * Prepare mapping batch for the period (no inclusion yet).
 */
export async function prepareRcmReturnMapping(input = {}) {
    const companyId = input.companyId;
    const returnPeriod = input.returnPeriod;
    const register = await buildRcmReconciliationRegister({
        companyId,
        returnPeriod,
        financialYear: input.financialYear,
    });
    const adj = await loadOrCreateAdjustment({
        companyId,
        financialYear: register.financialYear,
        month: register.month,
    });
    assertPeriodOpen(adj);

    const excludeIds = new Set((input.excludeLiabilityIds || []).map((id) => String(id)));
    let proposedRows = eligibleProposedRows(register.rows).filter(
        (r) => !excludeIds.has(String(r.liabilityId)),
    );

    // Draft cleanup: rebuild from prior inclusion sourceRefs minus excluded IDs
    // so unrelated already-included figures are preserved (e.g. remove one QA JV only).
    if (
        input.rebuildFromPriorInclusion === true
        && excludeIds.size
        && Array.isArray(adj.rcmPhase2?.inclusion?.sourceRefs)
        && adj.rcmPhase2.inclusion.sourceRefs.length
    ) {
        const kept = adj.rcmPhase2.inclusion.sourceRefs.filter(
            (ref) => !excludeIds.has(String(ref.liabilityId)),
        );
        proposedRows = kept.map((ref) => ({
            liabilityId: ref.liabilityId,
            liabilityPostingVoucher: ref.liabilityVoucher,
            paymentVoucher: ref.paymentVoucher,
            itcReleaseVoucher: ref.itcReleaseVoucher,
            proposedLiability: ref.proposedLiability || zeroTax(),
            proposedItc: ref.proposedItc || zeroTax(),
            itcProposedForGstr3b:
                (ref.proposedItc?.cgst || 0)
                + (ref.proposedItc?.sgst || 0)
                + (ref.proposedItc?.igst || 0),
            exceptions: [],
        }));
    }

    const liabilityTotals = proposedRows.reduce((a, r) => addTax(a, r.proposedLiability), zeroTax());
    const itcTotals = proposedRows.reduce((a, r) => addTax(a, r.proposedItc), zeroTax());
    const version = (adj.rcmPhase2?.version || 0) + 1;

    const batch = {
        workflowStatus: RCM_RETURN_WORKFLOW.PREPARED,
        version,
        returnPeriod,
        preparedBy: input.userId || null,
        preparedAt: new Date(),
        reviewedBy: null,
        reviewedAt: null,
        approvedBy: null,
        approvedAt: null,
        remarks: input.remarks || '',
        liabilityIds: proposedRows.map((r) => r.liabilityId),
        itcReleaseRefs: proposedRows
            .filter((r) => r.itcProposedForGstr3b > EPS)
            .map((r) => ({ liabilityId: r.liabilityId, releaseVoucher: r.itcReleaseVoucher })),
        totalsSnapshot: { liabilityTotals, itcTotals },
        rowSnapshot: proposedRows,
        exceptionsSnapshot: register.rows.filter((r) => r.exceptions.length),
        inclusion: adj.rcmPhase2?.inclusion || null,
        amendments: adj.rcmPhase2?.amendments || [],
        audit: [
            ...(adj.rcmPhase2?.audit || []),
            {
                at: new Date(),
                action: 'PREPARED',
                userId: input.userId || null,
                detail: `Prepared v${version} — liability ₹${liabilityTotals.cgst + liabilityTotals.sgst + liabilityTotals.igst}, ITC ₹${itcTotals.cgst + itcTotals.sgst + itcTotals.igst}`,
            },
        ],
    };

    adj.rcmPhase2 = batch;
    adj.auditLog = [
        ...(adj.auditLog || []),
        {
            action: 'RCM_PHASE2_PREPARED',
            performedBy: input.userId || null,
            timestamp: new Date(),
            newValues: { version, returnPeriod, liabilityTotals, itcTotals },
            reason: input.remarks || '',
        },
    ];
    await adj.save();

    return {
        banner: PHASE_2D_BANNER,
        message: 'RCM return mapping prepared. Review and approve before draft inclusion.',
        workflow: batch,
        register,
    };
}

export async function reviewRcmReturnMapping(input = {}) {
    const adj = await loadOrCreateAdjustment({
        companyId: input.companyId,
        financialYear: input.financialYear || fyFromPeriod(input.returnPeriod),
        month: monthFromPeriod(input.returnPeriod),
    });
    assertPeriodOpen(adj);
    const phase2 = adj.rcmPhase2;
    if (!phase2 || phase2.workflowStatus !== RCM_RETURN_WORKFLOW.PREPARED) {
        throw new ApiError(400, 'Mapping must be PREPARED before review');
    }
    if (input.enforceRoleSeparation && phase2.preparedBy && input.userId
        && String(phase2.preparedBy) === String(input.userId)) {
        throw new ApiError(403, 'Same user cannot prepare and review when role separation is configured');
    }
    phase2.workflowStatus = RCM_RETURN_WORKFLOW.REVIEWED;
    phase2.reviewedBy = input.userId || null;
    phase2.reviewedAt = new Date();
    phase2.remarks = input.remarks || phase2.remarks;
    phase2.audit.push({
        at: new Date(),
        action: 'REVIEWED',
        userId: input.userId || null,
        detail: input.remarks || 'Reviewed',
    });
    adj.rcmPhase2 = phase2;
    adj.markModified('rcmPhase2');
    await adj.save();
    return { banner: PHASE_2D_BANNER, message: 'RCM mapping reviewed.', workflow: phase2 };
}

export async function approveRcmReturnMapping(input = {}) {
    const adj = await loadOrCreateAdjustment({
        companyId: input.companyId,
        financialYear: input.financialYear || fyFromPeriod(input.returnPeriod),
        month: monthFromPeriod(input.returnPeriod),
    });
    assertPeriodOpen(adj);
    const phase2 = adj.rcmPhase2;
    if (!phase2 || ![RCM_RETURN_WORKFLOW.PREPARED, RCM_RETURN_WORKFLOW.REVIEWED].includes(phase2.workflowStatus)) {
        throw new ApiError(400, 'Mapping must be PREPARED or REVIEWED before approve');
    }
    if (input.enforceRoleSeparation && phase2.preparedBy && input.userId
        && String(phase2.preparedBy) === String(input.userId)) {
        throw new ApiError(403, 'Same user cannot prepare and approve when role separation is configured');
    }
    phase2.workflowStatus = RCM_RETURN_WORKFLOW.APPROVED;
    phase2.approvedBy = input.userId || null;
    phase2.approvedAt = new Date();
    phase2.remarks = input.remarks || phase2.remarks;
    phase2.audit.push({
        at: new Date(),
        action: 'APPROVED',
        userId: input.userId || null,
        detail: input.remarks || 'Approved for draft GSTR-3B inclusion',
    });
    adj.rcmPhase2 = phase2;
    adj.markModified('rcmPhase2');
    await adj.save();
    return {
        banner: PHASE_2D_BANNER,
        message: 'RCM mapping approved. Authorised user may include figures in draft GSTR-3B.',
        workflow: phase2,
    };
}

/**
 * Include approved RCM figures into draft GSTR-3B working data (idempotent).
 * Updates table4.inwardRcm + manualAdjustments.rcmLiability only for Phase 2 batch.
 */
export async function includeApprovedRcmInDraftGstr3b(input = {}) {
    if (input.confirmInclude !== true || input.checkboxAccepted !== true) {
        throw new ApiError(400, 'confirmInclude=true and checkboxAccepted=true are required');
    }
    const companyId = input.companyId;
    const returnPeriod = input.returnPeriod;
    const adj = await loadOrCreateAdjustment({
        companyId,
        financialYear: input.financialYear || fyFromPeriod(returnPeriod),
        month: monthFromPeriod(returnPeriod),
    });
    assertPeriodOpen(adj);
    const phase2 = adj.rcmPhase2;
    if (!phase2 || phase2.workflowStatus !== RCM_RETURN_WORKFLOW.APPROVED) {
        if (phase2?.workflowStatus === RCM_RETURN_WORKFLOW.INCLUDED_IN_DRAFT_RETURN && phase2.inclusion) {
            return {
                status: 'ALREADY_INCLUDED',
                banner: PHASE_2D_INCLUDED_BANNER,
                message: 'This RCM inclusion batch is already present in draft GSTR-3B.',
                workflow: phase2,
                alreadyIncluded: true,
            };
        }
        throw new ApiError(400, 'Mapping must be APPROVED before inclusion');
    }

    const liabilityTotals = phase2.totalsSnapshot?.liabilityTotals || zeroTax();
    const itcTotals = phase2.totalsSnapshot?.itcTotals || zeroTax();
    const liabilityIds = (phase2.liabilityIds || []).map(String);
    const priorIncludedIds = (phase2.inclusion?.includedLiabilityIds || []).map(String);
    const itcReleaseIds = (phase2.itcReleaseRefs || []).map((r) => String(r.releaseVoucher || r.liabilityId));
    const idempotencyKey = buildInclusionIdempotencyKey({
        companyId,
        returnPeriod,
        reconciliationVersion: phase2.version,
        liabilityIds,
        itcReleaseIds,
    });

    if (phase2.inclusion?.idempotencyKey === idempotencyKey) {
        return {
            status: 'ALREADY_INCLUDED',
            banner: PHASE_2D_INCLUDED_BANNER,
            message: 'This RCM inclusion batch is already present in draft GSTR-3B.',
            workflow: phase2,
            alreadyIncluded: true,
        };
    }

    const existingManualItc = fromAdjEntry(adj.table4?.inwardRcm || {});
    const existingManualLiab = fromAdjEntry(adj.manualAdjustments?.rcmLiability || {});
    const hasManual = (existingManualItc.cgst + existingManualItc.sgst + existingManualItc.igst
        + existingManualLiab.cgst + existingManualLiab.sgst + existingManualLiab.igst) > EPS;

    const manualOption = String(input.manualAdjustmentOption || RCM_MANUAL_ADJ_OPTIONS.REPLACE_WITH_APPROVED);
    if (hasManual && !input.manualAdjustmentOption) {
        return {
            status: 'MANUAL_ADJUSTMENT_CONFLICT',
            banner: PHASE_2D_BANNER,
            message: 'Existing manual RCM adjustment found. Choose how to proceed.',
            existingManual: { itc: existingManualItc, liability: existingManualLiab },
            systemCalculated: { liability: liabilityTotals, itc: itcTotals },
            options: Object.values(RCM_MANUAL_ADJ_OPTIONS),
            requiresConfirmation: true,
        };
    }

    if (manualOption === RCM_MANUAL_ADJ_OPTIONS.EXCLUDE_CURRENT_BATCH) {
        phase2.audit.push({
            at: new Date(),
            action: 'INCLUSION_EXCLUDED',
            userId: input.userId || null,
            detail: 'User excluded current batch; manual figures kept',
        });
        adj.rcmPhase2 = phase2;
        adj.markModified('rcmPhase2');
        await adj.save();
        return {
            status: 'EXCLUDED',
            banner: PHASE_2D_BANNER,
            message: 'Current RCM batch excluded. Manual adjustment retained.',
            workflow: phase2,
        };
    }

    const before = {
        table4InwardRcm: { ...(adj.table4?.inwardRcm?.toObject?.() || adj.table4?.inwardRcm || {}) },
        manualRcmLiability: {
            ...(adj.manualAdjustments?.rcmLiability?.toObject?.()
                || adj.manualAdjustments?.rcmLiability
                || {}),
        },
    };

    let nextItc = toAdjEntry(itcTotals);
    let nextLiab = toAdjEntry(liabilityTotals);
    if (manualOption === RCM_MANUAL_ADJ_OPTIONS.KEEP_MANUAL) {
        nextItc = toAdjEntry(existingManualItc);
        nextLiab = toAdjEntry(existingManualLiab);
    } else if (manualOption === RCM_MANUAL_ADJ_OPTIONS.ADD_ONLY_DIFFERENCE) {
        nextItc = toAdjEntry({
            taxableValue: Math.max(0, itcTotals.taxableValue - existingManualItc.taxableValue),
            cgst: Math.max(0, itcTotals.cgst - existingManualItc.cgst),
            sgst: Math.max(0, itcTotals.sgst - existingManualItc.sgst),
            igst: Math.max(0, itcTotals.igst - existingManualItc.igst),
            cess: Math.max(0, itcTotals.cess - existingManualItc.cess),
        });
        // For ADD_ONLY_DIFFERENCE on ITC slot: applyAdj adds to auto PI RCM; store difference only.
        nextLiab = toAdjEntry({
            taxableValue: Math.max(0, liabilityTotals.taxableValue - existingManualLiab.taxableValue),
            cgst: Math.max(0, liabilityTotals.cgst - existingManualLiab.cgst),
            sgst: Math.max(0, liabilityTotals.sgst - existingManualLiab.sgst),
            igst: Math.max(0, liabilityTotals.igst - existingManualLiab.igst),
            cess: Math.max(0, liabilityTotals.cess - existingManualLiab.cess),
        });
    }

    if (!adj.table4) adj.table4 = {};
    adj.table4.inwardRcm = nextItc;
    if (!adj.manualAdjustments) adj.manualAdjustments = {};
    adj.manualAdjustments.rcmLiability = nextLiab;

    phase2.workflowStatus = RCM_RETURN_WORKFLOW.INCLUDED_IN_DRAFT_RETURN;
    phase2.inclusion = {
        idempotencyKey,
        version: phase2.version,
        includedAt: new Date(),
        includedBy: input.userId || null,
        manualOption,
        includedLiabilityIds: liabilityIds,
        liabilityTotals,
        itcTotals,
        appliedItcAdjustment: nextItc,
        appliedLiabilityAdjustment: nextLiab,
        beforeSnapshot: before,
        sourceRefs: phase2.rowSnapshot?.map((r) => ({
            liabilityId: r.liabilityId,
            liabilityVoucher: r.liabilityPostingVoucher,
            paymentVoucher: r.paymentVoucher,
            itcReleaseVoucher: r.itcReleaseVoucher,
            proposedLiability: r.proposedLiability,
            proposedItc: r.proposedItc,
        })) || [],
    };
    phase2.audit.push({
        at: new Date(),
        action: 'INCLUDED_IN_DRAFT_GSTR3B',
        userId: input.userId || null,
        detail: `Included v${phase2.version} via ${manualOption}`,
    });
    adj.rcmPhase2 = phase2;
    adj.markModified('rcmPhase2');
    adj.markModified('table4');
    adj.markModified('manualAdjustments');
    adj.auditLog = [
        ...(adj.auditLog || []),
        {
            action: 'RCM_PHASE2_INCLUDED',
            performedBy: input.userId || null,
            timestamp: new Date(),
            oldValues: before,
            newValues: { nextItc, nextLiab, idempotencyKey },
            reason: input.remarks || '',
        },
    ];
    await adj.save();

    // Stamp vouchers mapping status (no new JV)
    if (liabilityIds.length) {
        await Voucher.updateMany(
            { _id: { $in: liabilityIds }, companyId },
            {
                $set: {
                    'rcmLiabilityMeta.gstr3bMappingStatus': 'INCLUDED_IN_DRAFT_RETURN',
                    'rcmLiabilityMeta.gstr3bInclusionVersion': phase2.version,
                    'rcmLiabilityMeta.gstr3bReturnPeriod': returnPeriod,
                },
                $push: {
                    'rcmLiabilityMeta.auditHistory': {
                        at: new Date(),
                        action: 'GSTR3B_DRAFT_INCLUDED',
                        userId: input.userId || null,
                        detail: `Included in draft GSTR-3B ${returnPeriod} v${phase2.version}`,
                    },
                },
            },
        );
    }

    // Clear mapping on liabilities removed from this inclusion batch (draft exclusion)
    const removedIds = priorIncludedIds.filter((id) => !liabilityIds.includes(String(id)));
    if (removedIds.length) {
        const removedOids = removedIds
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
            .map((id) => new mongoose.Types.ObjectId(String(id)));
        await Voucher.updateMany(
            { _id: { $in: removedOids }, companyId },
            {
                $set: {
                    'rcmLiabilityMeta.gstr3bMappingStatus': 'EXCLUDED_FROM_DRAFT_RETURN',
                },
                $push: {
                    'rcmLiabilityMeta.auditHistory': {
                        at: new Date(),
                        action: 'GSTR3B_DRAFT_EXCLUDED',
                        userId: input.userId || null,
                        detail: `Excluded from draft GSTR-3B ${returnPeriod} v${phase2.version}: ${input.remarks || ''}`.trim(),
                    },
                },
            },
        );
    }

    return {
        status: 'INCLUDED',
        banner: PHASE_2D_INCLUDED_BANNER,
        message: 'Approved RCM figures included in draft GSTR-3B working data. Return not filed. No accounting JV created.',
        workflow: phase2,
        before,
        after: { itc: nextItc, liability: nextLiab },
        alreadyIncluded: false,
        accountingUnchanged: true,
        excludedLiabilityIds: removedIds,
    };
}

export async function lockRcmGstr3bPeriod(input = {}) {
    if (input.confirmLock !== true) throw new ApiError(400, 'confirmLock=true is required');
    const adj = await loadOrCreateAdjustment({
        companyId: input.companyId,
        financialYear: input.financialYear || fyFromPeriod(input.returnPeriod),
        month: monthFromPeriod(input.returnPeriod),
    });
    const phase2 = adj.rcmPhase2 || { audit: [] };
    if (phase2.workflowStatus !== RCM_RETURN_WORKFLOW.INCLUDED_IN_DRAFT_RETURN
        && !phase2.inclusion) {
        throw new ApiError(400, 'Include approved RCM figures in draft return before locking');
    }
    adj.status = 'Locked';
    phase2.workflowStatus = RCM_RETURN_WORKFLOW.FILED_LOCKED;
    phase2.lockedBy = input.userId || null;
    phase2.lockedAt = new Date();
    phase2.audit = [
        ...(phase2.audit || []),
        {
            at: new Date(),
            action: 'LOCKED',
            userId: input.userId || null,
            detail: input.remarks || 'Period locked — amendments required for further changes',
        },
    ];
    adj.rcmPhase2 = phase2;
    adj.markModified('rcmPhase2');
    await adj.save();
    return {
        message: 'RCM GSTR-3B period locked. Direct changes prohibited; use amendment workflow.',
        workflow: phase2,
        status: adj.status,
    };
}

export async function createRcmGstr3bAmendment(input = {}) {
    const reason = String(input.reason || '').trim();
    if (!reason) throw new ApiError(400, 'Amendment reason is required');
    const adj = await loadOrCreateAdjustment({
        companyId: input.companyId,
        financialYear: input.financialYear || fyFromPeriod(input.returnPeriod),
        month: monthFromPeriod(input.returnPeriod),
    });
    const phase2 = adj.rcmPhase2 || { audit: [], amendments: [] };
    if (phase2.workflowStatus !== RCM_RETURN_WORKFLOW.FILED_LOCKED && adj.status !== 'Locked' && adj.status !== 'Filed') {
        throw new ApiError(400, 'Amendment proposal is for filed/locked periods (or post-filing reversals)');
    }
    const amendment = {
        id: `AMD-${Date.now()}`,
        createdAt: new Date(),
        createdBy: input.userId || null,
        reason,
        targetPeriod: input.amendmentPeriod || null,
        liabilityIds: input.liabilityIds || [],
        notes: input.notes || '',
        status: 'PROPOSED',
        filedPeriodSnapshot: phase2.inclusion || null,
    };
    phase2.amendments = [...(phase2.amendments || []), amendment];
    phase2.audit = [
        ...(phase2.audit || []),
        {
            at: new Date(),
            action: 'AMENDMENT_PROPOSED',
            userId: input.userId || null,
            detail: reason,
        },
    ];
    adj.rcmPhase2 = phase2;
    adj.markModified('rcmPhase2');
    await adj.save();
    return {
        message: 'Amendment/reconciliation requirement recorded. Filed period snapshot retained; not altered.',
        amendment,
        workflow: phase2,
    };
}

export function buildRcmReconciliationExport(register) {
    return (register.rows || []).map((r) => ({
        'Source Module': r.sourceModule,
        'Source Voucher': r.sourceVoucherNumber,
        'Source Date': r.sourceVoucherDate,
        Supplier: r.supplier,
        Ledger: r.expensePurchaseLedger,
        'RCM Category': r.rcmCategory,
        'Rule': `${r.ruleCode || ''} v${r.ruleVersion || ''}`,
        'Taxable Value': r.taxableValue,
        'CGST Liability': r.cgstLiability,
        'SGST Liability': r.sgstLiability,
        'IGST Liability': r.igstLiability,
        'Liability JV': r.liabilityPostingVoucher,
        'Liability Status': r.liabilityStatus,
        'Amount Paid': r.amountPaid,
        Outstanding: r.outstanding,
        Challan: r.challanReference,
        'Payment Date': r.paymentDate,
        'ITC Eligibility': r.itcEligibility,
        'Eligible ITC': r.eligibleItc,
        'ITC Released Books': r.itcReleasedInBooks,
        'ITC Reversed': r.itcReversed,
        'ITC Proposed 3B': r.itcProposedForGstr3b,
        'ITC Included 3B': r.itcIncludedInGstr3b,
        'Liability Return Status': r.liabilityReturnStatus,
        'ITC Return Status': r.itcReturnStatus,
        'Liability Period': r.periods?.liabilityPeriod,
        'Payment Period': r.periods?.paymentPeriod,
        'ITC Period': r.periods?.itcAvailabilityPeriod,
        'Proposed Claim Period': r.periods?.proposedItcClaimPeriod,
        Difference: r.difference,
        Exception: r.exception,
        'Approval Status': r.approvalStatus,
    }));
}

export default {
    buildRcmReconciliationRegister,
    prepareRcmReturnMapping,
    reviewRcmReturnMapping,
    approveRcmReturnMapping,
    includeApprovedRcmInDraftGstr3b,
    lockRcmGstr3bPeriod,
    createRcmGstr3bAmendment,
    buildInclusionIdempotencyKey,
    buildRcmReconciliationExport,
    PHASE_2D_BANNER,
    PHASE_2D_INCLUDED_BANNER,
};
