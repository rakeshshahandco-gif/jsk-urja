import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { Voucher } from '../models/voucher.model.js';
import { VoucherType } from '../models/voucherType.model.js';
import { LedgerEntry } from '../models/ledgerEntry.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { CashBankAccount } from '../models/cashBankAccount.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { getFYFromDate, getShortFY } from '../utils/fyUtils.js';
import { calculateVoucherGstTotals, getNextVoucherNo } from '../utils/voucherUtils.js';
import { autoLinkEntityLedger, autoLinkCashBankLedger } from '../utils/ledgerLinking.utils.js';
import { previewExpenseVoucherTds, resolveTdsPayableLedgerId, collectExpenseTdsDebitContext, normalizeMongoRefId } from '../services/tdsDecisionEngine.service.js';
import * as tdsTh from '../services/tdsThreshold.service.js';
import {
    postAccountingEntry,
    reverseLedgerEntriesForVoucher,
} from '../services/accounting/accountingPostingEngine.service.js';
import {
    assertBalancedEntries,
    assertGstMatchesVoucher,
    assertPostingAllowed,
} from '../services/accounting/accountingValidation.service.js';
import { assertVoucherNumberAvailable } from '../services/accounting/voucherIntegrity.service.js';
import { logAccountingAudit } from '../services/accounting/accountingAudit.service.js';
import {
    applyBillPaymentDelta,
    syncBillWiseAuditFromVoucher,
    reverseAllBillWiseForVoucher,
} from '../services/accounting/billWiseSettlement.service.js';
import { assertSourceCancelAllowedForRcm } from '../services/rcmLiabilityPostingStore.service.js';

const r2v = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function resolveExpenseVoucherTdsForPosting(body, { processingTotal, isGstEnabled, lineItems, fy, excludeVoucherId, userId }) {
    const preview = await previewExpenseVoucherTds({
        partyLedgerId: normalizeMongoRefId(body.partyId),
        financialYear: fy,
        items: lineItems,
        isGstEnabled,
        processingTotal,
        voucherTaxSnapshot: {
            totalTaxableAmount: body.totalTaxableAmount,
            totalTax: body.totalTax,
            totalCgst: body.totalCgst,
            totalSgst: body.totalSgst,
            totalIgst: body.totalIgst,
            roundOff: body.roundOff,
        },
        excludeVoucherId,
        expenseTdsSectionResolution: body.expenseTdsSectionResolution || undefined,
    });

    if (preview.sectionConflict?.message && !body.expenseTdsSectionResolution) {
        throw new ApiError(httpStatus.BAD_REQUEST, preview.sectionConflict.message);
    }

    if (preview.previewFailed && preview.previewErrorMessage) {
        throw new ApiError(httpStatus.BAD_REQUEST, preview.previewErrorMessage);
    }

    if (!preview.engineActive) return null;

    if (preview.blocked) {
        throw new ApiError(httpStatus.BAD_REQUEST, preview.blockReason || 'TDS validation failed');
    }

    const d = preview.decision;
    if (d.panBlock) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'PAN is mandatory for TDS on this transaction — update Supplier Master or disable TDS for this expense ledger.',
        );
    }

    if (body.tdsDisabledReason && String(body.tdsDisabledReason).trim()) {
        await tdsTh.logTdsAudit({
            action: 'TDS_DISABLED_ON_VOUCHER',
            supplierId: preview.supplierId,
            section: d.tdsSection,
            financialYear: fy,
            userId,
            details: { reason: body.tdsDisabledReason, flow: 'Expense' },
        });
        return { engineActive: true, skipTds: true, skipReason: 'disabled' };
    }

    if (body.tdsPopupSkipped) {
        await tdsTh.logTdsAudit({
            action: 'POPUP_SKIPPED',
            supplierId: preview.supplierId,
            section: d.tdsSection,
            financialYear: fy,
            userId,
            details: { wouldBeTds: d.tdsAmount, flow: 'Expense' },
        });
        return { engineActive: true, skipTds: true, skipReason: 'popup_skipped' };
    }

    if (d.tdsApplicable && d.liabilityAlert && !body.tdsUserConfirmed) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'TDS liability alert — confirm deduction (send tdsUserConfirmed: true) or explicitly skip (tdsPopupSkipped: true).',
        );
    }

    const master = preview.master;
    let payableId = null;
    if (d.tdsApplicable && d.tdsAmount > 0) {
        payableId = await resolveTdsPayableLedgerId(d.tdsSection, master);
        if (!payableId) {
            throw new ApiError(
                httpStatus.BAD_REQUEST,
                `TDS payable ledger is not mapped for Section ${d.tdsSection}. Please create or select ledger.`,
            );
        }
    }

    return {
        engineActive: true,
        skipTds: false,
        tdsAmount: d.tdsApplicable ? r2v(d.tdsAmount) : 0,
        tdsSection: d.tdsSection,
        supplierId: preview.supplierId,
        thresholdBase: r2v(preview.tdsThresholdBaseAmount ?? d.tdsBase ?? 0),
        payableLedgerId: payableId,
        expenseLineLedgerId: preview.expenseLineLedgerId,
        decision: d,
    };
}



