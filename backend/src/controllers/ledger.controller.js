import httpStatus from 'http-status';
import fs from 'fs';
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
    const { ledgerId, startDate, endDate } = req.query; // Page uses startDate/endDate in filters
    const filter = { ledgerId };
    if (startDate || endDate) {
        filter.date = {};
        if (startDate) filter.date.$gte = new Date(startDate);
        if (endDate) filter.date.$lte = new Date(endDate);
    }

    const ledger = await AccountLedger.findById(ledgerId);
    if (!ledger) throw new ApiError(httpStatus.NOT_FOUND, 'Ledger not found');

    // Calculate opening balance for the period
    const preEntries = await LedgerEntry.find({
        ledgerId,
        date: { $lt: startDate ? new Date(startDate) : new Date(0) }
    }).lean();

    let openingBalance = ledger.openingBalance || 0;
    preEntries.forEach(e => {
        openingBalance += e.type === 'Debit' ? e.amount : -e.amount;
    });

    const entries = await LedgerEntry.find(filter).sort({ date: 1, _id: 1 }).lean();

    let periodDebit = 0;
    let periodCredit = 0;
    let runningBalance = openingBalance;

    // Fetch all related entries to find the opposite ledger name
    const voucherIds = entries.map(e => e.voucherId);
    const relatedEntries = await LedgerEntry.find({ 
        voucherId: { $in: voucherIds }
    }).lean();

    const oppositeNamesByVoucher = {};
    relatedEntries.forEach(re => {
        if (re.ledgerId.toString() !== ledgerId.toString()) {
            const vId = re.voucherId.toString();
            if (!oppositeNamesByVoucher[vId]) oppositeNamesByVoucher[vId] = [];
            oppositeNamesByVoucher[vId].push(re.ledgerName);
        }
    });

    try {
        import('fs').then(fs => {
            fs.writeFileSync('debug_ledger.json', JSON.stringify({
                ledgerId,
                voucherIds: voucherIds.map(id => id?.toString()),
                relatedEntriesCount: relatedEntries.length,
                relatedEntries: relatedEntries.map(re => ({ vId: re.voucherId?.toString(), lId: re.ledgerId?.toString(), lName: re.ledgerName })),
                oppositeNamesByVoucher
            }, null, 2));
        });
    } catch(e) {}

    const processedEntries = entries.map(entry => {
        if (entry.type === 'Debit') {
            periodDebit += entry.amount;
            runningBalance += entry.amount;
        } else {
            periodCredit += entry.amount;
            runningBalance -= entry.amount;
        }
        
        const vId = entry.voucherId.toString();
        const oppositeName = oppositeNamesByVoucher[vId]?.join(', ') || 'Various Accounts';
        
        return {
            ...entry,
            oppositeName,
            runningBalance
        };
    });

    try {
        fs.writeFileSync('debug_ledger.json', JSON.stringify({
            receivedLedgerId: ledgerId,
            oppositeNamesByVoucher,
            sampleProcessedEntry: processedEntries[0]
        }, null, 2));
    } catch(e) {}


    res.send(new ApiResponse(httpStatus.OK, {
        entries: processedEntries,
        openingBalance,
        periodDebit,
        periodCredit,
        closingBalance: runningBalance
    }));
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
