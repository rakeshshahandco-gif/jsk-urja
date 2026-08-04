/**
 * Phase 2B-B — authorised RCM liability posting + unpaid reversal.
 * Does NOT pay tax, create bank entries, or release ITC.
 */
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { Voucher } from '../models/voucher.model.js';
import { VoucherType } from '../models/voucherType.model.js';
import { getNextVoucherNo } from '../utils/voucherUtils.js';
import { postBalancedBatch } from './accounting/accountingPostingEngine.service.js';
import { RCM_TREATMENTS } from './rcmDecisionEngine.service.js';
import { simulateRcmAccounting } from './rcmAccountingSimulation.service.js';
import { resolveRcmLedgerMap } from './rcmLedgerEnsure.service.js';
import {
    findPostedByIdempotencyKey,
    findPostingsForSource,
    findPostingById,
    buildPostingResponseFromVoucher,
} from './rcmLiabilityPostingStore.service.js';
import {
    RCM_LIFECYCLE,
    RCM_POSTING_STATUS,
    PHASE_2B_B_BANNER,
    GSTR3B_POSTED_BANNER,
    PROPOSED_RCM_LEDGERS,
} from '../config/rcmAccountingDesign.js';
import { buildStableRcmSourceLineId } from '../config/rcmCanonicalEnums.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const EPS = 0.05;

function toObjectIdOrNull(value) {
    if (!value) return null;
    try {
        if (value instanceof mongoose.Types.ObjectId) return value;
        const s = String(value);
        if (!mongoose.Types.ObjectId.isValid(s) || String(new mongoose.Types.ObjectId(s)) !== s) {
            // reject non-hex / non-24-char and seed string ids
            if (!/^[a-fA-F0-9]{24}$/.test(s)) return null;
        }
        return new mongoose.Types.ObjectId(s);
    } catch {
        return null;
    }
}

function isIgstType(gstType) {
    return String(gstType || '').toUpperCase().includes('IGST');
}

export function buildIdempotencyKey({
    companyId,
    sourceModule,
    sourceVoucherId,
    sourceLineId = 'header',
}) {
    return [
        String(companyId || ''),
        String(sourceModule || ''),
        String(sourceVoucherId || ''),
        String(sourceLineId || 'header'),
    ].join('|');
}

/**
 * Semantic duplicate: same company + source voucher + ledger + category + tax components.
 */
export async function findSemanticDuplicateLiability({
    companyId,
    sourceModule,
    sourceVoucherId,
    expensePurchaseLedgerId,
    expensePurchaseLedgerName,
    rcmCategory,
    taxableValue,
    cgst,
    sgst,
    igst,
    cess = 0,
} = {}) {
    if (!companyId || !sourceVoucherId) return null;

    const rows = await findPostingsForSource({ companyId, sourceVoucherId });
    const ledgerName = String(expensePurchaseLedgerName || '').trim().toLowerCase();
    const ledgerId = expensePurchaseLedgerId ? String(expensePurchaseLedgerId) : '';
    const cat = String(rcmCategory || '').trim().toUpperCase();
    const mod = String(sourceModule || 'ExpenseVoucher');

    for (const v of rows) {
        const m = v.rcmLiabilityMeta || {};
        if (m.postingStatus !== 'POSTED') continue;
        if (String(m.sourceModule || '') !== mod) continue;
        const sameLedger = ledgerId
            ? String(m.expensePurchaseLedgerId || '') === ledgerId
            : !ledgerName
              || String(m.expensePurchaseLedgerName || '').trim().toLowerCase() === ledgerName;
        if (!sameLedger) continue;
        if (cat && String(m.rcmCategory || '').toUpperCase() !== cat) continue;
        if (Math.abs((Number(m.taxableValue) || 0) - (Number(taxableValue) || 0)) > EPS) continue;
        if (Math.abs((Number(m.cgst) || 0) - (Number(cgst) || 0)) > EPS) continue;
        if (Math.abs((Number(m.sgst) || 0) - (Number(sgst) || 0)) > EPS) continue;
        if (Math.abs((Number(m.igst) || 0) - (Number(igst) || 0)) > EPS) continue;
        if (Math.abs((Number(m.cess) || 0) - (Number(cess) || 0)) > EPS) continue;
        return v;
    }
    return null;
}

/**
 * Approved active rule required — draft seeds never qualify for live posting.
 */
