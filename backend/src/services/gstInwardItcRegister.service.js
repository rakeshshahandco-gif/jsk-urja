/**
 * GST Inward & ITC Register — reporting / reconciliation layer only.
 * Does not create or alter vouchers, ledgers, stock, or GST returns.
 */
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { Voucher } from '../models/voucher.model.js';
import { FixedAsset } from '../models/fixedAsset.model.js';
import { Gstr2bData } from '../models/gstr2bData.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { LedgerEntry } from '../models/ledgerEntry.model.js';
import { getFYFromDate } from '../utils/fyUtils.js';
import { getCompanyScopeStore } from '../utils/companyScopeContext.js';
import {
    normalizeInvoiceRef,
    scoreGstPair,
    DEFAULT_GST_MATCH_CONFIG,
} from './gstReconciliation/gstReconEngine.js';

const OUR_STATE_CODE = '27';

export const INWARD_TABS = [
    'all',
    'purchases',
    'expenses_services',
    'fixed_assets',
    'reverse_charge',
    'imports',
    'credit_debit_notes',
    'eligible_itc',
    'ineligible_blocked',
    'books_vs_2b',
];

export const ITC_STATUS = {
    ELIGIBLE: 'Eligible',
    INELIGIBLE: 'Ineligible',
    BLOCKED: 'Blocked Credit',
    PARTLY: 'Partly Eligible',
    TEMP_REVERSED: 'Temporarily Reversed',
    PENDING_REVIEW: 'Pending Review',
    PENDING_SUPPLIER: 'Pending Supplier Filing',
    RCM_PENDING: 'RCM ITC Pending Tax Payment',
    RCM_AVAILABLE: 'RCM ITC Available',
    TIME_BARRED: 'Time-Barred',
    OWNER_REVIEW: 'Owner/Tax Professional Review Required',
};

const RECON_STATUS = {
    FULLY_MATCHED: 'Fully Matched',
    BOOKS_ONLY: 'Books Only',
    GSTR2B_ONLY: 'GSTR-2B Only',
    GSTIN_MISMATCH: 'GSTIN Mismatch',
    INV_MISMATCH: 'Invoice Number Mismatch',
    DATE_MISMATCH: 'Date Mismatch',
    TAXABLE_DIFF: 'Taxable Value Difference',
    CGST_DIFF: 'CGST Difference',
    SGST_DIFF: 'SGST Difference',
    IGST_DIFF: 'IGST Difference',
    CDN_DIFF: 'Credit Note Difference',
    MANUAL: 'Manual Review',
};

function isInterState(posCode, billingStateCode) {
    let code = String(posCode || '').substring(0, 2);
    if (!code) code = String(billingStateCode || '').substring(0, 2);
    if (!code) return false;
    return code !== OUR_STATE_CODE;
}

function buildDateQuery(startDate, endDate, dateField = 'invoiceDate') {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (!Number.isNaN(end.getTime()) && !String(endDate).includes('T')) {
        end.setUTCHours(23, 59, 59, 999);
    }
    return {
        $or: [
            { [dateField]: { $gte: start, $lte: end } },
            {
                $expr: {
                    $and: [
                        { $gte: [{ $toString: `$${dateField}` }, String(startDate)] },
                        { $lte: [{ $toString: `$${dateField}` }, `${String(endDate)}T23:59:59.999Z`] },
                    ],
                },
            },
        ],
    };
}

function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

function mapPurchaseType(raw) {
    const v = String(raw || '').toUpperCase();
    if (v.includes('CONSUMABLE')) return 'Consumable';
    if (v.includes('TRADING')) return 'Trading Purchase';
    if (v.includes('SERVICE') || v.includes('SAC')) return 'Service Purchase';
    if (v.includes('CAPITAL') || v.includes('ASSET')) return 'Capital Purchase';
    if (v.includes('RAW')) return 'Raw Material';
    return 'Raw Material';
}

function inferItcStatus({
    explicit,
    reverseCharge,
    supplierGstin,
    portalItcAvailable,
    blocked,
}) {
    if (explicit) {
        const e = String(explicit).trim();
        if (/block/i.test(e)) return ITC_STATUS.BLOCKED;
        if (/ineligib/i.test(e)) return ITC_STATUS.INELIGIBLE;
        if (/part/i.test(e)) return ITC_STATUS.PARTLY;
        if (/pending.*supplier|supplier.*fil/i.test(e)) return ITC_STATUS.PENDING_SUPPLIER;
        if (/rcm.*avail/i.test(e)) return ITC_STATUS.RCM_AVAILABLE;
        if (/rcm|reverse/i.test(e)) return ITC_STATUS.RCM_PENDING;
        if (/time.?bar/i.test(e)) return ITC_STATUS.TIME_BARRED;
        if (/review|owner|tax.?pro/i.test(e)) return ITC_STATUS.OWNER_REVIEW;
        if (/eligible/i.test(e)) return ITC_STATUS.ELIGIBLE;
        if (/ineligible|not.?eligible/i.test(e)) return ITC_STATUS.INELIGIBLE;
        return e;
    }
    if (blocked) return ITC_STATUS.BLOCKED;
    if (portalItcAvailable === 'No') return ITC_STATUS.INELIGIBLE;
    if (reverseCharge) return ITC_STATUS.RCM_PENDING;
    if (!supplierGstin) return ITC_STATUS.PENDING_REVIEW;
    return ITC_STATUS.ELIGIBLE;
}

