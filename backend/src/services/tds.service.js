import mongoose from 'mongoose';
import { TdsDeduction } from '../models/tdsDeduction.model.js';
import { TdsChallan } from '../models/tdsChallan.model.js';
import { TdsReturn } from '../models/tdsReturn.model.js';
import { TdsForm16a } from '../models/tdsForm16a.model.js';
import { Supplier } from '../models/supplier.model.js';
import { PaymentEntry } from '../models/paymentEntry.model.js';
import { Voucher } from '../models/voucher.model.js';
import { ApiError } from '../utils/ApiError.js';
import httpStatus from 'http-status';
import {
    TDS_SECTIONS,
    isValidPan,
    normalizePan,
    parseFinancialYearRange,
    quarterForDateInFY,
    assessmentYearFromFinancialYear,
} from '../constants/tds.constants.js';
import { getFYFromDate } from '../utils/fyUtils.js';
import { TdsMasterSection } from '../models/tdsMasterSection.model.js';

function assertSection(section) {
    const s = String(section || '').trim().toUpperCase();
    if (!TDS_SECTIONS.includes(s)) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Invalid TDS section "${section}". Allowed: ${TDS_SECTIONS.join(', ')}`);
    }
    return s;
}

/** Posted vouchers (expense / payment / journal / purchase) with TDS or skipped popup — not system-generated. */
function buildPostedVoucherTdsRegisterMatch(financialYear) {
    const fy = String(financialYear || '').trim();
    const fyRange = parseFinancialYearRange(fy);
    const orClauses = fyRange
        ? [{ financialYear: fy }, { date: { $gte: fyRange.start, $lte: fyRange.end } }]
        : [{ financialYear: fy }];
    return {
        nature: { $in: ['Expense', 'Payment', 'Journal', 'Purchase'] },
        status: { $ne: 'Cancelled' },
        isSystemGenerated: { $ne: true },
        $and: [
            { $or: orClauses },
            {
                $or: [{ tdsAmount: { $gt: 0 } }, { tdsPopupSkipped: true }],
            },
        ],
    };
}

function buildExpenseVoucherTdsMatch(financialYear) {
    const fy = String(financialYear || '').trim();
    const fyRange = parseFinancialYearRange(fy);
    const orClauses = fyRange
        ? [{ financialYear: fy }, { date: { $gte: fyRange.start, $lte: fyRange.end } }]
        : [{ financialYear: fy }];
    return {
        nature: 'Expense',
        tdsAmount: { $gt: 0 },
        status: { $ne: 'Cancelled' },
        isSystemGenerated: { $ne: true },
        $or: orClauses,
    };
}

const voucherTdsBaseExpr = {
    $cond: [
        { $gt: [{ $ifNull: ['$tdsThresholdBaseAmount', 0] }, 0] },
        '$tdsThresholdBaseAmount',
        { $ifNull: ['$totalTaxableAmount', { $ifNull: ['$grandTotal', '$totalAmount'] }] },
    ],
};

function mergeSectionWise(deductionBySection, voucherBySection) {
    const map = new Map();
    const add = (section, tds, paid) => {
        const k = String(section || 'OTHER').trim().toUpperCase() || 'OTHER';
        const cur = map.get(k) || { section: k, tds: 0, paid: 0 };
        cur.tds += Number(tds) || 0;
        cur.paid += Number(paid) || 0;
        map.set(k, cur);
    };
    for (const r of deductionBySection || []) add(r._id, r.tds, r.paid);
    for (const r of voucherBySection || []) add(r._id, r.tds, r.paid);
    return [...map.values()].sort((a, b) => b.tds - a.tds);
}

function mergeTopVendors(deductionRows, voucherRows) {
    const map = new Map();
    const add = (id, supplierName, totalPaid, totalTds, pending) => {
        if (id == null) return;
        const k = String(id);
        const cur = map.get(k) || {
            _id: id,
            supplierName: supplierName || '',
            totalPaid: 0,
            totalTds: 0,
            unmapped: 0,
        };
        cur.totalPaid += Number(totalPaid) || 0;
        cur.totalTds += Number(totalTds) || 0;
        cur.unmapped += Number(pending) || 0;
        if (supplierName && !cur.supplierName) cur.supplierName = supplierName;
        map.set(k, cur);
    };
    for (const r of deductionRows || []) add(r._id, r.supplierName, r.totalPaid, r.totalTds, r.unmapped);
    for (const r of voucherRows || []) add(r._id, r.supplierName, r.totalPaid, r.totalTds, r.unmapped);
    return [...map.values()].sort((a, b) => b.totalTds - a.totalTds).slice(0, 50);
}

const RUPEE_EPS = 0.02;

function sumChallanAllocations(alloc) {
    return (alloc || []).reduce((a, x) => a + (Number(x.amount) || 0), 0);
}

/** Paid against challans for a TdsDeduction document (legacy single challanId = full TDS if no allocations). */
export function getDeductionChallanPaidAmount(doc) {
    const tds = Number(doc.tdsAmount) || 0;
    let paid = sumChallanAllocations(doc.challanAllocations);
    if (paid <= RUPEE_EPS && doc.challanId) {
        const hasAlloc = Array.isArray(doc.challanAllocations) && doc.challanAllocations.length > 0;
        if (!hasAlloc) paid = tds;
    }
    return Math.round(paid * 100) / 100;
}

export function getDeductionChallanBalance(doc) {
    const tds = Number(doc.tdsAmount) || 0;
    const paid = getDeductionChallanPaidAmount(doc);
    return Math.max(0, Math.round((tds - paid) * 100) / 100);
}

export function getVoucherTdsChallanPaidAmount(v) {
    const paid = sumChallanAllocations(v.tdsChallanAllocations);
    return Math.round(paid * 100) / 100;
}

export function getVoucherTdsChallanBalance(v) {
    const tds = Number(v.tdsAmount) || 0;
    const paid = getVoucherTdsChallanPaidAmount(v);
    return Math.max(0, Math.round((tds - paid) * 100) / 100);
}

function challanPaymentStatus(balance, paid) {
    if (balance <= RUPEE_EPS) return 'Paid';
    if (paid > RUPEE_EPS) return 'Part Paid';
    return 'Unpaid';
}

export async function listDeductions(filters = {}) {
    const q = {};
    if (filters.financialYear) q.financialYear = filters.financialYear;
    if (filters.quarter) q.quarter = filters.quarter;
    if (filters.supplierId && mongoose.Types.ObjectId.isValid(filters.supplierId)) {
        q.supplierId = filters.supplierId;
    }
    if (filters.paymentEntryId && mongoose.Types.ObjectId.isValid(filters.paymentEntryId)) {
        q.paymentEntryId = filters.paymentEntryId;
    }
    let raw = await TdsDeduction.find(q).sort({ paymentDate: -1 }).limit(500).lean();
    if (filters.unmappedOnly === 'true' || filters.unmappedOnly === true) {
        raw = raw.filter((d) => getDeductionChallanBalance(d) > RUPEE_EPS);
    }
    return raw.map((d) => {
        const paid = getDeductionChallanPaidAmount(d);
        const balance = getDeductionChallanBalance(d);
        return {
            ...d,
            tdsPaidTowardsChallans: paid,
            tdsBalancePayable: balance,
            tdsChallanPaymentStatus: challanPaymentStatus(balance, paid),
        };
    });
}

/**
 * Unified TDS deduction register: posted vouchers (TDS on header) + TdsDeduction compliance rows.
 * Challan link continues to use TdsDeduction ids only (see raw listDeductions).
 */
export async function listTdsDeductionRegister(financialYear) {
    const fy = String(financialYear || '').trim();
    if (!fy) throw new ApiError(httpStatus.BAD_REQUEST, 'financialYear query required');

    const secDocs = await TdsMasterSection.find({})
        .select('sectionCode sectionName tdsPayableLedgerId')
        .populate('tdsPayableLedgerId', 'name')
        .lean();
    const secMap = Object.fromEntries(
        (secDocs || []).map((s) => [String(s.sectionCode || '').toUpperCase(), s]),
    );

    const voucherMatch = buildPostedVoucherTdsRegisterMatch(fy);
    const vouchers = await Voucher.find(voucherMatch)
        .sort({ date: -1 })
        .limit(2500)
        .populate('tdsPayableLedgerId', 'name')
        .populate('tdsExpenseLineLedgerId', 'name')
        .populate('tdsSupplierId', 'supplierName panNumber deducteeConstitution')
        .lean();

    const rows = [];

    for (const v of vouchers) {
        if (getFYFromDate(v.date) !== fy && String(v.financialYear || '').trim() !== fy) {
            continue;
        }
        const supplierName = (v.tdsSupplierId && v.tdsSupplierId.supplierName) || v.partyName || '';
        const pan = ((v.tdsSupplierId && v.tdsSupplierId.panNumber) || '').toUpperCase();
        const constitution = (v.tdsSupplierId && v.tdsSupplierId.deducteeConstitution) || '';
        const effFy = String(v.financialYear || '').trim() || getFYFromDate(v.date);
        const q = quarterForDateInFY(v.date, effFy) || '';
        const skipped = !!v.tdsPopupSkipped;
        const paidV = getVoucherTdsChallanPaidAmount(v);
        const balV = getVoucherTdsChallanBalance(v);
        const challanPayStatus = challanPaymentStatus(balV, paidV);
        let challanLbl = 'Unpaid';
        if (balV <= RUPEE_EPS) challanLbl = 'Paid';
        else if (paidV > RUPEE_EPS) challanLbl = `Part paid · bal ₹${balV.toFixed(2)}`;

        const lineRows = Array.isArray(v.tdsLines) && v.tdsLines.length
            ? v.tdsLines.map((line, idx) => {
                const section = String(line.section || v.tdsSection || '').trim().toUpperCase() || 'OTHER';
                const master = secMap[section] || {};
                const base = Number(line.tdsBase || 0);
                const tdsAmt = Number(line.tdsAmount || 0);
                const rate = line.rate != null && line.rate !== ''
                    ? Number(line.rate)
                    : (base > 0 && tdsAmt > 0 ? Math.round((tdsAmt / base) * 10000) / 100 : null);
                let status = 'Pending';
                if (skipped) status = 'Skipped';
                else if (tdsAmt > 0) status = 'Deducted';
                return {
                    rowKey: `voucher:${v._id}:line:${idx}`,
                    source: 'voucher',
                    voucherId: v._id,
                    voucherNo: v.voucherNo,
                    voucherDate: v.date,
                    voucherNature: v.nature,
                    voucherTypeName: v.voucherTypeName || '',
                    supplierId: v.tdsSupplierId || null,
                    payableLedgerId: line.payableLedgerId || v.tdsPayableLedgerId?._id || v.tdsPayableLedgerId || null,
                    supplierName,
                    deducteePan: pan,
                    deducteeConstitution: constitution,
                    tdsNature: line.tdsNature || '',
                    natureKey: line.natureKey || '',
                    sectionCode: section,
                    sectionName: master.sectionName || '',
                    section393Label: line.section393Label || '',
                    sectionDisplay: line.sectionDisplay || section,
                    expenseLedgerName: line.expenseLedgerName || (v.tdsExpenseLineLedgerId && v.tdsExpenseLineLedgerId.name) || '',
                    partyName: v.partyName || '',
                    grossAmount: base,
                    taxableAmount: base,
                    tdsRate: rate,
                    tdsAmount: tdsAmt,
                    netPayable: Math.round((base - tdsAmt) * 100) / 100,
                    tdsPayableLedgerName: (v.tdsPayableLedgerId && v.tdsPayableLedgerId.name) || '',
                    status,
                    skippedReason: v.tdsDisabledReason || '',
                    alreadyPaidAmount: paidV,
                    balancePayable: balV,
                    tdsChallanPaymentStatus: challanPayStatus,
                    challanStatus: challanLbl,
                    quarter: q,
                    financialYear: effFy,
                    deductionId: null,
                    paymentEntryId: null,
                    challanId: null,
                    multiNatureLine: true,
                };
            })
            : null;

        if (lineRows) {
            rows.push(...lineRows);
            continue;
        }

        const section = String(v.tdsSection || '').trim().toUpperCase() || 'OTHER';
        const master = secMap[section] || {};
        const base =
            Number(v.tdsThresholdBaseAmount) > 0
                ? Number(v.tdsThresholdBaseAmount)
                : Number(v.totalTaxableAmount || v.grandTotal || v.totalAmount || 0);
        const tdsAmt = Number(v.tdsAmount) || 0;
        const taxable = Number(v.totalTaxableAmount || 0);
        const grossBill = Number(v.grandTotal || v.totalAmount || 0);
        const rate = base > 0 && tdsAmt > 0 ? Math.round((tdsAmt / base) * 10000) / 100 : null;
        let status = 'Pending';
        if (skipped) status = 'Skipped';
        else if (tdsAmt > 0) status = 'Deducted';
        const netPayable =
            grossBill > 0
                ? Math.round((grossBill - tdsAmt) * 100) / 100
                : Math.round((base - tdsAmt) * 100) / 100;

        rows.push({
            rowKey: `voucher:${v._id}`,
            source: 'voucher',
            voucherId: v._id,
            voucherNo: v.voucherNo,
            voucherDate: v.date,
            voucherNature: v.nature,
            voucherTypeName: v.voucherTypeName || '',
            supplierId: v.tdsSupplierId || null,
            payableLedgerId: v.tdsPayableLedgerId?._id || v.tdsPayableLedgerId || null,
            supplierName,
            deducteePan: pan,
            deducteeConstitution: constitution,
            tdsNature: '',
            sectionCode: section,
            sectionName: master.sectionName || '',
            expenseLedgerName: (v.tdsExpenseLineLedgerId && v.tdsExpenseLineLedgerId.name) || '',
            partyName: v.partyName || '',
            grossAmount: base,
            taxableAmount: taxable,
            tdsRate: rate,
            tdsAmount: tdsAmt,
            netPayable,
            tdsPayableLedgerName: (v.tdsPayableLedgerId && v.tdsPayableLedgerId.name) || '',
            status,
            skippedReason: v.tdsDisabledReason || '',
            alreadyPaidAmount: paidV,
            balancePayable: balV,
            tdsChallanPaymentStatus: challanPayStatus,
            challanStatus: challanLbl,
            quarter: q,
            financialYear: effFy,
            deductionId: null,
            paymentEntryId: null,
            challanId: null,
        });
    }

    const deductions = await TdsDeduction.find({ financialYear: fy })
        .sort({ paymentDate: -1 })
        .limit(500)
        .populate({
            path: 'paymentEntryId',
            select: 'invoiceNumber amountPaid paymentMode transactionId',
        })
        .lean();

    const challanIdSet = new Set();
    for (const d of deductions) {
        if (d.challanId) challanIdSet.add(String(d.challanId));
        for (const a of d.challanAllocations || []) {
            if (a.challanId) challanIdSet.add(String(a.challanId));
        }
    }
    const challans = challanIdSet.size
        ? await TdsChallan.find({ _id: { $in: [...challanIdSet] } })
              .select('bsrCode challanSerial status challanDate amountDeposited')
              .lean()
        : [];
    const chMap = Object.fromEntries(challans.map((c) => [String(c._id), c]));

    for (const d of deductions) {
        const section = String(d.section || '').toUpperCase();
        const master = secMap[section] || {};
        const pay = d.paymentEntryId && typeof d.paymentEntryId === 'object' && d.paymentEntryId._id ? d.paymentEntryId : null;
        const payOid = pay
            ? String(pay._id)
            : d.paymentEntryId && typeof d.paymentEntryId !== 'object'
              ? String(d.paymentEntryId)
              : '';
        const refLabel = pay
            ? `Pay · ${pay.invoiceNumber || 'inv'}`
            : payOid
              ? `Pay ID …${payOid.slice(-6)}`
              : 'Manual register';
        const payableName =
            master.tdsPayableLedgerId && typeof master.tdsPayableLedgerId === 'object' && master.tdsPayableLedgerId.name
                ? master.tdsPayableLedgerId.name
                : '';
        const payableId =
            master.tdsPayableLedgerId && master.tdsPayableLedgerId._id
                ? master.tdsPayableLedgerId._id
                : master.tdsPayableLedgerId || null;
        const base = Number(d.amountPaid) || 0;
        const tdsAmt = Number(d.tdsAmount) || 0;
        const rate = base > 0 && tdsAmt > 0 ? Math.round((tdsAmt / base) * 10000) / 100 : null;

        const paidD = getDeductionChallanPaidAmount(d);
        const balD = getDeductionChallanBalance(d);
        const challanPayStatusD = challanPaymentStatus(balD, paidD);
        let challanLbl = 'Unpaid';
        if (balD <= RUPEE_EPS) {
            const lastId = d.challanAllocations?.length
                ? d.challanAllocations[d.challanAllocations.length - 1].challanId
                : d.challanId;
            const ch = lastId ? chMap[String(lastId)] : null;
            challanLbl = ch ? `Paid · ${ch.bsrCode || ''} ${ch.challanSerial || ''}`.trim() : 'Paid';
        } else if (paidD > RUPEE_EPS) {
            challanLbl = `Part paid · bal ₹${balD.toFixed(2)}`;
        }

        rows.push({
            rowKey: `deduction:${d._id}`,
            source: 'tds_deduction',
            voucherId: null,
            voucherNo: refLabel,
            voucherDate: d.paymentDate,
            voucherNature: 'Payment entry / register',
            voucherTypeName: '',
            supplierId: d.supplierId || null,
            payableLedgerId: payableId,
            supplierName: d.supplierName || '',
            deducteePan: d.deducteePan || '',
            sectionCode: section,
            sectionName: master.sectionName || '',
            expenseLedgerName: '',
            partyName: d.supplierName || '',
            grossAmount: base,
            taxableAmount: base,
            tdsRate: rate,
            tdsAmount: tdsAmt,
            netPayable: Math.round((base - tdsAmt) * 100) / 100,
            tdsPayableLedgerName: payableName,
            status: balD <= RUPEE_EPS ? 'Paid' : paidD > RUPEE_EPS ? 'Part Paid' : 'Deducted',
            skippedReason: '',
            alreadyPaidAmount: paidD,
            balancePayable: balD,
            tdsChallanPaymentStatus: challanPayStatusD,
            challanStatus: challanLbl,
            quarter: d.quarter || '',
            financialYear: d.financialYear || fy,
            deductionId: d._id,
            paymentEntryId: pay ? pay._id : d.paymentEntryId && typeof d.paymentEntryId !== 'object' ? d.paymentEntryId : null,
            challanId: d.challanId || null,
        });
    }

    rows.sort((a, b) => new Date(b.voucherDate || 0) - new Date(a.voucherDate || 0));
    return rows;
}

/**
 * Rows for TDS challan screen: same pool as deduction register, filtered for unpaid / part-paid balances.
 */
export async function listUnpaidTdsForChallan(filters = {}) {
    const fy = String(filters.financialYear || '').trim();
    if (!fy) throw new ApiError(httpStatus.BAD_REQUEST, 'financialYear query required');
    const rows = await listTdsDeductionRegister(fy);

    const from = filters.fromDate ? new Date(filters.fromDate) : null;
    if (from && !Number.isNaN(from.getTime())) from.setHours(0, 0, 0, 0);
    const to = filters.toDate ? new Date(filters.toDate) : null;
    if (to && !Number.isNaN(to.getTime())) to.setHours(23, 59, 59, 999);

    const quarter = filters.quarter ? String(filters.quarter).trim().toUpperCase() : '';
    const section = filters.section ? String(filters.section).trim().toUpperCase() : '';
    const payableId = filters.payableLedgerId ? String(filters.payableLedgerId) : '';
    const supplierId = filters.supplierId ? String(filters.supplierId) : '';
    const status = filters.status ? String(filters.status).trim() : 'UnpaidOrPart';

    return rows
        .filter((r) => {
            if (from && !Number.isNaN(from.getTime()) && new Date(r.voucherDate) < from) return false;
            if (to && !Number.isNaN(to.getTime()) && new Date(r.voucherDate) > to) return false;
            if (quarter && String(r.quarter || '').toUpperCase() !== quarter) return false;
            if (section && String(r.sectionCode || '').toUpperCase() !== section) return false;
            if (payableId) {
                const pid = r.payableLedgerId ? String(r.payableLedgerId) : '';
                if (pid !== payableId) return false;
            }
            if (supplierId) {
                const sid = r.supplierId ? String(r.supplierId) : '';
                if (sid !== supplierId) return false;
            }
            const bal = Number(r.balancePayable) || 0;
            const st = r.tdsChallanPaymentStatus;
            if (status === 'All') return true;
            if (status === 'Paid') return bal <= RUPEE_EPS;
            if (status === 'Unpaid') return bal > RUPEE_EPS && st === 'Unpaid';
            if (status === 'Part Paid') return bal > RUPEE_EPS && st === 'Part Paid';
            /* UnpaidOrPart default */
            return bal > RUPEE_EPS;
        })
        .map((r) => ({
            rowKey: r.rowKey,
            source: r.source === 'tds_deduction' ? 'deduction' : 'voucher',
            sourceId: r.source === 'tds_deduction' ? r.deductionId : r.voucherId,
            deductionDate: r.voucherDate,
            voucherNo: r.voucherNo,
            supplierName: r.supplierName,
            deducteePan: r.deducteePan,
            section: r.sectionCode,
            tdsPayableLedgerName: r.tdsPayableLedgerName,
            payableLedgerId: r.payableLedgerId,
            taxableAmount: r.taxableAmount,
            tdsAmount: r.tdsAmount,
            alreadyPaidAmount: r.alreadyPaidAmount,
            balancePayable: r.balancePayable,
            quarter: r.quarter,
            status: r.tdsChallanPaymentStatus,
            financialYear: r.financialYear,
        }));
}

async function buildAlreadyPaidError(source, doc) {
    let chId = null;
    if (source === 'deduction') {
        const all = doc.challanAllocations || [];
        chId = all.length ? all[all.length - 1].challanId : doc.challanId;
    } else {
        const all = doc.tdsChallanAllocations || [];
        chId = all.length ? all[all.length - 1].challanId : null;
    }
    if (!chId && source === 'deduction') chId = doc.challanId;
    const ch = chId ? await TdsChallan.findById(chId).select('challanSerial challanDate bsrCode').lean() : null;
    const no = ch?.challanSerial || ch?.bsrCode || '—';
    const dt = ch?.challanDate ? new Date(ch.challanDate).toLocaleDateString('en-IN') : '—';
    return new ApiError(
        httpStatus.CONFLICT,
        `This TDS deduction is already paid through Challan No. ${no} dated ${dt}.`,
    );
}

export async function createDeduction(body, userId) {
    const pan = normalizePan(body.deducteePan);
    if (!isValidPan(pan)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid PAN format (expected AAAAA9999A).');
    }
    const section = assertSection(body.section);
    const fy = String(body.financialYear || '').trim();
    if (!parseFinancialYearRange(fy)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'financialYear must be like 2025-2026');
    }
    const paymentDate = new Date(body.paymentDate);
    if (Number.isNaN(paymentDate.getTime())) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid paymentDate');
    }
    const { assertTdsDateNotLocked } = await import('./accounting/periodLock.service.js');
    await assertTdsDateNotLocked({
        date: paymentDate,
        financialYear: fy,
        adminOverride: Boolean(body.adminOverride),
        unlockReason: body.unlockReason || '',
    });
    let quarter = body.quarter;
    if (!quarter) {
        quarter = quarterForDateInFY(paymentDate, fy);
    }
    if (!['Q1', 'Q2', 'Q3', 'Q4'].includes(quarter)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'quarter must be Q1–Q4 or derivable from paymentDate within the FY');
    }

    const supplier = await Supplier.findById(body.supplierId).select('supplierName panNumber').lean();
    if (!supplier) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found');
    }

    const doc = await TdsDeduction.create({
        paymentEntryId: body.paymentEntryId || null,
        supplierId: body.supplierId,
        supplierName: supplier.supplierName || body.supplierName || '',
        deducteePan: pan,
        section,
        amountPaid: Number(body.amountPaid),
        tdsAmount: Number(body.tdsAmount),
        paymentDate,
        financialYear: fy,
        quarter,
        isNonResident: Boolean(body.isNonResident),
        notes: body.notes || '',
        createdBy: userId || null,
    });
    return doc.toObject();
}

export async function updateDeduction(id, body) {
    const d = await TdsDeduction.findById(id);
    if (!d) throw new ApiError(httpStatus.NOT_FOUND, 'TDS deduction not found');
    if (body.deducteePan != null) {
        const pan = normalizePan(body.deducteePan);
        if (!isValidPan(pan)) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid PAN');
        d.deducteePan = pan;
    }
    if (body.section != null) d.section = assertSection(body.section);
    if (body.amountPaid != null) d.amountPaid = Number(body.amountPaid);
    if (body.tdsAmount != null) d.tdsAmount = Number(body.tdsAmount);
    if (body.paymentDate != null) {
        const dt = new Date(body.paymentDate);
        if (Number.isNaN(dt.getTime())) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid paymentDate');
        d.paymentDate = dt;
    }
    if (body.financialYear != null) {
        if (!parseFinancialYearRange(body.financialYear)) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid financialYear');
        d.financialYear = body.financialYear.trim();
    }
    if (body.quarter != null) d.quarter = body.quarter;
    if (body.notes != null) d.notes = body.notes;
    if (body.challanId !== undefined) {
        if (body.challanId === null || body.challanId === '') {
            d.challanId = null;
        } else {
            const ch = await TdsChallan.findById(body.challanId);
            if (!ch) throw new ApiError(httpStatus.NOT_FOUND, 'Challan not found');
            d.challanId = ch._id;
        }
    }
    await d.save();
    return d.toObject();
}

export async function deleteDeduction(id, body = {}) {
    const d = await TdsDeduction.findById(id);
    if (!d) throw new ApiError(httpStatus.NOT_FOUND, 'TDS deduction not found');
    const { assertTdsDateNotLocked } = await import('./accounting/periodLock.service.js');
    await assertTdsDateNotLocked({
        date: d.paymentDate,
        financialYear: d.financialYear,
        adminOverride: Boolean(body.adminOverride),
        unlockReason: body.unlockReason || '',
    });
    await d.deleteOne();
    return { ok: true };
}

export async function listChallans() {
    const { listChallanRegister } = await import('./tdsChallan.service.js');
    return listChallanRegister({});
}

export async function createChallan(body, userId, companyId) {
    const { createChallan: createChallanImpl } = await import('./tdsChallan.service.js');
    return createChallanImpl(body, userId, companyId);
}

export async function linkDeductionsToChallan(challanId, deductionIds) {
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const ch = await TdsChallan.findById(challanId).session(session);
            if (!ch) throw new ApiError(httpStatus.NOT_FOUND, 'Challan not found');
            if (!Array.isArray(deductionIds) || deductionIds.length === 0) {
                throw new ApiError(httpStatus.BAD_REQUEST, 'deductionIds array required');
            }
            for (const rawId of deductionIds) {
                const doc = await TdsDeduction.findById(rawId).session(session);
                if (!doc) throw new ApiError(httpStatus.NOT_FOUND, `Deduction ${rawId} not found`);
                const bal = getDeductionChallanBalance(doc);
                if (bal <= RUPEE_EPS) throw await buildAlreadyPaidError('deduction', doc);
                await TdsDeduction.updateOne(
                    { _id: doc._id },
                    { $push: { challanAllocations: { challanId: ch._id, amount: bal } }, $set: { challanId: ch._id } },
                    { session },
                );
            }
        });
    } finally {
        await session.endSession();
    }

    const ch = await TdsChallan.findById(challanId).lean();
    const linked = await TdsDeduction.find({
        $or: [{ challanId }, { 'challanAllocations.challanId': challanId }],
    }).lean();
    const sumTds = linked.reduce((a, x) => a + (Number(x.tdsAmount) || 0), 0);
    return { challan: ch, linkedCount: linked.length, sumTdsLinked: sumTds };
}

function getDeductionPrimaryChallanId(r) {
    if (r.challanId) return r.challanId;
    const alloc = r.challanAllocations || [];
    return alloc.length ? alloc[alloc.length - 1].challanId : null;
}

export async function getDashboardSummary(financialYear) {
    const fy = String(financialYear || '').trim();
    if (!fy) throw new ApiError(httpStatus.BAD_REQUEST, 'financialYear query required');

    const base = { financialYear: fy };
    const voucherMatch = buildExpenseVoucherTdsMatch(fy);
    const vMatchReg = buildPostedVoucherTdsRegisterMatch(fy);

    const vTotalsPipeline = [
        { $match: voucherMatch },
        {
            $group: {
                _id: null,
                totalTds: { $sum: '$tdsAmount' },
                totalPaid: { $sum: voucherTdsBaseExpr },
                count: { $sum: 1 },
            },
        },
    ];
    const vBySectionPipeline = [
        { $match: voucherMatch },
        {
            $group: {
                _id: {
                    $toUpper: {
                        $trim: {
                            input: {
                                $cond: [
                                    {
                                        $or: [
                                            { $eq: [{ $ifNull: ['$tdsSection', ''] }, ''] },
                                            { $eq: ['$tdsSection', null] },
                                        ],
                                    },
                                    'OTHER',
                                    '$tdsSection',
                                ],
                            },
                        },
                    },
                },
                tds: { $sum: '$tdsAmount' },
                paid: { $sum: voucherTdsBaseExpr },
            },
        },
    ];
    const vVendorPipeline = [
        { $match: { ...voucherMatch, tdsSupplierId: { $ne: null } } },
        {
            $group: {
                _id: '$tdsSupplierId',
                totalTds: { $sum: '$tdsAmount' },
                totalPaid: { $sum: voucherTdsBaseExpr },
                unmapped: { $sum: 1 },
                partyName: { $first: '$partyName' },
            },
        },
        {
            $lookup: {
                from: Supplier.collection.collectionName,
                let: { sid: '$_id' },
                pipeline: [
                    { $match: { $expr: { $eq: ['$_id', '$$sid'] } } },
                    { $project: { supplierName: 1 } },
                    { $limit: 1 },
                ],
                as: 'sup',
            },
        },
        {
            $addFields: {
                supplierName: {
                    $cond: [
                        { $gt: [{ $size: '$sup' }, 0] },
                        { $arrayElemAt: ['$sup.supplierName', 0] },
                        '$partyName',
                    ],
                },
            },
        },
        { $project: { sup: 0, partyName: 0 } },
    ];

    const [
        totals,
        bySection,
        missingPan,
        challanAgg,
        vTotals,
        vBySection,
        vVendorRows,
        regForBalance,
        vForBalance,
        challanDepInFyArr,
    ] = await Promise.all([
        TdsDeduction.aggregate([
            { $match: base },
            {
                $group: {
                    _id: null,
                    totalTds: { $sum: '$tdsAmount' },
                    totalPaid: { $sum: '$amountPaid' },
                    count: { $sum: 1 },
                },
            },
        ]),
        TdsDeduction.aggregate([
            { $match: base },
            { $group: { _id: '$section', tds: { $sum: '$tdsAmount' }, paid: { $sum: '$amountPaid' } } },
        ]),
        TdsDeduction.countDocuments({
            ...base,
            $or: [{ deducteePan: '' }, { deducteePan: { $exists: false } }],
        }),
        TdsChallan.aggregate([
            {
                $lookup: {
                    from: TdsDeduction.collection.collectionName,
                    localField: '_id',
                    foreignField: 'challanId',
                    as: 'rows',
                },
            },
            {
                $project: {
                    amountDeposited: 1,
                    challanDate: 1,
                    status: 1,
                    linkedTds: { $sum: '$rows.tdsAmount' },
                },
            },
        ]),
        Voucher.aggregate(vTotalsPipeline),
        Voucher.aggregate(vBySectionPipeline),
        Voucher.aggregate(vVendorPipeline),
        TdsDeduction.find({ financialYear: fy })
            .select('tdsAmount challanId challanAllocations supplierId supplierName amountPaid')
            .lean(),
        Voucher.find(vMatchReg)
            .select('date financialYear tdsAmount tdsChallanAllocations tdsSupplierId partyName tdsSection')
            .limit(2500)
            .lean(),
        (async () => {
            const range = parseFinancialYearRange(fy);
            if (!range) return [];
            return TdsChallan.aggregate([
                { $match: { challanDate: { $gte: range.start, $lte: range.end } } },
                { $group: { _id: null, s: { $sum: '$amountDeposited' } } },
            ]);
        })(),
    ]);

    let pendingRegCount = 0;
    let regBalSum = 0;
    const vendorMap = new Map();
    for (const d of regForBalance) {
        const b = getDeductionChallanBalance(d);
        regBalSum += b;
        if (b > RUPEE_EPS) pendingRegCount++;
        const id = d.supplierId;
        if (id) {
            const k = String(id);
            const cur = vendorMap.get(k) || {
                _id: id,
                supplierName: d.supplierName || '',
                totalPaid: 0,
                totalTds: 0,
                unmapped: 0,
            };
            cur.totalPaid += Number(d.amountPaid) || 0;
            cur.totalTds += Number(d.tdsAmount) || 0;
            if (b > RUPEE_EPS) cur.unmapped += 1;
            if (d.supplierName && !cur.supplierName) cur.supplierName = d.supplierName;
            vendorMap.set(k, cur);
        }
    }
    const vendorRows = [...vendorMap.values()].sort((a, b) => b.totalTds - a.totalTds).slice(0, 50);

    let pendingVCount = 0;
    let vBalSum = 0;
    const vVendorPending = new Map();
    for (const v of vForBalance) {
        if (getFYFromDate(v.date) !== fy && String(v.financialYear || '').trim() !== fy) continue;
        const b = getVoucherTdsChallanBalance(v);
        vBalSum += b;
        if (b > RUPEE_EPS) pendingVCount++;
        if (v.tdsSupplierId) {
            const k = String(v.tdsSupplierId);
            vVendorPending.set(k, (vVendorPending.get(k) || 0) + (b > RUPEE_EPS ? 1 : 0));
        }
    }
    const vVendorRowsFixed = vVendorRows.map((r) => ({
        ...r,
        unmapped: vVendorPending.get(String(r._id)) || 0,
    }));

    const t = totals[0] || { totalTds: 0, totalPaid: 0, count: 0 };
    const vt = vTotals[0] || { totalTds: 0, totalPaid: 0, count: 0 };
    const challansPaid = challanAgg.filter((c) => c.status === 'Paid' || c.status === 'Matched').length;
    const challanDeposits = challanAgg.reduce((a, c) => a + (Number(c.amountDeposited) || 0), 0);
    const challanTdsDepositedInFy = Number(challanDepInFyArr[0]?.s) || 0;

    const expenseVoucherTdsCount = Number(vt.count) || 0;
    const mergedVendors = mergeTopVendors(vendorRows, vVendorRowsFixed);
    const mergedSections = mergeSectionWise(bySection, vBySection);

    return {
        financialYear: fy,
        summary: {
            totalTdsDeducted: Number(t.totalTds) + Number(vt.totalTds),
            totalBasePayments: Number(t.totalPaid) + Number(vt.totalPaid),
            deductionRows: Number(t.count) + expenseVoucherTdsCount,
            pendingChallanMappings: pendingRegCount + pendingVCount,
            tdsPayableBalance: Math.round((regBalSum + vBalSum) * 100) / 100,
            tdsDepositedViaChallansInFy: Math.round(challanTdsDepositedInFy * 100) / 100,
            invalidPanRows: missingPan,
            challansRecorded: challanAgg.length,
            challansPaidOrMatched: challansPaid,
            totalChallanDeposits: challanDeposits,
            expenseVoucherTdsCount,
            pendingRegisterRows: pendingRegCount,
            pendingVoucherTdsRows: pendingVCount,
        },
        sectionWise: mergedSections.map((r) => ({
            section: r.section,
            tds: r.tds,
            paid: r.paid,
        })),
        topVendors: mergedVendors.map((r) => ({
            supplierId: r._id,
            supplierName: r.supplierName,
            totalPaid: r.totalPaid,
            totalTds: r.totalTds,
            rowsPendingChallan: r.unmapped,
        })),
        alerts: buildAlerts({ unmapped: pendingRegCount, missingPan, fy, expenseVoucherTdsCount: pendingVCount }),
    };
}

function buildAlerts({ unmapped, missingPan, fy, expenseVoucherTdsCount = 0 }) {
    const list = [];
    const regUnmapped = unmapped || 0;
    const vCount = expenseVoucherTdsCount || 0;
    if (regUnmapped > 0) list.push(`${regUnmapped} TDS compliance row(s) in ${fy} have balance pending challan deposit.`);
    if (vCount > 0)
        list.push(`${vCount} posted voucher(s) with TDS in ${fy} still have balance pending challan deposit.`);
    if (missingPan > 0) list.push(`${missingPan} row(s) have empty PAN — fix before filing.`);
    list.push('Verify return due dates for the quarter with your CA.');
    return list;
}

export async function previewReturn({ returnType, financialYear, quarter }) {
    const fy = String(financialYear || '').trim();
    if (!parseFinancialYearRange(fy)) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid financialYear');
    if (!['Q1', 'Q2', 'Q3', 'Q4'].includes(quarter)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid quarter');
    }
    const q = { financialYear: fy, quarter };
    if (returnType === '27Q') q.isNonResident = true;
    if (returnType === '26Q') q.isNonResident = { $ne: true };
    if (returnType === '24Q') {
        return {
            rows: [],
            validationErrors: ['24Q (salary) is not wired to payroll in this phase — use manual export when ready.'],
            assessmentYear: assessmentYearFromFinancialYear(fy),
        };
    }

    const rows = await TdsDeduction.find(q).sort({ paymentDate: 1 }).lean();
    const validationErrors = [];
    for (const r of rows) {
        if (!isValidPan(r.deducteePan)) validationErrors.push(`Invalid PAN for row ${r._id}`);
        if (getDeductionChallanBalance(r) > RUPEE_EPS) {
            validationErrors.push(`Challan not fully paid for deduction ${r._id} (${r.supplierName})`);
        }
        if (!getDeductionPrimaryChallanId(r)) validationErrors.push(`Challan not mapped for deduction ${r._id} (${r.supplierName})`);
    }
    return {
        rows,
        validationErrors,
        assessmentYear: assessmentYearFromFinancialYear(fy),
    };
}

function rowToCsvLine(r, challanMap) {
    const chId = getDeductionPrimaryChallanId(r);
    const ch = chId ? challanMap.get(String(chId)) : null;
    const esc = (v) => {
        const s = String(v ?? '');
        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
    };
    return [
        esc(r.deducteePan),
        esc(r.supplierName),
        esc(r.section),
        esc(new Date(r.paymentDate).toISOString().slice(0, 10)),
        esc(r.amountPaid),
        esc(r.tdsAmount),
        esc(ch?.bsrCode || ''),
        esc(ch?.challanSerial || ''),
        ch ? esc(new Date(ch.challanDate).toISOString().slice(0, 10)) : '',
    ].join(',');
}

export async function exportReturn({ returnType, financialYear, quarter, userId }) {
    const preview = await previewReturn({ returnType, financialYear, quarter });
    if (preview.validationErrors.length > 0) {
        const ret = await TdsReturn.create({
            returnType,
            financialYear,
            quarter,
            assessmentYear: assessmentYearFromFinancialYear(financialYear),
            status: 'draft',
            deductionIds: preview.rows.map((r) => r._id),
            validationErrors: preview.validationErrors,
            exportCsv: '',
            createdBy: userId || null,
        });
        return { returnRecord: ret.toObject(), validationErrors: preview.validationErrors, exportCsv: null };
    }

    const challanIds = [...new Set(preview.rows.map((r) => getDeductionPrimaryChallanId(r)).filter(Boolean).map(String))];
    const challans = await TdsChallan.find({ _id: { $in: challanIds } }).lean();
    const challanMap = new Map(challans.map((c) => [String(c._id), c]));

    const header = 'deductee_pan,deductee_name,section,payment_date,amount_paid,tds_amount,bsr_code,challan_serial,challan_date';
    const lines = preview.rows.map((r) => rowToCsvLine(r, challanMap));
    const exportCsv = [header, ...lines].join('\n');

    const ret = await TdsReturn.create({
        returnType,
        financialYear,
        quarter,
        assessmentYear: assessmentYearFromFinancialYear(financialYear),
        status: 'exported',
        deductionIds: preview.rows.map((r) => r._id),
        validationErrors: [],
        exportCsv,
        createdBy: userId || null,
    });
    return { returnRecord: ret.toObject(), validationErrors: [], exportCsv };
}

export async function listReturns() {
    const rows = await TdsReturn.find().sort({ createdAt: -1 }).limit(100).lean();
    return rows.map((r) => ({
        ...r,
        assessmentYear: r.assessmentYear || assessmentYearFromFinancialYear(r.financialYear),
    }));
}

export async function issueForm16a({ supplierId, financialYear, quarter, userId }) {
    const fy = String(financialYear || '').trim();
    if (!['Q1', 'Q2', 'Q3', 'Q4'].includes(quarter)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid quarter');
    }
    const supplier = await Supplier.findById(supplierId).lean();
    if (!supplier) throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found');
    const pan = normalizePan(supplier.panNumber || '');
    if (!isValidPan(pan)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Supplier PAN is missing or invalid; update Supplier Master first.');
    }

    const rows = await TdsDeduction.find({
        supplierId,
        financialYear: fy,
        quarter,
    }).lean();

    if (rows.length === 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'No TDS deductions for this vendor / period.');
    }

    const totalAmountPaid = rows.reduce((a, r) => a + (Number(r.amountPaid) || 0), 0);
    const totalTdsDeducted = rows.reduce((a, r) => a + (Number(r.tdsAmount) || 0), 0);
    const ay = assessmentYearFromFinancialYear(fy);

    const existing = await TdsForm16a.findOne({ supplierId, financialYear: fy, quarter });
    if (existing) {
        throw new ApiError(
            httpStatus.CONFLICT,
            'Form 16A already issued for this vendor and quarter.',
        );
    }

    const cert = await TdsForm16a.create({
        supplierId,
        supplierName: supplier.supplierName,
        deducteePan: pan,
        financialYear: fy,
        assessmentYear: ay || '',
        quarter,
        totalAmountPaid,
        totalTdsDeducted,
        deductionIds: rows.map((r) => r._id),
        certificateNo: '',
        issuedBy: userId || null,
    });
    return cert.toObject();
}

export async function listForm16a() {
    const rows = await TdsForm16a.find().sort({ createdAt: -1 }).limit(100).lean();
    return rows.map((r) => ({
        ...r,
        assessmentYear: r.assessmentYear || assessmentYearFromFinancialYear(r.financialYear),
    }));
}

export async function getForm16aPdfData(certificateId) {
    const cert = await TdsForm16a.findById(certificateId).lean();
    if (!cert) throw new ApiError(httpStatus.NOT_FOUND, 'Certificate not found');
    const deductions = await TdsDeduction.find({ _id: { $in: cert.deductionIds || [] } })
        .sort({ paymentDate: 1 })
        .lean();
    const certificate = {
        ...cert,
        assessmentYear: cert.assessmentYear || assessmentYearFromFinancialYear(cert.financialYear),
    };
    return { certificate, deductions };
}

/**
 * Build a TdsDeduction row from a purchase PaymentEntry (idempotent if already linked).
 * Uses optional TDS fields stored on the payment when present; otherwise overrides from body.
 */
export async function createDeductionFromPaymentEntry(paymentEntryId, overrides = {}, userId) {
    if (!mongoose.Types.ObjectId.isValid(paymentEntryId)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid payment entry id');
    }
    const existing = await TdsDeduction.findOne({ paymentEntryId }).lean();
    if (existing) {
        return { ...existing, _alreadyLinked: true };
    }

    const payment = await PaymentEntry.findById(paymentEntryId).lean();
    if (!payment) throw new ApiError(httpStatus.NOT_FOUND, 'Payment entry not found');
    if (payment.paymentStatus === 'Failed') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot link TDS to a failed payment');
    }

    const supplierId = payment.supplierId;
    if (!supplierId) throw new ApiError(httpStatus.BAD_REQUEST, 'Payment has no supplier');

    const supplier = await Supplier.findById(supplierId).select('supplierName panNumber').lean();
    if (!supplier) throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found');

    const sectionSource = overrides.section ?? payment.tdsSection;
    if (!sectionSource) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'TDS section is required (save on payment or pass in request body)');
    }
    const section = assertSection(sectionSource);

    const tdsAmount = Number(overrides.tdsAmount ?? payment.tdsAmount ?? 0);
    if (!(tdsAmount > 0)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'TDS amount must be > 0 (save on payment or pass in request body)');
    }

    const amountPaid = Number(overrides.amountPaid ?? payment.tdsBaseAmount ?? payment.amountPaid ?? 0);
    if (!(amountPaid > 0)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Base / gross amount must be > 0');
    }

    const pan = normalizePan(overrides.deducteePan || payment.tdsDeducteePan || supplier.panNumber || '');
    if (!isValidPan(pan)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Valid PAN required — update Supplier Master or pass deducteePan override');
    }

    const fy = String(overrides.financialYear || payment.financialYear || '').trim();
    if (!parseFinancialYearRange(fy)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Valid financialYear required on payment or in request body');
    }

    const paymentDate = new Date(overrides.paymentDate || payment.paymentDate);
    let quarter = overrides.quarter;
    if (!quarter) quarter = quarterForDateInFY(paymentDate, fy);
    if (!['Q1', 'Q2', 'Q3', 'Q4'].includes(quarter)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot derive quarter from payment date — pass quarter in request body');
    }

    const doc = await TdsDeduction.create({
        paymentEntryId: payment._id,
        supplierId,
        supplierName: payment.supplierName || supplier.supplierName || '',
        deducteePan: pan,
        section,
        amountPaid,
        tdsAmount,
        paymentDate,
        financialYear: fy,
        quarter,
        isNonResident: Boolean(overrides.isNonResident ?? payment.tdsIsNonResident ?? false),
        notes:
            overrides.notes ||
            (payment.notes ? `Payment ${payment._id}: ${payment.notes}` : `Linked from payment ${payment._id}`),
        createdBy: userId || null,
    });
    return doc.toObject();
}