export function assertApprovedRuleForPosting(decision = {}) {
    const rule = decision.matchedRule;
    if (!rule || (!rule._id && !rule.id && !rule.ruleCode)) {
        return {
            ok: false,
            reason:
                'No approved active RCM rule matched. Draft-rule suggestions cannot be used for live liability posting. Approve an RCM rule first.',
        };
    }
    if (decision.matchedDraftRule && !decision.matchedRule) {
        return {
            ok: false,
            reason: 'Only a draft/inactive rule matched. Post RCM Liability remains disabled until the rule is approved.',
        };
    }
    const status = String(rule.status || '').toLowerCase();
    if (status && status !== 'active') {
        return {
            ok: false,
            reason: `Matched rule status is "${rule.status}" — only approved active rules may post liability.`,
        };
    }
    if (!rule.approvedBy || !rule.approvedAt) {
        return {
            ok: false,
            reason:
                'Matched rule is missing approvedBy/approvedAt. Approve the rule before posting RCM liability.',
        };
    }
    if (!rule.effectiveFrom) {
        return {
            ok: false,
            reason: 'Matched rule is missing effectiveFrom.',
        };
    }
    if (!rule.statutoryReference) {
        return {
            ok: false,
            reason: 'Matched rule is missing statutoryReference (required before live posting).',
        };
    }
    if (rule.version == null) {
        return {
            ok: false,
            reason: 'Matched rule is missing version.',
        };
    }
    return { ok: true, rule };
}

export function assertPostingTreatmentGate(decision = {}, { rcmConfirmed } = {}) {
    const treatment = decision.treatment;
    if (treatment !== RCM_TREATMENTS.REVERSE_CHARGE) {
        return {
            ok: false,
            reason: `Treatment is ${treatment || 'unknown'} — posting requires confirmed Reverse Charge.`,
        };
    }
    if (rcmConfirmed !== true && decision.rcmConfirmed !== true) {
        return {
            ok: false,
            reason: 'RCM decision is not confirmed by an authorised user.',
        };
    }
    if (
        treatment === RCM_TREATMENTS.REVIEW_REQUIRED
        || treatment === RCM_TREATMENTS.FORWARD_CHARGE
        || treatment === RCM_TREATMENTS.EXEMPT
        || treatment === RCM_TREATMENTS.NON_GST
        || treatment === RCM_TREATMENTS.NOT_APPLICABLE
    ) {
        return { ok: false, reason: `Posting blocked for treatment ${treatment}.` };
    }
    const missing = decision.missingInformation || [];
    if (Array.isArray(missing) && missing.length) {
        return {
            ok: false,
            reason: `Missing information: ${missing.join(', ')}`,
        };
    }
    return { ok: true };
}

export async function evaluatePostingEligibility(input = {}) {
    const decision = input.decision || {};
    const treatmentGate = assertPostingTreatmentGate(decision, {
        rcmConfirmed: input.rcmConfirmed,
    });
    if (!treatmentGate.ok) {
        return { eligible: false, reason: treatmentGate.reason, code: 'TREATMENT' };
    }
    const ruleGate = assertApprovedRuleForPosting(decision);
    if (!ruleGate.ok) {
        return { eligible: false, reason: ruleGate.reason, code: 'DRAFT_OR_UNAPPROVED_RULE' };
    }
    if (!input.sourceVoucherId) {
        return {
            eligible: false,
            reason: 'Source voucher must be saved before RCM liability can be posted.',
            code: 'SOURCE_VOUCHER_REQUIRED',
        };
    }
    if (input.sourceCancelled === true) {
        return {
            eligible: false,
            reason: 'Source voucher is cancelled — posting blocked.',
            code: 'CANCELLED',
        };
    }

    const gstType = input.gstType || decision.gstType || 'CGST / SGST';
    const igst = isIgstType(gstType);
    const cess = Number(input.cessAmount || 0) > 0;
    const ledgers = await resolveRcmLedgerMap(input.companyId, { igst, cess });
    if (!ledgers.complete) {
        return {
            eligible: false,
            reason: `RCM ledger mapping incomplete. Missing: ${ledgers.missing.join(', ')}. Create via ensure-ledgers with confirmCreate=true.`,
            code: 'LEDGER_MAPPING',
            missingLedgers: ledgers.missing,
        };
    }

    const taxable = r2(input.taxableValue ?? decision.taxableValue);
    const rate = Number(
        decision.suggestedGstRate != null ? decision.suggestedGstRate : input.rate,
    );
    if (!(taxable > 0) || !(rate > 0)) {
        return {
            eligible: false,
            reason: 'Taxable value and GST rate must be valid and greater than zero.',
            code: 'TAX_VALUES',
        };
    }

    return {
        eligible: true,
        reason: null,
        code: 'OK',
        rule: ruleGate.rule,
        ledgers,
    };
}