function isEligibleItcStatus(status) {
    return status === ITC_STATUS.ELIGIBLE
        || status === ITC_STATUS.RCM_AVAILABLE
        || status === ITC_STATUS.PARTLY;
}

function mapReconDetail(books, portal) {
    if (!books && portal) return RECON_STATUS.GSTR2B_ONLY;
    if (books && !portal) return RECON_STATUS.BOOKS_ONLY;
    const scored = scoreGstPair(
        {
            supplierGstin: books.supplierGstin,
            billNo: books.invoiceNumber,
            billDate: books.invoiceDate || books.date,
            taxableValue: books.taxableValue,
            totalGst: books.totalGst,
        },
        {
            supplierGstin: portal.supplierGstin,
            billNo: portal.invoiceNumber,
            billDate: portal.invoiceDate,
            taxableValue: portal.taxableValue,
            totalGst: portal.totalTax || ((portal.cgst || 0) + (portal.sgst || 0) + (portal.igst || 0)),
        },
        DEFAULT_GST_MATCH_CONFIG,
    );
    if (scored.reasons?.includes('gstin_mismatch')) return RECON_STATUS.GSTIN_MISMATCH;
    if (scored.reasons?.includes('invoice_number_mismatch')) return RECON_STATUS.INV_MISMATCH;
    if (scored.reasons?.includes('date_outside_tolerance')) return RECON_STATUS.DATE_MISMATCH;
    if (scored.score >= 92) return RECON_STATUS.FULLY_MATCHED;
    if (Math.abs((books.cgst || 0) - (portal.cgst || 0)) > 2) return RECON_STATUS.CGST_DIFF;
    if (Math.abs((books.sgst || 0) - (portal.sgst || 0)) > 2) return RECON_STATUS.SGST_DIFF;
    if (Math.abs((books.igst || 0) - (portal.igst || 0)) > 2) return RECON_STATUS.IGST_DIFF;
    if (scored.reasons?.includes('amount_mismatch')) return RECON_STATUS.TAXABLE_DIFF;
    return RECON_STATUS.MANUAL;
}

function baseRow(partial) {
    return {
        id: null,
        date: null,
        voucherType: '',
        voucherNumber: '',
        sourceModule: '',
        supplierName: '',
        supplierGstin: '',
        invoiceNumber: '',
        invoiceNumberNormalized: '',
        invoiceDate: null,
        expensePurchaseLedger: '',
        documentCategory: 'purchases',
        purchaseType: '',
        placeOfSupply: '',
        taxableValue: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        cess: 0,
        totalGst: 0,
        totalTax: 0,
        invoiceValue: 0,
        rcmApplicable: false,
        itcEligibility: ITC_STATUS.ELIGIBLE,
        ineligibilityReason: '',
        gstr2bStatus: '',
        reconciliationStatus: RECON_STATUS.BOOKS_ONLY,
        accountingPostingStatus: '',
        paymentStatus: '',
        remarks: '',
        // Phase 2D — GSTR-3B mapping (reporting only; not auto-claimed)
        rcmLiabilityReturnPeriod: '',
        rcmLiabilityReturnStatus: '',
        rcmItcReturnStatus: '',
        gstr3bBatchVersion: null,
        gstr3bInclusionBatch: '',
        rcmExceptionStatus: '',
        rcmApprovalStatus: '',
        rcmFiledPeriod: '',
        rcmAmendmentRequired: false,
        rcmReconciliationDifference: '',
        gstr3bMappingStatus: 'Not Automatically Updated',
        gstr3bPreviewSection: 'Preview only — not in return',
        liabilityJvId: null,
        paymentJvId: null,
        itcReleaseJvId: null,
        ...partial,
    };
}

/**
 * Phase 2 RCM liability journals — drill-down for books vs GSTR-3B mapping status.
 * Reporting only; does not create vouchers or alter returns.
 */
