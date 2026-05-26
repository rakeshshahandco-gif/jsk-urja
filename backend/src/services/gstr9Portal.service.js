/**
 * GSTR-9 Portal Import Service
 *
 * Accepts GST-portal-downloaded JSON/Excel for GSTR-1 and GSTR-3B (monthly),
 * parses them, persists to Gstr9PortalImport, and provides FY-level
 * "Portal vs Books" reconciliation data for the GSTR-9 annual return.
 */
import crypto from 'crypto';
import ExcelJS from 'exceljs';
import { Gstr9PortalImport } from '../models/gstr9PortalImport.model.js';
import { generateGSTR9Data } from './gstReport.service.js';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
function n(v) { return Number(v) || 0; }
function fileHash(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

/**
 * Derive FY string ("2025-2026") and month ("04"–"03") from portal filing period.
 * Portal uses "MMYYYY" e.g. "032026" = March 2026.
 */
function parseFp(fp) {
  const mm   = String(fp).substring(0, 2).padStart(2, '0');
  const yyyy = Number(String(fp).substring(2));
  const fy   = Number(mm) >= 4
    ? `${yyyy}-${yyyy + 1}`
    : `${yyyy - 1}-${yyyy}`;
  return { month: mm, financialYear: fy };
}

// ──────────────────────────────────────────────────────────────────────────────
// GSTR-1 JSON parser (official portal JSON format)
// ──────────────────────────────────────────────────────────────────────────────
function parseGstr1Json(json) {
  const errors = [];
  let taxableValue = 0, igst = 0, cgst = 0, sgst = 0, cess = 0;
  let nilExempt = 0, zeroRated = 0;
  const hsnRows = [];

  // ── B2B ────────────────────────────────────────────────────────────────────
  for (const rec of (json.b2b || [])) {
    for (const inv of (rec.inv || [])) {
      for (const itm of (inv.itms || [])) {
        const d = itm.itm_det || itm;
        taxableValue += n(d.txval);
        igst         += n(d.iamt);
        cgst         += n(d.camt);
        sgst         += n(d.samt);
        cess         += n(d.csamt);
      }
    }
  }

  // ── B2CL (inter-state > ₹1L, B2C Large) ──────────────────────────────────
  for (const rec of (json.b2cl || [])) {
    for (const inv of (rec.inv || [])) {
      for (const itm of (inv.itms || [])) {
        const d = itm.itm_det || itm;
        taxableValue += n(d.txval);
        igst         += n(d.iamt);
        cess         += n(d.csamt);
      }
    }
  }

  // ── B2CS (B2C small) ───────────────────────────────────────────────────────
  for (const rec of (json.b2cs || [])) {
    taxableValue += n(rec.txval);
    igst         += n(rec.iamt);
    cgst         += n(rec.camt);
    sgst         += n(rec.samt);
    cess         += n(rec.csamt);
  }

  // ── CDNR (credit/debit notes – registered) ─────────────────────────────────
  for (const rec of (json.cdnr || [])) {
    for (const note of (rec.nt || [])) {
      const sign = (note.ntty || '').toUpperCase() === 'C' ? -1 : 1;
      for (const itm of (note.itms || [])) {
        const d = itm.itm_det || itm;
        taxableValue += sign * n(d.txval);
        igst         += sign * n(d.iamt);
        cgst         += sign * n(d.camt);
        sgst         += sign * n(d.samt);
        cess         += sign * n(d.csamt);
      }
    }
  }

  // ── CDNUR (credit/debit notes – unregistered) ─────────────────────────────
  for (const note of (json.cdnur || [])) {
    const sign = (note.ntty || '').toUpperCase() === 'C' ? -1 : 1;
    for (const itm of (note.itms || [])) {
      const d = itm.itm_det || itm;
      taxableValue += sign * n(d.txval);
      igst         += sign * n(d.iamt);
      cess         += sign * n(d.csamt);
    }
  }

  // ── NIL/EXEMPT ─────────────────────────────────────────────────────────────
  const nil = json.nil || {};
  for (const rec of (nil.inv || [])) {
    nilExempt += n(rec.nil_amt) + n(rec.expt_amt);
  }

  // ── EXPORTS (zero-rated) ──────────────────────────────────────────────────
  for (const inv of (json.exp || [])) {
    for (const itm of (inv.itms || [])) {
      const d = itm.itm_det || itm;
      zeroRated    += n(d.txval);
      taxableValue += n(d.txval);
      igst         += n(d.iamt);
    }
  }

  // ── HSN Summary ────────────────────────────────────────────────────────────
  const hsnData = json.hsn?.data || json.hsn_sum?.data || [];
  for (const row of hsnData) {
    hsnRows.push({
      hsn:          String(row.hsn_sc || row.num || ''),
      description:  row.desc || '',
      uom:          row.uqc  || '',
      qty:          n(row.qty),
      taxableValue: n(row.txval),
      igst:         n(row.iamt),
      cgst:         n(row.camt),
      sgst:         n(row.samt),
      cess:         n(row.csamt),
      gstRate:      n(row.rt),
    });
  }

  if (!json.fp && !json.ret_period) errors.push('Filing period (fp) not found in JSON');

  return { taxableValue, igst, cgst, sgst, cess, nilExempt, zeroRated, hsnRows, errors };
}

// ──────────────────────────────────────────────────────────────────────────────
// GSTR-3B JSON parser (official portal JSON format)
// ──────────────────────────────────────────────────────────────────────────────
function parseGstr3bJson(json) {
  const errors = [];
  const sup = json.sup_details || {};

  // Outward supplies
  const outDet  = sup.osup_det  || {};  // regular taxable
  const outZero = sup.osup_zero || {};  // zero-rated
  const outNil  = sup.osup_nil_exmp || {};
  const inRev   = sup.isup_rev  || {};  // RCM inward

  const taxableValue = n(outDet.txval);
  const igst         = n(outDet.iamt);
  const cgst         = n(outDet.camt);
  const sgst         = n(outDet.samt);
  const cess         = n(outDet.csamt);
  const nilExempt    = n(outNil.txval);
  const zeroRated    = n(outZero.txval);

  // ITC availed
  const itcElg  = json.itc_elg  || {};
  const itcAvl  = itcElg.itc_avl || [];
  let itcIgst = 0, itcCgst = 0, itcSgst = 0;
  let itcRcmIgst = 0, itcRcmCgst = 0, itcRcmSgst = 0;

  for (const itc of itcAvl) {
    const ty = (itc.ty || '').toUpperCase();
    if (ty === 'ISRC') {
      // Inward supplies liable to reverse charge
      itcRcmIgst += n(itc.iamt);
      itcRcmCgst += n(itc.camt);
      itcRcmSgst += n(itc.samt);
    } else {
      itcIgst += n(itc.iamt);
      itcCgst += n(itc.camt);
      itcSgst += n(itc.samt);
    }
  }

  // Tax paid (from cash/ITC ledger)
  const intr = json.intr_ltfee || {};
  const taxPaid = intr.intr_det || {};
  const taxPaidIgst = n(taxPaid.iamt);
  const taxPaidCgst = n(taxPaid.camt);
  const taxPaidSgst = n(taxPaid.samt);
  const taxPaidCess = n(taxPaid.csamt);

  if (!json.ret_period && !json.fp) errors.push('Return period (ret_period) not found in JSON');

  return {
    taxableValue, igst, cgst, sgst, cess,
    nilExempt, zeroRated,
    itcIgst, itcCgst, itcSgst,
    itcRcmIgst, itcRcmCgst, itcRcmSgst,
    taxPaidIgst, taxPaidCgst, taxPaidSgst, taxPaidCess,
    errors,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Excel fallback parser — reads "outward taxable / IGST / CGST / SGST" rows
// from the portal's downloadable GSTR-1 / 3B Excel summary sheet.
// ──────────────────────────────────────────────────────────────────────────────
async function parsePortalExcel(buffer, formType) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const totals = {
    taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0,
    nilExempt: 0, zeroRated: 0,
    itcIgst: 0, itcCgst: 0, itcSgst: 0,
    errors: [],
  };

  // Try to extract numbers from any sheet — look for rows with "taxable" in col 0
  wb.eachSheet((ws) => {
    ws.eachRow((row) => {
      const c1 = String(row.getCell(1).value || '').toLowerCase();
      if (c1.includes('taxable')) {
        totals.taxableValue += Number(row.getCell(2).value) || 0;
        totals.igst         += Number(row.getCell(3).value) || 0;
        totals.cgst         += Number(row.getCell(4).value) || 0;
        totals.sgst         += Number(row.getCell(5).value) || 0;
        totals.cess         += Number(row.getCell(6).value) || 0;
      }
      if (c1.includes('itc') || c1.includes('input tax')) {
        totals.itcIgst += Number(row.getCell(3).value) || 0;
        totals.itcCgst += Number(row.getCell(4).value) || 0;
        totals.itcSgst += Number(row.getCell(5).value) || 0;
      }
    });
  });

  if (totals.taxableValue === 0 && totals.igst === 0)
    totals.errors.push('Could not extract tax values from Excel. Try importing the JSON file instead.');

  return totals;
}

// ──────────────────────────────────────────────────────────────────────────────
// Main import function — called from controller
// ──────────────────────────────────────────────────────────────────────────────
export async function importGstr9PortalFile({ buffer, fileName, formType, userId }) {
  const hash  = fileHash(buffer);
  const fname = String(fileName || '').toLowerCase();
  const isJson = fname.endsWith('.json');
  const isExcel = fname.endsWith('.xlsx') || fname.endsWith('.xls');

  let parsed;
  let rawJson = null;
  let fp = '';

  if (isJson) {
    let json;
    try {
      json = JSON.parse(buffer.toString('utf8'));
    } catch {
      throw new Error('Invalid JSON file. Please upload the original file downloaded from the GST portal.');
    }
    rawJson = json;
    fp = json.fp || json.ret_period || '';
    parsed = formType === 'GSTR1' ? parseGstr1Json(json) : parseGstr3bJson(json);
  } else if (isExcel) {
    parsed = await parsePortalExcel(buffer, formType);
    // FY/month must be supplied manually for Excel (portal doesn't embed it reliably)
  } else {
    throw new Error('Unsupported file type. Please upload a .json or .xlsx file from the GST portal.');
  }

  if (!fp) {
    throw new Error('Filing period not detected in the file. Ensure you uploaded the official portal JSON.');
  }

  const { month, financialYear } = parseFp(fp);

  // Upsert — one doc per FY + month + formType
  const doc = await Gstr9PortalImport.findOneAndUpdate(
    { financialYear, month, formType },
    {
      $set: {
        gstin:         rawJson?.gstin || '',
        filingPeriod:  fp,
        outwardTaxableValue: parsed.taxableValue,
        outwardIgst:         parsed.igst,
        outwardCgst:         parsed.cgst,
        outwardSgst:         parsed.sgst,
        outwardCess:         parsed.cess,
        nilExemptValue:      parsed.nilExempt   || 0,
        zeroRatedValue:      parsed.zeroRated   || 0,
        itcIgst:             parsed.itcIgst     || 0,
        itcCgst:             parsed.itcCgst     || 0,
        itcSgst:             parsed.itcSgst     || 0,
        itcRcmIgst:          parsed.itcRcmIgst  || 0,
        itcRcmCgst:          parsed.itcRcmCgst  || 0,
        itcRcmSgst:          parsed.itcRcmSgst  || 0,
        taxPaidIgst:         parsed.taxPaidIgst || 0,
        taxPaidCgst:         parsed.taxPaidCgst || 0,
        taxPaidSgst:         parsed.taxPaidSgst || 0,
        taxPaidCess:         parsed.taxPaidCess || 0,
        hsnRows:             parsed.hsnRows     || [],
        fileName,
        fileHash:   hash,
        importedBy: userId,
        rowCount:   (parsed.hsnRows || []).length,
        parseErrors: parsed.errors || [],
        rawData:    rawJson,
      },
    },
    { upsert: true, new: true },
  );

  return {
    success:       true,
    financialYear,
    month,
    formType,
    parseErrors:   parsed.errors || [],
    docId:         doc._id,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Get imported portal data for a FY (all months)
// ──────────────────────────────────────────────────────────────────────────────
export async function getGstr9PortalImports(financialYear) {
  const records = await Gstr9PortalImport.find({ financialYear })
    .select('-rawData')
    .sort({ formType: 1, month: 1 })
    .lean();
  return records;
}

// ──────────────────────────────────────────────────────────────────────────────
// Delete a specific import (re-import replacement)
// ──────────────────────────────────────────────────────────────────────────────
export async function deleteGstr9PortalImport(id) {
  await Gstr9PortalImport.findByIdAndDelete(id);
}

// ──────────────────────────────────────────────────────────────────────────────
// Reconcile portal vs books — FY-level GSTR-9 comparison
// ──────────────────────────────────────────────────────────────────────────────
export async function reconcileGstr9(financialYear) {
  const [portalDocs, booksData] = await Promise.all([
    Gstr9PortalImport.find({ financialYear }).select('-rawData').lean(),
    generateGSTR9Data(financialYear),
  ]);

  // Aggregate portal GSTR-1 records
  const p1 = portalDocs.filter((d) => d.formType === 'GSTR1');
  const p3b = portalDocs.filter((d) => d.formType === 'GSTR3B');

  const sumP1 = p1.reduce(
    (acc, d) => ({
      taxableValue: acc.taxableValue + d.outwardTaxableValue,
      igst:         acc.igst         + d.outwardIgst,
      cgst:         acc.cgst         + d.outwardCgst,
      sgst:         acc.sgst         + d.outwardSgst,
      cess:         acc.cess         + d.outwardCess,
      nilExempt:    acc.nilExempt    + d.nilExemptValue,
      zeroRated:    acc.zeroRated    + d.zeroRatedValue,
    }),
    { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, nilExempt: 0, zeroRated: 0 },
  );

  const sumP3b = p3b.reduce(
    (acc, d) => ({
      itcIgst:    acc.itcIgst    + d.itcIgst,
      itcCgst:    acc.itcCgst    + d.itcCgst,
      itcSgst:    acc.itcSgst    + d.itcSgst,
      itcRcmIgst: acc.itcRcmIgst + d.itcRcmIgst,
      itcRcmCgst: acc.itcRcmCgst + d.itcRcmCgst,
      itcRcmSgst: acc.itcRcmSgst + d.itcRcmSgst,
      taxPaidIgst: acc.taxPaidIgst + d.taxPaidIgst,
      taxPaidCgst: acc.taxPaidCgst + d.taxPaidCgst,
      taxPaidSgst: acc.taxPaidSgst + d.taxPaidSgst,
      taxPaidCess: acc.taxPaidCess + d.taxPaidCess,
    }),
    { itcIgst: 0, itcCgst: 0, itcSgst: 0, itcRcmIgst: 0, itcRcmCgst: 0, itcRcmSgst: 0, taxPaidIgst: 0, taxPaidCgst: 0, taxPaidSgst: 0, taxPaidCess: 0 },
  );

  const booksOutward = booksData.table4.total;
  const booksItc     = booksData.table6.total;

  // Build comparison rows
  const ROWS = [
    {
      label:    'Outward Taxable Value',
      portal:   sumP1.taxableValue,
      books:    booksOutward.taxableValue,
      diff:     r2(booksOutward.taxableValue - sumP1.taxableValue),
      source:   'GSTR-1 vs Books (Table 4)',
    },
    {
      label:    'IGST on Outward',
      portal:   sumP1.igst,
      books:    booksOutward.igst,
      diff:     r2(booksOutward.igst - sumP1.igst),
      source:   'GSTR-1 vs Books',
    },
    {
      label:    'CGST on Outward',
      portal:   sumP1.cgst,
      books:    booksOutward.cgst,
      diff:     r2(booksOutward.cgst - sumP1.cgst),
      source:   'GSTR-1 vs Books',
    },
    {
      label:    'SGST on Outward',
      portal:   sumP1.sgst,
      books:    booksOutward.sgst,
      diff:     r2(booksOutward.sgst - sumP1.sgst),
      source:   'GSTR-1 vs Books',
    },
    {
      label:    'Nil / Exempt Supplies',
      portal:   sumP1.nilExempt,
      books:    booksData.table5.nilExempt.taxableValue,
      diff:     r2(booksData.table5.nilExempt.taxableValue - sumP1.nilExempt),
      source:   'GSTR-1 vs Books (Table 5)',
    },
    {
      label:    'ITC Availed – IGST',
      portal:   sumP3b.itcIgst,
      books:    booksItc.igst,
      diff:     r2(booksItc.igst - sumP3b.itcIgst),
      source:   'GSTR-3B vs Books (Table 6)',
    },
    {
      label:    'ITC Availed – CGST',
      portal:   sumP3b.itcCgst,
      books:    booksItc.cgst,
      diff:     r2(booksItc.cgst - sumP3b.itcCgst),
      source:   'GSTR-3B vs Books',
    },
    {
      label:    'ITC Availed – SGST',
      portal:   sumP3b.itcSgst,
      books:    booksItc.sgst,
      diff:     r2(booksItc.sgst - sumP3b.itcSgst),
      source:   'GSTR-3B vs Books',
    },
    {
      label:    'RCM ITC – IGST',
      portal:   sumP3b.itcRcmIgst,
      books:    booksData.table6.rcm.igst,
      diff:     r2(booksData.table6.rcm.igst - sumP3b.itcRcmIgst),
      source:   'GSTR-3B vs Books',
    },
  ];

  const monthlyStatus = {
    gstr1:  buildMonthlyStatus(p1,  financialYear),
    gstr3b: buildMonthlyStatus(p3b, financialYear),
  };

  return {
    financialYear,
    portal:  { gstr1: sumP1, gstr3b: sumP3b },
    books:   booksData,
    rows:    ROWS,
    monthlyStatus,
    importedMonths: {
      gstr1:  p1.length,
      gstr3b: p3b.length,
    },
  };
}

function r2(n) { return Math.round((n || 0) * 100) / 100; }

function buildMonthlyStatus(docs, fy) {
  const FY_MONTHS = ['04','05','06','07','08','09','10','11','12','01','02','03'];
  return FY_MONTHS.map((m) => {
    const doc = docs.find((d) => d.month === m);
    return {
      month: m,
      imported: !!doc,
      fileName: doc?.fileName || '',
      importedAt: doc?.updatedAt || null,
      outwardTaxableValue: doc?.outwardTaxableValue || 0,
    };
  });
}
