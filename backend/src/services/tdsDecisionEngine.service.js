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
    suggestTdsNatureFromLedgerName,
    normalizeTdsNatureKey,
    defaultNatureForSection,
    formatTdsSectionDisplay,
    TDS_SECTION_393_MAP,
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

/** Group TDS-applicable expense debit lines by section + nature (multi-section vouchers allowed). */
export async function collectExpenseTdsDebitGroups(items, isGstEnabled) {
    const debitItems = (items || []).filter((i) => itemIsExpenseDebitLine(i) && normalizeMongoRefId(i.ledgerId));
    if (!debitItems.length) return [];
    const ids = [...new Set(debitItems.map((i) => normalizeMongoRefId(i.ledgerId)).filter(Boolean))];
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (!validIds.length) return [];
    const ledgers = await AccountLedger.find({ _id: { $in: validIds } }).lean();
    const byId = Object.fromEntries(ledgers.map((l) => [String(l._id), l]));

    const groupsMap = new Map();
    for (const it of debitItems) {
        const lid = normalizeMongoRefId(it.ledgerId);
        const L = byId[String(lid)];
        if (!L?.tdsApplicable || !String(L.tdsSection || '').trim()) continue;
        const section = String(L.tdsSection).trim().toUpperCase();
        const tdsNature =
            String(L.tdsNature || '').trim()
            || suggestTdsNatureFromLedgerName(L.name)
            || defaultNatureForSection(section)
            || '';
        const natureKey = normalizeTdsNatureKey(tdsNature);
        const groupKey = `${section}|${natureKey}`;
        const deductOn = L.tdsDeductOn || 'with_gst';
        const amt = computeLineAmountForTdsBase(it, isGstEnabled, deductOn);
        if (!groupsMap.has(groupKey)) {
            groupsMap.set(groupKey, {
                section,
                tdsNature,
                natureKey,
                expenseLineLedger: { ...L, tdsNature: tdsNature || L.tdsNature || '' },
                gross: 0,
            });
        }
        const g = groupsMap.get(groupKey);
        g.gross = r2(g.gross + amt);
    }
    return [...groupsMap.values()].filter((g) => g.gross > 0);
}

/**
 * Returns { expenseLineLedger, section, gross } for a single TDS group, or null.
 * Multi-section vouchers: returns the first group and sets `groups` / `multiSection`.
 * No longer throws when lines use different sections.
 */
