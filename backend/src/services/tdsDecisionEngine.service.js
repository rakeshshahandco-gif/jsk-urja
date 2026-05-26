import mongoose from 'mongoose';
import { PaymentEntry } from '../models/paymentEntry.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { Supplier } from '../models/supplier.model.js';
import { Voucher } from '../models/voucher.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { getMasterSectionOrDefaults } from './tdsMaster.service.js';
import { getTdsSettings, getSectionBalance } from './tdsThreshold.service.js';
import { ApiError } from '../utils/ApiError.js';
import httpStatus from 'http-status';
import logger from '../utils/logger.js';
import {
    isValidPan,
    normalizePan,
    PAN_ABSENT_DEFAULT_RATE,
    isIndividualHufConstitution,
    constitutionFromLegacyDeductorType,
    suggestTdsSectionFromLedgerName,
} from '../constants/tds.constants.js';
import { resolveLowerDeductionRate } from '../utils/tdsLowerDeduction.util.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Populated APIs often send `{ _id }` instead of a string — normalize for Mongo queries / validation. */
export function normalizeMongoRefId(val) {
    if (val == null || val === '') return null;
    if (typeof val === 'object' && val._id != null) return String(val._id);
    return String(val);
}

function itemIsExpenseDebitLine(item) {
    const t = String(item?.type ?? 'Debit').trim();
    return t !== 'Credit';
}

/**
 * TDS base for a purchase payment: optional manual base; else exclude GST when ledger.tdsDeductOn === 'taxable'.
 */
export function computeInvoiceTdsPaymentBase({ amountPaid, tdsBaseAmount, ledger, invoiceSnapshot }) {
    if (Number(tdsBaseAmount) > 0) return r2(Number(tdsBaseAmount));
    const ap = Number(amountPaid) || 0;
    if (!ledger || (ledger.tdsDeductOn || 'with_gst') !== 'taxable') return r2(ap);
    const inv = invoiceSnapshot;
    if (!inv) return r2(ap);
    const gt = Number(inv.grandTotal) || 0;
    if (gt <= 0) return r2(ap);
    let taxable = Number(inv.totalTaxableAmount) || 0;
    if (taxable <= 0) {
        const tax =
            Number(inv.totalTax) ||
            r2(
                Number(inv.totalCgst || 0) +
                    Number(inv.totalSgst || 0) +
                    Number(inv.totalIgst || 0) +
                    Number(inv.freightTotalGst || 0),
            );
        const ro = Number(inv.roundOff || 0);
        taxable = r2(Math.max(0, gt - tax - ro));
    }
    if (taxable <= 0) return r2(ap);
    const ratio = Math.min(1, Math.max(0, taxable / gt));
    return r2(ap * ratio);
}

export async function resolveVendorLedger(supplierId) {
    if (!supplierId || !mongoose.Types.ObjectId.isValid(String(supplierId))) return null;
    const sup = await Supplier.findById(supplierId)
        .select(
            'ledgerId supplierName panNumber tdsApplicable tdsSection tdsLowerDeductionPercent tdsLowerDeductionValidFrom tdsLowerDeductionValidTo tdsLowerDeductionCertificates tdsIgnoreThreshold tdsDeductorType deducteeConstitution tdsStartDate msmeApplicable',
        )
        .lean();
    if (!sup) return null;
    if (sup.ledgerId) {
        const led = await AccountLedger.findById(sup.ledgerId).lean();
        if (led) return mergeLedgerWithSupplier(led, sup);
    }
    const led = await AccountLedger.findOne({ referenceModel: 'Supplier', referenceId: sup._id }).lean();
    return led ? mergeLedgerWithSupplier(led, sup) : null;
}

function mergeLedgerWithSupplier(ledger, supplier) {
    const constitution =
        String(ledger.tdsDeducteeConstitution || '').trim() ||
        String(supplier.deducteeConstitution || '').trim() ||
        constitutionFromLegacyDeductorType(supplier.tdsDeductorType) ||
        constitutionFromLegacyDeductorType(ledger.tdsDeductorType) ||
        '';

    return {
        ...ledger,
        tdsApplicable: ledger.tdsApplicable ?? supplier.tdsApplicable ?? false,
        tdsSection: ledger.tdsSection || supplier.tdsSection || '',
        tdsLowerDeductionPercent: ledger.tdsLowerDeductionPercent ?? supplier.tdsLowerDeductionPercent ?? 0,
        tdsIgnoreThreshold: ledger.tdsIgnoreThreshold ?? supplier.tdsIgnoreThreshold ?? false,
        tdsDeductorType: ledger.tdsDeductorType || supplier.tdsDeductorType || 'Others',
        tdsRateSource: ledger.tdsRateSource || 'auto',
        tdsDeductOn: ledger.tdsDeductOn || 'with_gst',
        tdsPanAssumedAvailable: ledger.tdsPanAssumedAvailable !== false,
        tdsPanStatus: ledger.tdsPanStatus || '',
        tdsStartDate: ledger.tdsStartDate || supplier.tdsStartDate || null,
        msmeApplicable: Boolean(ledger.msmeApplicable || supplier.msmeApplicable),
        tdsLowerDeductionCertificates: [
            ...(Array.isArray(ledger.tdsLowerDeductionCertificates) ? ledger.tdsLowerDeductionCertificates : []),
            ...(Array.isArray(supplier.tdsLowerDeductionCertificates) ? supplier.tdsLowerDeductionCertificates : []),
        ],
        tdsLowerDeductionValidFrom: ledger.tdsLowerDeductionValidFrom || supplier.tdsLowerDeductionValidFrom,
        tdsLowerDeductionValidTo: ledger.tdsLowerDeductionValidTo || supplier.tdsLowerDeductionValidTo,
        supplierPan: supplier.panNumber || ledger.pan || '',
        supplierDeducteeConstitution: String(supplier.deducteeConstitution || '').trim(),
        effectiveDeducteeConstitution: constitution,
    };
}

