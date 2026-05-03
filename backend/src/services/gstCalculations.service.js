import { SalesInvoice } from '../models/salesInvoice.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { CreditDebitNote } from '../models/creditDebitNote.model.js';
import { InvoiceSeries } from '../models/invoiceSeries.model.js';
import { getFYFromDate } from '../utils/fyUtils.js';

/**
 * Service to aggregate data for various internal GST reports
 */

// Helper to determine if an invoice is inter-state
const OUR_STATE_CODE = '27'; // Assuming Maharashtra as default based on GSTR-1 logic

function isInterState(posCode, billingStateCode) {
    let code = (posCode || '').substring(0, 2);
    if (!code) {
        code = (billingStateCode || '').substring(0, 2);
    }
    if (!code) return false;
    return code !== OUR_STATE_CODE;
}

// Ensure date format is handled correctly matching GST service logic
function buildDateQuery(startDate, endDate, dateField = 'invoiceDate') {
    return {
        $or: [
            { [dateField]: { $gte: new Date(startDate), $lte: new Date(endDate) } },
            {
                $expr: {
                    $and: [
                        { $gte: [`$${dateField}`, String(startDate)] },
                        { $lte: [`$${dateField}`, String(endDate) + 'T23:59:59.999Z'] }
                    ]
                }
            }
        ]
    };
}

/**
 * 1. ITC Register
 * Returns a detailed list of all purchase invoices with GST components.
 */
export async function getItcRegister(startDate, endDate) {
    const query = {
        ...buildDateQuery(startDate, endDate, 'invoiceDate'),
        isDeleted: { $ne: true },
        status: { $ne: 'Cancelled' },
        // Assuming all confirmed purchases with GST are eligible for ITC for this report
        totalTax: { $gt: 0 }
    };

    const purchases = await PurchaseInvoice.find(query)
        .populate('supplierId', 'name gstin stateCode')
        .sort({ invoiceDate: 1 })
        .lean();

    return purchases.map(p => ({
        id: p._id,
        date: p.invoiceDate,
        supplierName: p.supplierName || p.supplierId?.name,
        supplierGstin: p.supplierGstin || p.supplierId?.gstin,
        invoiceNumber: p.invoiceNumber || p.supplierInvoiceNo,
        taxableValue: p.totalTaxableAmount || 0,
        cgst: p.totalCgst || 0,
        sgst: p.totalSgst || 0,
        igst: p.totalIgst || 0,
        totalTax: p.totalTax || (p.totalCgst + p.totalSgst + p.totalIgst) || 0,
        totalInvoiceValue: p.grandTotal || p.roundedTotal || 0,
        placeOfSupply: p.placeOfSupply || p.supplierStateCode || ''
    }));
}

/**
 * 2. GST Payable Summary
 * Calculates net GST Liability = Output Tax (Sales + Debit Notes) - Input Tax (Purchases + Credit Notes)
 */