async function loadRcmPhaseLiabilityRows(startDate, endDate) {
    const vouchers = await Voucher.find({
        ...buildDateQuery(startDate, endDate, 'date'),
        'rcmLiabilityMeta.kind': 'RCM_LIABILITY',
        status: { $ne: 'Cancelled' },
    })
        .sort({ date: 1 })
        .lean();

    return vouchers.map((v) => {
        const m = v.rcmLiabilityMeta || {};
        const cgst = Number(m.cgst ?? m.taxComponents?.cgst ?? 0) || 0;
        const sgst = Number(m.sgst ?? m.taxComponents?.sgst ?? 0) || 0;
        const igst = Number(m.igst ?? m.taxComponents?.igst ?? 0) || 0;
        const cess = Number(m.cess ?? m.taxComponents?.cess ?? 0) || 0;
        const taxableValue = Number(m.taxableValue ?? 0) || 0;
        const totalGst = round2(cgst + sgst + igst + cess);
        const mapStatus = m.gstr3bMappingStatus || 'NOT_AUTOMATICALLY_UPDATED';
        const included = /INCLUDED|FILED|CLAIMED/i.test(String(mapStatus));
        const returnPeriod = m.gstr3bReturnPeriod || '';
        return baseRow({
            id: String(v._id),
            date: v.date,
            voucherType: 'RCM Liability JV',
            voucherNumber: v.voucherNo || '',
            sourceModule: 'RCM Liability',
            supplierName: m.supplierName || v.partyName || '',
            supplierGstin: m.supplierGstin || '',
            invoiceNumber: m.sourceVoucherNumber || '',
            invoiceNumberNormalized: normalizeInvoiceRef(m.sourceVoucherNumber || ''),
            invoiceDate: m.sourceVoucherDate || v.date,
            expensePurchaseLedger: m.expensePurchaseLedgerName || '',
            documentCategory: 'reverse_charge',
            purchaseType: 'RCM Liability',
            placeOfSupply: m.placeOfSupply || '',
            taxableValue: round2(taxableValue),
            cgst: round2(cgst),
            sgst: round2(sgst),
            igst: round2(igst),
            cess: round2(cess),
            totalGst,
            totalTax: totalGst,
            invoiceValue: round2(taxableValue + totalGst),
            rcmApplicable: true,
            itcEligibility: m.itcEligibilityDecision || m.itcStatus || ITC_STATUS.RCM_PENDING,
            ineligibilityReason: m.itcIneligibilityReason || '',
            accountingPostingStatus: m.postingStatus || v.status || '',
            paymentStatus: m.paymentStatus || '',
            remarks: `RCM Phase mapping — ${mapStatus}`,
            gstr3bMappingStatus: mapStatus,
            gstr3bPreviewSection: included
                ? `Included in GSTR-3B ${returnPeriod || '(period set)'} v${m.gstr3bInclusionVersion || '?'}`
                : 'PREVIEW ONLY — NOT YET INCLUDED IN GSTR-3B',
            rcmLiabilityReturnPeriod: returnPeriod,
            rcmLiabilityReturnStatus: mapStatus,
            rcmItcReturnStatus: m.itcGstr3bStatus || m.itcStatus || '',
            gstr3bBatchVersion: m.gstr3bInclusionVersion || null,
            gstr3bInclusionBatch: m.gstr3bInclusionVersion
                ? `v${m.gstr3bInclusionVersion}`
                : '',
            rcmExceptionStatus: m.gstr3bException || '',
            rcmApprovalStatus: m.gstr3bApprovalStatus || '',
            rcmFiledPeriod: /FILED|LOCKED/i.test(String(mapStatus)) ? returnPeriod : '',
            rcmAmendmentRequired: Boolean(m.amendmentRequired),
            rcmReconciliationDifference: m.reconciliationDifference || '',
            liabilityJvId: String(v._id),
            paymentJvId: m.lastPaymentVoucherId ? String(m.lastPaymentVoucherId) : null,
            itcReleaseJvId: m.lastItcReleaseVoucherId ? String(m.lastItcReleaseVoucherId) : null,
            itcReleaseVoucherNumber: m.lastItcReleaseVoucherNo || '',
            _matchKey: `rcm-liab|${v._id}`,
        });
    });
}

function sumPiTaxes(p) {
    const isInter = isInterState(p.placeOfSupply, p.supplierStateCode || p.supplierId?.stateCode);
    let taxableValue = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    let cess = 0;
    let hasGst = false;
    let pType = 'Raw Material';

    if (p.items?.length) {
        pType = mapPurchaseType(p.items[0].purchaseType);
        for (const item of p.items) {
            taxableValue += item.taxableAmount || 0;
            let icgst = item.cgstAmount || 0;
            let isgst = item.sgstAmount || 0;
            let iigst = item.igstAmount || 0;
            if (icgst === 0 && isgst === 0 && iigst === 0 && item.gstRate > 0 && item.taxableAmount > 0) {
                const totalTax = (item.taxableAmount * item.gstRate) / 100;
                if (isInter) iigst = totalTax;
                else {
                    icgst = totalTax / 2;
                    isgst = totalTax / 2;
                }
            }
            if (icgst > 0 || isgst > 0 || iigst > 0) hasGst = true;
            cgst += icgst;
            sgst += isgst;
            igst += iigst;
            cess += item.cessAmount || 0;
        }
    } else {
        taxableValue = p.totalTaxableAmount || 0;
        cgst = p.totalCgst || 0;
        sgst = p.totalSgst || 0;
        igst = p.totalIgst || 0;
        if (cgst > 0 || sgst > 0 || igst > 0) hasGst = true;
    }

    if (p.isConsumable && pType === 'Raw Material') pType = 'Consumable';

    return {
        taxableValue: round2(taxableValue),
        cgst: round2(cgst),
        sgst: round2(sgst),
        igst: round2(igst),
        cess: round2(cess),
        hasGst,
        purchaseType: pType,
    };
}