export function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Ledger to credit TDS — TDS Master tdsPayableLedgerId first, then section-flag ledger, then legacy names. */
export async function resolveTdsPayableLedgerId(sectionCode, masterRow) {
    const code = String(sectionCode || '').trim().toUpperCase();

    const idRaw = masterRow?.tdsPayableLedgerId;
    const idStr =
        idRaw && typeof idRaw === 'object' && idRaw._id != null ? String(idRaw._id) : idRaw != null ? String(idRaw) : '';
    if (idStr && mongoose.Types.ObjectId.isValid(idStr)) {
        const led = await AccountLedger.findById(idStr).select('_id status').lean();
        if (led && led.status !== 'Inactive') return led._id;
    }

    const bySectionFlag = await AccountLedger.findOne({
        isTdsPayableLedger: true,
        tdsPayableSectionCode: code,
        status: { $ne: 'Inactive' },
    })
        .select('_id')
        .lean();
    if (bySectionFlag) return bySectionFlag._id;

    const exactNames = [];
    const mapping = masterRow?.tdsLedgerMapping && String(masterRow.tdsLedgerMapping).trim();
    if (mapping) exactNames.push(mapping);
    for (const c of [`TDS Payable ${code}`, `TDS Payable u/s ${code}`, `TDS Payable - ${code}`, 'TDS Payable']) {
        exactNames.push(c);
    }
    const orConds = exactNames.map((n) => ({ name: new RegExp(`^${escapeRegex(n)}$`, 'i') }));
    const led = orConds.length ? await AccountLedger.findOne({ $or: orConds }).lean() : null;
    if (led && led.status !== 'Inactive') return led._id;
    const fuzzy = await AccountLedger.findOne({
        name: new RegExp(escapeRegex(`TDS`) + '.*' + escapeRegex(code), 'i'),
    }).lean();
    return fuzzy && fuzzy.status !== 'Inactive' ? fuzzy._id : null;
}

export async function resolveSupplierIdFromPartyLedger(partyLedgerId) {
    if (!partyLedgerId || !mongoose.Types.ObjectId.isValid(String(partyLedgerId))) return null;
    const led = await AccountLedger.findById(partyLedgerId).select('referenceModel referenceId').lean();
    if (led?.referenceModel === 'Supplier' && led.referenceId) return led.referenceId;
    const sup = await Supplier.findOne({ ledgerId: partyLedgerId }).select('_id').lean();
    return sup?._id || null;
}

function computeLineAmountForTdsBase(item, isGstEnabled, deductOn) {
    const d = deductOn || 'with_gst';
    if (isGstEnabled && d === 'taxable') {
        const t = r2(Number(item.taxableAmount || 0));
        return t > 0 ? t : r2(Number(item.amount || 0));
    }
    return r2(Number(item.amount || 0));
}

/** Returns { expenseLineLedger, section, gross } or null if no TDS debit line */
export async function collectExpenseTdsDebitContext(items, isGstEnabled) {
    const debitItems = (items || []).filter((i) => itemIsExpenseDebitLine(i) && normalizeMongoRefId(i.ledgerId));
    if (!debitItems.length) return null;
    const ids = [...new Set(debitItems.map((i) => normalizeMongoRefId(i.ledgerId)).filter(Boolean))];
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (!validIds.length) return null;
    const ledgers = await AccountLedger.find({ _id: { $in: validIds } }).lean();
    const byId = Object.fromEntries(ledgers.map((l) => [String(l._id), l]));

    let expenseLine = null;
    let section = '';
    for (const it of debitItems) {
        const lid = normalizeMongoRefId(it.ledgerId);
        const L = byId[String(lid)];
        if (!L?.tdsApplicable || !String(L.tdsSection || '').trim()) continue;
        const sec = String(L.tdsSection).trim().toUpperCase();
        if (section && sec !== section) {
            throw new ApiError(
                httpStatus.BAD_REQUEST,
                'This voucher has debit lines with different TDS sections — use separate vouchers.',
            );
        }
        section = sec;
        expenseLine = L;
    }
    if (!expenseLine) return null;

    const deductOn = expenseLine.tdsDeductOn || 'with_gst';
    let gross = 0;
    for (const it of debitItems) {
        const lid = normalizeMongoRefId(it.ledgerId);
        const L = byId[String(lid)];
        if (!L?.tdsApplicable || String(L.tdsSection || '').trim().toUpperCase() !== section) continue;
        gross += computeLineAmountForTdsBase(it, isGstEnabled, deductOn);
    }
    return { expenseLineLedger: expenseLine, section, gross: r2(gross) };
}

/**
 * When no TDS-applicable line was found, explain if user picked a ledger without TDS / section mapping.
 */
export async function diagnoseExpenseTdsLedgerMapping(items, vendorLed) {
    const debitItems = (items || []).filter(
        (i) => itemIsExpenseDebitLine(i) && normalizeMongoRefId(i.ledgerId) && Number(i.amount) > 0,
    );
    if (!debitItems.length) return null;
    const ids = [...new Set(debitItems.map((i) => normalizeMongoRefId(i.ledgerId)).filter(Boolean))];
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (!validIds.length) return null;
    const ledgers = await AccountLedger.find({ _id: { $in: validIds } }).lean();
    const byId = Object.fromEntries(ledgers.map((l) => [String(l._id), l]));

    const vendorHasSection = Boolean(
        vendorLed?.tdsApplicable && String(vendorLed.tdsSection || '').trim(),
    );

    for (const it of debitItems) {
        const lid = normalizeMongoRefId(it.ledgerId);
        const L = byId[String(lid)];
        if (!L) continue;
        if (!L.tdsApplicable || !String(L.tdsSection || '').trim()) {
            const hint = suggestTdsSectionFromLedgerName(L.name);
            if (hint) {
                return {
                    previewErrorMessage: `${L.name} ledger is not mapped to TDS Section ${hint}. Please map it in Ledger Master / TDS Master.${
                        vendorHasSection ? '' : ' Also set a default TDS section on the supplier, or enable TDS on this expense ledger.'
                    }`,
                };
            }
            return {
                previewErrorMessage: `${L.name} is not set up for TDS. Enable TDS Applicable and choose a section in Ledger Master / TDS Master.${
                    vendorHasSection ? '' : ' Also set a default TDS section on the supplier.'
                }`,
            };
        }
    }
    return null;
}