/** @deprecated Use postAccountingEntry from accounting foundation — kept as alias for this controller. */
const postToLedger = (data, session) => postAccountingEntry(data, session);

/** Bill-wise settlement (Against Bill / New Reference / Opening Credit handled in engine). */
const adjustBill = (adj, nature, voucherNo, date, session) =>
    applyBillPaymentDelta(adj, nature, voucherNo, date, session, false);

export const createVoucher = asyncHandler(async (req, res) => {
    const { voucherTypeId, date, cashBankAccountId, totalAmount, items, narration, nature } = req.body;
    let retries = 3;
    let lastError = null;

    while (retries > 0) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // --- SAFETY HOOK: Ensure party ledgers are linked ---
            if (req.body.customerId) {
                const customerLedgerId = await autoLinkEntityLedger(req.body.customerId, 'Customer', session);
                if (!req.body.partyId) req.body.partyId = customerLedgerId;
            }
            if (req.body.supplierId) {
                const supplierLedgerId = await autoLinkEntityLedger(req.body.supplierId, 'Supplier', session);
                if (!req.body.partyId) req.body.partyId = supplierLedgerId;
            }
            
            if (items && Array.isArray(items)) {
                for (const item of items) {
                    if (item.customerId) {
                        item.ledgerId = await autoLinkEntityLedger(item.customerId, 'Customer', session);
                    }
                    if (item.supplierId) {
                        item.ledgerId = await autoLinkEntityLedger(item.supplierId, 'Supplier', session);
                    }
                }
            }
            // ----------------------------------------------------

            const vType = await VoucherType.findById(voucherTypeId).session(session);
            if (!vType) throw new ApiError(httpStatus.NOT_FOUND, 'Voucher type not found');

            const fy = req.body.financialYear || getFYFromDate(date || new Date());
            await assertPostingAllowed({
                voucherDate: date,
                financialYear: fy,
                adminOverride: !!req.body.adminOverride,
                unlockReason: req.body.unlockReason || '',
            });
            const voucherNo = await getNextVoucherNo(voucherTypeId, date, session);
            await assertVoucherNumberAvailable({
                financialYear: fy,
                voucherTypeId,
                voucherNo,
                session,
            });
            const actualNature = vType.nature || nature;

            const voucher = new Voucher({
                ...req.body,
                voucherNo,
                financialYear: fy,
                voucherType: vType._id,
                nature: actualNature,
                voucherTypeName: vType.name,
                createdBy: req.user.id
            });

            if (actualNature === 'Journal') {
                assertBalancedEntries(
                    (items || []).map(i => ({ ledgerId: i.ledgerId, amount: i.amount, type: i.type })),
                    'Journal voucher',
                );
                for (const item of items) {
                    await postToLedger({
                        voucherId: voucher._id, voucherNo, date,
                        ledgerId: item.ledgerId, amount: item.amount,
                        type: item.type,
                        narration: item.narration || narration,
                        financialYear: fy
                    }, session);
                }
            } else {
                let mainLedgerId;
                let mainEntryType = 'Debit';
                let isCreditExpense = actualNature === 'Expense' && req.body.expenseType === 'Credit';
                let isGstEnabled = actualNature === 'Expense' && req.body.isGstEnabled;
                let processingTotal = totalAmount;

                if (isGstEnabled) {
                    const gstResult = calculateVoucherGstTotals(items, req.body.gstType);
                    Object.assign(voucher, gstResult);
                    processingTotal = gstResult.grandTotal;
                    voucher.items = gstResult.updatedItems;
                    assertGstMatchesVoucher({
                        isGstEnabled: true,
                        ...gstResult,
                        items: gstResult.updatedItems,
                    });
                }

                const lineItemsForTds = isGstEnabled ? voucher.items : items;
                let requiresPartyForExpenseTds = false;
                if (actualNature === 'Expense' && req.body.paymentMode !== 'Adjustment') {
                    const tdsDebitCtx = await collectExpenseTdsDebitContext(lineItemsForTds, isGstEnabled);
                    requiresPartyForExpenseTds = !!tdsDebitCtx;
                }

                let expenseTdsCtx = null;
                let mainVoucherCredit = processingTotal;
                let tdsAmtApply = 0;

                if (actualNature === 'Expense' && req.body.paymentMode !== 'Adjustment') {
                    expenseTdsCtx = await resolveExpenseVoucherTdsForPosting(req.body, {
                        processingTotal,
                        isGstEnabled,
                        lineItems: lineItemsForTds,
                        fy,
                        excludeVoucherId: null,
                        userId: req.user?.id || req.user?._id,
                    });
                    if (expenseTdsCtx?.engineActive && !expenseTdsCtx.skipTds) {
                        voucher.tdsSection = expenseTdsCtx.tdsSection || '';
                        voucher.tdsAmount = expenseTdsCtx.tdsAmount || 0;
                        voucher.tdsThresholdBaseAmount = expenseTdsCtx.thresholdBase || 0;
                        voucher.tdsSupplierId = expenseTdsCtx.supplierId || null;
                        voucher.tdsPayableLedgerId = expenseTdsCtx.payableLedgerId || null;
                        voucher.tdsExpenseLineLedgerId = expenseTdsCtx.expenseLineLedgerId || null;
                        voucher.tdsUserConfirmed = !!req.body.tdsUserConfirmed;
                        voucher.tdsPopupSkipped = false;
                        voucher.tdsDisabledReason = (req.body.tdsDisabledReason && String(req.body.tdsDisabledReason)) || '';
                        if ((expenseTdsCtx.tdsAmount || 0) > 0) {
                            tdsAmtApply = expenseTdsCtx.tdsAmount;
                            /** Credit expense: supplier Cr = full bill; TDS is Dr supplier + Cr TDS payable (ledger shows gross + TDS). Cash/Bank: Cr bank = net paid + Cr TDS payable. */
                            if (!isCreditExpense) {
                                mainVoucherCredit = r2v(processingTotal - tdsAmtApply);
                            }
                        }
                    }
                    if (expenseTdsCtx?.skipTds && expenseTdsCtx.skipReason === 'popup_skipped') {
                        voucher.tdsPopupSkipped = true;
                    }
                }

                if (requiresPartyForExpenseTds && !req.body.partyId) {
                    throw new ApiError(
                        httpStatus.BAD_REQUEST,
                        'This expense has a TDS-applicable debit ledger — select Party (contractor / supplier) to calculate TDS and FY threshold.',
                    );
                }

                if (isCreditExpense) {
                    if (!req.body.partyId) throw new ApiError(httpStatus.BAD_REQUEST, 'Supplier ledger (partyId) is required for Credit Expense');
                    mainLedgerId = req.body.partyId;
                    mainEntryType = 'Credit';
                    voucher.paymentStatus = 'Unpaid';
                    voucher.paidAmount = 0;
                } else if (req.body.paymentMode === 'Adjustment') {
                    // Adjustment mode - typically zero-sum Customer Dr/Cr
                    // We skip main ledger entry here as the items will contain the Dr/Cr pair
                    mainLedgerId = null; 
                    voucher.paymentStatus = 'Paid';
                    voucher.paidAmount = processingTotal;
                } else {
                    if (!cashBankAccountId) throw new ApiError(httpStatus.BAD_REQUEST, 'Cash/Bank account is required for this voucher type');
                    const cbAcc = await CashBankAccount.findById(cashBankAccountId).session(session);
                    if (!cbAcc) throw new ApiError(httpStatus.NOT_FOUND, 'Cash/Bank account not found');
                    mainLedgerId = await autoLinkCashBankLedger(cbAcc, session);
                    if (!mainLedgerId) throw new ApiError(httpStatus.BAD_REQUEST, 'Main account ledger not found for selected Cash/Bank account and auto-link failed');
                    voucher.paymentStatus = 'Paid';
                    voucher.paidAmount = processingTotal;
                    if (actualNature === 'Payment' || actualNature === 'Expense') mainEntryType = 'Credit';
                    else if (actualNature === 'Contra') mainEntryType = req.body.headerType || 'Debit';
                }

                if (mainLedgerId) {
                    await postToLedger({
                        voucherId: voucher._id, voucherNo, date,
                        ledgerId: mainLedgerId, amount: mainVoucherCredit,
                        type: mainEntryType,
                        narration: narration || `Main entry for ${voucherNo}`,
                        cashBankAccountId: isCreditExpense ? null : cashBankAccountId,
                        financialYear: fy
                    }, session);
                }

                for (const item of voucher.items) {
                    await postToLedger({
                        voucherId: voucher._id, voucherNo, date,
                        ledgerId: item.ledgerId, amount: isGstEnabled ? item.taxableAmount : item.amount,
                        type: item.type,
                        narration: item.narration || narration,
                        financialYear: fy
                    }, session);
                    if (item.adjustments && item.adjustments.length > 0) {
                        for (const adj of item.adjustments) {
                            await adjustBill(adj, actualNature, voucherNo, date, session);
                        }
                    }
                }

                if (isGstEnabled) {
                    const [cgstLedger, sgstLedger, igstLedger, roundOffLedger] = await Promise.all([
                        AccountLedger.findOne({ name: 'CGST Input' }).session(session),
                        AccountLedger.findOne({ name: 'SGST Input' }).session(session),
                        AccountLedger.findOne({ name: 'IGST Input' }).session(session),
                        AccountLedger.findOne({ name: 'Round Off' }).session(session)
                    ]);
                    if (voucher.totalCgst > 0 && cgstLedger) await postToLedger({ voucherId: voucher._id, voucherNo, date, ledgerId: cgstLedger._id, amount: voucher.totalCgst, type: 'Debit', narration: 'Input CGST', financialYear: fy }, session);
                    if (voucher.totalSgst > 0 && sgstLedger) await postToLedger({ voucherId: voucher._id, voucherNo, date, ledgerId: sgstLedger._id, amount: voucher.totalSgst, type: 'Debit', narration: 'Input SGST', financialYear: fy }, session);
                    if (voucher.totalIgst > 0 && igstLedger) await postToLedger({ voucherId: voucher._id, voucherNo, date, ledgerId: igstLedger._id, amount: voucher.totalIgst, type: 'Debit', narration: 'Input IGST', financialYear: fy }, session);
                    if (voucher.roundOff !== 0 && roundOffLedger) await postToLedger({ voucherId: voucher._id, voucherNo, date, ledgerId: roundOffLedger._id, amount: Math.abs(voucher.roundOff), type: voucher.roundOff > 0 ? 'Debit' : 'Credit', narration: 'Round Off', financialYear: fy }, session);
                }

                if (actualNature === 'Expense' && expenseTdsCtx && !expenseTdsCtx.skipTds && tdsAmtApply > 0 && expenseTdsCtx.payableLedgerId) {
                    if (isCreditExpense && req.body.partyId) {
                        await postToLedger({
                            voucherId: voucher._id,
                            voucherNo,
                            date,
                            ledgerId: req.body.partyId,
                            amount: tdsAmtApply,
                            type: 'Debit',
                            narration: `TDS deducted u/s ${expenseTdsCtx.tdsSection}`,
                            financialYear: fy,
                        }, session);
                    }
                    await postToLedger({
                        voucherId: voucher._id,
                        voucherNo,
                        date,
                        ledgerId: expenseTdsCtx.payableLedgerId,
                        amount: tdsAmtApply,
                        type: 'Credit',
                        narration: `TDS u/s ${expenseTdsCtx.tdsSection}`,
                        financialYear: fy,
                    }, session);
                }
            }

            await voucher.save({ session });

            await syncBillWiseAuditFromVoucher(
                voucher,
                session,
                req.user?.id || req.user?._id,
                req.companyId,
            );

            await logAccountingAudit({
                action: 'CREATE',
                moduleSource: 'Voucher',
                resourceType: 'Voucher',
                resourceId: voucher._id,
                voucherNo,
                financialYear: fy,
                userId: req.user?.id || req.user?._id,
                newValue: { nature: actualNature, totalAmount: voucher.totalAmount, status: voucher.status },
                session,
            });

            if (
                actualNature === 'Expense' &&
                voucher.tdsThresholdBaseAmount > 0 &&
                voucher.tdsSupplierId &&
                voucher.tdsSection &&
                !voucher.tdsPopupSkipped &&
                !(voucher.tdsDisabledReason && String(voucher.tdsDisabledReason).trim())
            ) {
                await tdsTh.applyVoucherBillToTdsBalance(
                    {
                        supplierId: voucher.tdsSupplierId,
                        section: voucher.tdsSection,
                        financialYear: fy,
                        baseAmount: voucher.tdsThresholdBaseAmount,
                        tdsAmount: voucher.tdsAmount || 0,
                        voucherId: voucher._id,
                    },
                    req.user?.id || req.user?._id,
                    session,
                );
            }

            await session.commitTransaction();
            return res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, voucher, 'Voucher created successfully'));

        } catch (error) {
            await session.abortTransaction();
            lastError = error;
            // Handle MongoDB Duplicate Key Error (Code 11000)
            if ((error.code === 11000 || error.message?.includes('E11000')) && retries > 1) {
                retries--;
                console.log(`Duplicate voucher number detected. Retrying... Attempts left: ${retries}`);
                continue;
            }
            throw error;
        } finally {
            session.endSession();
        }
    }

    // If all retries failed
    throw new ApiError(httpStatus.CONFLICT, 'Voucher number already exists. Please try again or manually update the voucher series next number.');
});