async function loadPurchaseRows(startDate, endDate) {
    const purchases = await PurchaseInvoice.find({
        ...buildDateQuery(startDate, endDate, 'invoiceDate'),
        isDeleted: { $ne: true },
        status: { $ne: 'Cancelled' },
    })
        .populate('supplierId', 'name gstin stateCode')
        .sort({ invoiceDate: 1 })
        .lean();

    const rows = [];
    for (const p of purchases) {
        const tax = sumPiTaxes(p);
        if (!tax.hasGst) continue;
        const supplierGstin = p.supplierGstin || p.supplierId?.gstin || '';
        const invoiceNumber = p.supplierInvoiceNo || p.invoiceNumber || '';
        const rcm = Boolean(p.reverseCharge);
        const itcEligibility = inferItcStatus({
            explicit: p.itcEligibility,
            reverseCharge: rcm,
            supplierGstin,
        });
        const isImport = /import|bill.?of.?entry|boe/i.test(String(p.remarks || p.flowType || ''))
            || String(p.gstType || '').toUpperCase().includes('IMPORT');

        let documentCategory = 'purchases';
        if (rcm) documentCategory = 'reverse_charge';
        else if (isImport) documentCategory = 'imports';
        else if (tax.purchaseType === 'Capital Purchase') documentCategory = 'fixed_assets';

        const totalGst = round2(tax.cgst + tax.sgst + tax.igst + tax.cess);
        rows.push(baseRow({
            id: String(p._id),
            date: p.invoiceDate,
            voucherType: 'Purchase Invoice',
            voucherNumber: p.invoiceNumber || '',
            sourceModule: 'Purchase',
            supplierName: p.supplierName || p.supplierId?.name || '',
            supplierGstin,
            invoiceNumber,
            invoiceNumberNormalized: normalizeInvoiceRef(invoiceNumber),
            invoiceDate: p.invoiceDate,
            expensePurchaseLedger: tax.purchaseType,
            documentCategory,
            purchaseType: tax.purchaseType,
            placeOfSupply: p.placeOfSupply || p.supplierStateCode || '',
            taxableValue: tax.taxableValue,
            cgst: tax.cgst,
            sgst: tax.sgst,
            igst: tax.igst,
            cess: tax.cess,
            totalGst,
            totalTax: totalGst,
            invoiceValue: round2(p.grandTotal || p.roundedTotal || 0),
            rcmApplicable: rcm,
            itcEligibility,
            ineligibilityReason: itcEligibility === ITC_STATUS.ELIGIBLE ? '' : (rcm ? 'Reverse charge — ITC after tax payment' : (!supplierGstin ? 'Supplier GSTIN missing' : '')),
            accountingPostingStatus: p.status || '',
            paymentStatus: p.paymentStatus || '',
            remarks: p.remarks || '',
            _matchKey: `${normalizeInvoiceRef(supplierGstin)}|${normalizeInvoiceRef(invoiceNumber)}`,
        }));
    }
    return rows;
}

async function loadExpenseRows(startDate, endDate, purchaseKeys = new Set()) {
    // Exclude nature "Purchase" / system vouchers — those are posted from PurchaseInvoice
    // and would double-count Input GST if included here.
    // Important: wrap date + GST conditions in $and so the date $or is not overwritten.
    const vouchers = await Voucher.find({
        $and: [
            buildDateQuery(startDate, endDate, 'date'),
            { nature: { $in: ['Expense', 'Debit Note', 'Credit Note', 'Journal'] } },
            { isSystemGenerated: { $ne: true } },
            { status: { $ne: 'Cancelled' } },
            {
                $or: [
                    { isGstEnabled: true },
                    { totalCgst: { $gt: 0 } },
                    { totalSgst: { $gt: 0 } },
                    { totalIgst: { $gt: 0 } },
                    { 'items.cgstAmount': { $gt: 0 } },
                    { 'items.sgstAmount': { $gt: 0 } },
                    { 'items.igstAmount': { $gt: 0 } },
                ],
            },
        ],
    })
        .populate('voucherType', 'name nature')
        .sort({ date: 1 })
        .lean();

    const rows = [];
    for (const v of vouchers) {
        let taxableValue = Number(v.totalTaxableAmount) || 0;
        let cgst = Number(v.totalCgst) || 0;
        let sgst = Number(v.totalSgst) || 0;
        let igst = Number(v.totalIgst) || 0;
        const expenseLedgers = [];

        if (Array.isArray(v.items)) {
            for (const it of v.items) {
                if (it.type === 'Debit' && it.ledgerName) expenseLedgers.push(it.ledgerName);
                if ((it.cgstAmount || it.sgstAmount || it.igstAmount) && !(v.totalCgst || v.totalSgst || v.totalIgst)) {
                    cgst += it.cgstAmount || 0;
                    sgst += it.sgstAmount || 0;
                    igst += it.igstAmount || 0;
                    taxableValue += it.taxableAmount || 0;
                }
            }
        }

        const totalGst = round2(cgst + sgst + igst);
        if (totalGst <= 0) continue;

        const nature = String(v.nature || '');
        const isNote = /debit note|credit note/i.test(nature);
        let documentCategory = 'expenses_services';
        if (isNote) documentCategory = 'credit_debit_notes';

        const supplierGstin = v.supplierGstin || '';
        const invoiceNumber = v.supplierBillNo || v.voucherNo || '';
        const matchKey = `${normalizeInvoiceRef(supplierGstin)}|${normalizeInvoiceRef(invoiceNumber)}`;
        // Skip if same supplier bill already counted as Purchase Invoice
        if (supplierGstin && invoiceNumber && purchaseKeys.has(matchKey)) continue;

        const rcm = Boolean(v.isReverseCharge || v.reverseCharge || /reverse.?charge|rcm/i.test(String(v.narration || '')));
        const itcEligibility = inferItcStatus({ reverseCharge: rcm, supplierGstin });
        const purchaseType = isNote
            ? (/credit/i.test(nature) ? 'Purchase Credit Note' : 'Purchase Debit Note')
            : 'Expense';
        if (rcm) documentCategory = 'reverse_charge';

        rows.push(baseRow({
            id: String(v._id),
            date: v.date,
            voucherType: v.voucherTypeName || v.voucherType?.name || nature || 'Expense',
            voucherNumber: v.voucherNo || '',
            sourceModule: isNote ? 'Accounts' : 'Expense Voucher',
            supplierName: v.partyName || '',
            supplierGstin,
            invoiceNumber,
            invoiceNumberNormalized: normalizeInvoiceRef(invoiceNumber),
            invoiceDate: v.supplierBillDate || v.date,
            expensePurchaseLedger: expenseLedgers.filter(Boolean).slice(0, 3).join(', '),
            documentCategory,
            purchaseType,
            placeOfSupply: v.placeOfSupply || '',
            taxableValue: round2(taxableValue || (v.grandTotal ? v.grandTotal - totalGst : 0)),
            cgst: round2(cgst),
            sgst: round2(sgst),
            igst: round2(igst),
            totalGst,
            totalTax: totalGst,
            invoiceValue: round2(v.grandTotal || v.totalAmount || 0),
            rcmApplicable: rcm,
            itcEligibility,
            ineligibilityReason: rcm
                ? 'Reverse charge — ITC after tax payment'
                : (!supplierGstin ? 'Supplier GSTIN missing' : ''),
            accountingPostingStatus: v.status || '',
            paymentStatus: v.paymentStatus || '',
            remarks: v.narration || '',
            _matchKey: matchKey,
        }));
    }
    return rows;
}