export async function collectExpenseTdsDebitContext(items, isGstEnabled) {
    const groups = await collectExpenseTdsDebitGroups(items, isGstEnabled);
    if (!groups.length) return null;
    const first = groups[0];
    return {
        expenseLineLedger: first.expenseLineLedger,
        section: first.section,
        gross: first.gross,
        groups,
        multiSection: groups.length > 1,
    };
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
        tdsNature: expenseLineLedger.tdsNature || vendorLedger.tdsNature || '',
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
    natureKey = '',
) {
    const nat = String(natureKey || '').trim().toUpperCase();
    const bal = await getSectionBalance(supplierId, section, financialYear, nat);
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
            .select('tdsSupplierId tdsSection tdsThresholdBaseAmount tdsAmount status nature tdsLines')
            .lean();
        if (v && v.status !== 'Cancelled' && v.nature === 'Expense' && String(v.tdsSupplierId || '') === String(supplierId || '')) {
            const lines = Array.isArray(v.tdsLines) && v.tdsLines.length
                ? v.tdsLines
                : [{ section: v.tdsSection, natureKey: '', tdsBase: v.tdsThresholdBaseAmount, tdsAmount: v.tdsAmount }];
            for (const line of lines) {
                if (String(line.section || '').toUpperCase() !== String(section).toUpperCase()) continue;
                if (String(line.natureKey || '').toUpperCase() !== nat) continue;
                cum = r2(Math.max(0, cum - r2(Number(line.tdsBase || line.thresholdBase || 0))));
                cumTds = r2(Math.max(0, cumTds - r2(Number(line.tdsAmount || 0))));
            }
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
            && !nat
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
    const nature = String(ledger.tdsNature || master?.tdsNature || '').trim();
    if (/technical/i.test(nature) && Number(master?.rateTechnicalServices) > 0) {
        return r2(Number(master.rateTechnicalServices));
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
 * Expense voucher — line-wise TDS: expense ledger decides nature/section; supplier constitution decides rate.
 * One voucher may produce multiple TDS lines (e.g. 194C + 194J) with separate threshold buckets.
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
    tdsLineOverrides = [],
}) {
    const previewStart = Date.now();
    const settings = { ...(await getTdsSettings()), financialYear: String(financialYear || '').trim() };
    const partyRef = normalizeMongoRefId(partyLedgerId);

    let groups = [];
    try {
        groups = await collectExpenseTdsDebitGroups(items, isGstEnabled);
    } catch (e) {
        if (e instanceof ApiError) {
            return {
                engineActive: false,
                previewFailed: true,
                previewErrorMessage: e.message,
                decision: null,
                tdsLines: [],
                settings,
                blocked: false,
            };
        }
        throw e;
    }

    if (!partyRef || !mongoose.Types.ObjectId.isValid(partyRef)) {
        if (!groups.length) {
            return { engineActive: false, decision: null, tdsLines: [], settings, blocked: false, previewFailed: false };
        }
        return {
            engineActive: true,
            previewFailed: true,
            previewErrorMessage:
                'Select Party (supplier / contractor ledger) in the header so TDS can be calculated for this expense.',
            decision: null,
            tdsLines: [],
            settings,
            blocked: false,
            supplier: null,
        };
    }

    const supplierId = await resolveSupplierIdFromPartyLedger(partyRef);
    if (!supplierId) {
        return {
            engineActive: true,
            previewFailed: true,
            previewErrorMessage:
                'Could not link the selected party to a supplier. Use a supplier ledger or link this ledger in Supplier Master.',
            decision: null,
            tdsLines: [],
            settings,
            supplier: null,
            blocked: false,
        };
    }

    const vendorLed = await resolveVendorLedger(supplierId);
    if (!vendorLed) {
        return {
            engineActive: true,
            previewFailed: true,
            previewErrorMessage: 'Could not resolve vendor ledger for this supplier.',
            decision: null,
            tdsLines: [],
            settings,
            blocked: false,
        };
    }

    if (!groups.length) {
        const fallback = await tryBuildExpenseTdsSupplierFallbackContext(items, isGstEnabled, vendorLed);
        if (fallback) {
            groups = [{
                section: fallback.section,
                tdsNature: defaultNatureForSection(fallback.section) || '',
                natureKey: normalizeTdsNatureKey(defaultNatureForSection(fallback.section)),
                expenseLineLedger: fallback.expenseLineLedger,
                gross: fallback.gross,
                fromSupplierSectionFallback: true,
            }];
        }
    }

    if (!groups.length) {
        const diag = await diagnoseExpenseTdsLedgerMapping(items, vendorLed);
        if (diag?.previewErrorMessage) {
            return {
                engineActive: false,
                previewFailed: true,
                previewErrorMessage: diag.previewErrorMessage,
                decision: null,
                tdsLines: [],
                settings,
                blocked: false,
            };
        }
        return { engineActive: false, decision: null, tdsLines: [], settings, blocked: false, previewFailed: false };
    }

    const resolution = String(expenseTdsSectionResolution || '').trim().toUpperCase();
    const supplierSection = String(vendorLed.tdsSection || '').trim().toUpperCase();
    const multiSection = groups.length > 1;

    // Single-group conflict: expense ledger section ≠ supplier default (suggestion only).
    if (
        !multiSection
        && !groups[0].fromSupplierSectionFallback
        && groups[0].section
        && supplierSection
        && groups[0].section !== supplierSection
        && resolution !== 'SUPPLIER_DEFAULT'
        && resolution !== 'EXPENSE_LEDGER'
    ) {
        return {
            engineActive: true,
            previewFailed: false,
            blocked: false,
            sectionConflict: {
                supplierSection,
                expenseSection: groups[0].section,
                expenseLedgerName: groups[0].expenseLineLedger?.name || '',
                message: `Supplier default TDS section is ${supplierSection}, but selected expense ledger ${groups[0].expenseLineLedger?.name} is mapped to ${groups[0].section}. Which section do you want to apply?`,
            },
            decision: null,
            tdsLines: [],
            settings: {
                tdsCalculationBasis: settings.tdsCalculationBasis,
                tdsPostingMode: settings.tdsPostingMode,
            },
            supplierId,
            expenseLineLedgerId: groups[0].expenseLineLedger?._id,
        };
    }

    const supplier = await Supplier.findById(supplierId)
        .select('supplierName panNumber deducteeConstitution allowedTdsNatures allowedTdsSections')
        .lean();

    const gt = Number(processingTotal) || 0;
    const tdsLines = [];
    let totalTds = 0;
    let totalBase = 0;
    let primaryDecision = null;
    let primaryMaster = null;
    let supplierConstitutionMissing = false;
    const previewMessages = [];

    for (const group of groups) {
        let expenseLedger = group.expenseLineLedger;
        const ov = (Array.isArray(tdsLineOverrides) ? tdsLineOverrides : []).find(
            (o) => o && String(o.expenseLedgerId || '') === String(expenseLedger?._id || ''),
        );
        const overridePrevious = {
            tdsNature: group.tdsNature || expenseLedger?.tdsNature || '',
            section: String(group.section || expenseLedger?.tdsSection || '').trim().toUpperCase(),
            rate: null,
        };
        if (ov?.tdsNature) {
            group.tdsNature = String(ov.tdsNature).trim();
            group.natureKey = normalizeTdsNatureKey(group.tdsNature);
            expenseLedger = { ...expenseLedger, tdsNature: group.tdsNature };
        }
        if (ov?.section) {
            expenseLedger = { ...expenseLedger, tdsSection: String(ov.section).trim().toUpperCase(), tdsApplicable: true };
            group.section = String(ov.section).trim().toUpperCase();
        }
        if (ov && ov.tdsApplicable === false) {
            continue;
        }
        if (resolution === 'SUPPLIER_DEFAULT' && !multiSection) {
            expenseLedger = { ...expenseLedger, tdsSection: '', tdsApplicable: false };
        }
        const merged = mergeExpenseLineIntoVendorLedger(vendorLed, expenseLedger);
        if (group.tdsNature) merged.tdsNature = group.tdsNature;
        if (ov?.rate != null && Number(ov.rate) >= 0 && String(ov.overrideReason || '').trim()) {
            merged.tdsRateSource = 'manual';
            merged.tdsDefaultRate = Number(ov.rate);
        }
        const section = String(merged.tdsSection || group.section || '').trim().toUpperCase();
        if (!section) continue;

        const allowedSections = Array.isArray(supplier?.allowedTdsSections)
            ? supplier.allowedTdsSections.map((s) => String(s).trim().toUpperCase()).filter(Boolean)
            : [];
        if (allowedSections.length && !allowedSections.includes(section)) {
            previewMessages.push(`Section ${section} is not in supplier allowed TDS sections.`);
        }

        let master;
        try {
            master = await getMasterSectionOrDefaults(section);
        } catch (e) {
            return {
                engineActive: true,
                previewFailed: true,
                previewErrorMessage: e instanceof ApiError ? e.message : `TDS Master ${section} missing or inactive.`,
                decision: null,
                tdsLines: [],
                settings,
                blocked: false,
            };
        }

        const currentBase = r2(group.gross);
        const cumState = await getCumulativeForSection(
            supplierId,
            section,
            financialYear,
            undefined,
            excludeVoucherId,
            undefined,
            group.natureKey || '',
        );

        const constitution = String(merged.effectiveDeducteeConstitution || '').trim();
        const auto = (merged.tdsRateSource || 'auto') === 'auto';
        const hasCert = Number(merged.tdsLowerDeductionPercent) > 0;
        if (auto && !hasCert && !constitution) supplierConstitutionMissing = true;

        const decision = computeTdsDecision({
            ledger: merged,
            master,
            cumulativeBefore: cumState.cumulativePaid,
            currentBase,
            supplierPan: supplier?.panNumber,
            paymentTdsDeducteePan: '',
            settings,
            cumulativeTdsDeductedBefore: cumState.cumulativeTdsDeducted,
            paymentDate: voucherDate,
        });

        let payableId = null;
        if (decision.tdsApplicable && decision.tdsAmount > 0) {
            payableId = await resolveTdsPayableLedgerId(decision.tdsSection, master);
            if (!payableId) {
                return {
                    engineActive: true,
                    previewFailed: true,
                    previewErrorCode: 'TDS_PAYABLE_LEDGER_MISSING',
                    missingTdsSection: decision.tdsSection,
                    previewErrorMessage: `TDS payable ledger is not mapped for Section ${decision.tdsSection}. Please create or select ledger.`,
                    decision,
                    tdsLines,
                    settings: {
                        tdsCalculationBasis: settings.tdsCalculationBasis,
                        tdsPostingMode: settings.tdsPostingMode,
                    },
                    supplierId,
                    blocked: false,
                };
            }
        }

        const map393 = TDS_SECTION_393_MAP[section];
        let rateReason = `${decision.tdsRate || decision.specifiedRate || 0}% from TDS Master for section ${section}.`;
        if (/technical/i.test(group.tdsNature || '') && Number(master?.rateTechnicalServices) > 0) {
            rateReason = `${decision.tdsRate}% selected because this line is classified as Technical Services under ${section}.`;
        } else if (/contract/i.test(group.tdsNature || '') && isIndividualHufConstitution(constitution)) {
            rateReason = `${decision.tdsRate}% selected because the supplier is a ${constitution || 'Proprietorship'} and this line is classified as Contractor.`;
        } else if (/contract/i.test(group.tdsNature || '')) {
            rateReason = `${decision.tdsRate}% selected because the supplier is a ${constitution || 'company'} and this line is classified as Contractor.`;
        } else if (/professional/i.test(group.tdsNature || '')) {
            rateReason = `${decision.tdsRate}% selected because this line is classified as Professional Services under ${section}.`;
        }

        const line = {
            expenseLedgerId: expenseLedger?._id || null,
            expenseLedgerName: expenseLedger?.name || '',
            tdsApplicable: !!decision.tdsApplicable,
            tdsNature: group.tdsNature || merged.tdsNature || master?.tdsNature || '',
            natureKey: group.natureKey || normalizeTdsNatureKey(group.tdsNature),
            section,
            sectionDisplay: formatTdsSectionDisplay(section, group.tdsNature),
            section393Label: master?.section393Label || map393?.actLabel || '',
            section393TableItem: master?.section393TableItem || map393?.tableItem || '',
            rate: decision.tdsRate || decision.specifiedRate || 0,
            specifiedRate: decision.specifiedRate || 0,
            tdsBase: currentBase,
            tdsAmount: decision.tdsApplicable ? r2(decision.tdsAmount) : 0,
            payableLedgerId: payableId,
            thresholdStatus: decision.thresholdCrossed ? 'Crossed' : (decision.thresholdWillCross ? 'WillCross' : 'Within'),
            previousAggregate: decision.cumulativeBefore,
            currentTransaction: currentBase,
            newAggregate: decision.cumulativeAfter,
            singleBillThreshold: Number(master?.singleBillThreshold || 0),
            annualThreshold: Number(master?.thresholdAmount || 0),
            thresholdCrossed: !!decision.thresholdCrossed,
            tdsApplicableReason: decision.tdsApplicable
                ? (decision.thresholdCrossed
                    ? 'Threshold crossed — TDS applies under master rules for this nature/section.'
                    : 'TDS applies under master rules for this nature/section.')
                : (decision.warnings?.[0] || 'Within threshold / not applicable yet.'),
            rateReason,
            supplierConstitution: constitution,
            overrideReason: ov?.overrideReason ? String(ov.overrideReason).trim() : '',
            overrideApplied: Boolean(ov && String(ov.overrideReason || '').trim()),
            overridePrevious: Boolean(ov && String(ov.overrideReason || '').trim())
                ? {
                    tdsNature: overridePrevious.tdsNature,
                    section: overridePrevious.section,
                    rate: overridePrevious.rate,
                }
                : null,
            decision,
            master: master
                ? {
                    sectionCode: master.sectionCode,
                    sectionName: master.sectionName,
                    rateIndividualHuf: master.rateIndividualHuf,
                    rateOthers: master.rateOthers,
                    rateTechnicalServices: master.rateTechnicalServices,
                    thresholdAmount: master.thresholdAmount,
                    singleBillThreshold: master.singleBillThreshold,
                    tdsNature: master.tdsNature,
                    section393Label: master.section393Label,
                    section393TableItem: master.section393TableItem,
                }
                : null,
        };
        tdsLines.push(line);
        totalTds = r2(totalTds + line.tdsAmount);
        totalBase = r2(totalBase + currentBase);
        if (!primaryDecision) {
            primaryDecision = {
                ...decision,
                tdsAmount: totalTds,
                tdsBase: totalBase,
                multiSection,
            };
            primaryMaster = line.master;
        }
    }

    if (supplierConstitutionMissing) {
        previewMessages.push('Supplier constitution missing.');
    }

    // Header decision uses summed TDS for posting net-of-TDS cash; section = primary or MULTI
    const headerDecision = primaryDecision
        ? {
            ...primaryDecision,
            tdsApplicable: totalTds > 0 || primaryDecision.tdsApplicable,
            tdsAmount: totalTds,
            tdsBase: totalBase,
            tdsSection: multiSection ? tdsLines.map((l) => l.section).join('+') : (tdsLines[0]?.section || ''),
            liabilityAlert: tdsLines.some((l) => l.decision?.liabilityAlert) || totalTds > 0,
            multiSection,
        }
        : null;

    logger.debug(`[tds.preview.expense] total ${Date.now() - previewStart}ms lines=${tdsLines.length}`);

    return {
        engineActive: true,
        blocked: false,
        blockReason: '',
        previewFailed: false,
        supplierConstitutionMissing,
        previewMessages,
        multiSection,
        settings: {
            tdsCalculationBasis: settings.tdsCalculationBasis,
            tdsPostingMode: settings.tdsPostingMode,
        },
        mergedLedgerPreview: {
            tdsSection: tdsLines[0]?.section || '',
            tdsNature: tdsLines[0]?.tdsNature || '',
            tdsRateSource: 'auto',
            effectiveDeducteeConstitution: String(vendorLed.effectiveDeducteeConstitution || '').trim(),
        },
        master: primaryMaster,
        supplier: supplier
            ? {
                _id: supplier._id,
                supplierName: supplier.supplierName,
                panNumber: supplier.panNumber || '',
                deducteeConstitution: supplier.deducteeConstitution || '',
                allowedTdsNatures: supplier.allowedTdsNatures || [],
                allowedTdsSections: supplier.allowedTdsSections || [],
            }
            : null,
        decision: headerDecision,
        tdsLines,
        tdsThresholdBaseAmount: totalBase,
        expenseLineLedgerId: tdsLines[0]?.expenseLedgerId || null,
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
