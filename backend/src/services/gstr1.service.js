import ExcelJS from 'exceljs';
import { SalesInvoice } from '../models/salesInvoice.model.js';

export const generateGSTR1Excel = async (filters) => {
    const { dateFrom, dateTo, financialYear } = filters;

    // Build query — exclude cancelled, deleted, and non-GST invoices
    const query = {
        status: { $ne: 'Cancelled' },
        isDeleted: { $ne: true },
        gstApplicable: { $ne: false },
    };

    if (financialYear) query.financialYear = financialYear;

    if (dateFrom || dateTo) {
        query.invoiceDate = {};
        if (dateFrom) query.invoiceDate.$gte = new Date(dateFrom);
        // Set dateTo to end-of-day (23:59:59.999) so the full day is included
        if (dateTo) {
            const end = new Date(dateTo);
            end.setHours(23, 59, 59, 999);
            query.invoiceDate.$lte = end;
        }
    }

    // NOTE: Do NOT populate 'customerId' — Customer model may not be registered in this context.
    // All required customer data (gstin, registrationType) is snapshotted directly on the invoice.
    // Only populate seriesId to exclude Estimate series.
    const invoices = await SalesInvoice.find(query)
        .populate('seriesId', 'isEstimate gstApplicable')
        .lean();

    // Filter out Estimate-series invoices
    const gstInvoices = invoices.filter(inv => {
        if (inv.seriesId?.isEstimate === true) return false;
        if (inv.seriesId?.gstApplicable === false) return false;
        return true;
    });

    console.log(`[GSTR1] Query matched ${invoices.length} invoices, ${gstInvoices.length} after series filter`);

    // ─── Build Workbook ───────────────────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'JSK URJA CRM';
    workbook.lastModifiedBy = 'JSK URJA CRM';
    workbook.created = new Date();

    // --- SHEET 1: b2b ---
    const b2bSheet = workbook.addWorksheet('b2b');
    b2bSheet.columns = [
        { header: 'GSTIN/UIN of Recipient', key: 'gstin', width: 22 },
        { header: 'Receiver Name', key: 'receiver', width: 30 },
        { header: 'Invoice Number', key: 'invNo', width: 15 },
        { header: 'Invoice date', key: 'invDate', width: 12 },
        { header: 'Invoice Value', key: 'invValue', width: 15 },
        { header: 'Place Of Supply', key: 'pos', width: 22 },
        { header: 'Reverse Charge', key: 'rc', width: 15 },
        { header: 'Applicable % of Tax Rate', key: 'appTax', width: 15 },
        { header: 'Invoice Type', key: 'invType', width: 20 },
        { header: 'E-Commerce GSTIN', key: 'ecommerce', width: 18 },
        { header: 'Rate', key: 'rate', width: 8 },
        { header: 'Taxable Value', key: 'taxValue', width: 15 },
        { header: 'Cess Amount', key: 'cessAmount', width: 12 }
    ];

    // --- SHEET 2: b2cl ---
    const b2clSheet = workbook.addWorksheet('b2cl');
    b2clSheet.columns = [
        { header: 'Invoice Number', key: 'invNo', width: 15 },
        { header: 'Invoice date', key: 'invDate', width: 12 },
        { header: 'Invoice Value', key: 'invValue', width: 15 },
        { header: 'Place Of Supply', key: 'pos', width: 22 },
        { header: 'Applicable % of Tax Rate', key: 'appTax', width: 15 },
        { header: 'Rate', key: 'rate', width: 8 },
        { header: 'Taxable Value', key: 'taxValue', width: 15 },
        { header: 'Cess Amount', key: 'cessAmount', width: 12 },
        { header: 'E-Commerce GSTIN', key: 'ecommerce', width: 18 }
    ];

    // --- SHEET 3: b2cs ---
    const b2csSheet = workbook.addWorksheet('b2cs');
    b2csSheet.columns = [
        { header: 'Type', key: 'type', width: 8 },
        { header: 'Place Of Supply', key: 'pos', width: 22 },
        { header: 'Applicable % of Tax Rate', key: 'appTax', width: 15 },
        { header: 'Rate', key: 'rate', width: 8 },
        { header: 'Taxable Value', key: 'taxValue', width: 15 },
        { header: 'Cess Amount', key: 'cessAmount', width: 12 },
        { header: 'E-Commerce GSTIN', key: 'ecommerce', width: 18 }
    ];

    // --- SHEET 4: hsn ---
    const hsnSheet = workbook.addWorksheet('hsn');
    hsnSheet.columns = [
        { header: 'HSN', key: 'hsn', width: 12 },
        { header: 'Description', key: 'desc', width: 35 },
        { header: 'UQC', key: 'uqc', width: 12 },
        { header: 'Total Quantity', key: 'tQty', width: 15 },
        { header: 'Total Value', key: 'tVal', width: 15 },
        { header: 'Taxable Value', key: 'taxVal', width: 15 },
        { header: 'Integrated Tax Amount', key: 'igst', width: 20 },
        { header: 'Central Tax Amount', key: 'cgst', width: 20 },
        { header: 'State/UT Tax Amount', key: 'sgst', width: 20 },
        { header: 'Cess Amount', key: 'cess', width: 12 }
    ];

    // --- SHEET 5: docs ---
    const docsSheet = workbook.addWorksheet('docs');
    docsSheet.columns = [
        { header: 'Nature of Document', key: 'nature', width: 28 },
        { header: 'Sr. No. From', key: 'srFrom', width: 15 },
        { header: 'Sr. No. To', key: 'srTo', width: 15 },
        { header: 'Total Number', key: 'tNum', width: 15 },
        { header: 'Cancelled', key: 'cancel', width: 12 }
    ];

    // Accumulators
    const hsnMap = new Map();
    const b2csMap = new Map();

    const formatDate = (date) => {
        if (!date) return '';
        const d = new Date(date);
        return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    };

    const getPlaceOfSupply = (inv) => {
        // 1. Use placeOfSupply field if already set
        if (inv.placeOfSupply && inv.placeOfSupply.trim()) return inv.placeOfSupply.trim();

        // 2. Derive state code from customer GSTIN first 2 chars
        const gstin = (inv.customerGstin || '').trim();
        let code = '';
        if (gstin.length >= 2) {
            code = gstin.substring(0, 2);
        } else {
            code = inv.billingStateCode || inv.shippingStateCode || '27';
        }
        const stateName = inv.billingState || inv.shippingState || 'Maharashtra';
        return `${code}-${stateName}`;
    };

    // ─── Determine B2B / B2CL / B2CS classification ───────────────────
    const classifyInvoice = (inv) => {
        const custGstin = (inv.customerGstin || '').trim();
        // sanitize: "undefined" string means no value
        const rawRegType = inv.customerRegistrationType || '';
        const regType = (rawRegType === 'undefined' || rawRegType === 'null') ? '' : rawRegType.trim();

        const isB2B = custGstin.length >= 15 
            || regType === 'Registered'
            || regType === 'SEZ'
            || regType === 'UIN'
            || regType === 'Composite'
            || regType === 'Export';

        const invValue = inv.roundedTotal || inv.grandTotal || 0;
        const isInterState = inv.gstType === 'IGST';
        // B2CL: unregistered, inter-state, value > 2.5L
        const isB2CL = !isB2B && (regType === 'Consumer-B2CL' || (isInterState && invValue > 250000));

        return { isB2B, isB2CL, custGstin, regType };
    };

    // ─── Compute item-level tax from stored amounts OR derive from totals ──
    const computeItemTax = (item, inv) => {
        const gstRate = item.gstRate || 0;

        // Taxable amount: use stored value, or compute from qty * rate
        let taxableAmt = (item.taxableAmount || 0);
        if (taxableAmt === 0 && item.qty && item.rate) {
            // Fallback: qty * rate (minus discount if any)
            taxableAmt = item.qty * item.rate;
            const discAmt = item.discountAmount || ((item.discountPercent || 0) / 100 * taxableAmt);
            taxableAmt = taxableAmt - discAmt;
        }

        // Tax amounts: use stored item values first
        let igstAmt = item.igstAmount || 0;
        let cgstAmt = item.cgstAmount || 0;
        let sgstAmt = item.sgstAmount || 0;

        // If item amounts are 0, fall back to invoice-level totals split proportionally
        if (igstAmt === 0 && cgstAmt === 0 && sgstAmt === 0 && taxableAmt > 0) {
            const invTaxable = inv.totalTaxableAmount || 0;
            const ratio = invTaxable > 0 ? taxableAmt / invTaxable : 1;
            if (inv.gstType === 'IGST') {
                igstAmt = Math.round((inv.totalIgst || 0) * ratio * 100) / 100;
            } else {
                cgstAmt = Math.round((inv.totalCgst || 0) * ratio * 100) / 100;
                sgstAmt = Math.round((inv.totalSgst || 0) * ratio * 100) / 100;
            }
        }

        // Last resort: compute directly from gstRate on taxable amount
        if (igstAmt === 0 && cgstAmt === 0 && sgstAmt === 0 && taxableAmt > 0 && gstRate > 0) {
            if (inv.gstType === 'IGST') {
                igstAmt = Math.round(taxableAmt * gstRate / 100 * 100) / 100;
            } else {
                cgstAmt = Math.round(taxableAmt * gstRate / 200 * 100) / 100;
                sgstAmt = Math.round(taxableAmt * gstRate / 200 * 100) / 100;
            }
        }

        const cessAmt = item.cessAmount || 0;
        return { gstRate, taxableAmt, igstAmt, cgstAmt, sgstAmt, cessAmt };
    };

    let b2bRows = 0, b2clRows = 0, b2csItems = 0, hsnItems = 0;

    gstInvoices.forEach(inv => {
        const { isB2B, isB2CL, custGstin, regType } = classifyInvoice(inv);
        const invDate = formatDate(inv.invoiceDate);
        const pos = getPlaceOfSupply(inv);
        const invNo = inv.invoiceNumber;
        const invVal = inv.roundedTotal || inv.grandTotal || 0;
        const rcFlag = inv.reverseCharge ? 'Y' : 'N';

        if (!Array.isArray(inv.items) || inv.items.length === 0) {
            console.log(`[GSTR1] ⚠️  Invoice ${invNo} has no items - skipping`);
            return;
        }

        inv.items.forEach(item => {
            const { gstRate, taxableAmt, igstAmt, cgstAmt, sgstAmt, cessAmt } = computeItemTax(item, inv);

            // ── HSN Aggregation ───────────────────────────────────────
            const hsnKey = `${item.hsnCode || 'UNKNOWN'}-${gstRate}`;
            if (!hsnMap.has(hsnKey)) {
                hsnMap.set(hsnKey, {
                    hsn: item.hsnCode || '',
                    desc: item.description || item.itemName || '',
                    uqc: item.uqc || item.uom || 'NOS',
                    tQty: 0, tVal: 0, taxVal: 0, igst: 0, cgst: 0, sgst: 0, cess: 0
                });
            }
            const hc = hsnMap.get(hsnKey);
            hc.tQty += (item.qty || 0);
            hc.tVal += (taxableAmt + igstAmt + cgstAmt + sgstAmt + cessAmt);
            hc.taxVal += taxableAmt;
            hc.igst += igstAmt;
            hc.cgst += cgstAmt;
            hc.sgst += sgstAmt;
            hc.cess += cessAmt;
            hsnItems++;

            // ── Sheet Population ──────────────────────────────────────
            if (isB2B) {
                b2bSheet.addRow({
                    gstin: custGstin,
                    receiver: inv.customerName,
                    invNo,
                    invDate,
                    invValue: invVal,
                    pos,
                    rc: rcFlag,
                    appTax: '',
                    invType: regType === 'SEZ' ? 'SEZ supplies with payment' : 'Regular B2B',
                    ecommerce: '',
                    rate: gstRate,
                    taxValue: taxableAmt,
                    cessAmount: cessAmt
                });
                b2bRows++;
            } else if (isB2CL) {
                b2clSheet.addRow({
                    invNo, invDate, invValue: invVal, pos, appTax: '',
                    rate: gstRate, taxValue: taxableAmt, cessAmount: cessAmt, ecommerce: ''
                });
                b2clRows++;
            } else {
                // B2CS aggregate
                const b2csKey = `${pos}-${gstRate}`;
                if (!b2csMap.has(b2csKey)) {
                    b2csMap.set(b2csKey, { type: 'OE', pos, appTax: '', rate: gstRate, taxValue: 0, cessAmount: 0, ecommerce: '' });
                }
                const bcs = b2csMap.get(b2csKey);
                bcs.taxValue += taxableAmt;
                bcs.cessAmount += cessAmt;
                b2csItems++;
            }
        });
    });

    console.log(`[GSTR1] B2B rows: ${b2bRows}, B2CL rows: ${b2clRows}, B2CS groups: ${b2csMap.size}, HSN keys: ${hsnMap.size}`);

    // Write B2CS aggregated rows
    b2csMap.forEach(val => b2csSheet.addRow(val));

    // Write HSN aggregated rows
    hsnMap.forEach(val => {
        val.tQty = Number(val.tQty.toFixed(2));
        val.tVal = Number(val.tVal.toFixed(2));
        val.taxVal = Number(val.taxVal.toFixed(2));
        val.igst = Number(val.igst.toFixed(2));
        val.cgst = Number(val.cgst.toFixed(2));
        val.sgst = Number(val.sgst.toFixed(2));
        val.cess = Number(val.cess.toFixed(2));
        hsnSheet.addRow(val);
    });

    // ── Docs (Table 13): Invoice summary by series ───────────────────
    try {
        const allSeriesInvoices = await SalesInvoice.aggregate([
            { $match: { ...query, isDeleted: { $ne: true } } },
            {
                $group: {
                    _id: '$seriesId',
                    count: { $sum: 1 },
                    minInv: { $min: '$invoiceNumber' },
                    maxInv: { $max: '$invoiceNumber' },
                    cancelled: { $sum: { $cond: [{ $eq: ['$status', 'Cancelled'] }, 1, 0] } }
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
    } catch (err) {
        console.error('[GSTR1] docs sheet error:', err.message);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    console.log(`[GSTR1] Excel buffer size: ${buffer.length} bytes`);
    return buffer;
};

export default { generateGSTR1Excel };