export const getVouchers = asyncHandler(async (req, res) => {
    const { from, to, nature, natureType, partyId, page = 1, limit = 50, showSystemGenerated } = req.query;
    const filter = {};
    
    // Hide system-generated vouchers by default unless explicitly requested
    if (showSystemGenerated !== 'true') {
        filter.isSystemGenerated = { $ne: true };
    }

    if (from || to) {
        filter.date = {};
        if (from) filter.date.$gte = new Date(from);
        if (to) filter.date.$lte = new Date(to);
    }
    if (nature) filter.nature = nature;
    if (partyId) filter.partyId = partyId;
    if (req.query.financialYear) filter.financialYear = req.query.financialYear;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
        Voucher.find(filter).sort({ date: -1, voucherNo: -1 }).skip(skip).limit(parseInt(limit)).lean(),
        Voucher.countDocuments(filter)
    ]);

    res.send(new ApiResponse(httpStatus.OK, { data, meta: { total, page: parseInt(page), limit: parseInt(limit) } }));
});

export const getVoucher = asyncHandler(async (req, res) => {
    const voucher = await Voucher.findById(req.params.id).populate('items.ledgerId').lean();
    if (!voucher) throw new ApiError(httpStatus.NOT_FOUND, 'Voucher not found');
    res.send(new ApiResponse(httpStatus.OK, voucher));
});

