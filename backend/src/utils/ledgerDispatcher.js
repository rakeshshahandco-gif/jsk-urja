import { Voucher } from '../models/voucher.model.js';
import { VoucherType } from '../models/voucherType.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { LedgerEntry } from '../models/ledgerEntry.model.js';
import { ApiError } from './ApiError.js';
import httpStatus from 'http-status';

/**
 * Helper to post to ledger and update balance
 */
const postEntry = async (data, session) => {
    const { voucherId, voucherNo, date, ledgerId, amount, type, narration } = data;
    if (amount <= 0) return;

    const ledger = await AccountLedger.findById(ledgerId).session(session);
    if (!ledger) throw new ApiError(httpStatus.NOT_FOUND, `Ledger ${ledgerId} not found`);

    await LedgerEntry.create([{
        voucherId, voucherNo, date, ledgerId, ledgerName: ledger.name,
        amount, type, narration
    }], { session });

    // Debit increases Asset/Expense, decreases Liability/Income
    // Credit increases Liability/Income, decreases Asset/Expense
    // We use a simple currentBalance: Debit is +, Credit is -
    const change = type === 'Debit' ? amount : -amount;
    ledger.currentBalance += change;
    await ledger.save({ session });
};

/**
 * Automates Ledger Posting for Sales Invoice
 */
export const postSalesInvoiceToLedger = async (invoice, userId, session) => {
    // 1. Get or Create Voucher Type for Sales
    let vType = await VoucherType.findOne({ nature: 'Sales' }).session(session);
    if (!vType) {
        vType = await VoucherType.create([{
            name: 'Sales Invoice',
            nature: 'Sales',
            prefix: 'SAL/',
            autoNumbering: true,
            createdBy: userId
        }], { session });
        vType = vType[0];
    }

    const voucherNo = invoice.invoiceNumber; // Use invoice number as voucher number for consistency
    const date = invoice.invoiceDate || new Date();

    // 2. Identify Ledgers
    let customerLedger;
    if (invoice.customerId) customerLedger = await AccountLedger.findOne({ referenceId: invoice.customerId }).session(session);
    if (!customerLedger && invoice.customerName) customerLedger = await AccountLedger.findOne({ name: invoice.customerName }).session(session);

    const salesLedger = await AccountLedger.findOne({ name: 'Sales Account' }).session(session);
    const cgstLedger = await AccountLedger.findOne({ name: 'CGST Output' }).session(session);
    const sgstLedger = await AccountLedger.findOne({ name: 'SGST Output' }).session(session);
    const igstLedger = await AccountLedger.findOne({ name: 'IGST Output' }).session(session);
    const roundOffLedger = await AccountLedger.findOne({ name: 'Round Off' }).session(session);
    const freightLedger = await AccountLedger.findOne({ name: 'Freight & Forwarding Charges' }).session(session);

    if (!customerLedger) throw new ApiError(400, `Ledger not found for customer: ${invoice.customerName}`);
    if (!salesLedger) throw new ApiError(400, "System ledger 'Sales Account' missing. Please run accounting initialization.");
    if (invoice.freightAmount && invoice.freightAmount > 0 && !freightLedger) throw new ApiError(400, "System ledger 'Freight & Forwarding Charges' missing. Please run accounting initialization.");

    // 3. Create Voucher
    const voucher = await Voucher.create([{
        voucherNo,
        voucherType: vType._id,
        nature: 'Sales',
        date,
        partyId: customerLedger._id,
        partyName: customerLedger.name,
        totalAmount: invoice.roundedTotal || invoice.grandTotal,
        narration: `Auto-generated from Sales Invoice ${invoice.invoiceNumber}`,
        isSystemGenerated: true,
        createdBy: userId,
        status: 'Confirmed'
    }], { session });

    const vId = voucher[0]._id;

    // 4. Post Entries
    // Debit Customer (Total)
    await postEntry({
        voucherId: vId, voucherNo, date,
        ledgerId: customerLedger._id, amount: invoice.roundedTotal || invoice.grandTotal,
        type: 'Debit', narration: `Sale to ${invoice.customerName}`
    }, session);

    // Credit Sales Account (Taxable minus freight)
    // Wait, invoice.totalTaxableAmount currently includes freight in calcInvoiceTotals.
    // If we separate them, we need to know the base taxable vs freight.
    // Actually, in `calcInvoiceTotals` (salesInvoice.controller.js line 110), it returns `totalTaxableAmount: taxableWithFreight`
    // Let's deduce the base sales by subtracting freight that was added.
    const baseSalesTaxable = invoice.totalTaxableAmount - (invoice.freightAmount || 0);
    
    await postEntry({
        voucherId: vId, voucherNo, date,
        ledgerId: salesLedger._id, amount: baseSalesTaxable,
        type: 'Credit', narration: `Revenue from Sales`
    }, session);

    // Credit Freight Account
    if (invoice.freightAmount && invoice.freightAmount > 0 && freightLedger) {
        await postEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: freightLedger._id, amount: invoice.freightAmount,
            type: 'Credit', narration: `Freight & Forwarding Income`
        }, session);
    }

    // Credit GST Output
    if (invoice.totalCgst > 0 && cgstLedger) {
        await postEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: cgstLedger._id, amount: invoice.totalCgst,
            type: 'Credit', narration: 'Output CGST'
        }, session);
    }
    if (invoice.totalSgst > 0 && sgstLedger) {
        await postEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: sgstLedger._id, amount: invoice.totalSgst,
            type: 'Credit', narration: 'Output SGST'
        }, session);
    }
    if (invoice.totalIgst > 0 && igstLedger) {
        await postEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: igstLedger._id, amount: invoice.totalIgst,
            type: 'Credit', narration: 'Output IGST'
        }, session);
    }

    // Round Off
    if (invoice.roundOff && roundOffLedger) {
        const type = invoice.roundOff > 0 ? 'Credit' : 'Debit';
        await postEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: roundOffLedger._id, amount: Math.abs(invoice.roundOff),
            type, narration: 'Invoice Round Off'
        }, session);
    }

    return vId;
};

