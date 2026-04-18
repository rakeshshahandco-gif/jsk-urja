import ExcelJS from 'exceljs';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { InvoiceSeries } from '../models/invoiceSeries.model.js';
import Customer from '../models/customer.model.js';
import mongoose from 'mongoose';

const mapGSTStateCode = (stateString) => {
    // Basic mapping, assuming standard 2-digit codes prefixes in GST numbers are used,
    // or mapping state names to standard codes.
    // For simplicity, we extract the code from GSTIN if available.
    return stateString;
};

export const generateGSTR1Excel = async (filters) => {
    const { dateFrom, dateTo, financialYear } = filters;

    const query = { status: { $ne: 'Cancelled' } };
    if (financialYear) query.financialYear = financialYear;
    if (dateFrom || dateTo) {
        query.invoiceDate = {};
        if (dateFrom) query.invoiceDate.$gte = new Date(dateFrom);
        if (dateTo) query.invoiceDate.$lte = new Date(dateTo);
    }

    const invoices = await SalesInvoice.find(query).populate('customerId').lean();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CRM System';
    workbook.lastModifiedBy = 'CRM System';
    workbook.created = new Date();

    // --- SHEET 1: b2b ---
    const b2bSheet = workbook.addWorksheet('b2b');
    b2bSheet.columns = [
        { header: 'GSTIN/UIN of Recipient', key: 'gstin', width: 20 },
        { header: 'Receiver Name', key: 'receiver', width: 25 },
        { header: 'Invoice Number', key: 'invNo', width: 15 },
        { header: 'Invoice date', key: 'invDate', width: 15 },
        { header: 'Invoice Value', key: 'invValue', width: 15 },
        { header: 'Place Of Supply', key: 'pos', width: 20 },
        { header: 'Reverse Charge', key: 'rc', width: 15 },
        { header: 'Applicable % of Tax Rate', key: 'appTax', width: 15 },
        { header: 'Invoice Type', key: 'invType', width: 15 },
        { header: 'E-Commerce GSTIN', key: 'ecommerce', width: 15 },
        { header: 'Rate', key: 'rate', width: 10 },
        { header: 'Taxable Value', key: 'taxValue', width: 15 },
        { header: 'Cess Amount', key: 'cessAmount', width: 15 }
    ];

    // --- SHEET 2: b2cl ---
    const b2clSheet = workbook.addWorksheet('b2cl');
    b2clSheet.columns = [
        { header: 'Invoice Number', key: 'invNo', width: 15 },
        { header: 'Invoice date', key: 'invDate', width: 15 },
        { header: 'Invoice Value', key: 'invValue', width: 15 },
        { header: 'Place Of Supply', key: 'pos', width: 20 },
        { header: 'Applicable % of Tax Rate', key: 'appTax', width: 15 },
        { header: 'Rate', key: 'rate', width: 10 },
        { header: 'Taxable Value', key: 'taxValue', width: 15 },
        { header: 'Cess Amount', key: 'cessAmount', width: 15 },
        { header: 'E-Commerce GSTIN', key: 'ecommerce', width: 15 }
    ];

    // --- SHEET 3: b2cs ---
    const b2csSheet = workbook.addWorksheet('b2cs');
    b2csSheet.columns = [
        { header: 'Type', key: 'type', width: 10 },
        { header: 'Place Of Supply', key: 'pos', width: 20 },
        { header: 'Applicable % of Tax Rate', key: 'appTax', width: 15 },
        { header: 'Rate', key: 'rate', width: 10 },
        { header: 'Taxable Value', key: 'taxValue', width: 15 },
        { header: 'Cess Amount', key: 'cessAmount', width: 15 },
        { header: 'E-Commerce GSTIN', key: 'ecommerce', width: 15 }
    ];

    // --- SHEET 4: hsn ---
    const hsnSheet = workbook.addWorksheet('hsn');
    hsnSheet.columns = [
        { header: 'HSN', key: 'hsn', width: 15 },
        { header: 'Description', key: 'desc', width: 30 },
        { header: 'UQC', key: 'uqc', width: 15 },
        { header: 'Total Quantity', key: 'tQty', width: 15 },
        { header: 'Total Value', key: 'tVal', width: 15 },
        { header: 'Taxable Value', key: 'taxVal', width: 15 },
        { header: 'Integrated Tax Amount', key: 'igst', width: 20 },
        { header: 'Central Tax Amount', key: 'cgst', width: 20 },
        { header: 'State/UT Tax Amount', key: 'sgst', width: 20 },
        { header: 'Cess Amount', key: 'cess', width: 15 }
    ];

    // --- SHEET 5: docs ---
    const docsSheet = workbook.addWorksheet('docs');
    docsSheet.columns = [
        { header: 'Nature of Document', key: 'nature', width: 25 },
        { header: 'Sr. No. From', key: 'srFrom', width: 15 },
        { header: 'Sr. No. To', key: 'srTo', width: 15 },
        { header: 'Total Number', key: 'tNum', width: 15 },
        { header: 'Cancelled', key: 'cancel', width: 15 }
    ];

    // Accumulators for HSN and B2CS
    const hsnMap = new Map();
    const b2csMap = new Map();

    const formatDate = (date) => {
        if (!date) return '';
        const d = new Date(date);
        return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    };

    const getPlaceOfSupply = (inv) => {
        // Simple extraction logic. Standard GST POS is "StateCode-StateName"
        let code = '';
        if (inv.gstNumber && inv.gstNumber.length >= 2) {
            code = inv.gstNumber.substring(0, 2);
        } else if (inv.shippingStateCode || inv.billingStateCode) {
            code = inv.shippingStateCode || inv.billingStateCode;
        } else {
            code = "27"; // Fallback to MH
        }
        return `${code}-${inv.billingState || 'Maharashtra'}`;
    };

    invoices.forEach(inv => {
        const isB2B = inv.customerRegistrationType === 'Registered' || inv.customerRegistrationType === 'SEZ' || inv.customerRegistrationType === 'UIN' || inv.customerRegistrationType === 'Composite';
        const isB2CL = inv.customerRegistrationType === 'Consumer-B2CL';
        // Anything else is mapped to B2CS (Consumer, Unregistered, etc) that isn't B2CL.

        const invDate = formatDate(inv.invoiceDate);
        const pos = getPlaceOfSupply(inv);

        inv.items.forEach(item => {
            const rowData = {
                gstin: inv.gstNumber || '',
                receiver: inv.customerName,
                invNo: inv.invoiceNumber,
                invDate: invDate,
                invValue: inv.roundedTotal || inv.grandTotal,
                pos: pos,
                rc: 'N',
                appTax: '', // Applicable % of Tax Rate (generally blank)
                invType: 'Regular B2B',
                ecommerce: '',
                rate: item.taxRate || 18,
                taxValue: item.taxableAmount || 0,
                cessAmount: item.cessAmount || 0
            };

            // Calculate exact tax components based on gstType
            let igst = 0, cgst = 0, sgst = 0;
            const taxAmt = item.taxAmount || 0;
            if (inv.gstType === 'IGST') {
                igst = taxAmt;
            } else {
                cgst = taxAmt / 2;
                sgst = taxAmt / 2;
            }

            // HSN Aggregation
            const hsnKey = `${item.hsnCode || 'UNKNOWN'}-${item.taxRate}`;
            if (!hsnMap.has(hsnKey)) {
                hsnMap.set(hsnKey, {
                    hsn: item.hsnCode || '',
                    desc: item.itemName || '',
                    uqc: item.uqc || 'NOS-NUMBERS', // Snapshot used
                    tQty: 0,
                    tVal: 0,
                    taxVal: 0,
                    igst: 0,
                    cgst: 0,
                    sgst: 0,
                    cess: 0
                });
            }
            const hc = hsnMap.get(hsnKey);
            hc.tQty += (item.qty || 0);
            hc.tVal += ((item.taxableAmount || 0) + taxAmt + (item.cessAmount || 0));
            hc.taxVal += (item.taxableAmount || 0);
            hc.igst += igst;
            hc.cgst += cgst;
            hc.sgst += sgst;
            hc.cess += (item.cessAmount || 0);

            // Populate Sheets
            if (isB2B) {
                b2bSheet.addRow(rowData);
            } else if (isB2CL) {
                b2clSheet.addRow({
                    invNo: inv.invoiceNumber,
                    invDate: invDate,
                    invValue: inv.roundedTotal || inv.grandTotal,
                    pos: pos,
                    appTax: '',
                    rate: item.taxRate || 18,
                    taxValue: item.taxableAmount || 0,
                    cessAmount: item.cessAmount || 0,
                    ecommerce: ''
                });
            } else {
                // Aggregate B2CS
                const b2csKey = `${pos}-${item.taxRate}`;
                if (!b2csMap.has(b2csKey)) {
                    b2csMap.set(b2csKey, {
                        type: 'OE',
                        pos: pos,
                        appTax: '',
                        rate: item.taxRate || 18,
                        taxValue: 0,
                        cessAmount: 0,
                        ecommerce: ''
                    });
                }
                const bcs = b2csMap.get(b2csKey);
                bcs.taxValue += (item.taxableAmount || 0);
                bcs.cessAmount += (item.cessAmount || 0);
            }
        });
    });

    // Write B2CS
    b2csMap.forEach(val => b2csSheet.addRow(val));

    // Write HSN
    hsnMap.forEach(val => {
        val.tQty = Number(val.tQty.toFixed(2));
        val.tVal = Number(val.tVal.toFixed(2));
        val.taxVal = Number(val.taxVal.toFixed(2));
        val.igst = Number(val.igst.toFixed(2));
        val.cgst = Number(val.cgst.toFixed(2));
        val.sgst = Number(val.sgst.toFixed(2));
        val.cess = Number(val.cess.toFixed(2));
        hsnSheet.addRow(val)
    });

    // Docs (Table 13) Generation
    // We fetch Series metadata for this financial year or date range
    const allSeriesInvoices = await SalesInvoice.aggregate([
        { $match: query },
        {
            $group: {
                _id: "$seriesId",
                count: { $sum: 1 },
                minInv: { $min: "$invoiceNumber" },
                maxInv: { $max: "$invoiceNumber" },
                cancelled: { $sum: { $cond: [{ $eq: ["$status", "Cancelled"] }, 1, 0] } }
            }
        }
    ]);

    for (const s of allSeriesInvoices) {
        docsSheet.addRow({
            nature: 'Invoices for outward supply',
            srFrom: s.minInv,
            srTo: s.maxInv,
            tNum: s.count,
            cancel: s.cancelled
        });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
};

export default {
    generateGSTR1Excel
};