async function loadFixedAssetRows(startDate, endDate, existingInvoiceKeys) {
    const assets = await FixedAsset.find({
        ...buildDateQuery(startDate, endDate, 'purchaseDate'),
        gstAmount: { $gt: 0 },
    })
        .populate('supplier', 'name gstin')
        .sort({ purchaseDate: 1 })
        .lean();

    const rows = [];
    for (const a of assets) {
        const invoiceNumber = a.purchaseInvoiceNo || a.assetCode || '';
        const gstin = a.supplier?.gstin || '';
        const key = `${normalizeInvoiceRef(gstin)}|${normalizeInvoiceRef(invoiceNumber)}`;
        // Avoid double-count when the same capital invoice is already in Purchase Invoice
        if (invoiceNumber && existingInvoiceKeys.has(key)) continue;
        if (!a.gstAmount) continue;

        const gst = round2(a.gstAmount);
        // No CGST/SGST/IGST split on FixedAsset — report under Total GST / IGST bucket for visibility
        const itcEligibility = inferItcStatus({ supplierGstin: gstin });

        rows.push(baseRow({
            id: String(a._id),
            date: a.purchaseDate,
            voucherType: 'Fixed Asset Purchase',
            voucherNumber: a.assetCode || '',
            sourceModule: 'Fixed Assets',
            supplierName: a.supplier?.name || a.manufacturerName || '',
            supplierGstin: gstin,
            invoiceNumber,
            invoiceNumberNormalized: normalizeInvoiceRef(invoiceNumber),
            invoiceDate: a.purchaseInvoiceDate || a.purchaseDate,
            expensePurchaseLedger: a.glAccount || a.assetName || '',
            documentCategory: 'fixed_assets',
            purchaseType: 'Capital Purchase',
            placeOfSupply: '',
            taxableValue: round2(a.purchaseValue || 0),
            cgst: 0,
            sgst: 0,
            igst: gst,
            totalGst: gst,
            totalTax: gst,
            invoiceValue: round2(a.capitalizedCost || (a.purchaseValue || 0) + gst),
            rcmApplicable: false,
            itcEligibility,
            ineligibilityReason: !gstin ? 'Supplier GSTIN missing' : 'GST split not stored on asset master — total GST shown',
            accountingPostingStatus: a.status || '',
            paymentStatus: '',
            remarks: a.assetName || '',
            _matchKey: key,
        }));
    }
    return rows;
}