export const cancelVoucher = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const voucher = await Voucher.findById(req.params.id).session(session);
        if (!voucher) throw new ApiError(httpStatus.NOT_FOUND, 'Voucher not found');
        if (voucher.status === 'Cancelled') throw new ApiError(httpStatus.BAD_REQUEST, 'Voucher already cancelled');

        await assertSourceCancelAllowedForRcm({
            companyId: voucher.companyId,
            sourceVoucherId: voucher._id,
        });
await tdsTh.reverseVoucherBillFromTdsBalance(voucher.toObject(), req.user?.id || req.user?._id, session);

        // Reverse Ledger Entries
        // Instead of deleting, we could create reverse entries or just mark them as cancelled.
        // For simple balance management, let's reverse the effects.

        await assertPostingAllowed({
            voucherDate: voucher.date,
            financialYear: voucher.financialYear,
            adminOverride: !!req.body?.adminOverride,
            unlockReason: req.body?.unlockReason || req.body?.reason || '',
        });

        await reverseLedgerEntriesForVoucher(voucher, session);

        await reverseAllBillWiseForVoucher(
            voucher,
            session,
            req.user?.id || req.user?._id,
            req.body?.reason || '',
        );

        voucher.status = 'Cancelled';
        await voucher.save({ session });

        await logAccountingAudit({
            action: 'CANCEL',
            moduleSource: 'Voucher',
            resourceType: 'Voucher',
            resourceId: voucher._id,
            voucherNo: voucher.voucherNo,
            financialYear: voucher.financialYear,
            userId: req.user?.id || req.user?._id,
            reason: req.body?.reason || '',
            oldValue: { status: 'Confirmed' },
            newValue: { status: 'Cancelled' },
            session,
        });

        await session.commitTransaction();
        res.send(new ApiResponse(httpStatus.OK, null, 'Voucher cancelled successfully'));

    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

