/**
 * Indexed dependency / View Usage discovery — company-scoped, no full DB scans.
 */
import mongoose from 'mongoose';
import { AccountLedger } from '../../models/accountLedger.model.js';
import { LedgerEntry } from '../../models/ledgerEntry.model.js';
import { SalesInvoice } from '../../models/salesInvoice.model.js';
import { SalesOrder } from '../../models/salesOrder.model.js';
import { CreditDebitNote } from '../../models/creditDebitNote.model.js';
import { PurchaseInvoice } from '../../models/purchaseInvoice.model.js';
import { PurchaseOrder } from '../../models/purchaseOrder.model.js';
import { PaymentEntry } from '../../models/paymentEntry.model.js';
import { Voucher } from '../../models/voucher.model.js';
import { GRN } from '../../models/grn.model.js';
import { BOM } from '../../models/bom.model.js';
import { Gstr1PeriodStatus } from '../../models/gstr1PeriodStatus.model.js';
import { MASTER_TYPES } from './fieldCategories.js';

function oid(id) {
    if (!id) return null;
    try {
        return new mongoose.Types.ObjectId(String(id));
    } catch {
        return null;
    }
}

function companyFilter(companyId) {
    return companyId ? { companyId: oid(companyId) } : {};
}

function returnPeriodFromDate(d) {
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return '';
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}

async function filedPeriodsSet(companyId) {
    if (!companyId) return new Set();
    const rows = await Gstr1PeriodStatus.find({
        companyId: oid(companyId),
        status: 'Filed',
    })
        .select('returnPeriod')
        .lean();
    return new Set(rows.map((r) => r.returnPeriod));
}

export async function discoverCustomerDependencies(customerId, companyId) {
    const id = oid(customerId);
    const cf = companyFilter(companyId);
    const base = { customerId: id, isDeleted: { $ne: true }, ...cf };

    const ledger = await AccountLedger.findOne({
        referenceId: id,
        referenceModel: 'Customer',
        ...cf,
    })
        .select('_id')
        .lean();

    const [
        salesInvoices,
        salesOrders,
        creditNotes,
        outstandingBills,
        attachments,
    ] = await Promise.all([
        SalesInvoice.countDocuments(base),
        SalesOrder.countDocuments({ customerId: id, isDeleted: { $ne: true }, ...cf }),
        CreditDebitNote.countDocuments({
            customerId: id,
            noteType: 'Credit Note',
            isDeleted: { $ne: true },
            ...cf,
        }),
        SalesInvoice.countDocuments({
            ...base,
            paymentStatus: { $in: ['Unpaid', 'Partially Paid'] },
            status: { $ne: 'Cancelled' },
        }),
        Promise.resolve(0),
    ]);

    let receipts = 0;
    let payments = 0;
    if (ledger?._id) {
        [receipts, payments] = await Promise.all([
            Voucher.countDocuments({
                partyId: ledger._id,
                nature: 'Receipt',
                status: { $ne: 'Cancelled' },
                ...cf,
            }),
            Voucher.countDocuments({
                partyId: ledger._id,
                nature: 'Payment',
                status: { $ne: 'Cancelled' },
                ...cf,
            }),
        ]);
    }

    const invoices = await SalesInvoice.find(base)
        .select('_id invoiceDate financialYear eInvoiceStatus irn customerName customerGstin gstr1CategorySnapshot')
        .lean();
    const filedSet = await filedPeriodsSet(companyId);
    let openGstr1 = 0;
    let filedGstr1 = 0;
    let eInvoiced = 0;
    for (const inv of invoices) {
        const period = returnPeriodFromDate(inv.invoiceDate);
        if (filedSet.has(period)) filedGstr1 += 1;
        else openGstr1 += 1;
        if (inv.irn || inv.eInvoiceStatus === 'Generated') eInvoiced += 1;
    }

    return {
        masterType: MASTER_TYPES.CUSTOMER,
        masterId: String(id),
        linkedLedgerId: ledger?._id ? String(ledger._id) : null,
        counts: {
            salesOrders,
            salesInvoices,
            receipts,
            payments,
            creditNotes,
            outstandingBills,
            gstr1Records: invoices.length,
            openGstr1,
            filedGstr1,
            eInvoiced,
            attachments,
        },
        invoices,
        filedPeriods: [...filedSet],
    };
}