/**
 * Automates Ledger Posting for Purchase Invoice
 */
export const postPurchaseInvoiceToLedger = async (invoice, userId, session) => {
    // 1. Get or Create Voucher Type for Purchase
    let vType = await VoucherType.findOne({ nature: 'Purchase' }).session(session);
    if (!vType) {
        vType = await VoucherType.create([{
            name: 'Purchase Invoice',
            nature: 'Purchase',
            prefix: 'PUR/',
            autoNumbering: true,
            createdBy: userId
        }], { session });
        vType = vType[0];
    }

    const voucherNo = invoice.invoiceNumber;
    const date = invoice.invoiceDate || new Date();

    // 2. Identify Ledgers
    let supplierLedger;
    if (invoice.supplierId) supplierLedger = await AccountLedger.findOne({ referenceId: invoice.supplierId }).session(session);
    if (!supplierLedger && invoice.supplierName) supplierLedger = await AccountLedger.findOne({ name: invoice.supplierName }).session(session);

    const purchaseLedger = await AccountLedger.findOne({ name: 'Purchase Account' }).session(session);
    const cgstInputLedger = await AccountLedger.findOne({ name: 'CGST Input' }).session(session);
    const sgstInputLedger = await AccountLedger.findOne({ name: 'SGST Input' }).session(session);
    const igstInputLedger = await AccountLedger.findOne({ name: 'IGST Input' }).session(session);
    const roundOffLedger = await AccountLedger.findOne({ name: 'Round Off' }).session(session);
    const freightLedger = await AccountLedger.findOne({ name: 'Freight Inward' }).session(session);

    if (!supplierLedger) throw new ApiError(400, `Ledger not found for supplier: ${invoice.supplierName}`);
    if (!purchaseLedger) throw new ApiError(400, "System ledger 'Purchase Account' missing. Please run accounting initialization.");
    if (invoice.freightAmount && invoice.freightAmount > 0 && !freightLedger) throw new ApiError(400, "System ledger 'Freight Inward' missing. Please run accounting initialization.");

    // 3. Resolve amounts — use stored totals on the invoice (source of truth)
    const grandTotal   = Math.round(invoice.grandTotal || 0);
    const freightAmt   = Math.round((invoice.freightAmount || 0) * 100) / 100;
    const igstAmt      = Math.round((invoice.totalIgst   || 0) * 100) / 100;
    const cgstAmt      = Math.round((invoice.totalCgst   || 0) * 100) / 100;
    const sgstAmt      = Math.round((invoice.totalSgst   || 0) * 100) / 100;
    const roundOffAmt  = invoice.roundOff || 0;

    // Positive roundOff is a debit, negative roundOff is a credit
    const roundOffDebit  = roundOffAmt > 0 ? Math.round(roundOffAmt * 100) / 100 : 0;
    const roundOffCredit = roundOffAmt < 0 ? Math.round(Math.abs(roundOffAmt) * 100) / 100 : 0;

    // Purchase Account = grandTotal − GST debits − freight − net roundOff debit
    // This guarantees Debits == Credits (grandTotal = Credit to Supplier) always.
    const purchaseDebit = Math.round(
        (grandTotal - igstAmt - cgstAmt - sgstAmt - freightAmt - roundOffDebit + roundOffCredit) * 100
    ) / 100;

    // 4. Create Voucher
    const voucher = await Voucher.create([{
        voucherNo,
        voucherType: vType._id,
        nature: 'Purchase',
        date,
        partyId: supplierLedger._id,
        partyName: supplierLedger.name,
        totalAmount: grandTotal,
        narration: `Auto-generated from Purchase Invoice ${invoice.invoiceNumber} from ${invoice.supplierName}`,
        isSystemGenerated: true,
        createdBy: userId,
        status: 'Confirmed'
    }], { session });

    const vId = voucher[0]._id;

    // 5. Post Debit Entries
    // Debit Purchase Account (taxable value derived from grandTotal to ensure balance)
    if (purchaseDebit > 0) {
        await postEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: purchaseLedger._id, amount: purchaseDebit,
            type: 'Debit', narration: `Direct Purchase`
        }, session);
    }

    // Debit Freight Inward Account
    if (freightAmt > 0 && freightLedger) {
        await postEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: freightLedger._id, amount: freightAmt,
            type: 'Debit', narration: `Freight Inward Expense`
        }, session);
    }

    // Debit GST Input
    if (cgstAmt > 0 && cgstInputLedger) {
        await postEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: cgstInputLedger._id, amount: cgstAmt,
            type: 'Debit', narration: 'Input CGST'
        }, session);
    }
    if (sgstAmt > 0 && sgstInputLedger) {
        await postEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: sgstInputLedger._id, amount: sgstAmt,
            type: 'Debit', narration: 'Input SGST'
        }, session);
    }
    if (igstAmt > 0 && igstInputLedger) {
        await postEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: igstInputLedger._id, amount: igstAmt,
            type: 'Debit', narration: 'Input IGST'
        }, session);
    }

    // Round Off
    if (roundOffDebit > 0 && roundOffLedger) {
        await postEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: roundOffLedger._id, amount: roundOffDebit,
            type: 'Debit', narration: 'Invoice Round Off'
        }, session);
    }
    if (roundOffCredit > 0 && roundOffLedger) {
        await postEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: roundOffLedger._id, amount: roundOffCredit,
            type: 'Credit', narration: 'Invoice Round Off'
        }, session);
    }

    // Credit Supplier (always equals grandTotal — Debit side is guaranteed to match)
    await postEntry({
        voucherId: vId, voucherNo, date,
        ledgerId: supplierLedger._id, amount: grandTotal,
        type: 'Credit', narration: `Purchased from ${invoice.supplierName}`
    }, session);

    return vId;
};

/**
 * Reverses Financial Impacts when Invoice is Cancelled
 */
export const reverseInvoiceLedgerImpact = async (voucherNo, session) => {
    const voucher = await Voucher.findOne({ voucherNo }).session(session);
    if (!voucher) return;

    if (voucher.status === 'Cancelled') return;

    const entries = await LedgerEntry.find({ voucherId: voucher._id }).session(session);
    for (const entry of entries) {
        const ledger = await AccountLedger.findById(entry.ledgerId).session(session);
        // Reverse balance: if Debit (+), subtract. if Credit (-), add.
        const reverseChange = entry.type === 'Debit' ? -entry.amount : entry.amount;
        ledger.currentBalance += reverseChange;
        await ledger.save({ session });
    }

    // Hard delete Ledger entries so they completely vanish from reports
    await LedgerEntry.deleteMany({ voucherId: voucher._id }).session(session);

    // Hard delete the voucher itself to prevent Duplicate Key errors on recreate
    await Voucher.deleteOne({ _id: voucher._id }).session(session);
};