export async function getGstPayableSummary(startDate, endDate) {
    // Exclude estimate series from Sales
    const estimateSeries = await InvoiceSeries.find({
        $or: [
            { isEstimate: true },
            { documentType: 'Estimate' },
            { gstApplicable: false },
        ]
    }).select('_id').lean();
    const estimateSeriesIds = estimateSeries.map(s => s._id.toString());

    // 1. Output Tax (Sales Invoices)
    const salesQuery = {
        ...buildDateQuery(startDate, endDate, 'invoiceDate'),
        isDeleted: { $ne: true },
        status: { $ne: 'Cancelled' },
        orderCategory: { $ne: 'Replacement' }
    };
    if (estimateSeriesIds.length > 0) {
        salesQuery.seriesId = { $nin: estimateSeriesIds };
    }

    const salesInvoices = await SalesInvoice.find(salesQuery).lean();
    
    let outputCgst = 0, outputSgst = 0, outputIgst = 0, outputTaxable = 0;
    salesInvoices.forEach(s => {
        outputTaxable += (s.totalTaxableAmount || 0);
        outputCgst += (s.totalCgst || 0);
        outputSgst += (s.totalSgst || 0);
        outputIgst += (s.totalIgst || 0);
    });

    // 2. Input Tax (Purchase Invoices)
    const purchaseQuery = {
        ...buildDateQuery(startDate, endDate, 'invoiceDate'),
        isDeleted: { $ne: true },
        status: { $ne: 'Cancelled' }
    };
    const purchaseInvoices = await PurchaseInvoice.find(purchaseQuery).lean();
    
    let inputCgst = 0, inputSgst = 0, inputIgst = 0, inputTaxable = 0;
    purchaseInvoices.forEach(p => {
        inputTaxable += (p.totalTaxableAmount || 0);
        inputCgst += (p.totalCgst || 0);
        inputSgst += (p.totalSgst || 0);
        inputIgst += (p.totalIgst || 0);
    });

    // 3. Adjustments via Credit/Debit Notes
    const noteQuery = {
        ...buildDateQuery(startDate, endDate, 'noteDate'),
        isDeleted: { $ne: true },
        status: 'Final'
    };
    const notes = await CreditDebitNote.find(noteQuery).lean();

    notes.forEach(note => {
        // Debit Notes increase liability (like Sales)
        // Credit Notes decrease liability (like Sales Return)
        // Note: In typical accounting, CDNs issued to customers affect Output Tax.
        // CDNs from suppliers affect Input Tax. Here we assume all CDNs in system are issued TO customers.
        const isDebit = note.noteType === 'Debit Note';
        const mult = isDebit ? 1 : -1;
        
        outputTaxable += (note.totalTaxableAmount || 0) * mult;
        outputCgst += (note.totalCgst || 0) * mult;
        outputSgst += (note.totalSgst || 0) * mult;
        outputIgst += (note.totalIgst || 0) * mult;
    });

    const netCgst = outputCgst - inputCgst;
    const netSgst = outputSgst - inputSgst;
    const netIgst = outputIgst - inputIgst;

    return {
        output: { taxable: outputTaxable, cgst: outputCgst, sgst: outputSgst, igst: outputIgst, total: outputCgst + outputSgst + outputIgst },
        input: { taxable: inputTaxable, cgst: inputCgst, sgst: inputSgst, igst: inputIgst, total: inputCgst + inputSgst + inputIgst },
        net: { cgst: netCgst, sgst: netSgst, igst: netIgst, total: netCgst + netSgst + netIgst }
    };
}

/**
 * 3. HSN Summary (Consolidated for Purchases and Sales)
 */
