/**
 * GSTR-1 Report Service
 * Generates sheet-wise GSTR-1 data from live CRM data
 * Matches GST portal / offline tool upload format
 */
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { CreditDebitNote } from '../models/creditDebitNote.model.js';
import { InvoiceSeries } from '../models/invoiceSeries.model.js';
import { CompanyProfile } from '../models/companyProfile.model.js';
import Customer from '../models/customer.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { Gstr3bAdjustment } from '../models/gstr3bAdjustment.model.js';
import { getFYFromDate } from '../utils/fyUtils.js';
import ExcelJS from 'exceljs';

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────
const OUR_STATE_CODE = '27'; // Maharashtra
const B2CL_THRESHOLD = 100000; // ₹1 Lakh (from Aug 2024)

const STATE_CODE_MAP = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
  '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
  '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
  '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
  '97': 'Other Territory',
};

function placeOfSupplyLabel(stateCode, inv = {}) {
  let code = String(stateCode || '').padStart(2, '0');
  if (code === '00' || !STATE_CODE_MAP[code]) {
    // Fallback to billing state code or gstin
    code = String(inv.billingStateCode || (inv.customerGstin || '').substring(0, 2) || '').padStart(2, '0');
  }
  if (code === '00') return '';
  
  const name = STATE_CODE_MAP[code] || '';
  return name ? `${code}-${name}` : code;
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function isRegistered(inv) {
  return inv.customerGstin && inv.customerGstin.length === 15;
}

function isInterState(inv) {
  let posCode = (inv.placeOfSupply || '').substring(0, 2);
  if (!posCode) {
    posCode = inv.billingStateCode || (inv.customerGstin || '').substring(0, 2);
  }
  if (!posCode) return false;
  return posCode !== OUR_STATE_CODE;
}

/**
 * Robustly derives numeric sequence number from invoice object.
 * Checks sequenceNumber field first, then parses numeric suffix from invoiceNumber.
 */
function getInvoiceSequence(inv) {
  if (inv.sequenceNumber !== undefined && inv.sequenceNumber !== null && inv.sequenceNumber > 0) {
    return Number(inv.sequenceNumber);
  }
  if (!inv.invoiceNumber) return 0;
  // Handle 26-27/01, 26-27/010, etc. extract last numeric part
  const parts = inv.invoiceNumber.split(/[/|-]/);
  const lastPart = parts[parts.length - 1];
  const num = parseInt(lastPart.replace(/\D/g, ''), 10);
  return isNaN(num) ? 0 : num;
}

function isEstimateSeries(series) {
  if (!series) return false;
  if (series.isEstimate) return true;
  if (series.documentType === 'Estimate') return true;
  if (series.gstApplicable === false) return true;
  return false;
}

/**
 * Robustly groups invoice amounts by GST rate, including freight.
 * Supports multiple field names for legacy/mismatched records and calculates
 * missing values from item details or falls back to invoice summary.
 */
function getRateGroups(inv) {
  const groups = {};
  const isInter = isInterState(inv);

  // 1. Items
  let totalItemsTaxable = 0;
  for (const item of (inv.items || [])) {
    const rate = Number(item.gstRate ?? item.gstPercent ?? 18);
    if (!groups[rate]) {
      groups[rate] = { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 };
    }
    
    // Support multiple field names for taxable amount
    let taxable = item.taxableAmount ?? item.taxableValue ?? item.taxableAmt ?? 0;
    
    // Fallback: Calculate from qty/rate if fields are missing/zero
    if (taxable === 0 && (item.qty > 0 && item.rate > 0)) {
      const base = item.qty * item.rate;
      const disc = item.discountAmount || ((item.discountPercent || 0) / 100 * base);
      taxable = base - disc;
    }
    
    groups[rate].taxableValue += taxable;
    totalItemsTaxable += taxable;

    // Use specific tax fields or split total tax if missing
    let igst = item.igstAmount ?? item.igstAmt ?? (isInter ? (item.taxAmount ?? item.taxAmt ?? 0) : 0);
    let cgst = item.cgstAmount ?? item.cgstAmt ?? (!isInter ? ((item.taxAmount ?? item.taxAmt ?? 0) / 2) : 0);
    let sgst = item.sgstAmount ?? item.sgstAmt ?? (!isInter ? ((item.taxAmount ?? item.taxAmt ?? 0) / 2) : 0);

    // If tax fields are STILL 0 but rate and taxable > 0, calculate them
    if (rate > 0 && taxable > 0 && igst === 0 && cgst === 0 && sgst === 0) {
      if (isInter) igst = (taxable * rate / 100);
      else {
        cgst = (taxable * rate / 200);
        sgst = (taxable * rate / 200);
      }
    }

    groups[rate].igst += igst;
    groups[rate].cgst += cgst;
    groups[rate].sgst += sgst;
    groups[rate].cess += item.cessAmount ?? item.cessAmt ?? 0;
  }

  // 2. Freight / Shipping
  let fAmount = inv.freightAmount ?? inv.shippingAmount ?? inv.shippingCharges ?? 0;
  if (fAmount > 0) {
    const fRate = Number(inv.freightGstRate ?? inv.shippingGstRate ?? 0);
    if (!groups[fRate]) {
      groups[fRate] = { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 };
    }
    groups[fRate].taxableValue += fAmount;
    
    let fGst = inv.freightGstAmount ?? inv.shippingGstAmount ?? 0;
    
    // If freight GST is 0 but rate > 0, calculate it
    if (fGst === 0 && fRate > 0) {
      fGst = (fAmount * fRate / 100);
    }

    if (isInter) {
      groups[fRate].igst += fGst;
    } else {
      groups[fRate].cgst += fGst / 2;
      groups[fRate].sgst += fGst / 2;
    }
  }

  // 3. Robust Fallback: If total taxable from items+freight is significantly 
  // different from the invoice-level summary field, trust the summary.
  const totalFromGroups = Object.values(groups).reduce((sum, g) => sum + g.taxableValue, 0);
  const summaryTaxable = inv.totalTaxableAmount ?? inv.taxableValue ?? inv.taxableAmount ?? inv.subTotal ?? 0;

  // If items failed to pull but summary exists, or if summary is > than our sum
  if (summaryTaxable > totalFromGroups + 0.1) {
    // If item-level sums were 0, we'll assign the whole summary to the first found rate (or 18%)
    if (totalFromGroups < 0.1) {
      const fallbackRate = (inv.items && inv.items[0] && (inv.items[0].gstRate || inv.items[0].gstPercent)) || 18;
      if (!groups[fallbackRate]) {
        groups[fallbackRate] = { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 };
      }
      groups[fallbackRate].taxableValue = summaryTaxable;
      groups[fallbackRate].igst = inv.totalIgst ?? (isInter ? (inv.totalGst || 0) : 0);
      groups[fallbackRate].cgst = inv.totalCgst ?? (!isInter ? ((inv.totalGst || 0) / 2) : 0);
      groups[fallbackRate].sgst = inv.totalSgst ?? (!isInter ? ((inv.totalGst || 0) / 2) : 0);
      
      // Final attempt to calculate tax from summary if still zero
      if (fallbackRate > 0 && groups[fallbackRate].taxableValue > 0 && 
          groups[fallbackRate].igst === 0 && groups[fallbackRate].cgst === 0 && groups[fallbackRate].sgst === 0) {
        if (isInter) groups[fallbackRate].igst = (summaryTaxable * fallbackRate / 100);
        else {
          groups[fallbackRate].cgst = (summaryTaxable * fallbackRate / 200);
          groups[fallbackRate].sgst = (summaryTaxable * fallbackRate / 200);
        }
      }
    }
  }

  return groups;
}

// ──────────────────────────────────────────────────────────────────────────────
// Data Fetching
// ──────────────────────────────────────────────────────────────────────────────
async function fetchInvoicesForPeriod(startDate, endDate) {
  // Get all estimate series IDs to exclude
  const estimateSeries = await InvoiceSeries.find({
    $or: [
      { isEstimate: true },
      { documentType: 'Estimate' },
      { gstApplicable: false },
    ]
  }).lean();
  const estimateSeriesIds = [
    ...estimateSeries.map(s => s._id),
    ...estimateSeries.map(s => s._id.toString())
  ];

  const query = {
    $or: [
      { invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
      {
        $expr: {
          $and: [
            { $gte: ["$invoiceDate", String(startDate)] },
            { $lte: ["$invoiceDate", String(endDate) + 'T23:59:59.999Z'] }
          ]
        }
      }
    ],
    isDeleted: { $ne: true },
    status: { $ne: 'Cancelled' },
  };

  if (estimateSeriesIds.length > 0) {
    query.seriesId = { $nin: estimateSeriesIds };
  }

  // Using direct collection to bypass Mongoose schema casting (since some dates are strings in local DB)
  return SalesInvoice.collection.find(query).sort({ invoiceDate: 1 }).toArray();
}

async function fetchCancelledInvoicesForPeriod(startDate, endDate) {
  const estimateSeries = await InvoiceSeries.find({
    $or: [
      { isEstimate: true },
      { documentType: 'Estimate' },
      { gstApplicable: false },
    ]
  }).select('_id');
  const estimateSeriesIds = [
    ...estimateSeries.map(s => s._id),
    ...estimateSeries.map(s => s._id.toString())
  ];

  const query = {
    $or: [
      { invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
      {
        $expr: {
          $and: [
            { $gte: ["$invoiceDate", String(startDate)] },
            { $lte: ["$invoiceDate", String(endDate) + 'T23:59:59.999Z'] }
          ]
        }
      }
    ],
    status: 'Cancelled',
    isDeleted: { $ne: true },
  };
  if (estimateSeriesIds.length > 0) {
    query.seriesId = { $nin: estimateSeriesIds };
  }
  return SalesInvoice.collection.find(query).project({ invoiceNumber: 1, sequenceNumber: 1, seriesId: 1 }).toArray();
}

async function fetchCreditDebitNotesForPeriod(startDate, endDate) {
  const query = {
    $or: [
      { noteDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
      {
        $expr: {
          $and: [
            { $gte: ["$noteDate", String(startDate)] },
            { $lte: ["$noteDate", String(endDate) + 'T23:59:59.999Z'] }
          ]
        }
      }
    ],
    status: 'Final',
    isDeleted: { $ne: true }
  };
  return CreditDebitNote.collection.find(query).toArray();
}

// ──────────────────────────────────────────────────────────────────────────────
// Sheet Builders
// ──────────────────────────────────────────────────────────────────────────────

function buildB2B(invoices) {
  const rows = [];
  const b2bInvoices = invoices.filter(inv => isRegistered(inv));

  for (const inv of b2bInvoices) {
    const posCode = (inv.placeOfSupply || inv.billingStateCode || (inv.customerGstin || '').substring(0, 2) || '').substring(0, 2);
    const isInter = isInterState(inv);
    const rateGroups = getRateGroups(inv);

    for (const [rate, totals] of Object.entries(rateGroups)) {
      rows.push({
        'GSTIN/UIN of Recipient': inv.customerGstin || '',
        'Receiver Name': inv.customerName || '',
        'Invoice Number': inv.invoiceNumber || '',
        'Invoice date': formatDate(inv.invoiceDate),
        'Invoice Value': Number((inv.grandTotal || inv.roundedTotal || 0).toFixed(2)),
        'Place Of Supply': placeOfSupplyLabel(posCode, inv),
        'Reverse Charge': inv.reverseCharge ? 'Y' : 'N',
        'Applicable % of Tax Rate': '',
        'Invoice Type': inv.invoiceType || 'Regular',
        'E-Commerce GSTIN': inv.ecommerceGstin || '',
        'Rate': Number(rate),
        'Taxable Value': Number(totals.taxableValue.toFixed(2)),
        'Cess Amount': Number(totals.cess.toFixed(2)),
        'Integrated Tax': isInter ? Number(totals.igst.toFixed(2)) : 0,
        'Central Tax': !isInter ? Number(totals.cgst.toFixed(2)) : 0,
        'State/UT Tax': !isInter ? Number(totals.sgst.toFixed(2)) : 0,
      });
    }
  }
  return rows;
}

function buildB2CL(invoices) {
  const rows = [];
  const b2clInvoices = invoices.filter(inv =>
    !isRegistered(inv) &&
    isInterState(inv) &&
    (inv.grandTotal || inv.roundedTotal || 0) > B2CL_THRESHOLD
  );

  for (const inv of b2clInvoices) {
    const posCode = (inv.placeOfSupply || inv.billingStateCode || (inv.customerGstin || '').substring(0, 2) || '').substring(0, 2);
    const rateGroups = getRateGroups(inv);

    for (const [rate, totals] of Object.entries(rateGroups)) {
      rows.push({
        'Invoice Number': inv.invoiceNumber || '',
        'Invoice date': formatDate(inv.invoiceDate),
        'Invoice Value': Number((inv.grandTotal || inv.roundedTotal || 0).toFixed(2)),
        'Place Of Supply': placeOfSupplyLabel(posCode, inv),
        'Applicable % of Tax Rate': '',
        'Rate': Number(rate),
        'Taxable Value': Number(totals.taxableValue.toFixed(2)),
        'Cess Amount': Number(totals.cess.toFixed(2)),
        'E-Commerce GSTIN': inv.ecommerceGstin || '',
        'Integrated Tax': Number(totals.igst.toFixed(2)),
      });
    }
  }
  return rows;
}

function buildB2CS(invoices) {
  // B2CS = all intra-state unregistered + inter-state unregistered ≤ B2CL_THRESHOLD
  const b2csInvoices = invoices.filter(inv => {
    if (isRegistered(inv)) return false;
    if (isInterState(inv) && (inv.grandTotal || inv.roundedTotal || 0) > B2CL_THRESHOLD) return false;
    return true;
  });

  // Group by: Place of Supply, Rate
  const groups = {};
  for (const inv of b2csInvoices) {
    const posCode = (inv.placeOfSupply || inv.billingStateCode || (inv.customerGstin || '').substring(0, 2) || '').substring(0, 2);
    const isInter = isInterState(inv);
    const rateGroups = getRateGroups(inv);

    for (const [rate, totals] of Object.entries(rateGroups)) {
      const key = `${posCode}|${rate}`;
      if (!groups[key]) {
        groups[key] = {
          posCode,
          rate: Number(rate),
          taxableValue: 0,
          igst: 0,
          cgst: 0,
          sgst: 0,
          cess: 0,
          isInter,
        };
      }
      groups[key].taxableValue += totals.taxableValue;
      groups[key].igst += totals.igst;
      groups[key].cgst += totals.cgst;
      groups[key].sgst += totals.sgst;
      groups[key].cess += totals.cess;
    }
  }

  return Object.values(groups).map(g => ({
    'Type': 'OE',
    'Place Of Supply': placeOfSupplyLabel(g.posCode, { billingStateCode: g.posCode }),
    'Applicable % of Tax Rate': '',
    'Rate': g.rate,
    'Taxable Value': Number(g.taxableValue.toFixed(2)),
    'Cess Amount': Number(g.cess.toFixed(2)),
    'E-Commerce GSTIN': '',
    'Integrated Tax': g.isInter ? Number(g.igst.toFixed(2)) : 0,
    'Central Tax': !g.isInter ? Number(g.cgst.toFixed(2)) : 0,
    'State/UT Tax': !g.isInter ? Number(g.sgst.toFixed(2)) : 0,
  }));
}

function buildCDNR(notes) {
  const rows = [];
  const registeredNotes = notes.filter(n => isRegistered(n));

  for (const n of registeredNotes) {
    const posCode = (n.placeOfSupply || '').substring(0, 2);
    const isInter = isInterState(n);
    const rateGroups = getRateGroups(n);

    for (const [rate, totals] of Object.entries(rateGroups)) {
      rows.push({
        'GSTIN/UIN of Recipient': n.customerGstin || '',
        'Receiver Name': n.customerName || '',
        'Note Number': n.noteNumber || '',
        'Note Date': formatDate(n.noteDate),
        'Note Type': n.noteType === 'Credit Note' ? 'C' : 'D',
        'Place Of Supply': placeOfSupplyLabel(posCode, n),
        'Reverse Charge': n.reverseCharge ? 'Y' : 'N',
        'Note Supply Type': n.noteSupplyType || 'Regular',
        'Note Value': Number((n.grandTotal || 0).toFixed(2)),
        'Applicable % of Tax Rate': '',
        'Rate': Number(rate),
        'Taxable Value': Number(totals.taxableValue.toFixed(2)),
        'Cess Amount': Number(totals.cess.toFixed(2)),
        'Integrated Tax': isInter ? Number(totals.igst.toFixed(2)) : 0,
        'Central Tax': !isInter ? Number(totals.cgst.toFixed(2)) : 0,
        'State/UT Tax': !isInter ? Number(totals.sgst.toFixed(2)) : 0,
      });
    }
  }
  return rows;
}

function buildCDNUR(notes) {
  const rows = [];
  // CDNUR is for B2CL (unregistered inter-state > 1L) and Exports
  const cdnurNotes = notes.filter(n => 
    !isRegistered(n) && (
      (isInterState(n) && (n.grandTotal || 0) > B2CL_THRESHOLD) ||
      n.noteSupplyType === 'Export'
    )
  );

  for (const n of cdnurNotes) {
    const posCode = (n.placeOfSupply || '').substring(0, 2);
    const rateGroups = getRateGroups(n);

    for (const [rate, totals] of Object.entries(rateGroups)) {
      rows.push({
        'Type': n.noteSupplyType === 'Export' ? 'Exp w/o Pay' : 'B2CL',
        'Note Number': n.noteNumber || '',
        'Note Date': formatDate(n.noteDate),
        'Note Type': n.noteType === 'Credit Note' ? 'C' : 'D',
        'Place Of Supply': placeOfSupplyLabel(posCode, n),
        'Note Value': Number((n.grandTotal || 0).toFixed(2)),
        'Applicable % of Tax Rate': '',
        'Rate': Number(rate),
        'Taxable Value': Number(totals.taxableValue.toFixed(2)),
        'Cess Amount': Number(totals.cess.toFixed(2)),
        'Integrated Tax': Number(totals.igst.toFixed(2)),
      });
    }
  }
  return rows;
}

function buildHSNSummary(invoices, filterFn, notes = []) {
  const filteredInvoices = invoices.filter(filterFn);
  const filteredNotes = notes.filter(filterFn);
  const hsnGroups = {};

  const processDoc = (doc, multiplier) => {
    const isInter = isInterState(doc);
    for (const item of (doc.items || [])) {
      const hsn = item.hsnCode || '99';
      const rate = Number(item.gstRate ?? item.gstPercent ?? 18);
      const key = `${hsn}|${rate}`;

      if (!hsnGroups[key]) {
        hsnGroups[key] = {
          hsn,
          description: item.itemName || 'Goods/Services',
          uqc: item.uqc || item.uom || 'NOS',
          totalQty: 0,
          totalValue: 0,
          rate,
          taxableValue: 0,
          igst: 0,
          cgst: 0,
          sgst: 0,
          cess: 0,
        };
      }
      
      const qty = (item.qty || 0) * multiplier;
      let taxable = (item.taxableAmount ?? item.taxableValue ?? item.taxableAmt ?? 0) * multiplier;
      
      // Fallback
      if (taxable === 0 && item.qty > 0 && item.rate > 0) {
        const base = item.qty * item.rate;
        const disc = item.discountAmount || ((item.discountPercent || 0) / 100 * base);
        taxable = (base - disc) * multiplier;
      }

      let igst = (item.igstAmount ?? item.igstAmt ?? (isInter ? (item.taxAmount ?? item.taxAmt ?? 0) : 0)) * multiplier;
      let cgst = (item.cgstAmount ?? item.cgstAmt ?? (!isInter ? ((item.taxAmount ?? item.taxAmt ?? 0) / 2) : 0)) * multiplier;
      let sgst = (item.sgstAmount ?? item.sgstAmt ?? (!isInter ? ((item.taxAmount ?? item.taxAmt ?? 0) / 2) : 0)) * multiplier;

      if (rate > 0 && taxable !== 0 && igst === 0 && cgst === 0 && sgst === 0) {
        if (isInter) igst = (taxable * rate / 100);
        else {
          cgst = (taxable * rate / 200);
          sgst = (taxable * rate / 200);
        }
      }

      const cess = (item.cessAmount ?? item.cessAmt ?? 0) * multiplier;
      const totalValue = taxable + igst + cgst + sgst + cess;

      hsnGroups[key].totalQty += qty;
      hsnGroups[key].taxableValue += taxable;
      hsnGroups[key].igst += igst;
      hsnGroups[key].cgst += cgst;
      hsnGroups[key].sgst += sgst;
      hsnGroups[key].cess += cess;
      hsnGroups[key].totalValue += totalValue;
    }

    // Freight
    let fAmount = (doc.freightAmount ?? doc.shippingAmount ?? doc.shippingCharges ?? 0) * multiplier;
    if (fAmount !== 0) {
      const hsn = '9965';
      const fRate = Number(doc.freightGstRate ?? doc.shippingGstRate ?? 0);
      const key = `${hsn}|${fRate}`;
      if (!hsnGroups[key]) {
        hsnGroups[key] = {
          hsn, description: 'Freight / Shipping', uqc: 'OTH-OTHERS',
          totalQty: 0, totalValue: 0, rate: fRate, taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0
        };
      }
      let fGst = (doc.freightGstAmount ?? doc.shippingGstAmount ?? 0) * multiplier;
      if (fGst === 0 && fRate > 0) fGst = (fAmount * fRate / 100);

      hsnGroups[key].taxableValue += fAmount;
      hsnGroups[key].totalValue += (fAmount + fGst);
      if (isInter) hsnGroups[key].igst += fGst;
      else {
        hsnGroups[key].cgst += fGst / 2;
        hsnGroups[key].sgst += fGst / 2;
      }
    }
  };

  for (const inv of filteredInvoices) processDoc(inv, 1);
  for (const note of filteredNotes) {
    const multiplier = note.noteType === 'Credit Note' ? -1 : 1;
    processDoc(note, multiplier);
  }

  return Object.values(hsnGroups).map(g => ({
    'HSN': g.hsn,
    'Description': g.description,
    'UQC': g.uqc,
    'Total Quantity': Number(g.totalQty.toFixed(2)),
    'Total Value': Number(g.totalValue.toFixed(2)),
    'Rate': g.rate,
    'Taxable Value': Number(g.taxableValue.toFixed(2)),
    'Integrated Tax Amount': Number(g.igst.toFixed(2)),
    'Central Tax Amount': Number(g.cgst.toFixed(2)),
    'State/UT Tax Amount': Number(g.sgst.toFixed(2)),
    'Cess Amount': Number(g.cess.toFixed(2)),
  }));
}

/**
 * Build Document Summary (Table 13)
 * Calculated from all GST Tax Invoice documents for selected period and series.
 */
async function buildDocsSummary(startDate, endDate) {
  const rows = [];
  const seriesList = await InvoiceSeries.find({ 
    isEstimate: { $ne: true }, 
    gstApplicable: { $ne: false },
    documentType: { $nin: ['Estimate'] }
  }).lean();

  // Use robust date query similar to fetchInvoicesForPeriod
  const dateQuery = {
    $or: [
      { invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
      {
        $expr: {
          $and: [
            { $gte: ["$invoiceDate", String(startDate)] },
            { $lte: ["$invoiceDate", String(endDate) + 'T23:59:59.999Z'] }
          ]
        }
      }
    ]
  };

  for (const series of seriesList) {
    const isNote = ['Credit Note', 'Debit Note'].includes(series.documentType);
    const Collection = isNote ? CreditDebitNote.collection : SalesInvoice.collection;
    const dateField = isNote ? 'noteDate' : 'invoiceDate';

    const dateQuery = {
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

    // Find all documents (including cancelled) for this series in the period
    const allDocs = await Collection.find({
      seriesId: { $in: [series._id, series._id.toString()] },
      ...dateQuery,
      isDeleted: { $ne: true },
    }).project({ 
      invoiceNumber: 1, 
      noteNumber: 1, 
      sequenceNumber: 1, 
      status: 1 
    }).toArray();

    if (allDocs.length === 0) continue;

    // Use robust sequence detection
    const seqNums = allDocs.map(i => {
      if (i.sequenceNumber && i.sequenceNumber > 0) return i.sequenceNumber;
      const numStr = i.noteNumber || i.invoiceNumber || '';
      const parts = numStr.split(/[/|-]/);
      const lastPart = parts[parts.length - 1];
      const num = parseInt(lastPart.replace(/\D/g, ''), 10);
      return isNaN(num) ? 0 : num;
    }).filter(n => n > 0);
    
    if (seqNums.length === 0) continue;

    const minSeq = Math.min(...seqNums);
    const maxSeq = Math.max(...seqNums);
    const total = maxSeq - minSeq + 1;
    const cancelledCount = allDocs.filter(i => i.status === 'Cancelled').length;

    let docType = 'Invoices for outward supply';
    if (series.documentType === 'Credit Note') docType = 'Credit Note';
    else if (series.documentType === 'Debit Note') docType = 'Debit Note';
    else if (series.documentType === 'Bill of Supply') docType = 'Bill of Supply';
    else if (series.documentType === 'Delivery Challan') docType = 'Delivery Challan';

    // Construct From/To strings based on prefix and min/max seq
    const prefix = series.prefix || '';
    const fromNum = `${prefix}${String(minSeq).padStart(series.padLength || 0, '0')}`;
    const toNum = `${prefix}${String(maxSeq).padStart(series.padLength || 0, '0')}`;

    rows.push({
      'Nature of Document': docType,
      'Sr. No. From': fromNum,
      'Sr. No. To': toNum,
      'Total Number': total,
      'Cancelled': cancelledCount,
      'Net Issued': total - cancelledCount,
    });
  }
  return rows;
}

// ──────────────────────────────────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────────────────────────────────
function validateInvoices(invoices) {
  const errors = [];
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

  for (const inv of invoices) {
    const base = {
      documentType: 'Sales Invoice',
      invoiceNo: inv.invoiceNumber,
      date: formatDate(inv.invoiceDate),
      customerName: inv.customerName,
      gstin: inv.customerGstin || '',
    };

    // 1. Missing Invoice Number
    if (!inv.invoiceNumber) {
      errors.push({ ...base, errorType: 'Missing Invoice Number', severity: 'Blocking Error', message: 'Invoice number is blank', suggestedFix: 'Enter invoice number' });
    }

    // 2. Missing Invoice Date
    if (!inv.invoiceDate) {
      errors.push({ ...base, errorType: 'Missing Invoice Date', severity: 'Blocking Error', message: 'Invoice date is blank', suggestedFix: 'Enter invoice date' });
    }

    // 3. Missing Place of Supply
    if (!inv.placeOfSupply || inv.placeOfSupply.length < 2) {
      errors.push({ ...base, errorType: 'Missing Place of Supply', severity: 'Blocking Error', message: 'Place of supply is missing', suggestedFix: 'Set place of supply on invoice or customer master' });
    }

    // 4. Invalid GSTIN format (if registered)
    if (inv.customerGstin && !gstinRegex.test(inv.customerGstin)) {
      errors.push({ ...base, errorType: 'Invalid GSTIN Format', severity: 'Blocking Error', message: `GSTIN "${inv.customerGstin}" does not match the 15-char format`, suggestedFix: 'Correct the GSTIN in customer master' });
    }

    // 5. GSTIN state code mismatch with place of supply
    if (inv.customerGstin && inv.placeOfSupply) {
      const gstState = inv.customerGstin.substring(0, 2);
      const posState = inv.placeOfSupply.substring(0, 2);
      if (gstState !== posState) {
        errors.push({ ...base, errorType: 'GSTIN State Code Mismatch', severity: 'Warning', message: `GSTIN state code (${gstState}) does not match place of supply (${posState})`, suggestedFix: 'Verify place of supply and customer GSTIN' });
      }
    }

    // 6. Wrong tax type based on place of supply
    const posCode = (inv.placeOfSupply || '').substring(0, 2);
    const isInter = posCode && posCode !== OUR_STATE_CODE;
    if (posCode) {
      if (isInter && inv.totalCgst > 0) {
        errors.push({ ...base, errorType: 'Wrong Tax Type', severity: 'Blocking Error', message: 'Inter-state invoice has CGST/SGST instead of IGST', suggestedFix: 'Change GST type to IGST for inter-state supply' });
      }
      if (!isInter && inv.totalIgst > 0) {
        errors.push({ ...base, errorType: 'Wrong Tax Type', severity: 'Blocking Error', message: 'Intra-state invoice has IGST instead of CGST/SGST', suggestedFix: 'Change GST type to CGST/SGST for intra-state supply' });
      }
    }

    // 7. Missing HSN on items
    for (const item of (inv.items || [])) {
      if (!item.hsnCode || item.hsnCode.trim() === '') {
        errors.push({
          ...base,
          errorType: 'Missing HSN',
          severity: 'Warning',
          message: `Item "${item.itemName}" has no HSN code`,
          suggestedFix: 'Add HSN code to the item master',
          itemHsn: '',
        });
      }
    }

    // 8. E-Commerce GSTIN validation
    if (inv.ecommerceGstin && !gstinRegex.test(inv.ecommerceGstin)) {
      errors.push({ ...base, errorType: 'Invalid E-Commerce GSTIN', severity: 'Warning', message: `E-Commerce GSTIN "${inv.ecommerceGstin}" is invalid`, suggestedFix: 'Correct or remove the E-Commerce GSTIN' });
    }

    // 9. Missing taxable value (Only for GST-applicable invoices)
    const rateGroups = getRateGroups(inv);
    const calculatedTaxable = Object.values(rateGroups).reduce((sum, g) => sum + g.taxableValue, 0);
    const invoiceValue = inv.grandTotal || inv.roundedTotal || 0;

    if (inv.gstApplicable !== false && invoiceValue > 0 && calculatedTaxable === 0) {
      errors.push({
        ...base,
        errorType: 'Missing Taxable Value',
        severity: 'Blocking Error',
        message: `Taxable value/GST amount not found for invoice no. ${inv.invoiceNumber}`,
        suggestedFix: 'Recalculate invoice totals or check item taxable amounts. Ensure items have rate, qty, and GST percentage.'
      });
    }
  }

  return errors;
}

// ──────────────────────────────────────────────────────────────────────────────
// Excel Generation
// ──────────────────────────────────────────────────────────────────────────────

function addSheetWithData(workbook, sheetName, columns, data) {
  const ws = workbook.addWorksheet(sheetName);
  ws.columns = columns.map(c => ({ header: c, key: c, width: 20 }));
  for (const row of data) {
    ws.addRow(row);
  }
  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  return ws;
}

export async function generateGSTR1Data(startDate, endDate) {
  const [invoices, notes] = await Promise.all([
    fetchInvoicesForPeriod(startDate, endDate),
    fetchCreditDebitNotesForPeriod(startDate, endDate)
  ]);
  
  // Numeric Sorting: Ensure 26-27/05 follows 26-27/04 and precedes 26-27/06
  const sortFn = (a, b) => {
    // Primary sort by date
    const dateA = new Date(a.invoiceDate).getTime();
    const dateB = new Date(b.invoiceDate).getTime();
    if (dateA !== dateB) return dateA - dateB;
    
    // Secondary sort by numeric sequence
    const seqA = getInvoiceSequence(a);
    const seqB = getInvoiceSequence(b);
    return seqA - seqB;
  };
  invoices.sort(sortFn);

  const company = await CompanyProfile.findOne().lean();

  const b2b = buildB2B(invoices);
  const b2cl = buildB2CL(invoices);
  const b2cs = buildB2CS(invoices);
  const cdnr = buildCDNR(notes);
  const cdnur = buildCDNUR(notes);
  const hsnB2B = buildHSNSummary(invoices, inv => isRegistered(inv), notes);
  const hsnB2C = buildHSNSummary(invoices, inv => !isRegistered(inv), notes);
  const docs = await buildDocsSummary(startDate, endDate, invoices, notes);

  return {
    company,
    summary: {
      totalInvoices: invoices.length,
      b2bCount: b2b.length,
      b2clCount: b2cl.length,
      b2csCount: b2cs.length,
      cdnrCount: cdnr.length,
      cdnurCount: cdnur.length,
      hsnB2BCount: hsnB2B.length,
      hsnB2CCount: hsnB2C.length,
      docsCount: docs.length,
    },
    b2b,
    b2cl,
    b2cs,
    cdnr,
    cdnur,
    hsnB2B,
    hsnB2C,
    docs,
  };
}

/**
 * Table 3.2 - Inter-state supplies to unregistered persons
 */
function buildTable32(invoices, notes) {
  const posGroups = {}; // key: posCode

  const process = (doc, multiplier) => {
    if (isRegistered(doc)) return;
    if (!isInterState(doc)) return;
    
    const posCode = (doc.placeOfSupply || '').substring(0, 2);
    if (!posCode) return;

    if (!posGroups[posCode]) {
      posGroups[posCode] = { posCode, taxableValue: 0, igst: 0 };
    }

    const rateGroups = getRateGroups(doc);
    for (const totals of Object.values(rateGroups)) {
      posGroups[posCode].taxableValue += totals.taxableValue * multiplier;
      posGroups[posCode].igst += totals.igst * multiplier;
    }
  };

  for (const inv of invoices) process(inv, 1);
  for (const note of notes) {
    const multiplier = note.noteType === 'Credit Note' ? -1 : 1;
    process(note, multiplier);
  }

  return Object.values(posGroups).map(g => ({
    placeOfSupply: placeOfSupplyLabel(g.posCode, { billingStateCode: g.posCode }),
    taxableValue: Number(g.taxableValue.toFixed(2)),
    igst: Number(g.igst.toFixed(2))
  })).filter(g => g.taxableValue !== 0);
}

async function fetchPurchaseInvoicesForPeriod(startDate, endDate) {
  const query = {
    $or: [
      { invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
      {
        $expr: {
          $and: [
            { $gte: ["$invoiceDate", String(startDate)] },
            { $lte: ["$invoiceDate", String(endDate) + 'T23:59:59.999Z'] }
          ]
        }
      }
    ],
    status: { $ne: 'Cancelled' },
    isDeleted: { $ne: true }
  };
  return PurchaseInvoice.find(query).lean();
}

export async function generateGSTR3BData(startDate, endDate) {
  const [invoices, notes, purchases] = await Promise.all([
    fetchInvoicesForPeriod(startDate, endDate),
    fetchCreditDebitNotesForPeriod(startDate, endDate),
    fetchPurchaseInvoicesForPeriod(startDate, endDate)
  ]);

  // Get adjustments for the period
  const month = new Date(startDate).getMonth() + 1;
  const monthStr = String(month).padStart(2, '0');
  const fy = getFYFromDate(new Date(startDate));
  const adjustment = await Gstr3bAdjustment.findOne({ financialYear: fy, month: monthStr }).lean();

  const summary = {
    table31: {
      outwardTaxable: { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 },
      outwardZeroRated: { taxableValue: 0, igst: 0, cess: 0 },
      outwardNilExempt: { taxableValue: 0 },
      inwardReverseCharge: { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 },
      nonGstOutward: { taxableValue: 0 }
    },
    table32: buildTable32(invoices, notes),
    table4: {
      itcAvailable: {
        importGoods: { igst: 0, cess: 0 },
        importServices: { igst: 0, cess: 0 },
        inwardRcm: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
        inwardIsd: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
        allOtherItc: { igst: 0, cgst: 0, sgst: 0, cess: 0 }
      },
      itcReversed: {
        rule38_42_43: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
        others: { igst: 0, cgst: 0, sgst: 0, cess: 0 }
      },
      otherDetails: {
        itcReclaimed: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
        ineligible16_4: { igst: 0, cgst: 0, sgst: 0, cess: 0 }
      }
    },
    table5: {
      exemptNil: { interState: 0, intraState: 0 },
      nonGst: { interState: 0, intraState: 0 }
    },
    table51: { interest: 0, lateFee: 0 },
    table61: { cashPaid: { igst: 0, cgst: 0, sgst: 0, cess: 0 } }
  };

  // 3.1 Outward supplies logic
  const processOutward = (doc, multiplier) => {
    const rateGroups = getRateGroups(doc);
    for (const [rate, totals] of Object.entries(rateGroups)) {
      if (doc.noteSupplyType === 'Export' || doc.exportCountry) {
        summary.table31.outwardZeroRated.taxableValue += totals.taxableValue * multiplier;
        summary.table31.outwardZeroRated.igst += totals.igst * multiplier;
        summary.table31.outwardZeroRated.cess += totals.cess * multiplier;
      } else if (Number(rate) === 0) {
        summary.table31.outwardNilExempt.taxableValue += totals.taxableValue * multiplier;
      } else {
        summary.table31.outwardTaxable.taxableValue += totals.taxableValue * multiplier;
        summary.table31.outwardTaxable.igst += totals.igst * multiplier;
        summary.table31.outwardTaxable.cgst += totals.cgst * multiplier;
        summary.table31.outwardTaxable.sgst += totals.sgst * multiplier;
        summary.table31.outwardTaxable.cess += totals.cess * multiplier;
      }
    }
  };

  for (const inv of invoices) processOutward(inv, 1);
  for (const note of notes) {
    const multiplier = note.noteType === 'Credit Note' ? -1 : 1;
    processOutward(note, multiplier);
  }

  // 3.1(d) Inward RCM & Table 4 ITC from Purchase Invoices
  for (const pi of purchases) {
    if (pi.reverseCharge) {
      summary.table31.inwardReverseCharge.taxableValue += pi.totalTaxableAmount || 0;
      summary.table31.inwardReverseCharge.igst += pi.totalIgst || 0;
      summary.table31.inwardReverseCharge.cgst += pi.totalCgst || 0;
      summary.table31.inwardReverseCharge.sgst += pi.totalSgst || 0;
      
      // Auto-populate Table 4(A)(3)
      summary.table4.itcAvailable.inwardRcm.igst += pi.totalIgst || 0;
      summary.table4.itcAvailable.inwardRcm.cgst += pi.totalCgst || 0;
      summary.table4.itcAvailable.inwardRcm.sgst += pi.totalSgst || 0;
    } else {
      // Regular ITC - Table 4(A)(5)
      summary.table4.itcAvailable.allOtherItc.igst += pi.totalIgst || 0;
      summary.table4.itcAvailable.allOtherItc.cgst += pi.totalCgst || 0;
      summary.table4.itcAvailable.allOtherItc.sgst += pi.totalSgst || 0;
    }
  }

  // Apply Manual Adjustments
  if (adjustment) {
    const applyAdj = (target, adj) => {
      if (!adj) return;
      if (adj.taxableValue) target.taxableValue = (target.taxableValue || 0) + adj.taxableValue;
      if (adj.integratedTax) target.igst = (target.igst || 0) + adj.integratedTax;
      if (adj.centralTax) target.cgst = (target.cgst || 0) + adj.centralTax;
      if (adj.stateUtTax) target.sgst = (target.sgst || 0) + adj.stateUtTax;
      if (adj.cess) target.cess = (target.cess || 0) + adj.cess;
    };

    const t4 = adjustment.table4;
    if (t4) {
      applyAdj(summary.table4.itcAvailable.importGoods, t4.importGoods);
      applyAdj(summary.table4.itcAvailable.importServices, t4.importServices);
      applyAdj(summary.table4.itcAvailable.inwardRcm, t4.inwardRcm);
      applyAdj(summary.table4.itcAvailable.inwardIsd, t4.inwardIsd);
      applyAdj(summary.table4.itcAvailable.allOtherItc, t4.allOtherItc);
      applyAdj(summary.table4.itcReversed.rule38_42_43, t4.itcReversedRule38_42_43);
      applyAdj(summary.table4.itcReversed.others, t4.itcReversedOthers);
      applyAdj(summary.table4.otherDetails.itcReclaimed, t4.itcReclaimed);
      applyAdj(summary.table4.otherDetails.ineligible16_4, t4.ineligibleItc16_4);
    }

    if (adjustment.table5) {
      summary.table5.exemptNil.interState += adjustment.table5.compositionExemptNil.interState || 0;
      summary.table5.exemptNil.intraState += adjustment.table5.compositionExemptNil.intraState || 0;
      summary.table5.nonGst.interState += adjustment.table5.nonGst.interState || 0;
      summary.table5.nonGst.intraState += adjustment.table5.nonGst.intraState || 0;
    }

    if (adjustment.table51) {
      summary.table51.interest = (adjustment.table51.interest?.integratedTax || 0) + (adjustment.table51.interest?.centralTax || 0) + (adjustment.table51.interest?.stateUtTax || 0);
      summary.table51.lateFee = (adjustment.table51.lateFee?.centralTax || 0) + (adjustment.table51.lateFee?.stateUtTax || 0);
    }
  }

  // Rounding
  const deepRound = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'number') obj[key] = Number(obj[key].toFixed(2));
      else if (typeof obj[key] === 'object' && obj[key] !== null) deepRound(obj[key]);
    }
  };
  deepRound(summary);

  return summary;
}

export async function reconcileGSTR1vs3B(startDate, endDate) {
  const g1 = await generateGSTR1Data(startDate, endDate);
  const g3b = await generateGSTR3BData(startDate, endDate);

  const g1Outward = {
    taxableValue: (g1.summary.b2bTaxable || 0) + (g1.summary.b2clTaxable || 0) + (g1.summary.b2csTaxable || 0),
    igst: (g1.summary.b2bIgst || 0) + (g1.summary.b2clIgst || 0) + (g1.summary.b2csIgst || 0),
    cgst: (g1.summary.b2bCgst || 0) + (g1.summary.b2csCgst || 0),
    sgst: (g1.summary.b2bSgst || 0) + (g1.summary.b2csSgst || 0),
  };

  // Need to calculate these correctly if summary fields are missing
  const sum = (arr, key) => arr.reduce((acc, row) => acc + (parseFloat(row[key]) || 0), 0);
  
  g1Outward.taxableValue = sum(g1.b2b, 'Taxable Value') + sum(g1.b2cl, 'Taxable Value') + sum(g1.b2cs, 'Taxable Value') + sum(g1.cdnr, 'Taxable Value') + sum(g1.cdnur, 'Taxable Value');
  g1Outward.igst = sum(g1.b2b, 'Integrated Tax') + sum(g1.b2cl, 'Integrated Tax') + sum(g1.b2cs, 'Integrated Tax') + sum(g1.cdnr, 'Integrated Tax') + sum(g1.cdnur, 'Integrated Tax');
  g1Outward.cgst = sum(g1.b2b, 'Central Tax') + sum(g1.b2cs, 'Central Tax') + sum(g1.cdnr, 'Central Tax');
  g1Outward.sgst = sum(g1.b2b, 'State/UT Tax') + sum(g1.b2cs, 'State/UT Tax') + sum(g1.cdnr, 'State/UT Tax');

  const g3bOutward = g3b.table31.outwardTaxable;

  return {
    gstr1: g1Outward,
    gstr3b: g3bOutward,
    difference: {
      taxableValue: g1Outward.taxableValue - g3bOutward.taxableValue,
      igst: g1Outward.igst - g3bOutward.igst,
      cgst: g1Outward.cgst - g3bOutward.cgst,
      sgst: g1Outward.sgst - g3bOutward.sgst,
    }
  };
}

export async function validateGSTR1(startDate, endDate) {
  const [invoices, notes] = await Promise.all([
    fetchInvoicesForPeriod(startDate, endDate),
    fetchCreditDebitNotesForPeriod(startDate, endDate)
  ]);
  const baseErrors = validateInvoices(invoices);
  const noteErrors = validateInvoices(notes); // Reuse validation for notes as well

  // Cross-check: Ensure all docs are covered in Document Summary
  const docs = await buildDocsSummary(startDate, endDate, invoices, notes);
  const docErrors = [];

  for (const inv of invoices) {
    const invSeq = getInvoiceSequence(inv);
    let foundInSummary = false;
    
    // Check if invoice sequence falls within any range in docs summary
    for (const docRow of docs) {
      // Extract numeric suffix from range strings
      const fromParts = docRow['Sr. No. From'].split(/[/|-]/);
      const fromSeq = parseInt(fromParts[fromParts.length - 1].replace(/\D/g, ''), 10);
      
      const toParts = docRow['Sr. No. To'].split(/[/|-]/);
      const toSeq = parseInt(toParts[toParts.length - 1].replace(/\D/g, ''), 10);
      
      if (invSeq >= fromSeq && invSeq <= toSeq) {
        foundInSummary = true;
        break;
      }
    }

    if (!foundInSummary) {
      docErrors.push({
        documentType: 'Sales Invoice',
        invoiceNo: inv.invoiceNumber,
        date: formatDate(inv.invoiceDate),
        customerName: inv.customerName,
        errorType: 'Summary Mismatch',
        severity: 'Blocking Error',
        message: `Invoice exists in GSTR-1 data but missing from Document Summary (Table 13).`,
        suggestedFix: 'Ensure invoice sequence number and series are correctly set.'
      });
    }
  }

  return [...baseErrors, ...noteErrors, ...docErrors];
}

export async function generateGSTR1Excel(startDate, endDate) {
  const data = await generateGSTR1Data(startDate, endDate);

  const workbook = new ExcelJS.Workbook();

  // B2B sheet
  const b2bCols = ['GSTIN/UIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice date',
    'Invoice Value', 'Place Of Supply', 'Reverse Charge', 'Applicable % of Tax Rate',
    'Invoice Type', 'E-Commerce GSTIN', 'Rate', 'Taxable Value', 'Cess Amount',
    'Integrated Tax', 'Central Tax', 'State/UT Tax'];
  addSheetWithData(workbook, 'b2b', b2bCols, data.b2b);

  // B2CL sheet
  const b2clCols = ['Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply',
    'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount',
    'E-Commerce GSTIN', 'Integrated Tax'];
  addSheetWithData(workbook, 'b2cl', b2clCols, data.b2cl);

  // B2CS sheet
  const b2csCols = ['Type', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate',
    'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN',
    'Integrated Tax', 'Central Tax', 'State/UT Tax'];
  addSheetWithData(workbook, 'b2cs', b2csCols, data.b2cs);

  // Empty sheets matching the template
  const cdnrCols = ['GSTIN/UIN of Recipient', 'Receiver Name', 'Note Number', 'Note Date',
    'Note Type', 'Place Of Supply', 'Reverse Charge', 'Note Supply Type',
    'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount',
    'Integrated Tax', 'Central Tax', 'State/UT Tax'];
  addSheetWithData(workbook, 'cdnr', cdnrCols, data.cdnr);

  const cdnurCols = ['Type', 'Note Number', 'Note Date', 'Note Type', 'Place Of Supply',
    'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount',
    'Integrated Tax'];
  addSheetWithData(workbook, 'cdnur', cdnurCols, data.cdnur);

  const emptySheets = ['exp', 'exemp', 'at', 'atadj'];
  for (const name of emptySheets) {
    workbook.addWorksheet(name);
  }

  // HSN B2B
  const hsnCols = ['HSN', 'Description', 'UQC', 'Total Quantity', 'Total Value', 'Rate',
    'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount',
    'State/UT Tax Amount', 'Cess Amount'];
  addSheetWithData(workbook, 'hsn(b2b)', hsnCols, data.hsnB2B);

  // HSN B2C
  addSheetWithData(workbook, 'hsn(b2c)', hsnCols, data.hsnB2C);

  // Docs / Table 13
  const docsCols = ['Nature of Document', 'Sr. No. From', 'Sr. No. To',
    'Total Number', 'Cancelled', 'Net Issued'];
  addSheetWithData(workbook, 'docs', docsCols, data.docs);

  // Additional empty amendment sheets
  const amendSheets = ['b2ba', 'b2cla', 'b2csa', 'expa', 'cdnra', 'cdnura', 'ata', 'atadja', 'ecoa', 'supeco', 'eco'];
  for (const name of amendSheets) {
    workbook.addWorksheet(name);
  }

  return { workbook, data };
}