/**
 * Priority 2: expense debit line has no TDS mapping — use supplier default section and threshold for the same gross base.
 */
async function tryBuildExpenseTdsSupplierFallbackContext(items, isGstEnabled, vendorLed) {
    const vSec = String(vendorLed?.tdsSection || '').trim().toUpperCase();
    if (!vendorLed?.tdsApplicable || !vSec) return null;

    const debitItems = (items || []).filter(
        (i) => itemIsExpenseDebitLine(i) && normalizeMongoRefId(i.ledgerId) && Number(i.amount) > 0,
    );
    if (!debitItems.length) return null;

    const ids = [...new Set(debitItems.map((i) => normalizeMongoRefId(i.ledgerId)).filter(Boolean))];
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (!validIds.length) return null;

    const ledgers = await AccountLedger.find({ _id: { $in: validIds } }).lean();
    const byId = Object.fromEntries(ledgers.map((l) => [String(l._id), l]));

    let primary = null;
    for (const it of debitItems) {
        const lid = normalizeMongoRefId(it.ledgerId);
        const L = byId[String(lid)];
        if (!L) continue;
        const amt = Number(it.amount) || 0;
        if (!primary || amt > primary.amt) primary = { L, amt };
    }
    if (!primary) return null;

    const lidKey = String(primary.L._id);
    const deductOn = primary.L.tdsDeductOn || vendorLed.tdsDeductOn || 'with_gst';
    let gross = 0;
    for (const it of debitItems) {
        const iid = normalizeMongoRefId(it.ledgerId);
        if (String(iid) !== lidKey) continue;
        gross += computeLineAmountForTdsBase(it, isGstEnabled, deductOn);
    }

    return {
        expenseLineLedger: primary.L,
        section: vSec,
        gross: r2(gross),
        fromSupplierSectionFallback: true,
    };
}

/** Overlay expense-line TDS master fields onto vendor resolution (creditor + supplier PAN/constitution) */
export function mergeExpenseLineIntoVendorLedger(vendorLedger, expenseLineLedger) {
    if (!vendorLedger) return null;
    if (!expenseLineLedger) return vendorLedger;
    const constitution =
        String(expenseLineLedger.tdsDeducteeConstitution || '').trim() ||
        String(vendorLedger.effectiveDeducteeConstitution || '').trim() ||
        '';
    return {
        ...vendorLedger,
        tdsApplicable: true,
        tdsSection: expenseLineLedger.tdsSection || vendorLedger.tdsSection,
        tdsRateSource: expenseLineLedger.tdsRateSource || vendorLedger.tdsRateSource || 'auto',
        tdsDefaultRate: expenseLineLedger.tdsDefaultRate ?? vendorLedger.tdsDefaultRate ?? 0,
        tdsThresholdOverride: expenseLineLedger.tdsThresholdOverride ?? vendorLedger.tdsThresholdOverride ?? 0,
        tdsPanMandatory: expenseLineLedger.tdsPanMandatory ?? vendorLedger.tdsPanMandatory ?? false,
        tdsPanAssumedAvailable:
            expenseLineLedger.tdsPanAssumedAvailable !== undefined
                ? expenseLineLedger.tdsPanAssumedAvailable !== false
                : vendorLedger.tdsPanAssumedAvailable !== false,
        tdsDeductOn: expenseLineLedger.tdsDeductOn || vendorLedger.tdsDeductOn || 'with_gst',
        tdsDeducteeConstitution: expenseLineLedger.tdsDeducteeConstitution || vendorLedger.tdsDeducteeConstitution || '',
        tdsLowerDeductionPercent:
            expenseLineLedger.tdsLowerDeductionPercent ?? vendorLedger.tdsLowerDeductionPercent ?? 0,
        tdsIgnoreThreshold: expenseLineLedger.tdsIgnoreThreshold ?? vendorLedger.tdsIgnoreThreshold ?? false,
        effectiveDeducteeConstitution: constitution,
    };
}

export async function getCumulativeForSection(
    supplierId,
    section,
    financialYear,
    excludePaymentEntryId,
    excludeVoucherId,
    excludePurchaseInvoiceId,
) {
    const bal = await getSectionBalance(supplierId, section, financialYear);
    let cum = r2(bal.cumulativePaid || 0);
    let cumTds = r2(bal.cumulativeTdsDeducted || 0);
    if (excludePaymentEntryId) {
        const ex = await PaymentEntry.findById(excludePaymentEntryId)
            .select('tdsBaseAmount amountPaid tdsSection paymentStatus tdsAmount')
            .lean();
        if (ex && ex.paymentStatus !== 'Failed' && String(ex.tdsSection || '').toUpperCase() === String(section).toUpperCase()) {
            const base = ex.tdsBaseAmount > 0 ? ex.tdsBaseAmount : ex.amountPaid;
            cum = r2(Math.max(0, cum - base));
            cumTds = r2(Math.max(0, cumTds - r2(Number(ex.tdsAmount || 0))));
        }
    }
    if (excludeVoucherId) {
        const v = await Voucher.findById(excludeVoucherId)
            .select('tdsSupplierId tdsSection tdsThresholdBaseAmount tdsAmount status nature')
            .lean();
        if (
            v &&
            v.status !== 'Cancelled' &&
            v.nature === 'Expense' &&
            String(v.tdsSection || '').toUpperCase() === String(section).toUpperCase() &&
            String(v.tdsSupplierId || '') === String(supplierId || '')
        ) {
            const b = r2(Number(v.tdsThresholdBaseAmount || 0));
            cum = r2(Math.max(0, cum - b));
            cumTds = r2(Math.max(0, cumTds - r2(Number(v.tdsAmount || 0))));
        }
    }
    if (excludePurchaseInvoiceId) {
        const pi = await PurchaseInvoice.findById(excludePurchaseInvoiceId)
            .select('supplierId tdsSection tdsThresholdBaseAmount tdsAmount isDeleted status')
            .lean();
        if (
            pi &&
            !pi.isDeleted &&
            String(pi.tdsSection || '').toUpperCase() === String(section).toUpperCase() &&
            String(pi.supplierId || '') === String(supplierId || '')
        ) {
            const b = r2(Number(pi.tdsThresholdBaseAmount || 0));
            cum = r2(Math.max(0, cum - b));
            cumTds = r2(Math.max(0, cumTds - r2(Number(pi.tdsAmount || 0))));
        }
    }
    return { cumulativePaid: cum, cumulativeTdsDeducted: cumTds };
}

