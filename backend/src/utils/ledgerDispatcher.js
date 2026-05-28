import { Voucher } from '../models/voucher.model.js';
import { VoucherType } from '../models/voucherType.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { LedgerEntry } from '../models/ledgerEntry.model.js';
import { postAccountingEntry } from '../services/accounting/accountingPostingEngine.service.js';

/**
 * Universal posting hook — delegates to accounting foundation engine.
 * @param {import('mongoose').ClientSession|null} session
 */
export const postLedgerEntry = async (data, session) => {
    return postAccountingEntry(data, session);
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
    const financialYear = invoice.financialYear;

    // Re-use after cancel/delete: remove orphan voucher (compound unique: FY + type + number)
    const orphanVoucher = await Voucher.findOne({
        voucherNo,
        voucherType: vType._id,
        financialYear,
    }).session(session);
    if (orphanVoucher) {
        await reverseInvoiceLedgerImpact(voucherNo, session, { forceRemove: true });
    }

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
        status: 'Confirmed',
        financialYear: invoice.financialYear
    }], { session });

    const vId = voucher[0]._id;

    // 4. Post Entries
    // Debit Customer (Total)
    await postLedgerEntry({
        voucherId: vId, voucherNo, date,
        ledgerId: customerLedger._id, amount: invoice.roundedTotal || invoice.grandTotal,
        type: 'Debit', narration: `Sale to ${invoice.customerName}`,
        financialYear: invoice.financialYear
    }, session);

    // Credit Sales Account (Taxable minus freight)
    // Wait, invoice.totalTaxableAmount currently includes freight in calcInvoiceTotals.
    // If we separate them, we need to know the base taxable vs freight.
    // Actually, in `calcInvoiceTotals` (salesInvoice.controller.js line 110), it returns `totalTaxableAmount: taxableWithFreight`
    // Let's deduce the base sales by subtracting freight that was added.
    const baseSalesTaxable = invoice.totalTaxableAmount - (invoice.freightAmount || 0);
    
    await postLedgerEntry({
        voucherId: vId, voucherNo, date,
        ledgerId: salesLedger._id, amount: baseSalesTaxable,
        type: 'Credit', narration: `Revenue from Sales`,
        financialYear: invoice.financialYear
    }, session);

    // Credit Freight Account
    if (invoice.freightAmount && invoice.freightAmount > 0 && freightLedger) {
        await postLedgerEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: freightLedger._id, amount: invoice.freightAmount,
            type: 'Credit', narration: `Freight & Forwarding Income`,
            financialYear: invoice.financialYear
        }, session);
    }

    // Credit GST Output
    if (invoice.totalCgst > 0 && cgstLedger) {
        await postLedgerEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: cgstLedger._id, amount: invoice.totalCgst,
            type: 'Credit', narration: 'Output CGST',
            financialYear: invoice.financialYear
        }, session);
    }
    if (invoice.totalSgst > 0 && sgstLedger) {
        await postLedgerEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: sgstLedger._id, amount: invoice.totalSgst,
            type: 'Credit', narration: 'Output SGST',
            financialYear: invoice.financialYear
        }, session);
    }
    if (invoice.totalIgst > 0 && igstLedger) {
        await postLedgerEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: igstLedger._id, amount: invoice.totalIgst,
            type: 'Credit', narration: 'Output IGST',
            financialYear: invoice.financialYear
        }, session);
    }

    // Round Off
    if (invoice.roundOff && roundOffLedger) {
        const type = invoice.roundOff > 0 ? 'Credit' : 'Debit';
        await postLedgerEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: roundOffLedger._id, amount: Math.abs(invoice.roundOff),
            type, narration: 'Invoice Round Off',
            financialYear: invoice.financialYear
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

    // Split items into Stock vs Consumable for separate ledger posting
    let stockTaxableTotal = 0;
    let consumableTaxableTotal = 0;

    invoice.items.forEach(item => {
        if (item.isConsumable) {
            consumableTaxableTotal += (item.taxableAmount || 0);
        } else {
            stockTaxableTotal += (item.taxableAmount || 0);
        }
    });

    // We use the same balancing logic to ensure Debits == Credits
    // Total Purchase Value (including roundoff adjustment)
    const totalPurchaseDebit = Math.round(
        (grandTotal - igstAmt - cgstAmt - sgstAmt - freightAmt - roundOffDebit + roundOffCredit) * 100
    ) / 100;

    // Allocate the totalPurchaseDebit proportionally or by exact taxable amount
    // Using exact taxable amount for Consumables, and remaining for Stock Purchase Account
    const consumableDebit = Math.round(consumableTaxableTotal * 100) / 100;
    const purchaseDebit = Math.round((totalPurchaseDebit - consumableDebit) * 100) / 100;

    const consumableLedger = await AccountLedger.findOne({ name: 'Consumable Purchase / Non-BOM Raw Material Cost' }).session(session);

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
        status: 'Confirmed',
        financialYear: invoice.financialYear
    }], { session });

    const vId = voucher[0]._id;

    // 5. Post Debit Entries
    // Debit Purchase Account (Stock)
    if (purchaseDebit > 0) {
        await postLedgerEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: purchaseLedger._id, amount: purchaseDebit,
            type: 'Debit', narration: `Stock Purchase`,
            financialYear: invoice.financialYear
        }, session);
    }

    // Debit Consumable Purchase Account
    if (consumableDebit > 0) {
        let ledgerToUse = consumableLedger;
        if (!ledgerToUse) {
            // Create it if it doesn't exist (One-time safety)
            const expenseGroup = await AccountGroup.findOne({ name: 'Direct Expenses' }).session(session) || 
                                 await AccountGroup.findOne({ nature: 'Expenses' }).session(session);
            
            ledgerToUse = await AccountLedger.create([{
                name: 'Consumable Purchase / Non-BOM Raw Material Cost',
                underGroup: expenseGroup?._id,
                groupName: expenseGroup?.name,
                openingBalance: 0,
                drCr: 'Dr',
                isSystem: true,
                createdBy: userId
            }], { session });
            ledgerToUse = ledgerToUse[0];
        }

        await postLedgerEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: ledgerToUse._id, amount: consumableDebit,
            type: 'Debit', narration: `Consumable / Non-Stock Purchase`,
            financialYear: invoice.financialYear
        }, session);
    }

    // Debit Freight Inward Account
    if (freightAmt > 0 && freightLedger) {
        await postLedgerEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: freightLedger._id, amount: freightAmt,
            type: 'Debit', narration: `Freight Inward Expense`,
            financialYear: invoice.financialYear
        }, session);
    }

    // Debit GST Input
    if (cgstAmt > 0 && cgstInputLedger) {
        await postLedgerEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: cgstInputLedger._id, amount: cgstAmt,
            type: 'Debit', narration: 'Input CGST',
            financialYear: invoice.financialYear
        }, session);
    }
    if (sgstAmt > 0 && sgstInputLedger) {
        await postLedgerEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: sgstInputLedger._id, amount: sgstAmt,
            type: 'Debit', narration: 'Input SGST',
            financialYear: invoice.financialYear
        }, session);
    }
    if (igstAmt > 0 && igstInputLedger) {
        await postLedgerEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: igstInputLedger._id, amount: igstAmt,
            type: 'Debit', narration: 'Input IGST',
            financialYear: invoice.financialYear
        }, session);
    }

    // Round Off
    if (roundOffDebit > 0 && roundOffLedger) {
        await postLedgerEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: roundOffLedger._id, amount: roundOffDebit,
            type: 'Debit', narration: 'Invoice Round Off',
            financialYear: invoice.financialYear
        }, session);
    }
    if (roundOffCredit > 0 && roundOffLedger) {
        await postLedgerEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: roundOffLedger._id, amount: roundOffCredit,
            type: 'Credit', narration: 'Invoice Round Off',
            financialYear: invoice.financialYear
        }, session);
    }

    // Credit Supplier (net of TDS withheld at source, when bill carries tdsAmount)
    const tdsAmt = Math.round((Number(invoice.tdsAmount) || 0) * 100) / 100;
    const supplierCredit = Math.round((grandTotal - tdsAmt) * 100) / 100;

    await postLedgerEntry({
        voucherId: vId, voucherNo, date,
        ledgerId: supplierLedger._id, amount: supplierCredit,
        type: 'Credit', narration: `Purchased from ${invoice.supplierName}`,
        financialYear: invoice.financialYear
    }, session);

    if (tdsAmt > 0 && invoice.tdsPayableLedgerId) {
        await postLedgerEntry({
            voucherId: vId, voucherNo, date,
            ledgerId: invoice.tdsPayableLedgerId,
            amount: tdsAmt,
            type: 'Credit',
            narration: `TDS u/s ${invoice.tdsSection || ''} — ${invoice.supplierName}`,
            financialYear: invoice.financialYear
        }, session);
    }

    return vId;
};

/**
 * Reverses Financial Impacts when Invoice is Cancelled
 */
export const reverseInvoiceLedgerImpact = async (voucherNo, session, options = {}) => {
    const { forceRemove = false } = options;
    const voucher = await Voucher.findOne({ voucherNo }).session(session);
    if (!voucher) return;

    if (!forceRemove && voucher.status === 'Cancelled') return;

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