async function loadPortalRows(startDate, endDate, booksKeys) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const fySet = new Set();
    const cursor = new Date(start);
    while (cursor <= end) {
        try {
            fySet.add(getFYFromDate(cursor));
        } catch {
            /* ignore */
        }
        cursor.setMonth(cursor.getMonth() + 1);
    }
    // Also include FY of start/end explicitly
    try { fySet.add(getFYFromDate(start)); } catch { /* */ }
    try { fySet.add(getFYFromDate(end)); } catch { /* */ }

    if (!fySet.size) return [];

    const portal = await Gstr2bData.find({
        financialYear: { $in: [...fySet] },
        invoiceDate: { $gte: start, $lte: end },
    }).lean();

    const rows = [];
    for (const p of portal) {
        const key = `${normalizeInvoiceRef(p.supplierGstin)}|${normalizeInvoiceRef(p.invoiceNumber)}`;
        if (booksKeys.has(key)) continue; // matched books rows carry recon status separately

        const totalGst = round2(p.totalTax || ((p.cgst || 0) + (p.sgst || 0) + (p.igst || 0) + (p.cess || 0)));
        const itcEligibility = inferItcStatus({
            portalItcAvailable: p.itcAvailable,
            reverseCharge: p.isReverseCharge,
            supplierGstin: p.supplierGstin,
        });

        rows.push(baseRow({
            id: String(p._id),
            date: p.invoiceDate,
            voucherType: p.invoiceType === 'C' ? 'GSTR-2B Credit Note' : (p.invoiceType === 'D' ? 'GSTR-2B Debit Note' : 'GSTR-2B Invoice'),
            voucherNumber: '',
            sourceModule: 'GSTR-2B Import',
            supplierName: p.supplierName || '',
            supplierGstin: p.supplierGstin || '',
            invoiceNumber: p.invoiceNumber || '',
            invoiceNumberNormalized: normalizeInvoiceRef(p.invoiceNumber),
            invoiceDate: p.invoiceDate,
            expensePurchaseLedger: '',
            documentCategory: p.isReverseCharge
                ? 'reverse_charge'
                : (p.invoiceType === 'C' || p.invoiceType === 'D' ? 'credit_debit_notes' : 'purchases'),
            purchaseType: 'GSTR-2B Only',
            placeOfSupply: '',
            taxableValue: round2(p.taxableValue || 0),
            cgst: round2(p.cgst || 0),
            sgst: round2(p.sgst || 0),
            igst: round2(p.igst || 0),
            cess: round2(p.cess || 0),
            totalGst,
            totalTax: totalGst,
            invoiceValue: round2(p.invoiceValue || 0),
            rcmApplicable: Boolean(p.isReverseCharge),
            itcEligibility,
            ineligibilityReason: p.itcAvailable === 'No' ? (p.reason || 'Portal marked ITC not available') : '',
            gstr2bStatus: p.reconciliationStatus || '2B Only',
            reconciliationStatus: RECON_STATUS.GSTR2B_ONLY,
            accountingPostingStatus: 'Not in Books',
            paymentStatus: '',
            remarks: p.remarks || '',
            _matchKey: key,
            _portalOnly: true,
        }));
    }
    return rows;
}

function attachRecon(booksRows, portalDocs) {
    const portalByKey = new Map();
    for (const p of portalDocs) {
        const key = `${normalizeInvoiceRef(p.supplierGstin)}|${normalizeInvoiceRef(p.invoiceNumber)}`;
        if (!portalByKey.has(key)) portalByKey.set(key, p);
    }

    for (const row of booksRows) {
        if (row._portalOnly) continue;
        const portal = portalByKey.get(row._matchKey);
        if (!portal) {
            row.reconciliationStatus = RECON_STATUS.BOOKS_ONLY;
            row.gstr2bStatus = 'Not in GSTR-2B';
            continue;
        }
        row.reconciliationStatus = mapReconDetail(row, portal);
        row.gstr2bStatus = portal.reconciliationStatus || 'Matched';
        if (portal.itcAvailable === 'No' && row.itcEligibility === ITC_STATUS.ELIGIBLE) {
            row.itcEligibility = ITC_STATUS.PENDING_SUPPLIER;
            row.ineligibilityReason = portal.reason || 'Pending supplier filing / portal ITC flag';
        }
        portalByKey.delete(row._matchKey);
    }
}