export const updateVoucher = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;
        const oldVoucher = await Voucher.findById(id).session(session);
        if (!oldVoucher) throw new ApiError(httpStatus.NOT_FOUND, 'Voucher not found');
        if (oldVoucher.status === 'Cancelled') throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot edit a cancelled voucher');

        await tdsTh.reverseVoucherBillFromTdsBalance(oldVoucher.toObject(), req.user?.id || req.user?._id, session);

        await assertPostingAllowed({
            voucherDate: req.body.date || oldVoucher.date,
            financialYear: req.body.financialYear || oldVoucher.financialYear,
            adminOverride: !!req.body.adminOverride,
            unlockReason: req.body.unlockReason || req.body.reason || '',
        });

        // 1. REVERSE OLD IMPACTS (Same as Cancel)
        await reverseLedgerEntriesForVoucher(oldVoucher, session);

        await reverseAllBillWiseForVoucher(
            oldVoucher,
            session,
            req.user?.id || req.user?._id,
            'Voucher edit — reversing prior settlement',
        );

        // 2. APPLY NEW DATA
        const { voucherTypeId, date, cashBankAccountId, totalAmount, items, narration, nature } = req.body;
        const fy = req.body.financialYear || getFYFromDate(date || new Date());
        const voucherNo = oldVoucher.voucherNo; // Keep existing number

        const vType = await VoucherType.findById(voucherTypeId || oldVoucher.voucherType).session(session);
        const actualNature = vType?.nature || nature || oldVoucher.nature;

        // Update the document fields
        Object.assign(oldVoucher, req.body, {
            voucherNo,
            financialYear: fy,
            voucherType: vType?._id || oldVoucher.voucherType,
            nature: actualNature,
            voucherTypeName: vType?.name || oldVoucher.voucherTypeName,
            updatedBy: req.user.id,
            status: 'Confirmed' // Ensure it's active
        });

        // 3. RE-POST NEW IMPACTS (Same as Create)
        if (actualNature === 'Journal') {
            let debitTotal = 0;
            let creditTotal = 0;
            for (const item of items) {
                if (item.type === 'Debit') debitTotal += item.amount;
                else creditTotal += item.amount;

                await postToLedger({
                    voucherId: oldVoucher._id, voucherNo, date,
                    ledgerId: item.ledgerId, amount: item.amount,
                    type: item.type,
                    narration: item.narration || narration,
                    financialYear: fy
                }, session);
            }
            if (Math.abs(debitTotal - creditTotal) > 0.01) {
                throw new ApiError(httpStatus.BAD_REQUEST, 'Journal entries must be balanced (Total Dr = Total Cr)');
            }
        } else {
            let mainLedgerId;
            let mainEntryType = 'Debit';
            let isCreditExpense = actualNature === 'Expense' && req.body.expenseType === 'Credit';
            let isGstEnabled = actualNature === 'Expense' && req.body.isGstEnabled;
            let processingTotal = totalAmount;

            if (isGstEnabled) {
                const gstResult = calculateVoucherGstTotals(items, req.body.gstType);
                Object.assign(oldVoucher, gstResult);
                processingTotal = gstResult.grandTotal;
                oldVoucher.items = gstResult.updatedItems;
            }

            const lineItemsForTds = isGstEnabled ? oldVoucher.items : items;
            let requiresPartyForExpenseTds = false;
            if (actualNature === 'Expense' && req.body.paymentMode !== 'Adjustment') {
                const tdsDebitCtx = await collectExpenseTdsDebitContext(lineItemsForTds, isGstEnabled);
                requiresPartyForExpenseTds = !!tdsDebitCtx;
            }

            let expenseTdsCtx = null;
            let mainVoucherCredit = processingTotal;
            let tdsAmtApply = 0;

            if (actualNature === 'Expense' && req.body.paymentMode !== 'Adjustment') {
                expenseTdsCtx = await resolveExpenseVoucherTdsForPosting(req.body, {
                    processingTotal,
                    isGstEnabled,
                    lineItems: lineItemsForTds,
                    fy,
                    excludeVoucherId: oldVoucher._id,
                    userId: req.user?.id || req.user?._id,
                });
                if (expenseTdsCtx?.engineActive && !expenseTdsCtx.skipTds) {
                    oldVoucher.tdsSection = expenseTdsCtx.tdsSection || '';
                    oldVoucher.tdsAmount = expenseTdsCtx.tdsAmount || 0;
                    oldVoucher.tdsThresholdBaseAmount = expenseTdsCtx.thresholdBase || 0;
                    oldVoucher.tdsSupplierId = expenseTdsCtx.supplierId || null;
                    oldVoucher.tdsPayableLedgerId = expenseTdsCtx.payableLedgerId || null;
                    oldVoucher.tdsExpenseLineLedgerId = expenseTdsCtx.expenseLineLedgerId || null;
                    oldVoucher.tdsUserConfirmed = !!req.body.tdsUserConfirmed;
                    oldVoucher.tdsPopupSkipped = false;
                    oldVoucher.tdsDisabledReason = (req.body.tdsDisabledReason && String(req.body.tdsDisabledReason)) || '';
                    if ((expenseTdsCtx.tdsAmount || 0) > 0) {
                        tdsAmtApply = expenseTdsCtx.tdsAmount;
                        if (!isCreditExpense) {
                            mainVoucherCredit = r2v(processingTotal - tdsAmtApply);
                        }
                    }
                }
                if (expenseTdsCtx?.skipTds && expenseTdsCtx.skipReason === 'popup_skipped') {
                    oldVoucher.tdsPopupSkipped = true;
                }
            }

            if (requiresPartyForExpenseTds && !req.body.partyId) {
                throw new ApiError(
                    httpStatus.BAD_REQUEST,
                    'This expense has a TDS-applicable debit ledger — select Party (contractor / supplier) to calculate TDS and FY threshold.',
                );
            }

            if (isCreditExpense) {
                if (!req.body.partyId) throw new ApiError(httpStatus.BAD_REQUEST, 'Supplier ledger (partyId) is required for Credit Expense');
                mainLedgerId = req.body.partyId;
                mainEntryType = 'Credit';
                oldVoucher.paymentStatus = 'Unpaid';
                oldVoucher.paidAmount = 0;
            } else {
                if (!cashBankAccountId) throw new ApiError(httpStatus.BAD_REQUEST, 'Cash/Bank account is required');
                
                const cbAcc = await CashBankAccount.findById(cashBankAccountId).session(session);
                if (!cbAcc) throw new ApiError(httpStatus.NOT_FOUND, 'Cash/Bank account not found');

                mainLedgerId = await autoLinkCashBankLedger(cbAcc, session);
                if (!mainLedgerId) throw new ApiError(httpStatus.BAD_REQUEST, 'Main account ledger not found and auto-link failed');

                oldVoucher.paymentStatus = 'Paid';
                oldVoucher.paidAmount = processingTotal;
                if (actualNature === 'Payment' || actualNature === 'Expense') mainEntryType = 'Credit';
                else if (actualNature === 'Contra') mainEntryType = req.body.headerType || 'Debit';
            }

            await postToLedger({
                voucherId: oldVoucher._id, voucherNo, date,
                ledgerId: mainLedgerId, amount: mainVoucherCredit,
                type: mainEntryType,
                narration: narration || `Main entry for ${voucherNo}`,
                cashBankAccountId: isCreditExpense ? null : cashBankAccountId,
                financialYear: fy
            }, session);

            for (const item of oldVoucher.items) {
                await postToLedger({
                    voucherId: oldVoucher._id, voucherNo, date,
                    ledgerId: item.ledgerId, amount: isGstEnabled ? item.taxableAmount : item.amount,
                    type: item.type,
                    narration: item.narration || narration,
                    financialYear: fy
                }, session);

                if (item.adjustments && item.adjustments.length > 0) {
                    for (const adj of item.adjustments) {
                        await adjustBill(adj, actualNature, voucherNo, date, session);
                    }
                }
            }

            if (isGstEnabled) {
                const cgstLedger = await AccountLedger.findOne({ name: 'CGST Input' }).session(session);
                const sgstLedger = await AccountLedger.findOne({ name: 'SGST Input' }).session(session);
                const igstLedger = await AccountLedger.findOne({ name: 'IGST Input' }).session(session);
                const roundOffLedger = await AccountLedger.findOne({ name: 'Round Off' }).session(session);
                if (oldVoucher.totalCgst > 0 && cgstLedger) await postToLedger({ voucherId: oldVoucher._id, voucherNo, date, ledgerId: cgstLedger._id, amount: oldVoucher.totalCgst, type: 'Debit', narration: 'Input CGST', financialYear: fy }, session);
                if (oldVoucher.totalSgst > 0 && sgstLedger) await postToLedger({ voucherId: oldVoucher._id, voucherNo, date, ledgerId: sgstLedger._id, amount: oldVoucher.totalSgst, type: 'Debit', narration: 'Input SGST', financialYear: fy }, session);
                if (oldVoucher.totalIgst > 0 && igstLedger) await postToLedger({ voucherId: oldVoucher._id, voucherNo, date, ledgerId: igstLedger._id, amount: oldVoucher.totalIgst, type: 'Debit', narration: 'Input IGST', financialYear: fy }, session);
                if (oldVoucher.roundOff !== 0 && roundOffLedger) await postToLedger({ voucherId: oldVoucher._id, voucherNo, date, ledgerId: roundOffLedger._id, amount: Math.abs(oldVoucher.roundOff), type: oldVoucher.roundOff > 0 ? 'Debit' : 'Credit', narration: 'Round Off', financialYear: fy }, session);
            }

            if (actualNature === 'Expense' && expenseTdsCtx && !expenseTdsCtx.skipTds && tdsAmtApply > 0 && expenseTdsCtx.payableLedgerId) {
                if (isCreditExpense && req.body.partyId) {
                    await postToLedger({
                        voucherId: oldVoucher._id,
                        voucherNo,
                        date,
                        ledgerId: req.body.partyId,
                        amount: tdsAmtApply,
                        type: 'Debit',
                        narration: `TDS deducted u/s ${expenseTdsCtx.tdsSection}`,
                        financialYear: fy,
                    }, session);
                }
                await postToLedger({
                    voucherId: oldVoucher._id,
                    voucherNo,
                    date,
                    ledgerId: expenseTdsCtx.payableLedgerId,
                    amount: tdsAmtApply,
                    type: 'Credit',
                    narration: `TDS u/s ${expenseTdsCtx.tdsSection}`,
                    financialYear: fy,
                }, session);
            }
        }

        await oldVoucher.save({ session });

        await syncBillWiseAuditFromVoucher(
            oldVoucher,
            session,
            req.user?.id || req.user?._id,
            req.companyId,
        );

        if (
            actualNature === 'Expense' &&
            oldVoucher.tdsThresholdBaseAmount > 0 &&
            oldVoucher.tdsSupplierId &&
            oldVoucher.tdsSection &&
            !oldVoucher.tdsPopupSkipped &&
            !(oldVoucher.tdsDisabledReason && String(oldVoucher.tdsDisabledReason).trim())
        ) {
            await tdsTh.applyVoucherBillToTdsBalance(
                {
                    supplierId: oldVoucher.tdsSupplierId,
                    section: oldVoucher.tdsSection,
                    financialYear: fy,
                    baseAmount: oldVoucher.tdsThresholdBaseAmount,
                    tdsAmount: oldVoucher.tdsAmount || 0,
                    voucherId: oldVoucher._id,
                },
                req.user?.id || req.user?._id,
                session,
            );
        }

        await session.commitTransaction();
        res.send(new ApiResponse(httpStatus.OK, oldVoucher, 'Voucher updated successfully'));

    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