export async function discoverSupplierDependencies(supplierId, companyId) {
    const id = oid(supplierId);
    const cf = companyFilter(companyId);
    const base = { supplierId: id, isDeleted: { $ne: true }, ...cf };

    const ledger = await AccountLedger.findOne({
        referenceId: id,
        referenceModel: 'Supplier',
        ...cf,
    })
        .select('_id')
        .lean();

    const [purchaseInvoices, purchaseOrders, paymentEntries, grns] = await Promise.all([
        PurchaseInvoice.countDocuments(base),
        PurchaseOrder.countDocuments({ supplierId: id, isDeleted: { $ne: true }, ...cf }),
        PaymentEntry.countDocuments({ supplierId: id, ...cf }),
        GRN.countDocuments({ supplierId: id, ...cf }),
    ]);
    const debitNotes = 0; // Debit notes in this CRM are customer-linked; supplier CN/DN not counted here

    let voucherPayments = 0;
    if (ledger?._id) {
        voucherPayments = await Voucher.countDocuments({
            partyId: ledger._id,
            nature: 'Payment',
            status: { $ne: 'Cancelled' },
            ...cf,
        });
    }

    const invoices = await PurchaseInvoice.find(base)
        .select('_id invoiceDate financialYear supplierName supplierGstin')
        .lean();

    return {
        masterType: MASTER_TYPES.SUPPLIER,
        masterId: String(id),
        linkedLedgerId: ledger?._id ? String(ledger._id) : null,
        counts: {
            purchaseOrders,
            purchaseInvoices,
            payments: paymentEntries + voucherPayments,
            debitNotes,
            grns,
            outstandingBills: await PurchaseInvoice.countDocuments({
                ...base,
                paymentStatus: { $in: ['Unpaid', 'Partially Paid'] },
            }).catch(() => 0),
        },
        invoices,
    };
}

export async function discoverLedgerDependencies(ledgerId, companyId) {
    const id = oid(ledgerId);
    const cf = companyFilter(companyId);

    const [ledgerEntries, vouchersAsParty, vouchersAsLine] = await Promise.all([
        LedgerEntry.countDocuments({ ledgerId: id, ...cf }),
        Voucher.countDocuments({ partyId: id, status: { $ne: 'Cancelled' }, ...cf }),
        Voucher.countDocuments({ 'items.ledgerId': id, status: { $ne: 'Cancelled' }, ...cf }),
    ]);

    const fyAgg = await LedgerEntry.aggregate([
        { $match: { ledgerId: id, ...(companyId ? { companyId: oid(companyId) } : {}) } },
        {
            $group: {
                _id: '$financialYear',
                count: { $sum: 1 },
                minDate: { $min: '$date' },
                maxDate: { $max: '$date' },
            },
        },
    ]);

    return {
        masterType: MASTER_TYPES.LEDGER,
        masterId: String(id),
        counts: {
            ledgerEntries,
            vouchers: vouchersAsParty + vouchersAsLine,
            trialBalance: ledgerEntries > 0 ? 1 : 0,
            profitAndLoss: ledgerEntries > 0 ? 1 : 0,
            balanceSheet: ledgerEntries > 0 ? 1 : 0,
            outstanding: 0,
        },
        financialYears: fyAgg.map((r) => ({
            financialYear: r._id || 'Unknown',
            entryCount: r.count,
            minDate: r.minDate,
            maxDate: r.maxDate,
        })),
    };
}

export async function discoverItemDependencies(itemId, companyId) {
    const id = oid(itemId);
    const cf = companyFilter(companyId);

    const [siLines, piLines, boms] = await Promise.all([
        SalesInvoice.countDocuments({ 'items.itemId': id, isDeleted: { $ne: true }, ...cf }),
        PurchaseInvoice.countDocuments({ 'items.itemId': id, isDeleted: { $ne: true }, ...cf }),
        BOM.countDocuments({ $or: [{ itemId: id }, { 'components.itemId': id }], ...cf }).catch(() => 0),
    ]);

    const invoices = await SalesInvoice.find({
        'items.itemId': id,
        isDeleted: { $ne: true },
        ...cf,
    })
        .select('_id invoiceDate financialYear eInvoiceStatus irn items.itemId items.hsnCode')
        .lean();

    const filedSet = await filedPeriodsSet(companyId);
    let openLines = 0;
    let filedLines = 0;
    let eInvoiceLines = 0;
    for (const inv of invoices) {
        const period = returnPeriodFromDate(inv.invoiceDate);
        const lineCount = (inv.items || []).filter((l) => String(l.itemId) === String(id)).length || 1;
        const isEi = Boolean(inv.irn) || inv.eInvoiceStatus === 'Generated';
        if (isEi) eInvoiceLines += lineCount;
        if (filedSet.has(period) || isEi) filedLines += lineCount;
        else openLines += lineCount;
    }

    return {
        masterType: MASTER_TYPES.ITEM,
        masterId: String(id),
        counts: {
            salesInvoiceLines: siLines,
            purchaseInvoiceLines: piLines,
            purchaseReferences: piLines,
            boms,
            stockMovements: 0,
            production: 0,
            openGstr1Hsn: openLines,
            filedGstr1Hsn: filedLines,
            openSalesInvoiceLines: openLines,
            filedInvoiceLines: filedLines,
            eInvoiceLines,
            eInvoiced: eInvoiceLines,
        },
        invoices,
        filedPeriods: [...filedSet],
    };
}

export async function discoverDependencies(masterType, masterId, companyId) {
    switch (masterType) {
        case MASTER_TYPES.CUSTOMER:
            return discoverCustomerDependencies(masterId, companyId);
        case MASTER_TYPES.SUPPLIER:
            return discoverSupplierDependencies(masterId, companyId);
        case MASTER_TYPES.LEDGER:
            return discoverLedgerDependencies(masterId, companyId);
        case MASTER_TYPES.ITEM:
            return discoverItemDependencies(masterId, companyId);
        default:
            throw new Error(`Unsupported master type: ${masterType}`);
    }
}