function buildSummary(rows) {
    const summary = {
        totalInwardTaxable: 0,
        totalGstBooks: 0,
        totalGstGstr2b: 0,
        eligibleItc: 0,
        ineligibleBlockedItc: 0,
        temporarilyReversed: 0,
        rcmLiability: 0,
        rcmItcAvailable: 0,
        booksNotIn2b: 0,
        gstr2bNotInBooks: 0,
        reconciliationDifference: 0,
        missingGstin: 0,
        inputGstLedgerTotal: 0,
        inputGstLedgerSplit: { cgst: 0, sgst: 0, igst: 0 },
        documentVsPostingDifference: 0,
        counts: {
            purchase: 0,
            expense: 0,
            fixedAsset: 0,
            rcm: 0,
            imports: 0,
            notes: 0,
            portalOnly: 0,
            total: 0,
        },
    };

    for (const r of rows) {
        summary.counts.total += 1;
        const gst = Number(r.totalGst) || 0;
        if (!r._portalOnly) {
            summary.totalInwardTaxable += Number(r.taxableValue) || 0;
            summary.totalGstBooks += gst;
        } else {
            summary.totalGstGstr2b += gst;
            summary.counts.portalOnly += 1;
        }

        if (r.documentCategory === 'purchases') summary.counts.purchase += 1;
        if (r.documentCategory === 'expenses_services') summary.counts.expense += 1;
        if (r.documentCategory === 'fixed_assets') summary.counts.fixedAsset += 1;
        if (r.documentCategory === 'reverse_charge' || r.rcmApplicable) summary.counts.rcm += 1;
        if (r.documentCategory === 'imports') summary.counts.imports += 1;
        if (r.documentCategory === 'credit_debit_notes') summary.counts.notes += 1;

        if (!r.supplierGstin) summary.missingGstin += 1;

        if (r.rcmApplicable) summary.rcmLiability += gst;
        if (r.itcEligibility === ITC_STATUS.RCM_AVAILABLE) summary.rcmItcAvailable += gst;
        if (r.itcEligibility === ITC_STATUS.TEMP_REVERSED) summary.temporarilyReversed += gst;

        if (isEligibleItcStatus(r.itcEligibility) && !r._portalOnly) {
            summary.eligibleItc += gst;
        } else if (
            r.itcEligibility === ITC_STATUS.INELIGIBLE
            || r.itcEligibility === ITC_STATUS.BLOCKED
        ) {
            summary.ineligibleBlockedItc += gst;
        }

        if (r.reconciliationStatus === RECON_STATUS.BOOKS_ONLY) summary.booksNotIn2b += gst;
        if (r.reconciliationStatus === RECON_STATUS.GSTR2B_ONLY) summary.gstr2bNotInBooks += gst;
    }

    // Portal matched amounts also count toward 2B total
    for (const r of rows) {
        if (!r._portalOnly && r.reconciliationStatus === RECON_STATUS.FULLY_MATCHED) {
            summary.totalGstGstr2b += Number(r.totalGst) || 0;
        }
    }

    summary.reconciliationDifference = round2(summary.totalGstBooks - summary.totalGstGstr2b);
    summary.totalInwardTaxable = round2(summary.totalInwardTaxable);
    summary.totalGstBooks = round2(summary.totalGstBooks);
    summary.totalGstGstr2b = round2(summary.totalGstGstr2b);
    summary.eligibleItc = round2(summary.eligibleItc);
    summary.ineligibleBlockedItc = round2(summary.ineligibleBlockedItc);
    summary.temporarilyReversed = round2(summary.temporarilyReversed);
    summary.rcmLiability = round2(summary.rcmLiability);
    summary.rcmItcAvailable = round2(summary.rcmItcAvailable);
    summary.booksNotIn2b = round2(summary.booksNotIn2b);
    summary.gstr2bNotInBooks = round2(summary.gstr2bNotInBooks);

    return summary;
}

function applyFilters(rows, filters = {}) {
    const {
        supplier,
        gstin,
        gstType,
        itcEligibility,
        purchaseType,
        missingGstinOnly,
        tab = 'all',
        documentCategory,
        rcmOnly,
    } = filters;

    return rows.filter((row) => {
        if (String(missingGstinOnly) === 'true' && row.supplierGstin) return false;
        if (supplier) {
            const s = supplier.toLowerCase();
            if (!String(row.supplierName || '').toLowerCase().includes(s)) return false;
        }
        if (gstin && !String(row.supplierGstin || '').toLowerCase().includes(String(gstin).toLowerCase())) {
            return false;
        }
        if (gstType === 'CGST/SGST' && !(row.cgst > 0 || row.sgst > 0)) return false;
        if (gstType === 'IGST' && !(row.igst > 0)) return false;
        if (purchaseType && purchaseType !== 'All' && row.purchaseType !== purchaseType) {
            // allow Expense filter to match expense rows
            if (!(purchaseType === 'Expense' && row.documentCategory === 'expenses_services')) return false;
        }
        if (itcEligibility && itcEligibility !== 'All') {
            if (itcEligibility === 'Reverse Charge' && !row.rcmApplicable) return false;
            else if (itcEligibility === 'Blocked' && row.itcEligibility !== ITC_STATUS.BLOCKED) return false;
            else if (itcEligibility === 'Ineligible' && row.itcEligibility !== ITC_STATUS.INELIGIBLE && row.itcEligibility !== ITC_STATUS.BLOCKED) return false;
            else if (itcEligibility === 'Eligible' && !isEligibleItcStatus(row.itcEligibility)) return false;
            else if (itcEligibility === 'Pending' && !/Pending|Review|Owner/i.test(row.itcEligibility)) return false;
            else if (!['Reverse Charge', 'Blocked', 'Ineligible', 'Eligible', 'Pending'].includes(itcEligibility)
                && row.itcEligibility !== itcEligibility) return false;
        }
        if (documentCategory && row.documentCategory !== documentCategory) return false;
        if (String(rcmOnly) === 'true' && !row.rcmApplicable) return false;

        switch (tab) {
            case 'purchases':
                return row.documentCategory === 'purchases';
            case 'expenses_services':
                return row.documentCategory === 'expenses_services';
            case 'fixed_assets':
                return row.documentCategory === 'fixed_assets';
            case 'reverse_charge':
                return row.rcmApplicable || row.documentCategory === 'reverse_charge';
            case 'imports':
                return row.documentCategory === 'imports';
            case 'credit_debit_notes':
                return row.documentCategory === 'credit_debit_notes';
            case 'eligible_itc':
                return isEligibleItcStatus(row.itcEligibility) && !row._portalOnly;
            case 'ineligible_blocked':
                return row.itcEligibility === ITC_STATUS.INELIGIBLE || row.itcEligibility === ITC_STATUS.BLOCKED;
            case 'books_vs_2b':
                return true;
            case 'all':
            default:
                return true;
        }
    });
}