async function loadSourceVoucher({ sourceModule, sourceVoucherId, companyId }) {
    if (sourceModule === 'PurchaseInvoice') {
        // Soft support: look up if model exists; otherwise treat as opaque id
        try {
            const { PurchaseInvoice } = await import('../models/purchaseInvoice.model.js');
            const doc = await PurchaseInvoice.findById(sourceVoucherId).lean();
            if (!doc) throw new ApiError(404, 'Source purchase invoice not found');
            if (String(doc.status || '').toLowerCase() === 'cancelled') {
                throw new ApiError(400, 'Source purchase invoice is cancelled');
            }
            return {
                id: doc._id,
                number: doc.invoiceNumber || doc.voucherNo || String(doc._id),
                date: doc.invoiceDate || doc.date,
                cancelled: false,
                financialYear: doc.financialYear,
                supplierId: doc.supplierId,
                nature: 'Purchase',
            };
        } catch (e) {
            if (e instanceof ApiError) throw e;
            // Fall through to Voucher
        }
    }

    const doc = await Voucher.findById(sourceVoucherId).lean();
    if (!doc) throw new ApiError(404, 'Source voucher not found');
    if (String(doc.status || '').toLowerCase() === 'cancelled') {
        throw new ApiError(400, 'Source voucher is cancelled');
    }
    if (companyId && doc.companyId && String(doc.companyId) !== String(companyId)) {
        throw new ApiError(403, 'Source voucher does not belong to the active company');
    }
    return {
        id: doc._id,
        number: doc.voucherNo,
        date: doc.date,
        cancelled: false,
        financialYear: doc.financialYear,
        supplierId: doc.partyId || doc.supplierId || null,
        nature: doc.nature || 'Expense',
        voucherTypeName: doc.voucherTypeName || '',
    };
}

function computeTax({ taxableValue, rate, gstType, cessAmount = 0 }) {
    const taxable = r2(taxableValue);
    const rateN = Number(rate) || 0;
    const tax = r2((taxable * rateN) / 100);
    const igst = isIgstType(gstType);
    const cgst = igst ? 0 : r2(tax / 2);
    const sgst = igst ? 0 : r2(tax - cgst);
    const igstAmt = igst ? tax : 0;
    const cess = r2(cessAmount);
    return {
        taxableValue: taxable,
        rate: rateN,
        cgst,
        sgst,
        igst: igstAmt,
        cess,
        totalLiability: r2(cgst + sgst + igstAmt + cess),
        placeType: igst ? 'INTER_STATE' : 'INTRA_STATE',
    };
}

/**
 * Post RCM liability journal (Dr Recoverable / Cr RCM Payable*).
 */
