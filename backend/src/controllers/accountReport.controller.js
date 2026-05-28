import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { Voucher } from '../models/voucher.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';

/**
 * Sales Register: Combination of Sales Invoices and Sales Vouchers
 */
export const getSalesRegister = asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const filter = {};
    if (from || to) {
        filter.invoiceDate = {};
        if (from) filter.invoiceDate.$gte = new Date(from);
        if (to) filter.invoiceDate.$lte = new Date(to);
    }

    const invoices = await SalesInvoice.find({ ...filter, isDeleted: { $ne: true } })
        .sort({ invoiceDate: -1, invoiceNumber: -1 })
        .populate('customerId', 'name')
        .populate('seriesId', 'seriesName isEstimate gstApplicable')
        .lean();

    const registerRows = invoices.map((inv) => {
        const isCancelled = inv.status === 'Cancelled';
        if (!isCancelled) return inv;
        return {
            ...inv,
            registerStatus: 'CANCELLED',
            totalTaxableAmount: 0,
            totalBeforeTax: 0,
            totalTaxAmount: 0,
            totalGst: 0,
            totalCgst: 0,
            totalSgst: 0,
            totalIgst: 0,
            totalCessAmount: 0,
            grandTotal: 0,
            roundedTotal: 0,
            items: (inv.items || []).map((it) => ({
                ...it,
                taxableAmount: 0,
                cgstAmount: 0,
                sgstAmount: 0,
                igstAmount: 0,
                cessAmount: 0,
                totalAmount: 0,
            })),
        };
    });

    res.send(new ApiResponse(httpStatus.OK, registerRows));
});

/**
 * Purchase Register
 */
export const getPurchaseRegister = asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const filter = {};
    if (from || to) {
        filter.invoiceDate = {};
        if (from) filter.invoiceDate.$gte = new Date(from);
        if (to) filter.invoiceDate.$lte = new Date(to);
    }

    const invoices = await PurchaseInvoice.find({ ...filter, isDeleted: false })
        .sort({ invoiceDate: -1, invoiceNumber: -1 })
        .populate('supplierId', 'name')
        .lean();

    res.send(new ApiResponse(httpStatus.OK, invoices));
});

/**
 * Day Book: All accounting vouchers for a period
 */
export const getDayBook = asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const filter = {};
    if (from || to) {
        filter.date = {};
        if (from) filter.date.$gte = new Date(from);
        if (to) filter.date.$lte = new Date(to);
    }

    const vouchers = await Voucher.find(filter)
        .sort({ date: -1, voucherNo: -1 })
        .populate('items.ledgerId', 'name')
        .lean();

    res.send(new ApiResponse(httpStatus.OK, vouchers));
});

/**
 * Cash/Bank Book: Transactions for specific account
 */
export const getCashBankBook = asyncHandler(async (req, res) => {
    const { ledgerId, from, to } = req.query;
    if (!ledgerId) {
        // Fallback: get first Cash ledger if not specified
        const cashLedger = await AccountLedger.findOne({ isCashLedger: true });
        if (!cashLedger) return res.send(new ApiResponse(httpStatus.OK, []));
        // Recurse or just use id
    }

    const filter = {
        $or: [
            { 'items.ledgerId': ledgerId },
            { 'cashBankAccountId': ledgerId } // This depends on how we store it. 
            // In our current model, cashBankAccountId is a ref to CashBankAccount. 
            // We need to find the Ledger associated with that CashBankAccount.
        ]
    };

    if (from || to) {
        filter.date = {};
        if (from) filter.date.$gte = new Date(from);
        if (to) filter.date.$lte = new Date(to);
    }

    const vouchers = await Voucher.find(filter)
        .sort({ date: 1, voucherNo: 1 })
        .populate('items.ledgerId', 'name')
        .lean();

    res.send(new ApiResponse(httpStatus.OK, vouchers));
});

/**
 * Expense Register: All expense vouchers with payment status
 */
export const getExpenseRegister = asyncHandler(async (req, res) => {
    const { from, to, paymentStatus, expenseType } = req.query;
    const filter = { nature: 'Expense' };

    if (from || to) {
        filter.date = {};
        if (from) filter.date.$gte = new Date(from);
        if (to) filter.date.$lte = new Date(to);
    }

    if (paymentStatus) {
        filter.paymentStatus = paymentStatus;
    }

    if (expenseType) {
        filter.expenseType = expenseType;
    }

    const vouchers = await Voucher.find(filter)
        .sort({ date: -1, voucherNo: -1 })
        .populate('partyId', 'name')
        .populate('items.ledgerId', 'name')
        .lean();

    res.send(new ApiResponse(httpStatus.OK, vouchers));
});