/**
 * Read-only: net debit on Input CGST/SGST/IGST ledgers for the period.
 * Does not alter accounting.
 */
async function loadInputGstLedgerPosted(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (!Number.isNaN(end.getTime()) && !String(endDate).includes('T')) {
        end.setUTCHours(23, 59, 59, 999);
    }

    const companyId = getCompanyScopeStore()?.companyId;
    const ledgerFilter = {
        name: { $in: ['CGST Input', 'SGST Input', 'IGST Input'] },
    };
    if (companyId) ledgerFilter.companyId = companyId;

    const ledgers = await AccountLedger.find(ledgerFilter).select('_id name').lean();

    const split = { cgst: 0, sgst: 0, igst: 0 };
    let total = 0;

    for (const led of ledgers) {
        const entryFilter = {
            ledgerId: led._id,
            date: { $gte: start, $lte: end },
        };
        if (companyId) entryFilter.companyId = companyId;

        const entries = await LedgerEntry.find(entryFilter).select('amount type').lean();

        let debit = 0;
        let credit = 0;
        for (const e of entries) {
            if (e.type === 'Debit') debit += e.amount || 0;
            else credit += e.amount || 0;
        }
        const net = round2(debit - credit);
        if (/^CGST Input$/i.test(led.name)) split.cgst = net;
        else if (/^SGST Input$/i.test(led.name)) split.sgst = net;
        else if (/^IGST Input$/i.test(led.name)) split.igst = net;
        total += net;
    }

    return {
        inputGstLedgerTotal: round2(total),
        inputGstLedgerSplit: split,
    };
}

/**
 * Full inward GST + ITC register for a date range (company scoped by mongoose plugins / caller).
 */
export async function getGstInwardItcRegister(startDate, endDate, filters = {}) {
    const purchaseRows = await loadPurchaseRows(startDate, endDate);
    const purchaseKeys = new Set(purchaseRows.map((r) => r._matchKey));
    const expenseRows = await loadExpenseRows(startDate, endDate, purchaseKeys);

    const invoiceKeys = new Set([
        ...purchaseRows.map((r) => r._matchKey),
        ...expenseRows.map((r) => r._matchKey),
    ]);

    const assetRows = await loadFixedAssetRows(startDate, endDate, invoiceKeys);
    const rcmPhaseRows = await loadRcmPhaseLiabilityRows(startDate, endDate);
    const booksRows = [...purchaseRows, ...expenseRows, ...assetRows, ...rcmPhaseRows];

    const fySet = new Set();
    try { fySet.add(getFYFromDate(new Date(startDate))); } catch { /* */ }
    try { fySet.add(getFYFromDate(new Date(endDate))); } catch { /* */ }

    const portalDocs = fySet.size
        ? await Gstr2bData.find({
            financialYear: { $in: [...fySet] },
            invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
        }).lean()
        : [];

    attachRecon(booksRows, portalDocs);

    const booksKeys = new Set(booksRows.map((r) => r._matchKey));
    const portalOnlyRows = await loadPortalRows(startDate, endDate, booksKeys);

    const allRows = [...booksRows, ...portalOnlyRows]
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    const filtered = applyFilters(allRows, filters);
    const summary = buildSummary(filtered);

    // Ledger posting totals for the same period (always on full books set for the date range,
    // not tab-filtered — so difference stays meaningful on every tab).
    const unfilteredBooksSummary = buildSummary(
        applyFilters(allRows, { ...filters, tab: 'all' }),
    );
    const ledgerPosted = await loadInputGstLedgerPosted(startDate, endDate);
    summary.inputGstLedgerTotal = ledgerPosted.inputGstLedgerTotal;
    summary.inputGstLedgerSplit = ledgerPosted.inputGstLedgerSplit;
    summary.documentVsPostingDifference = round2(
        (unfilteredBooksSummary.totalGstBooks || 0) - (ledgerPosted.inputGstLedgerTotal || 0),
    );
    // Keep document total visible even when a tab filters rows
    summary.totalGstInwardDocuments = unfilteredBooksSummary.totalGstBooks;

    // Strip internal fields
    const rows = filtered.map(({ _matchKey, _portalOnly, ...rest }) => ({
        ...rest,
        // backward-compat aliases for older UI
        totalTax: rest.totalGst,
        totalInvoiceValue: rest.invoiceValue,
    }));

    return {
        title: 'GST Inward & ITC Register',
        tabs: INWARD_TABS,
        rows,
        summary,
        meta: {
            startDate,
            endDate,
            reportingOnly: true,
            note: 'Read-only reconciliation view. Total inward GST is not claimable ITC. Does not alter vouchers, ledgers, stock, or GST returns.',
        },
    };
}