export async function postRcmLiability(input = {}) {
    const companyId = input.companyId;
    if (!companyId) throw new ApiError(400, 'companyId is required');
    if (input.confirmPost !== true || input.checkboxAccepted !== true) {
        throw new ApiError(
            400,
            'Final confirmation required: confirmPost=true and checkboxAccepted=true.',
        );
    }

    const decision = input.decision || {};
    const eligibility = await evaluatePostingEligibility(input);
    if (!eligibility.eligible) {
        throw new ApiError(400, eligibility.reason);
    }

    const source = await loadSourceVoucher({
        sourceModule: input.sourceModule || 'ExpenseVoucher',
        sourceVoucherId: input.sourceVoucherId,
        companyId,
    });

    const financialYear = input.financialYear || source.financialYear;
    if (!financialYear) throw new ApiError(400, 'financialYear is required');

    const gstType = input.gstType || 'CGST / SGST';
    const tax = computeTax({
        taxableValue: input.taxableValue ?? decision.taxableValue,
        rate: decision.suggestedGstRate ?? input.rate,
        gstType,
        cessAmount: input.cessAmount || 0,
    });
    if (!(tax.totalLiability > 0)) {
        throw new ApiError(400, 'RCM liability amount must be greater than zero');
    }

    const sourceLineId = buildStableRcmSourceLineId({
        sourceVoucherId: input.sourceVoucherId,
        sourceLineId: input.sourceLineId,
        expensePurchaseLedgerId: input.expensePurchaseLedgerId,
        expensePurchaseLedgerName: input.expensePurchaseLedgerName,
        lineIndex: input.lineIndex ?? 0,
        taxableValue: tax.taxableValue,
    });

    const idempotencyKey = buildIdempotencyKey({
        companyId,
        sourceModule: input.sourceModule || 'ExpenseVoucher',
        sourceVoucherId: input.sourceVoucherId,
        sourceLineId,
    });

    const existingVoucher = await findPostedByIdempotencyKey(companyId, idempotencyKey);
    if (existingVoucher) {
        return {
            status: RCM_POSTING_STATUS.ALREADY_POSTED,
            banner: 'RCM Liability Already Posted',
            message: PHASE_2B_B_BANNER,
            posting: buildPostingResponseFromVoucher(existingVoucher),
            alreadyPosted: true,
        };
    }

    const semanticDup = await findSemanticDuplicateLiability({
        companyId,
        sourceModule: input.sourceModule || 'ExpenseVoucher',
        sourceVoucherId: input.sourceVoucherId,
        expensePurchaseLedgerId: input.expensePurchaseLedgerId,
        expensePurchaseLedgerName: input.expensePurchaseLedgerName,
        rcmCategory: decision.rcmCategory || input.rcmCategory,
        taxableValue: tax.taxableValue,
        cgst: tax.cgst,
        sgst: tax.sgst,
        igst: tax.igst,
        cess: tax.cess,
    });
    if (semanticDup) {
        const sameKey = semanticDup.rcmLiabilityMeta?.idempotencyKey === idempotencyKey;
        if (sameKey || String(semanticDup.rcmLiabilityMeta?.sourceLineId) === String(sourceLineId)) {
            return {
                status: RCM_POSTING_STATUS.ALREADY_POSTED,
                banner: 'RCM Liability Already Posted',
                message: PHASE_2B_B_BANNER,
                posting: buildPostingResponseFromVoucher(semanticDup),
                alreadyPosted: true,
            };
        }
        throw new ApiError(
            409,
            `Duplicate RCM Liability Review Required: an active RCM liability already exists for this source voucher / ledger / category / tax amounts (${semanticDup.voucherNo || semanticDup._id}). Reuse the existing posting or reverse it before posting again.`,
        );
    }

    const igst = tax.igst > 0;
    const ledgerRes = await resolveRcmLedgerMap(companyId, {
        igst,
        cess: tax.cess > 0,
    });
    if (!ledgerRes.complete) {
        throw new ApiError(
            400,
            `RCM ledger mapping incomplete. Missing: ${ledgerRes.missing.join(', ')}`,
        );
    }
    const L = ledgerRes.map;

    // Simulation snapshot for audit (no side effects)
    const simulation = await simulateRcmAccounting({
        decision: { ...decision, rcmConfirmed: true },
        rcmConfirmed: true,
        expenseLedgerName: input.expensePurchaseLedgerName,
        supplierName: input.supplierName,
        taxableValue: tax.taxableValue,
        gstType,
        rate: tax.rate,
        supplierChargedGst: 0,
        rcmCategory: decision.rcmCategory || input.rcmCategory,
    });

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        // Re-check inside transaction
        const again = await Voucher.findOne({
            companyId,
            isSystemGenerated: true,
            'rcmLiabilityMeta.idempotencyKey': idempotencyKey,
            'rcmLiabilityMeta.postingStatus': 'POSTED',
        }).session(session);
        if (again) {
            await session.abortTransaction();
            return {
                status: RCM_POSTING_STATUS.ALREADY_POSTED,
                banner: 'RCM Liability Already Posted',
                message: PHASE_2B_B_BANNER,
                posting: buildPostingResponseFromVoucher(again.toObject()),
                alreadyPosted: true,
            };
        }

        const vType =
            (await VoucherType.findOne({ nature: 'Journal', isActive: { $ne: false } }).session(session))
            || (await VoucherType.findOne({ name: /journal/i, isActive: { $ne: false } }).session(session));
        if (!vType) throw new ApiError(400, 'No Journal voucher type configured');

        const date = source.date || new Date();
        const voucherNo = await getNextVoucherNo(vType._id, date, session);

        const lines = [
            {
                ledgerId: L.recoverable._id,
                ledgerName: L.recoverable.name,
                amount: tax.totalLiability,
                type: 'Debit',
                narration: `RCM GST recoverable — ${input.sourceModule || 'Expense'} ${source.number}`,
            },
        ];
        if (tax.cgst > 0) {
            lines.push({
                ledgerId: L.cgst._id,
                ledgerName: L.cgst.name,
                amount: tax.cgst,
                type: 'Credit',
                narration: 'RCM CGST Payable',
            });
        }
        if (tax.sgst > 0) {
            lines.push({
                ledgerId: L.sgst._id,
                ledgerName: L.sgst.name,
                amount: tax.sgst,
                type: 'Credit',
                narration: 'RCM SGST Payable',
            });
        }
        if (tax.igst > 0) {
            lines.push({
                ledgerId: L.igst._id,
                ledgerName: L.igst.name,
                amount: tax.igst,
                type: 'Credit',
                narration: 'RCM IGST Payable',
            });
        }
        if (tax.cess > 0 && L.cess) {
            lines.push({
                ledgerId: L.cess._id,
                ledgerName: L.cess.name,
                amount: tax.cess,
                type: 'Credit',
                narration: 'RCM Cess Payable',
            });
        }

        // Guard: never touch ordinary Input GST
        for (const line of lines) {
            if (PROPOSED_RCM_LEDGERS.doNotUse.includes(line.ledgerName)) {
                throw new ApiError(500, `Refusing to post to banned ledger ${line.ledgerName}`);
            }
        }

        const [voucher] = await Voucher.create(
            [
                {
                    voucherNo,
                    voucherType: vType._id,
                    voucherTypeName: vType.name,
                    nature: 'Journal',
                    date,
                    financialYear,
                    companyId,
                    totalAmount: tax.totalLiability,
                    narration:
                        input.remarks
                        || `RCM liability for ${source.number} — tax payment & ITC not included`,
                    status: 'Confirmed',
                    isSystemGenerated: true,
                    items: lines.map((l) => ({
                        ledgerId: l.ledgerId,
                        ledgerName: l.ledgerName,
                        amount: l.amount,
                        type: l.type,
                        narration: l.narration,
                    })),
                    createdBy: input.userId || null,
                },
            ],
            { session },
        );

        await postBalancedBatch({
            lines,
            voucherId: voucher._id,
            voucherNo,
            date,
            financialYear,
            session,
            label: 'RCM Liability',
            adminOverride: false,
        });

        const rule = eligibility.rule || {};
        const meta = {
            kind: 'RCM_LIABILITY',
            idempotencyKey,
            sourceModule: input.sourceModule || 'ExpenseVoucher',
            sourceVoucherType: source.voucherTypeName || source.nature || '',
            sourceVoucherId: source.id,
            sourceVoucherNumber: source.number,
            sourceVoucherDate: source.date,
            sourceLineId,
            supplierId: input.supplierId || source.supplierId || null,
            supplierName: input.supplierName || '',
            expensePurchaseLedgerId: input.expensePurchaseLedgerId || null,
            expensePurchaseLedgerName: input.expensePurchaseLedgerName || '',
            rcmCategory: decision.rcmCategory || input.rcmCategory || '',
            ruleId: toObjectIdOrNull(rule._id || rule.id) || rule._id || rule.id || null,
            ruleCode: rule.ruleCode || '',
            ruleVersion: rule.version ?? null,
            taxableValue: tax.taxableValue,
            gstRate: tax.rate,
            cgst: tax.cgst,
            sgst: tax.sgst,
            igst: tax.igst,
            cess: tax.cess,
            totalLiability: tax.totalLiability,
            placeOfSupply: input.placeOfSupply || decision.placeOfSupply || '',
            gstType,
            supplierPayable: tax.taxableValue,
            ledgerMap: {
                recoverableId: L.recoverable._id,
                recoverableName: L.recoverable.name,
                cgstPayableId: L.cgst?._id || null,
                cgstPayableName: L.cgst?.name || '',
                sgstPayableId: L.sgst?._id || null,
                sgstPayableName: L.sgst?.name || '',
                igstPayableId: L.igst?._id || null,
                igstPayableName: L.igst?.name || '',
                cessPayableId: L.cess?._id || null,
                cessPayableName: L.cess?.name || '',
            },
            postingStatus: 'POSTED',
            lifecycleStatus: RCM_LIFECYCLE.TAX_PAYMENT_PENDING,
            taxPaymentStatus: 'PENDING',
            itcStatus: 'NOT_AVAILABLE_YET',
            gstr3bMappingStatus: 'PENDING_REVIEW',
            postedBy: input.userId || null,
            postedAt: new Date(),
            confirmation: {
                confirmed: true,
                remarks: input.remarks || '',
                checkboxAccepted: true,
            },
            decisionSnapshot: {
                treatment: decision.treatment,
                treatmentLabel: decision.treatmentLabel,
                decisionReason: decision.decisionReason,
                matchedRule: rule,
                confidence: decision.confidence,
                overriddenValues: decision.overriddenValues || [],
            },
            simulationSnapshot: {
                banner: simulation.banner,
                supplierBooking: simulation.supplierBooking,
                rcmLiability: simulation.rcmLiability,
                simulatedEntries: simulation.simulatedEntries,
            },
            auditHistory: [
                {
                    at: new Date(),
                    action: 'LIABILITY_POSTED',
                    userId: input.userId || null,
                    detail: `Posted ${voucherNo} liability ₹${tax.totalLiability}`,
                },
            ],
        };

        voucher.rcmLiabilityMeta = meta;
        await voucher.save({ session });

        await session.commitTransaction();

        const posting = buildPostingResponseFromVoucher({
            ...voucher.toObject(),
            rcmLiabilityMeta: meta,
        });

        return {
            status: RCM_POSTING_STATUS.POSTED,
            banner: PHASE_2B_B_BANNER,
            gstr3bBanner: GSTR3B_POSTED_BANNER,
            message: 'RCM liability posted. Tax payment and ITC release are not enabled in this phase.',
            posting,
            alreadyPosted: false,
            supplierPayable: tax.taxableValue,
            rcmAddedToSupplierPayable: false,
            taxPaymentStatus: 'PENDING',
            itcStatus: 'NOT_AVAILABLE_YET',
        };
    } catch (err) {
        await session.abortTransaction().catch(() => {});
        const existingDup = await findPostedByIdempotencyKey(companyId, idempotencyKey);
        if (existingDup) {
            return {
                status: RCM_POSTING_STATUS.ALREADY_POSTED,
                banner: 'RCM Liability Already Posted',
                message: PHASE_2B_B_BANNER,
                posting: buildPostingResponseFromVoucher(existingDup),
                alreadyPosted: true,
            };
        }
        throw err;
    } finally {
        session.endSession();
    }
}