export async function sumCumulativeVendorPaymentsInFY(supplierId, financialYear, excludePaymentEntryId) {
    const ledger = await resolveVendorLedger(supplierId);
    const section = String(ledger?.tdsSection || '').trim().toUpperCase();
    if (!section) return 0;
    const st = await getCumulativeForSection(supplierId, section, financialYear, excludePaymentEntryId);
    return st.cumulativePaid;
}

function resolveSpecifiedRate({ master, ledger, constitution }) {
    if (Number(ledger.tdsLowerDeductionPercent) > 0) {
        return r2(Number(ledger.tdsLowerDeductionPercent));
    }
    const source = ledger.tdsRateSource || 'auto';
    if (source === 'manual') {
        return r2(Number(ledger.tdsDefaultRate || 0));
    }
    const indiv = isIndividualHufConstitution(constitution);
    let r0 = indiv
        ? Number(master?.rateIndividualHuf ?? master?.defaultRate ?? 0)
        : Number(master?.rateOthers ?? master?.defaultRate ?? 0);
    if (r0 <= 0) r0 = Number(master?.defaultRate ?? 0);
    return r2(r0);
}

function resolveThresholdMethod(master) {
    if (master?.thresholdCalculationMethod) return master.thresholdCalculationMethod;
    if (master?.calculationType === 'PerTransaction') return 'SingleBill';
    return 'AggregateFY';
}

/** 206AA: higher of specified rate and PAN-missing floor when PAN not effective. */
function applyPanFloor(specifiedRate, panEffective, master, settings) {
    const floor = Number(master?.panMissingRate ?? settings?.panAbsentRate ?? PAN_ABSENT_DEFAULT_RATE);
    if (panEffective) return r2(specifiedRate);
    return r2(Math.max(Number(specifiedRate) || 0, floor));
}

