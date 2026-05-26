import mongoose from 'mongoose';
import { AccountLedger } from '../models/accountLedger.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { Voucher } from '../models/voucher.model.js';
import { isBillWiseLedger, getAgeingBucket, computeOverdueDays } from './accounting/billWiseSettlement.service.js';

const TYPE_CONFIG = {
    Receivable: {
        ledgerFilter: { $or: [{ type: 'Customer' }, { isCustomer: true }] },
        defaultGroupNames: ['Sundry Debtors', 'Customer Ledgers'],
        isDebitOutstanding: true,
    },
    Payable: {
        ledgerFilter: { $or: [{ type: 'Supplier' }, { isSupplier: true }] },
        defaultGroupNames: ['Sundry Creditors'],
        isDebitOutstanding: false,
    },
    Expense: {
        ledgerFilter: { type: 'Expense' },
        defaultGroupNames: ['Outstanding Expenses', 'Indirect Expenses', 'Direct Expenses'],
        isDebitOutstanding: false,
    },
};

const OPEN_SALES = { paymentStatus: { $ne: 'Paid' }, status: 'Confirmed', isDeleted: false };
const OPEN_PURCHASE = { paymentStatus: { $ne: 'Paid' }, status: { $in: ['Confirmed', 'Posted'] }, isDeleted: false };
const OPEN_EXPENSE_VOUCHER = {
    nature: 'Expense',
    expenseType: 'Credit',
    paymentStatus: { $ne: 'Paid' },
    status: { $ne: 'Cancelled' },
};

function withFy(base, financialYear) {
    if (!financialYear) return base;
    return { ...base, financialYear };
}

function billBalance(doc) {
    const total = Number(doc.grandTotal ?? doc.totalAmount ?? 0);
    const paid = Number(doc.paidAmount ?? 0);
    return Math.max(0, total - paid);
}

export function getTypeConfig(type) {
    return TYPE_CONFIG[type] || TYPE_CONFIG.Receivable;
}

export function buildLedgerFilter({ type, viewMode, groupId, ledgerId }) {
    const config = getTypeConfig(type);
    const filter = { status: 'Active', ...config.ledgerFilter };

    if (viewMode === 'ledger' && ledgerId && mongoose.Types.ObjectId.isValid(ledgerId)) {
        filter._id = ledgerId;
    } else if (viewMode === 'group' && groupId && mongoose.Types.ObjectId.isValid(groupId)) {
        filter.underGroup = groupId;
    }

    return { filter, config };
}

async function sumSalesOutstanding(referenceId, financialYear) {
    if (!referenceId) return { amount: 0, count: 0 };
    const query = withFy({ customerId: referenceId, ...OPEN_SALES }, financialYear);
    const bills = await SalesInvoice.find(query).select('grandTotal paidAmount').lean();
    return {
        amount: bills.reduce((s, b) => s + billBalance(b), 0),
        count: bills.length,
    };
}

async function sumPurchaseOutstanding(referenceId, financialYear) {
    if (!referenceId) return { amount: 0, count: 0 };
    const query = withFy({ supplierId: referenceId, ...OPEN_PURCHASE }, financialYear);
    const bills = await PurchaseInvoice.find(query).select('grandTotal paidAmount').lean();
    return {
        amount: bills.reduce((s, b) => s + billBalance(b), 0),
        count: bills.length,
    };
}

async function sumExpenseVoucherOutstanding(partyLedgerId, financialYear) {
    if (!partyLedgerId) return { amount: 0, count: 0 };
    const query = withFy({ partyId: partyLedgerId, ...OPEN_EXPENSE_VOUCHER }, financialYear);
    const bills = await Voucher.find(query).select('totalAmount paidAmount').lean();
    return {
        amount: bills.reduce((s, b) => s + billBalance(b), 0),
        count: bills.length,
    };
}