/**
 * Authorised reversal of unpaid RCM liability.
 */
export async function reverseRcmLiability(input = {}) {
    const companyId = input.companyId;
    const postingId = input.postingId;
    if (!companyId || !postingId) {
        throw new ApiError(400, 'companyId and postingId are required');
    }
    if (input.confirmReverse !== true) {
        throw new ApiError(400, 'confirmReverse=true is required');
    }

    const liabilityVoucher = await findPostingById(companyId, postingId);
    if (!liabilityVoucher) throw new ApiError(404, 'RCM liability posting not found');
    const meta = liabilityVoucher.rcmLiabilityMeta || {};
    if (meta.postingStatus === 'REVERSED') {
        throw new ApiError(400, 'RCM liability already reversed');
    }
    const activePayments = (meta.payments || []).filter((p) => p.status !== 'REVERSED');
    if (
        activePayments.length
        || meta.taxPaymentStatus === 'PAID'
        || meta.taxPaymentStatus === 'PARTLY_PAID'
        || Number(meta.amountPaid || 0) > 0
    ) {
        throw new ApiError(
            400,
            'RCM tax payment has already been recorded. GST reconciliation and authorised reversal are required. Silent liability reversal is blocked.',
        );
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const vType =
            (await VoucherType.findOne({ nature: 'Journal', isActive: { $ne: false } }).session(session))
            || (await VoucherType.findOne({ name: /journal/i, isActive: { $ne: false } }).session(session));
        if (!vType) throw new ApiError(400, 'No Journal voucher type configured');

        const date = new Date();
        const voucherNo = await getNextVoucherNo(vType._id, date, session);
        const LM = meta.ledgerMap || {};

        const lines = [];
        if (meta.cgst > 0 && LM.cgstPayableId) {
            lines.push({
                ledgerId: LM.cgstPayableId,
                amount: meta.cgst,
                type: 'Debit',
                narration: 'Reverse RCM CGST Payable',
            });
        }
        if (meta.sgst > 0 && LM.sgstPayableId) {
            lines.push({
                ledgerId: LM.sgstPayableId,
                amount: meta.sgst,
                type: 'Debit',
                narration: 'Reverse RCM SGST Payable',
            });
        }
        if (meta.igst > 0 && LM.igstPayableId) {
            lines.push({
                ledgerId: LM.igstPayableId,
                amount: meta.igst,
                type: 'Debit',
                narration: 'Reverse RCM IGST Payable',
            });
        }
        if (meta.cess > 0 && LM.cessPayableId) {
            lines.push({
                ledgerId: LM.cessPayableId,
                amount: meta.cess,
                type: 'Debit',
                narration: 'Reverse RCM Cess Payable',
            });
        }
        lines.push({
            ledgerId: LM.recoverableId,
            amount: meta.totalLiability,
            type: 'Credit',
            narration: 'Reverse RCM GST Recoverable',
        });

        const [revVoucher] = await Voucher.create(
            [
                {
                    voucherNo,
                    voucherType: vType._id,
                    voucherTypeName: vType.name,
                    nature: 'Journal',
                    date,
                    financialYear: liabilityVoucher.financialYear,
                    companyId,
                    totalAmount: meta.totalLiability,
                    narration:
                        input.remarks
                        || `Reversal of RCM liability ${liabilityVoucher.voucherNo}`,
                    status: 'Confirmed',
                    isSystemGenerated: true,
                    rcmLiabilityMeta: {
                        kind: 'RCM_LIABILITY_REVERSAL',
                        reversesPostingId: liabilityVoucher._id,
                    },
                    items: lines.map((l) => ({
                        ledgerId: l.ledgerId,
                        amount: l.amount,
                        type: l.type,
                        narration: l.narration,
                    })),
                    createdBy: input.userId || null,
                },
            ],
            { session },
        );

        await postBalancedBatch({
            lines,
            voucherId: revVoucher._id,
            voucherNo,
            date,
            financialYear: liabilityVoucher.financialYear,
            session,
            label: 'RCM Liability Reversal',
        });

        const auditHistory = [...(meta.auditHistory || [])];
        auditHistory.push({
            at: new Date(),
            action: 'LIABILITY_REVERSED',
            userId: input.userId || null,
            detail: `Reversed via ${voucherNo}`,
        });
        liabilityVoucher.rcmLiabilityMeta = {
            ...meta,
            postingStatus: 'REVERSED',
            lifecycleStatus: RCM_LIFECYCLE.REVERSED,
            reversalVoucherId: revVoucher._id,
            reversalVoucherNumber: voucherNo,
            reversedBy: input.userId || null,
            reversedAt: new Date(),
            reversalRemarks: input.remarks || '',
            auditHistory,
        };
        await liabilityVoucher.save({ session });

        await session.commitTransaction();

        return {
            status: RCM_POSTING_STATUS.REVERSED,
            message: 'RCM liability reversed. Original posting retained for audit.',
            posting: buildPostingResponseFromVoucher(liabilityVoucher.toObject()),
            reversalVoucherNumber: voucherNo,
        };
    } catch (err) {
        await session.abortTransaction().catch(() => {});
        throw err;
    } finally {
        session.endSession();
    }
}

export async function getRcmLiabilityPosting({ companyId, postingId, sourceVoucherId }) {
    if (postingId) {
        const row = await findPostingById(companyId, postingId);
        return row ? [buildPostingResponseFromVoucher(row.toObject ? row.toObject() : row)] : [];
    }
    if (sourceVoucherId) {
        const rows = await findPostingsForSource({ companyId, sourceVoucherId });
        return rows.map(buildPostingResponseFromVoucher);
    }
    return [];
}

export default {
    postRcmLiability,
    reverseRcmLiability,
    getRcmLiabilityPosting,
    evaluatePostingEligibility,
    assertApprovedRuleForPosting,
    assertPostingTreatmentGate,
    buildIdempotencyKey,
};