export function computeTdsDecision({
    ledger,
    master,
    cumulativeBefore,
    currentBase,
    supplierPan,
    paymentTdsDeducteePan,
    settings,
    cumulativeTdsDeductedBefore = 0,
    paymentDate = null,
}) {
    const warnings = [];
    const cumTdsBefore = r2(Number(cumulativeTdsDeductedBefore) || 0);
    const empty = {
        tdsApplicable: false,
        tdsSection: '',
        tdsRate: 0,
        specifiedRate: 0,
        tdsThreshold: 0,
        singleBillThreshold: 0,
        cumulativeBefore: r2(cumulativeBefore),
        cumulativeAfter: r2(cumulativeBefore + currentBase),
        cumulativeTdsDeductedBefore: cumTdsBefore,
        tdsAmount: 0,
        tdsBase: r2(currentBase),
        netPayable: r2(currentBase),
        calculationType: 'YearlyCumulative',
        panOk: true,
        panEffective: true,
        panBlock: false,
        warnings,
        thresholdWillCross: false,
        thresholdCrossed: false,
        liabilityAlert: false,
        taxableAmount: 0,
        tdsCalculationBasis: settings?.tdsCalculationBasis || 'CurrentBill',
        rateSource: ledger?.tdsRateSource || 'auto',
        deducteeConstitution: ledger?.effectiveDeducteeConstitution || '',
    };

    if (!ledger?.tdsApplicable) return empty;

    if (ledger.tdsStartDate && paymentDate) {
        const start = new Date(ledger.tdsStartDate);
        const pd = new Date(paymentDate);
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(pd.getTime()) && pd < start) {
            warnings.push('Transaction date is before TDS start date on ledger');
            return empty;
        }
    }

    const fyList = master?.applicableFinancialYears;
    if (Array.isArray(fyList) && fyList.length > 0 && settings?.financialYear) {
        if (!fyList.includes(String(settings.financialYear).trim())) {
            warnings.push('Section not applicable for this financial year');
            return empty;
        }
    }

    const section = String(ledger.tdsSection || '').trim().toUpperCase();
    if (!section) {
        warnings.push('TDS Applicable is ON but no section is set on this ledger');
        return empty;
    }

    const singleBillThreshold = Number(master?.singleBillThreshold ?? 0);
    const aggregateThreshold =
        ledger.tdsThresholdOverride > 0 ? Number(ledger.tdsThresholdOverride) : Number(master?.thresholdAmount ?? 0);
    const method = resolveThresholdMethod(master);

    const cumBefore = r2(cumulativeBefore);
    const base = r2(currentBase);
    const cumAfter = r2(cumBefore + base);

    const pan = normalizePan(paymentTdsDeducteePan || supplierPan || ledger.supplierPan || ledger.pan || '');
    const panOk = isValidPan(pan);
    const panAssumed = ledger.tdsPanAssumedAvailable !== false;
    const panStatus = String(ledger.tdsPanStatus || '').trim();
    const panEffective =
        panOk &&
        panAssumed &&
        panStatus !== 'Invalid' &&
        panStatus !== 'NotAvailable' &&
        (panStatus === 'Valid' || !panStatus);

    const constitution = String(ledger.effectiveDeducteeConstitution || '').trim();
    let specifiedRate;

    const ldcRate = resolveLowerDeductionRate({
        section,
        paymentDate: paymentDate || new Date(),
        certificates: ledger.tdsLowerDeductionCertificates,
        legacyPercent: ledger.tdsLowerDeductionPercent,
        legacyValidFrom: ledger.tdsLowerDeductionValidFrom,
        legacyValidTo: ledger.tdsLowerDeductionValidTo,
    });
    if (ldcRate != null && ldcRate > 0) {
        specifiedRate = ldcRate;
    } else {
        specifiedRate = resolveSpecifiedRate({ master, ledger, constitution });
    }

    const rate = applyPanFloor(specifiedRate, panEffective, master, settings);

    let thresholdCrossed = false;
    let thresholdWillCross = false;
    let singleCrossed = false;
    let aggregateCrossed = false;

    if (ledger.tdsIgnoreThreshold) {
        thresholdCrossed = true;
    } else {
        singleCrossed = singleBillThreshold > 0 && base > singleBillThreshold;
        aggregateCrossed = aggregateThreshold > 0 && cumAfter > aggregateThreshold;
        thresholdWillCross = aggregateCrossed && cumBefore <= aggregateThreshold;

        if (method === 'SingleBill') thresholdCrossed = singleCrossed;
        else if (method === 'AggregateFY') thresholdCrossed = aggregateCrossed;
        else thresholdCrossed = singleCrossed || aggregateCrossed;

        if (aggregateThreshold <= 0 && singleBillThreshold <= 0 && master?.autoDeductTds !== false) {
            thresholdCrossed = true;
        }
    }

    const tdsApplicable = thresholdCrossed && (master?.autoDeductTds !== false);

    let taxableAmount = base;
    let tdsAmount = 0;

    if (tdsApplicable) {
        const aggregateCatchUp =
            aggregateCrossed && (method === 'AggregateFY' || method === 'Both');
        const singlePath =
            (method === 'SingleBill' && singleCrossed) ||
            (method === 'Both' && singleCrossed && !aggregateCrossed);

        if (aggregateCatchUp) {
            const deductMode = master?.thresholdDeductMode || 'FullAfterCrossing';
            if (deductMode === 'ExcessOnly') {
                if (cumBefore >= aggregateThreshold) {
                    taxableAmount = base;
                    tdsAmount = r2((base * rate) / 100);
                } else {
                    const excess = r2(Math.max(0, cumAfter - aggregateThreshold));
                    taxableAmount = excess;
                    tdsAmount = r2((excess * rate) / 100);
                }
            } else {
                /** FullAfterCrossing: FY catch-up on cumulative base less TDS already deducted */
                taxableAmount = cumAfter;
                const grossTdsOnCumulative = r2((cumAfter * rate) / 100);
                tdsAmount = r2(Math.max(0, grossTdsOnCumulative - cumTdsBefore));
            }
        } else if (singlePath) {
            taxableAmount = base;
            tdsAmount = r2((base * rate) / 100);
        } else {
            taxableAmount = base;
            tdsAmount = r2((base * rate) / 100);
        }
    }
    const panMandatory = Boolean(ledger.tdsPanMandatory || master?.panMandatory);
    const panBlock = Boolean(panMandatory && tdsApplicable && !panOk);
    const netPayable = tdsApplicable ? r2(Math.max(0, base - tdsAmount)) : base;

    if (thresholdWillCross) warnings.push('Threshold limit will be crossed in this transaction');
    if (tdsApplicable && !panEffective) warnings.push('PAN not available or not assumed — section 206AA higher rate applied');

    return {
        tdsApplicable,
        tdsSection: section,
        tdsRate: rate,
        specifiedRate,
        tdsThreshold: aggregateThreshold,
        singleBillThreshold,
        cumulativeBefore: cumBefore,
        cumulativeAfter: cumAfter,
        cumulativeTdsDeductedBefore: cumTdsBefore,
        tdsAmount,
        tdsBase: base,
        taxableAmount: tdsApplicable ? r2(taxableAmount) : 0,
        netPayable,
        calculationType: master?.calculationType || 'YearlyCumulative',
        thresholdCalculationMethod: method,
        panOk,
        panEffective,
        panBlock,
        warnings,
        thresholdWillCross,
        thresholdCrossed,
        liabilityAlert: tdsApplicable && (thresholdWillCross || singleCrossed),
        tdsCalculationBasis: settings?.tdsCalculationBasis || 'CurrentBill',
        rateSource: ledger.tdsRateSource || 'auto',
        deducteeConstitution: constitution,
    };
}