export async function getHsnSummary(startDate, endDate) {
    const hsnGroups = {};

    const processItem = (item, type, multiplier = 1, isInter = false) => {
        const hsn = item.hsnCode || '99';
        if (!hsnGroups[hsn]) {
            hsnGroups[hsn] = {
                hsn,
                description: item.itemName || 'Goods',
                uqc: item.uqc || item.uom || 'NOS',
                inwardQty: 0, inwardValue: 0, inwardTax: 0,
                outwardQty: 0, outwardValue: 0, outwardTax: 0,
                cgst: 0, sgst: 0, igst: 0
            };
        }

        const qty = (item.qty || 0) * multiplier;
        const taxable = (item.taxableAmount || item.taxableValue || 0) * multiplier;
        const cgst = (item.cgstAmount || 0) * multiplier;
        const sgst = (item.sgstAmount || 0) * multiplier;
        const igst = (item.igstAmount || 0) * multiplier;
        const totalTax = cgst + sgst + igst;

        if (type === 'INWARD') {
            hsnGroups[hsn].inwardQty += qty;
            hsnGroups[hsn].inwardValue += taxable;
            hsnGroups[hsn].inwardTax += totalTax;
        } else {
            hsnGroups[hsn].outwardQty += qty;
            hsnGroups[hsn].outwardValue += taxable;
            hsnGroups[hsn].outwardTax += totalTax;
        }

        hsnGroups[hsn].cgst += cgst;
        hsnGroups[hsn].sgst += sgst;
        hsnGroups[hsn].igst += igst;
    };

    // Sales
    const salesQuery = {
        ...buildDateQuery(startDate, endDate, 'invoiceDate'),
        isDeleted: { $ne: true },
        status: { $ne: 'Cancelled' }
    };
    const sales = await SalesInvoice.find(salesQuery).lean();
    sales.forEach(inv => {
        const isInter = isInterState(inv.placeOfSupply, inv.billingStateCode);
        (inv.items || []).forEach(item => processItem(item, 'OUTWARD', 1, isInter));
    });

    // Purchases
    const purchaseQuery = {
        ...buildDateQuery(startDate, endDate, 'invoiceDate'),
        isDeleted: { $ne: true },
        status: { $ne: 'Cancelled' }
    };
    const purchases = await PurchaseInvoice.find(purchaseQuery).lean();
    purchases.forEach(inv => {
        const isInter = isInterState(inv.placeOfSupply, inv.supplierStateCode);
        (inv.items || []).forEach(item => processItem(item, 'INWARD', 1, isInter));
    });

    return Object.values(hsnGroups);
}

/**
 * 4. GST Ledger
 * Chronological ledger of Input & Output GST movements
 */
export async function getGstLedger(startDate, endDate) {
    const entries = [];

    // Sales (Output Tax -> Liability Increase -> Credit)
    const salesQuery = {
        ...buildDateQuery(startDate, endDate, 'invoiceDate'),
        isDeleted: { $ne: true }, status: { $ne: 'Cancelled' }
    };
    const sales = await SalesInvoice.find(salesQuery).lean();
    sales.forEach(inv => {
        const cgst = inv.totalCgst || 0;
        const sgst = inv.totalSgst || 0;
        const igst = inv.totalIgst || 0;
        if (cgst > 0 || sgst > 0 || igst > 0) {
            entries.push({
                date: inv.invoiceDate,
                type: 'SALES_INVOICE',
                refNumber: inv.invoiceNumber,
                particulars: `Sales to ${inv.customerName}`,
                debit: 0,
                credit: cgst + sgst + igst,
                cgst: { debit: 0, credit: cgst },
                sgst: { debit: 0, credit: sgst },
                igst: { debit: 0, credit: igst }
            });
        }
    });

    // Purchases (Input Tax -> Asset Increase -> Debit)
    const purchaseQuery = {
        ...buildDateQuery(startDate, endDate, 'invoiceDate'),
        isDeleted: { $ne: true }, status: { $ne: 'Cancelled' }
    };
    const purchases = await PurchaseInvoice.find(purchaseQuery).lean();
    purchases.forEach(inv => {
        const cgst = inv.totalCgst || 0;
        const sgst = inv.totalSgst || 0;
        const igst = inv.totalIgst || 0;
        if (cgst > 0 || sgst > 0 || igst > 0) {
            entries.push({
                date: inv.invoiceDate,
                type: 'PURCHASE_INVOICE',
                refNumber: inv.invoiceNumber || inv.supplierInvoiceNo,
                particulars: `Purchase from ${inv.supplierName}`,
                debit: cgst + sgst + igst,
                credit: 0,
                cgst: { debit: cgst, credit: 0 },
                sgst: { debit: sgst, credit: 0 },
                igst: { debit: igst, credit: 0 }
            });
        }
    });

    // Sort chronologically
    entries.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate running balance (Debit = Asset, Credit = Liability. Net Balance = Debit - Credit)
    // A negative balance implies net payable to Govt.
    let runningBalance = 0;
    entries.forEach(entry => {
        runningBalance += (entry.debit - entry.credit);
        entry.balance = runningBalance;
    });

    return entries;
}