// ── Reversing Journal ────────────────────────────────────────────────────────

export const reverseVoucher = asyncHandler(async (req, res) => {
    const original = await Voucher.findById(req.params.id).lean();
    if (!original) throw new ApiError(httpStatus.NOT_FOUND, 'Voucher not found');
    if (original.status === 'Cancelled') throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot reverse a cancelled voucher');
    if (original.isReversed) throw new ApiError(httpStatus.BAD_REQUEST, 'Voucher is already reversed');

    const reverseDate = req.body.reverseDate ? new Date(req.body.reverseDate) : new Date();
    const { getFYFromDate } = await import('../utils/fyUtils.js');
    const fy = getFYFromDate(reverseDate);

    // Flip each item's Dr/Cr
    const reversedItems = (original.items || []).map(item => ({
        ...item,
        _id: undefined,
        type: item.type === 'Debit' ? 'Credit' : 'Debit',
    }));

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const nextNo = await getNextVoucherNo(original.voucherType, original.nature, fy, session);

        const reversal = await Voucher.create([{
            ...original,
            _id: undefined,
            voucherNo: nextNo,
            date: reverseDate,
            financialYear: fy,
            narration: `Reversing entry for ${original.voucherNo}`,
            status: 'Confirmed',
            items: reversedItems,
            originalVoucherId: original._id,
            isReversingJournal: false,
            reverseOnDate: null,
            reversedVoucherId: null,
            isReversed: false,
            createdBy: req.user?._id,
        }], { session });

        // Mark original as reversed
        await Voucher.findByIdAndUpdate(original._id, { isReversed: true, reversedVoucherId: reversal[0]._id }, { session });

        // Post ledger entries for the reversal
        await postAccountingEntry(reversal[0], session, req.user?._id, req.companyId);

        await session.commitTransaction();
        res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, reversal[0], 'Reversing entry created'));
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
});

// GET pending reversing journals (where reverseOnDate <= today and not yet reversed)
export const getPendingReversingJournals = asyncHandler(async (req, res) => {
    const today = new Date();
    const list = await Voucher.find({
        isReversingJournal: true,
        isReversed: false,
        reverseOnDate: { $lte: today },
        status: 'Confirmed',
    }).lean();
    res.send(new ApiResponse(httpStatus.OK, list));
});
