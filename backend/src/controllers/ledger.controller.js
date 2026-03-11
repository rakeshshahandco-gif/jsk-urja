import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { LedgerEntry } from '../models/ledgerEntry.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';

export const getLedgers = asyncHandler(async (req, res) => {
    const { group, type, search } = req.query;
    const filter = {};
    if (group) filter.group = group;
    if (type) filter.type = type;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const ledgers = await AccountLedger.find(filter).sort({ name: 1 });
    res.send(new ApiResponse(httpStatus.OK, ledgers));
});

export const getLedgerReport = asyncHandler(async (req, res) => {
    const { ledgerId, from, to } = req.query;
    const filter = { ledgerId };
    if (from || to) {
        filter.date = {};
        if (from) filter.date.$gte = new Date(from);
        if (to) filter.date.$lte = new Date(to);
    }

    const entries = await LedgerEntry.find(filter).sort({ date: 1, _id: 1 }).lean();

    // Calculate opening balance for the period
    const ledger = await AccountLedger.findById(ledgerId);
    const preEntries = await LedgerEntry.find({
        ledgerId,
        date: { $lt: from ? new Date(from) : new Date(0) }
    }).lean();

    let opening = ledger.openingBalance;
    preEntries.forEach(e => {
        opening += e.type === 'Debit' ? e.amount : -e.amount;
    });

    res.send(new ApiResponse(httpStatus.OK, { entries, opening }));
});

/**
 * Get Outstanding Invoices for a specific Party Ledger
 */
export const getOutstandingBills = asyncHandler(async (req, res) => {
    const { ledgerId } = req.params;
    const ledger = await AccountLedger.findById(ledgerId);
    if (!ledger || !ledger.referenceId) {
        return res.send(new ApiResponse(httpStatus.OK, []));
    }

    let bills = [];
    if (ledger.type === 'Customer') {
        bills = await SalesInvoice.find({
            customerId: ledger.referenceId,
            paymentStatus: { $ne: 'Paid' },
            status: 'Confirmed'
        }).sort({ invoiceDate: 1 }).lean();
    } else if (ledger.type === 'Supplier') {
        bills = await PurchaseInvoice.find({
            supplierId: ledger.referenceId,
            paymentStatus: { $ne: 'Paid' },
            status: { $in: ['Confirmed', 'Posted'] }
        }).sort({ invoiceDate: 1 }).lean();
    }

    res.send(new ApiResponse(httpStatus.OK, bills));
});

export const getCashBankBalances = asyncHandler(async (req, res) => {
    const balances = await AccountLedger.find({ type: { $in: ['Cash', 'Bank'] } })
        .select('name currentBalance type referenceId')
        .lean();
    res.send(new ApiResponse(httpStatus.OK, balances));
});

export const getOutstandingSummary = asyncHandler(async (req, res) => {
    const { type } = req.query; // Receivable or Payable
    const ledgerType = type === 'Receivable' ? 'Customer' : 'Supplier';

    const ledgers = await AccountLedger.find({ type: ledgerType }).lean();
    const summary = [];

    for (const ledger of ledgers) {
        let billCount = 0;
        if (ledgerType === 'Customer') {
            billCount = await SalesInvoice.countDocuments({
                customerId: ledger.referenceId,
                paymentStatus: { $ne: 'Paid' },
                status: 'Confirmed'
            });
        } else {
            billCount = await PurchaseInvoice.countDocuments({
                supplierId: ledger.referenceId,
                paymentStatus: { $ne: 'Paid' },
                status: { $in: ['Confirmed', 'Posted'] }
            });
        }

        if (ledger.currentBalance !== 0 || billCount > 0) {
            summary.push({
                ledgerId: ledger._id,
                ledgerName: ledger.name,
                outstanding: Math.abs(ledger.currentBalance),
                billCount
            });
        }
    }

    res.send(new ApiResponse(httpStatus.OK, summary));
});