export async function previewPurchasePaymentTds({
    supplierId,
    financialYear,
    amountPaid,
    tdsBaseAmount,
    excludePaymentEntryId,
    invoiceSnapshot,
    paymentDate = null,
}) {
    const ledger = await resolveVendorLedger(supplierId);
    if (!ledger?.tdsApplicable) {
        return {
            engineActive: false,
            ledger: ledger ? { _id: ledger._id, name: ledger.name, tdsApplicable: false } : null,
            decision: null,
            settings: await getTdsSettings(),
        };
    }

    const section = String(ledger.tdsSection || '').trim().toUpperCase();
    const master = await getMasterSectionOrDefaults(section);
    const settings = { ...(await getTdsSettings()), financialYear: String(financialYear || '').trim() };

    const base = computeInvoiceTdsPaymentBase({
        amountPaid,
        tdsBaseAmount,
        ledger,
        invoiceSnapshot,
    });

    const cumState = await getCumulativeForSection(
        supplierId,
        section,
        financialYear,
        excludePaymentEntryId,
        undefined,
        undefined,
    );
    const cumulativeBefore = cumState.cumulativePaid;

    const supplier = await Supplier.findById(supplierId)
        .select('supplierName panNumber deducteeConstitution')
        .lean();

    const decision = computeTdsDecision({
        ledger,
        master,
        cumulativeBefore,
        currentBase: base,
        supplierPan: supplier?.panNumber,
        paymentTdsDeducteePan: '',
        settings,
        cumulativeTdsDeductedBefore: cumState.cumulativeTdsDeducted,
        paymentDate,
    });

    return {
        engineActive: true,
        settings: {
            tdsCalculationBasis: settings.tdsCalculationBasis,
            tdsPostingMode: settings.tdsPostingMode,
        },
        ledger: {
            _id: ledger._id,
            name: ledger.name,
            tdsApplicable: ledger.tdsApplicable,
            tdsSection: ledger.tdsSection,
            tdsRateSource: ledger.tdsRateSource,
            tdsDefaultRate: ledger.tdsDefaultRate,
            tdsThresholdOverride: ledger.tdsThresholdOverride,
            tdsPanMandatory: ledger.tdsPanMandatory,
            tdsPanAssumedAvailable: ledger.tdsPanAssumedAvailable,
            tdsDeductOn: ledger.tdsDeductOn,
            tdsDeducteeConstitution: ledger.tdsDeducteeConstitution || '',
            tdsIgnoreThreshold: ledger.tdsIgnoreThreshold,
            effectiveDeducteeConstitution: ledger.effectiveDeducteeConstitution || '',
        },
        master: master
            ? {
                  sectionCode: master.sectionCode,
                  sectionName: master.sectionName,
                  defaultRate: master.defaultRate,
                  rateIndividualHuf: master.rateIndividualHuf,
                  rateOthers: master.rateOthers,
                  panMissingRate: master.panMissingRate,
                  thresholdAmount: master.thresholdAmount,
                  singleBillThreshold: master.singleBillThreshold,
                  thresholdCalculationMethod: master.thresholdCalculationMethod,
                  calculationType: master.calculationType,
                  natureOfPayment: master.natureOfPayment,
              }
            : null,
        supplier: supplier
            ? {
                  supplierName: supplier.supplierName,
                  panNumber: supplier.panNumber || '',
                  deducteeConstitution: supplier.deducteeConstitution || '',
              }
            : null,
        decision,
    };
}

/**
 * Expense voucher — TDS section priority: (1) expense ledger master, (2) supplier default when expense not mapped,
 * (3) user choice when expense section and supplier default differ.
 * Does not throw: uses previewFailed + previewErrorMessage for client-visible errors.
 */