export async function getLedgerBillStats(ledger, type, financialYear) {
    if (type === 'Receivable') {
        return sumSalesOutstanding(ledger.referenceId, financialYear);
    }
    if (type === 'Payable') {
        const purchase = await sumPurchaseOutstanding(ledger.referenceId, financialYear);
        const expense = await sumExpenseVoucherOutstanding(ledger._id, financialYear);
        return { amount: purchase.amount + expense.amount, count: purchase.count + expense.count };
    }
    if (type === 'Expense') {
        return sumExpenseVoucherOutstanding(ledger._id, financialYear);
    }
    return { amount: 0, count: 0 };
}

export function resolveOutstandingAmount(ledger, type, config, billAmount) {
    const bal = Number(ledger.currentBalance) || 0;
    const fromBills = Number(billAmount) || 0;
    const balanceOutstanding = config.isDebitOutstanding
        ? (bal > 0 ? bal : 0)
        : (bal < 0 ? Math.abs(bal) : 0);
    const outstanding = Math.max(balanceOutstanding, fromBills);
    const isOutstanding = outstanding > 0.005;

    return { outstanding, isOutstanding };
}

export async function getOutstandingSummaryRows({
    type = 'Receivable',
    showAll = false,
    viewMode = 'group',
    groupId,
    ledgerId,
    financialYear,
}) {
    const isShowAll = showAll === true || showAll === 'true';
    const { filter, config } = buildLedgerFilter({ type, viewMode, groupId, ledgerId });

    if (viewMode === 'group' && !groupId) return [];
    if (viewMode === 'ledger' && !ledgerId) return [];

    let ledgers = await AccountLedger.find(filter).sort({ name: 1 }).lean();
    ledgers = ledgers.filter(isBillWiseLedger);

    const summary = [];

    for (const ledger of ledgers) {
        const { amount: billAmount, count: billCount } = await getLedgerBillStats(ledger, type, financialYear);
        const { outstanding, isOutstanding } = resolveOutstandingAmount(ledger, type, config, billAmount);

        if (isShowAll || isOutstanding) {
            const ageingHint = await getLedgerMaxAgeing(ledger, type, financialYear);
            summary.push({
                ledgerId: ledger._id,
                ledgerName: ledger.name,
                groupId: ledger.underGroup,
                groupName: ledger.groupName || '',
                outstanding,
                billCount,
                overdueDays: ageingHint.overdueDays,
                ageingBucket: ageingHint.ageingBucket,
            });
        }
    }

    return summary;
}

async function getLedgerMaxAgeing(ledger, type, financialYear) {
    if (!ledger.referenceId) return { overdueDays: 0, ageingBucket: '0-30' };
    const fyMatch = financialYear ? { financialYear } : {};
    let maxDays = 0;
    if (type === 'Receivable') {
        const bills = await SalesInvoice.find({
            customerId: ledger.referenceId,
            paymentStatus: { $ne: 'Paid' },
            status: 'Confirmed',
            isDeleted: false,
            ...fyMatch,
        }).select('paymentDueDate grandTotal roundedTotal paidAmount').lean();
        for (const b of bills) {
            const pending = Math.max(0, (b.roundedTotal || b.grandTotal || 0) - (b.paidAmount || 0));
            maxDays = Math.max(maxDays, computeOverdueDays(b.paymentDueDate, pending));
        }
    } else if (type === 'Payable') {
        const bills = await PurchaseInvoice.find({
            supplierId: ledger.referenceId,
            paymentStatus: { $ne: 'Paid' },
            status: { $in: ['Confirmed', 'Posted'] },
            isDeleted: false,
            ...fyMatch,
        }).select('dueDate grandTotal paidAmount').lean();
        for (const b of bills) {
            const pending = Math.max(0, (b.grandTotal || 0) - (b.paidAmount || 0));
            maxDays = Math.max(maxDays, computeOverdueDays(b.dueDate, pending));
        }
    }
    return { overdueDays: maxDays, ageingBucket: getAgeingBucket(maxDays) };
}