export async function previewExpenseVoucherTds({
    partyLedgerId,
    financialYear,
    items,
    isGstEnabled,
    processingTotal,
    voucherTaxSnapshot,
    excludeVoucherId,
    expenseTdsSectionResolution,
    voucherDate = null,
}) {
    const previewStart = Date.now();
    let lastTick = previewStart;
    const phase = (label) => {
        const now = Date.now();
        const slice = now - lastTick;
        lastTick = now;
        logger.debug(
            `[tds.preview.expense] ${label} +${slice}ms (elapsed ${now - previewStart}ms)`,
        );
    };

    const settings = { ...(await getTdsSettings()), financialYear: String(financialYear || '').trim() };
    phase('after_settings');

    const partyRef = normalizeMongoRefId(partyLedgerId);

    let ctx;
    try {
        ctx = await collectExpenseTdsDebitContext(items, isGstEnabled);
    } catch (e) {
        if (e instanceof ApiError) {
            return {
                engineActive: false,
                previewFailed: true,
                previewErrorMessage: e.message,
                decision: null,
                settings,
                blocked: false,
            };
        }
        throw e;
    }

    if (!partyRef || !mongoose.Types.ObjectId.isValid(partyRef)) {
        if (!ctx) {
            return { engineActive: false, decision: null, settings, blocked: false, previewFailed: false };
        }
        return {
            engineActive: true,
            previewFailed: true,
            previewErrorMessage:
                'Select Party (supplier / contractor ledger) in the header so TDS can be calculated for this expense.',
            decision: null,
            settings,
            blocked: false,
            supplier: null,
        };
    }

    const supplierId = await resolveSupplierIdFromPartyLedger(partyRef);
    phase('after_party_to_supplier');
    if (!supplierId) {
        return {
            engineActive: true,
            previewFailed: true,
            previewErrorMessage:
                'Could not link the selected party to a supplier. Use a supplier ledger or link this ledger in Supplier Master.',
            decision: null,
            settings,
            supplier: null,
            blocked: false,
        };
    }

    const vendorLed = await resolveVendorLedger(supplierId);
    phase('after_vendor_ledger');
    if (!vendorLed) {
        return {
            engineActive: true,
            previewFailed: true,
            previewErrorMessage: 'Could not resolve vendor ledger for this supplier.',
            decision: null,
            settings,
            blocked: false,
        };
    }

    if (!ctx) {
        ctx = await tryBuildExpenseTdsSupplierFallbackContext(items, isGstEnabled, vendorLed);
    }

    if (!ctx) {
        const diag = await diagnoseExpenseTdsLedgerMapping(items, vendorLed);
        if (diag?.previewErrorMessage) {
            return {
                engineActive: false,
                previewFailed: true,
                previewErrorMessage: diag.previewErrorMessage,
                decision: null,
                settings,
                blocked: false,
            };
        }
        return { engineActive: false, decision: null, settings, blocked: false, previewFailed: false };
    }

    const resolution = String(expenseTdsSectionResolution || '').trim().toUpperCase();
    const expenseSectionFromLedger = String(ctx.expenseLineLedger.tdsSection || '').trim().toUpperCase();
    const supplierSection = String(vendorLed.tdsSection || '').trim().toUpperCase();

    if (
        !ctx.fromSupplierSectionFallback &&
        expenseSectionFromLedger &&
        supplierSection &&
        expenseSectionFromLedger !== supplierSection &&
        resolution !== 'SUPPLIER_DEFAULT' &&
        resolution !== 'EXPENSE_LEDGER'
    ) {
        return {
            engineActive: true,
            previewFailed: false,
            blocked: false,
            sectionConflict: {
                supplierSection,
                expenseSection: expenseSectionFromLedger,
                expenseLedgerName: ctx.expenseLineLedger.name || '',
                message: `Supplier default TDS section is ${supplierSection}, but selected expense ledger ${ctx.expenseLineLedger.name} is mapped to ${expenseSectionFromLedger}. Which section do you want to apply?`,
            },
            decision: null,
            settings: {
                tdsCalculationBasis: settings.tdsCalculationBasis,
                tdsPostingMode: settings.tdsPostingMode,
            },
            supplierId,
            expenseLineLedgerId: ctx.expenseLineLedger._id,
        };
    }

    const mergeSource =
        resolution === 'SUPPLIER_DEFAULT' || ctx.fromSupplierSectionFallback
            ? { ...ctx.expenseLineLedger, tdsSection: '', tdsApplicable: false }
            : ctx.expenseLineLedger;

    const merged = mergeExpenseLineIntoVendorLedger(vendorLed, mergeSource);
    const section = String(merged.tdsSection || '').trim().toUpperCase();

    let master;
    try {
        master = await getMasterSectionOrDefaults(section);
        phase('after_master');
    } catch (e) {
        logger.debug(`[tds.preview.expense] failed at master (${Date.now() - previewStart}ms)`);
        return {
            engineActive: true,
            previewFailed: true,
            previewErrorMessage: e instanceof ApiError ? e.message : `TDS Master ${section} missing or inactive.`,
            decision: null,
            settings,
            blocked: false,
        };
    }

    const gt = Number(processingTotal) || 0;
    const invoiceSnapshot = {
        grandTotal: gt > 0 ? gt : ctx.gross,
        totalTaxableAmount: voucherTaxSnapshot?.totalTaxableAmount,
        totalTax: voucherTaxSnapshot?.totalTax,
        totalCgst: voucherTaxSnapshot?.totalCgst,
        totalSgst: voucherTaxSnapshot?.totalSgst,
        totalIgst: voucherTaxSnapshot?.totalIgst,
        freightTotalGst: 0,
        roundOff: voucherTaxSnapshot?.roundOff,
    };

    const currentBase = computeInvoiceTdsPaymentBase({
        amountPaid: ctx.gross,
        tdsBaseAmount: 0,
        ledger: merged,
        invoiceSnapshot: gt > 0 ? invoiceSnapshot : { grandTotal: ctx.gross, totalTaxableAmount: ctx.gross },
    });

    const cumState = await getCumulativeForSection(
        supplierId,
        section,
        financialYear,
        undefined,
        excludeVoucherId,
        undefined,
    );
    const cumulativeBefore = cumState.cumulativePaid;
    phase('after_cumulative');

    const supplier = await Supplier.findById(supplierId)
        .select('supplierName panNumber deducteeConstitution')
        .lean();
    phase('after_supplier');

    const constitution = String(merged.effectiveDeducteeConstitution || '').trim();
    const auto = (merged.tdsRateSource || 'auto') === 'auto';
    const hasCert = Number(merged.tdsLowerDeductionPercent) > 0;
    const supplierConstitutionMissing = Boolean(auto && !hasCert && !constitution);

    const previewMessages = [];
    if (supplierConstitutionMissing) {
        previewMessages.push('Supplier constitution missing.');
    }

    const decision = computeTdsDecision({
        ledger: merged,
        master,
        cumulativeBefore,
        currentBase,
        supplierPan: supplier?.panNumber,
        paymentTdsDeducteePan: '',
        settings,
        cumulativeTdsDeductedBefore: cumState.cumulativeTdsDeducted,
        paymentDate: voucherDate,
    });

    if (decision.tdsApplicable && decision.tdsAmount > 0) {
        const payId = await resolveTdsPayableLedgerId(decision.tdsSection, master);
        if (!payId) {
            logger.debug(`[tds.preview.expense] total ${Date.now() - previewStart}ms (failed payable)`);
            return {
                engineActive: true,
                previewFailed: true,
                previewErrorCode: 'TDS_PAYABLE_LEDGER_MISSING',
                missingTdsSection: decision.tdsSection,
                previewErrorMessage: `TDS payable ledger is not mapped for Section ${decision.tdsSection}. Please create or select ledger.`,
                decision,
                settings: {
                    tdsCalculationBasis: settings.tdsCalculationBasis,
                    tdsPostingMode: settings.tdsPostingMode,
                },
                mergedLedgerPreview: {
                    tdsSection: merged.tdsSection,
                    tdsRateSource: merged.tdsRateSource,
                    effectiveDeducteeConstitution: constitution,
                },
                master: master
                    ? {
                          sectionCode: master.sectionCode,
                          sectionName: master.sectionName,
                          defaultRate: master.defaultRate,
                          rateIndividualHuf: master.rateIndividualHuf,
                          rateOthers: master.rateOthers,
                          panMissingRate: master.panMissingRate,
                          thresholdAmount: master.thresholdAmount,
                          singleBillThreshold: master.singleBillThreshold,
                          thresholdCalculationMethod: master.thresholdCalculationMethod,
                          calculationType: master.calculationType,
                          natureOfPayment: master.natureOfPayment,
                          tdsLedgerMapping: master.tdsLedgerMapping,
                          tdsPayableLedgerId: master.tdsPayableLedgerId,
                      }
                    : null,
                supplier: supplier
                    ? {
                            _id: supplier._id,
                            supplierName: supplier.supplierName,
                            panNumber: supplier.panNumber || '',
                            deducteeConstitution: supplier.deducteeConstitution || '',
                        }
                    : null,
                blocked: false,
                supplierConstitutionMissing,
                previewMessages,
                tdsThresholdBaseAmount: currentBase,
                expenseLineLedgerId: ctx.expenseLineLedger._id,
                supplierId,
            };
        }
        phase('after_payable_led');
    }

    logger.debug(`[tds.preview.expense] total ${Date.now() - previewStart}ms`);

    return {
        engineActive: true,
        blocked: false,
        blockReason: '',
        previewFailed: false,
        supplierConstitutionMissing,
        previewMessages,
        settings: {
            tdsCalculationBasis: settings.tdsCalculationBasis,
            tdsPostingMode: settings.tdsPostingMode,
        },
        mergedLedgerPreview: {
            tdsSection: merged.tdsSection,
            tdsRateSource: merged.tdsRateSource,
            effectiveDeducteeConstitution: constitution,
        },
        master: master
            ? {
                  sectionCode: master.sectionCode,
                  sectionName: master.sectionName,
                  defaultRate: master.defaultRate,
                  rateIndividualHuf: master.rateIndividualHuf,
                  rateOthers: master.rateOthers,
                  panMissingRate: master.panMissingRate,
                  thresholdAmount: master.thresholdAmount,
                  singleBillThreshold: master.singleBillThreshold,
                  thresholdCalculationMethod: master.thresholdCalculationMethod,
                  calculationType: master.calculationType,
                  natureOfPayment: master.natureOfPayment,
                  tdsLedgerMapping: master.tdsLedgerMapping,
                  tdsPayableLedgerId: master.tdsPayableLedgerId,
              }
            : null,
        supplier: supplier
            ? {
                  _id: supplier._id,
                  supplierName: supplier.supplierName,
                  panNumber: supplier.panNumber || '',
                  deducteeConstitution: supplier.deducteeConstitution || '',
              }
            : null,
        decision,
        tdsThresholdBaseAmount: currentBase,
        expenseLineLedgerId: ctx.expenseLineLedger._id,
        supplierId,
    };
}

/**
 * Purchase invoice (bill) — same engine as payment; base from invoice GST snapshot.
 */
export async function previewPurchaseInvoiceTds({
    supplierId,
    financialYear,
    invoiceSnapshot,
    excludePurchaseInvoiceId,
    billDate = null,
}) {
    const settings = await getTdsSettings();
    const ledger = await resolveVendorLedger(supplierId);
    if (!ledger?.tdsApplicable) {
        return {
            engineActive: false,
            ledger: ledger ? { _id: ledger._id, name: ledger.name, tdsApplicable: false } : null,
            decision: null,
            settings,
            blocked: false,
        };
    }

    const section = String(ledger.tdsSection || '').trim().toUpperCase();
    const master = await getMasterSectionOrDefaults(section);

    const paid = Number(invoiceSnapshot?.grandTotal || 0);
    const base = computeInvoiceTdsPaymentBase({
        amountPaid: paid,
        tdsBaseAmount: 0,
        ledger,
        invoiceSnapshot,
    });

    const cumState = await getCumulativeForSection(
        supplierId,
        section,
        financialYear,
        undefined,
        undefined,
        excludePurchaseInvoiceId,
    );
    const cumulativeBefore = cumState.cumulativePaid;

    const supplier = await Supplier.findById(supplierId)
        .select('supplierName panNumber deducteeConstitution')
        .lean();

    const constitution = String(ledger.effectiveDeducteeConstitution || '').trim();
    const auto = (ledger.tdsRateSource || 'auto') === 'auto';
    const hasCert = Number(ledger.tdsLowerDeductionPercent) > 0;

    const decision = computeTdsDecision({
        ledger,
        master,
        cumulativeBefore,
        currentBase: base,
        supplierPan: supplier?.panNumber,
        paymentTdsDeducteePan: '',
        settings,
        cumulativeTdsDeductedBefore: cumState.cumulativeTdsDeducted,
        paymentDate: billDate,
    });

    return {
        engineActive: true,
        blocked: Boolean(auto && !hasCert && !constitution),
        blockReason:
            auto && !hasCert && !constitution
                ? 'Set deductee constitution on Supplier Master or use Manual TDS rate on the vendor ledger.'
                : '',
        settings: {
            tdsCalculationBasis: settings.tdsCalculationBasis,
            tdsPostingMode: settings.tdsPostingMode,
        },
        ledger: {
            _id: ledger._id,
            name: ledger.name,
            tdsApplicable: ledger.tdsApplicable,
            tdsSection: ledger.tdsSection,
            tdsRateSource: ledger.tdsRateSource,
            tdsDefaultRate: ledger.tdsDefaultRate,
            tdsThresholdOverride: ledger.tdsThresholdOverride,
            tdsPanMandatory: ledger.tdsPanMandatory,
            tdsPanAssumedAvailable: ledger.tdsPanAssumedAvailable,
            tdsDeductOn: ledger.tdsDeductOn,
            tdsDeducteeConstitution: ledger.tdsDeducteeConstitution || '',
            tdsIgnoreThreshold: ledger.tdsIgnoreThreshold,
            effectiveDeducteeConstitution: ledger.effectiveDeducteeConstitution || '',
        },
        master: master
            ? {
                  sectionCode: master.sectionCode,
                  sectionName: master.sectionName,
                  defaultRate: master.defaultRate,
                  rateIndividualHuf: master.rateIndividualHuf,
                  rateOthers: master.rateOthers,
                  panMissingRate: master.panMissingRate,
                  thresholdAmount: master.thresholdAmount,
                  singleBillThreshold: master.singleBillThreshold,
                  thresholdCalculationMethod: master.thresholdCalculationMethod,
                  calculationType: master.calculationType,
                  natureOfPayment: master.natureOfPayment,
                  tdsLedgerMapping: master.tdsLedgerMapping,
              }
            : null,
        supplier: supplier
            ? {
                  _id: supplier._id,
                  supplierName: supplier.supplierName,
                  panNumber: supplier.panNumber || '',
                  deducteeConstitution: supplier.deducteeConstitution || '',
              }
            : null,
        decision,
        tdsThresholdBaseAmount: base,
        supplierId,
    };
}
