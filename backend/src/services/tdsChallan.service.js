import mongoose from 'mongoose';
import httpStatus from 'http-status';
import { TdsChallan } from '../models/tdsChallan.model.js';
import { TdsDeduction } from '../models/tdsDeduction.model.js';
import { Voucher } from '../models/voucher.model.js';
import { Company } from '../models/company.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { VoucherType } from '../models/voucherType.model.js';
import { ApiError } from '../utils/ApiError.js';
import { getFYFromDate, getShortFY } from '../utils/fyUtils.js';
import { getNextVoucherNo } from '../utils/voucherUtils.js';
import { postLedgerEntry } from '../utils/ledgerDispatcher.js';
import {
    assessmentYearFromFinancialYear,
    parseFinancialYearRange,
    quarterForDateInFY,
} from '../constants/tds.constants.js';
import { TdsMasterSection } from '../models/tdsMasterSection.model.js';
import * as tdsThreshold from './tdsThreshold.service.js';

const RUPEE_EPS = 0.02;

function sumChallanAllocations(alloc) {
    return (alloc || []).reduce((a, x) => a + (Number(x.amount) || 0), 0);
}

function getDeductionChallanPaidAmount(doc) {
    const tds = Number(doc.tdsAmount) || 0;
    let paid = sumChallanAllocations(doc.challanAllocations);
    if (paid <= RUPEE_EPS && doc.challanId) {
        const hasAlloc = Array.isArray(doc.challanAllocations) && doc.challanAllocations.length > 0;
        if (!hasAlloc) paid = tds;
    }
    return Math.round(paid * 100) / 100;
}

function getDeductionChallanBalance(doc) {
    const tds = Number(doc.tdsAmount) || 0;
    return Math.max(0, Math.round((tds - getDeductionChallanPaidAmount(doc)) * 100) / 100);
}

function getVoucherTdsChallanPaidAmount(v) {
    return Math.round(sumChallanAllocations(v.tdsChallanAllocations) * 100) / 100;
}

function getVoucherTdsChallanBalance(v) {
    const tds = Number(v.tdsAmount) || 0;
    return Math.max(0, Math.round((tds - getVoucherTdsChallanPaidAmount(v)) * 100) / 100);
}

const IT_EPAY_TAX_URL = 'https://www.incometax.gov.in/iec/foportal/help/e-pay-tax';

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
    const ch = chId ? await TdsChallan.findById(chId).select('challanNo challanSerial challanDate bsrCode').lean() : null;
    const no = ch?.challanNo || ch?.challanSerial || ch?.bsrCode || '—';
    const dt = ch?.challanDate ? new Date(ch.challanDate).toLocaleDateString('en-IN') : '—';
    return new ApiError(
        httpStatus.CONFLICT,
        `This TDS deduction is already paid through Challan No. ${no} dated ${dt}.`,
    );
}

export function getIncomeTaxEPayTaxUrl() {
    return IT_EPAY_TAX_URL;
}

export async function generateChallanNo(financialYear, companyId) {
    const fy = String(financialYear || '').trim();
    const short = getShortFY(fy) || fy.replace(/\d{4}-/g, '').slice(0, 5);
    const prefix = `TDS/${short}/`;
    const q = { challanNo: new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) };
    if (companyId) q.companyId = companyId;
    const last = await TdsChallan.findOne(q).sort({ challanNo: -1 }).select('challanNo').lean();
    let seq = 1;
    if (last?.challanNo) {
        const m = String(last.challanNo).match(/(\d+)$/);
        if (m) seq = parseInt(m[1], 10) + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
}

export async function resolveLineItemFromAllocation(raw, session) {
    const src = String(raw.source || '').toLowerCase();
    const id = raw.id || raw.sourceId;
    const amt = Math.round((Number(raw.amount) || 0) * 100) / 100;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Invalid allocation id: ${id}`);
    }
    if (amt <= RUPEE_EPS) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Each allocation must be a positive amount');
    }

    if (src === 'deduction') {
        const doc = await TdsDeduction.findById(id).session(session);
        if (!doc) throw new ApiError(httpStatus.NOT_FOUND, `TDS deduction ${id} not found`);
        const balance = getDeductionChallanBalance(doc);
        if (balance <= RUPEE_EPS) throw await buildAlreadyPaidError('deduction', doc);
        if (amt > balance + RUPEE_EPS) {
            throw new ApiError(httpStatus.BAD_REQUEST, `Amount Rs.${amt.toFixed(2)} exceeds balance Rs.${balance.toFixed(2)}`);
        }
        const master = await TdsMasterSection.findOne({ sectionCode: String(doc.section || '').toUpperCase() })
            .populate('tdsPayableLedgerId', 'name')
            .lean();
        return {
            src: 'deduction',
            id: doc._id,
            line: {
                source: 'deduction',
                sourceId: doc._id,
                rowKey: `deduction:${doc._id}`,
                deductionDate: doc.paymentDate,
                voucherNo: doc.paymentEntryId ? `Pay # ${String(doc.paymentEntryId).slice(-6)}` : 'Register',
                supplierName: doc.supplierName || '',
                deducteePan: doc.deducteePan || '',
                section: String(doc.section || '').toUpperCase(),
                payableLedgerId: master?.tdsPayableLedgerId?._id || master?.tdsPayableLedgerId || null,
                payableLedgerName: master?.tdsPayableLedgerId?.name || '',
                taxableAmount: Number(doc.amountPaid) || 0,
                tdsAmount: Number(doc.tdsAmount) || 0,
                alreadyPaidAmount: Number(doc.tdsAmount) - balance,
                balanceBefore: balance,
                payAmount: amt,
                quarter: doc.quarter || '',
            },
            amt,
        };
    }

    if (src === 'voucher') {
        const doc = await Voucher.findById(id).session(session);
        if (!doc) throw new ApiError(httpStatus.NOT_FOUND, `Voucher ${id} not found`);
        const balance = getVoucherTdsChallanBalance(doc);
        if (balance <= RUPEE_EPS) throw await buildAlreadyPaidError('voucher', doc);
        if (amt > balance + RUPEE_EPS) {
            throw new ApiError(httpStatus.BAD_REQUEST, `Amount Rs.${amt.toFixed(2)} exceeds balance Rs.${balance.toFixed(2)}`);
        }
        const section = String(doc.tdsSection || '').toUpperCase();
        const master = await TdsMasterSection.findOne({ sectionCode: section }).populate('tdsPayableLedgerId', 'name').lean();
        const base =
            Number(doc.tdsThresholdBaseAmount) > 0
                ? Number(doc.tdsThresholdBaseAmount)
                : Number(doc.totalTaxableAmount || doc.grandTotal || doc.totalAmount || 0);
        const fy = String(doc.financialYear || '').trim() || getFYFromDate(doc.date);
        const q = quarterForDateInFY(doc.date, fy) || '';
        return {
            src: 'voucher',
            id: doc._id,
            line: {
                source: 'voucher',
                sourceId: doc._id,
                rowKey: `voucher:${doc._id}`,
                deductionDate: doc.date,
                voucherNo: doc.voucherNo || '',
                supplierName: doc.partyName || '',
                deducteePan: '',
                section,
                payableLedgerId: doc.tdsPayableLedgerId || master?.tdsPayableLedgerId?._id || null,
                payableLedgerName: master?.tdsPayableLedgerId?.name || '',
                taxableAmount: base,
                tdsAmount: Number(doc.tdsAmount) || 0,
                alreadyPaidAmount: Number(doc.tdsAmount) - balance,
                balanceBefore: balance,
                payAmount: amt,
                quarter: q,
            },
            amt,
        };
    }

    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid allocation source "${raw.source}"`);
}

function buildSectionSummary(lineItems) {
    const map = new Map();
    for (const li of lineItems) {
        const sec = li.section || 'OTHER';
        const cur = map.get(sec) || { section: sec, taxableTotal: 0, tdsTotal: 0, paidTotal: 0 };
        cur.taxableTotal += Number(li.taxableAmount) || 0;
        cur.tdsTotal += Number(li.tdsAmount) || 0;
        cur.paidTotal += Number(li.payAmount) || 0;
        map.set(sec, cur);
    }
    return [...map.values()];
}

function derivePeriodAndQuarter(lineItems) {
    let minD = null;
    let maxD = null;
    const quarters = new Set();
    for (const li of lineItems) {
        const d = li.deductionDate ? new Date(li.deductionDate) : null;
        if (d && !Number.isNaN(d.getTime())) {
            if (!minD || d < minD) minD = d;
            if (!maxD || d > maxD) maxD = d;
        }
        if (li.quarter) quarters.add(li.quarter);
    }
    const primaryQuarter = quarters.size === 1 ? [...quarters][0] : [...quarters].sort().join(', ');
    return { periodFrom: minD, periodTo: maxD, primaryQuarter };
}

async function validateDuplicateGovtRef(companyId, fy, bsrCode, challanSerial, excludeId) {
    const bsr = String(bsrCode || '').trim();
    const serial = String(challanSerial || '').trim();
    if (!bsr || !serial) return;
    const q = {
        financialYear: fy,
        bsrCode: bsr,
        challanSerial: serial,
        status: { $in: ['Paid', 'Part Paid', 'Generated'] },
    };
    if (companyId) q.companyId = companyId;
    if (excludeId) q._id = { $ne: excludeId };
    const dup = await TdsChallan.findOne(q).select('challanNo').lean();
    if (dup) {
        throw new ApiError(
            httpStatus.CONFLICT,
            `Duplicate BSR + Challan serial for this FY (existing ${dup.challanNo}).`,
        );
    }
}

async function applyAllocations(challanId, normalized, session) {
    for (const n of normalized) {
        if (n.src === 'deduction') {
            await TdsDeduction.updateOne(
                { _id: n.id },
                { $push: { challanAllocations: { challanId, amount: n.amt } }, $set: { challanId } },
                { session },
            );
        } else {
            await Voucher.updateOne(
                { _id: n.id },
                { $push: { tdsChallanAllocations: { challanId, amount: n.amt } } },
                { session },
            );
        }
    }
}

async function postChallanAccounting(challan, userId, session) {
    if (challan.accountingPosted && challan.paymentVoucherId) {
        return challan.paymentVoucherId;
    }
    const bankLedgerId = challan.bankLedgerId;
    if (!bankLedgerId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Bank ledger is required to post accounting entry');
    }
    const paid = Number(challan.amountDeposited) || 0;
    if (paid <= RUPEE_EPS) return null;

    const vType =
        (await VoucherType.findOne({ name: /journal/i, isActive: { $ne: false } }).session(session)) ||
        (await VoucherType.findOne().session(session));
    if (!vType) throw new ApiError(httpStatus.BAD_REQUEST, 'No voucher type configured for TDS payment JV');

    const date = challan.challanDate || new Date();
    const fy = challan.financialYear || getFYFromDate(date);
    const voucherNo = await getNextVoucherNo(vType._id, date, session);

    const sectionTotals = new Map();
    for (const li of challan.lineItems || []) {
        const sec = li.section || 'OTHER';
        const cur = sectionTotals.get(sec) || { amount: 0, ledgerId: li.payableLedgerId };
        cur.amount += Number(li.payAmount) || 0;
        if (li.payableLedgerId) cur.ledgerId = li.payableLedgerId;
        sectionTotals.set(sec, cur);
    }

    const items = [];
    for (const [, v] of sectionTotals) {
        if (v.amount <= RUPEE_EPS) continue;
        let ledgerId = v.ledgerId;
        if (!ledgerId) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'TDS payable ledger missing for a section in this challan');
        }
        items.push({ ledgerId, amount: Math.round(v.amount * 100) / 100, type: 'Debit' });
    }

    const voucher = await Voucher.create(
        [
            {
                voucherNo,
                voucherType: vType._id,
                voucherTypeName: vType.name,
                nature: 'Journal',
                date,
                financialYear: fy,
                totalAmount: paid,
                narration: `TDS Challan ${challan.challanNo} payment`,
                status: 'Confirmed',
                isSystemGenerated: true,
                items: items.map((i) => ({
                    ledgerId: i.ledgerId,
                    amount: i.amount,
                    type: i.type,
                    narration: `TDS deposited — ${challan.challanNo}`,
                })),
                createdBy: userId || null,
            },
        ],
        { session },
    );
    const vch = voucher[0];

    for (const item of items) {
        await postLedgerEntry(
            {
                voucherId: vch._id,
                voucherNo,
                date,
                ledgerId: item.ledgerId,
                amount: item.amount,
                type: 'Debit',
                narration: `TDS Challan ${challan.challanNo}`,
                financialYear: fy,
            },
            session,
        );
    }
    await postLedgerEntry(
        {
            voucherId: vch._id,
            voucherNo,
            date,
            ledgerId: bankLedgerId,
            amount: paid,
            type: 'Credit',
            narration: `TDS Challan ${challan.challanNo} — bank`,
            financialYear: fy,
        },
        session,
    );

    await TdsChallan.updateOne(
        { _id: challan._id },
        { $set: { paymentVoucherId: vch._id, accountingPosted: true } },
        { session },
    );
    return vch._id;
}

function normalizeSaveStatus(body) {
    const s = String(body.status || body.saveMode || 'Draft').trim();
    if (s === 'paid' || s === 'Paid') return 'Paid';
    if (s === 'generated' || s === 'Generated') return 'Generated';
    if (s === 'draft' || s === 'Draft') return 'Draft';
    if (['Paid', 'Part Paid', 'Draft', 'Generated', 'Cancelled'].includes(s)) return s;
    return 'Draft';
}

function requiresGovtPaymentFields(status) {
    return status === 'Paid' || status === 'Part Paid';
}

export async function createChallan(body, userId, companyId) {
    const allocations = body.allocations;
    if (!Array.isArray(allocations) || allocations.length === 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Select at least one unpaid TDS row');
    }

    const status = normalizeSaveStatus(body);
    const session = await mongoose.startSession();
    let created;
    try {
        await session.withTransaction(async () => {
            const normalized = [];
            const lineItems = [];
            let sumAlloc = 0;
            for (const raw of allocations) {
                const resolved = await resolveLineItemFromAllocation(raw, session);
                normalized.push({ src: resolved.src, id: resolved.id, amt: resolved.amt });
                lineItems.push(resolved.line);
                sumAlloc += resolved.amt;
            }

            const challanDate = new Date(body.challanDate);
            if (Number.isNaN(challanDate.getTime())) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid challanDate');

            let fySave = String(body.financialYear || '').trim();
            if (!parseFinancialYearRange(fySave)) fySave = getFYFromDate(challanDate);
            const expectedAY = assessmentYearFromFinancialYear(fySave);
            const finalAY = String(body.assessmentYear || '').trim() || expectedAY;
            const overrideReason = String(body.assessmentYearOverrideReason || '').trim();
            if (finalAY !== expectedAY && overrideReason.length < 8) {
                throw new ApiError(
                    httpStatus.BAD_REQUEST,
                    `Assessment Year must be ${expectedAY} or provide override reason (8+ chars).`,
                );
            }

            const amountDeposited = Math.round((Number(body.amountDeposited) || sumAlloc) * 100) / 100;
            if (Math.abs(amountDeposited - sumAlloc) > RUPEE_EPS) {
                throw new ApiError(
                    httpStatus.BAD_REQUEST,
                    `Amount deposited must equal sum of Pay now (Rs.${sumAlloc.toFixed(2)}).`,
                );
            }

            if (requiresGovtPaymentFields(status)) {
                if (!String(body.bsrCode || '').trim()) throw new ApiError(httpStatus.BAD_REQUEST, 'BSR code required when marking Paid');
                if (!String(body.challanSerial || '').trim() && !String(body.cinNumber || '').trim()) {
                    throw new ApiError(httpStatus.BAD_REQUEST, 'Challan serial or CIN required when marking Paid');
                }
                if (!String(body.bankName || '').trim()) throw new ApiError(httpStatus.BAD_REQUEST, 'Bank name required when marking Paid');
                await validateDuplicateGovtRef(companyId, fySave, body.bsrCode, body.challanSerial || body.cinNumber);
            }

            const { periodFrom, periodTo, primaryQuarter } = derivePeriodAndQuarter(lineItems);
            const totalTds = lineItems.reduce((a, x) => a + (Number(x.tdsAmount) || 0), 0);
            const totalTaxable = lineItems.reduce((a, x) => a + (Number(x.taxableAmount) || 0), 0);
            const balanceAmount = Math.max(0, Math.round((totalTds - amountDeposited) * 100) / 100);
            const finalStatus =
                status === 'Paid' && balanceAmount > RUPEE_EPS ? 'Part Paid' : status === 'Paid' ? 'Paid' : status;

            const challanNo = await generateChallanNo(fySave, companyId);
            const interest = Math.round((Number(body.interest) || 0) * 100) / 100;
            const lateFee = Math.round((Number(body.lateFee) || 0) * 100) / 100;
            const penalty = Math.round((Number(body.penalty) || 0) * 100) / 100;
            const totalPaidAmount =
                body.totalPaidAmount != null && body.totalPaidAmount !== ''
                    ? Math.round((Number(body.totalPaidAmount) || 0) * 100) / 100
                    : Math.round((amountDeposited + interest + lateFee + penalty) * 100) / 100;

            const docs = await TdsChallan.create(
                [
                    {
                        challanNo,
                        companyId: companyId || undefined,
                        bsrCode: body.bsrCode || '',
                        challanSerial: body.challanSerial || '',
                        bankName: body.bankName || '',
                        challanDate,
                        periodFrom: body.periodFrom ? new Date(body.periodFrom) : periodFrom,
                        periodTo: body.periodTo ? new Date(body.periodTo) : periodTo,
                        amountDeposited,
                        interest,
                        lateFee,
                        penalty,
                        totalPaidAmount,
                        totalTaxableAmount: totalTaxable,
                        totalTdsAmount: totalTds,
                        balanceAmount,
                        financialYear: fySave,
                        primaryQuarter: body.primaryQuarter || primaryQuarter,
                        assessmentYear: finalAY,
                        assessmentYearOverrideReason: finalAY !== expectedAY ? overrideReason : '',
                        cinNumber: body.cinNumber || '',
                        paymentMode: body.paymentMode || '',
                        status: finalStatus,
                        remarks: body.remarks || '',
                        lineItems,
                        sectionWiseSummary: buildSectionSummary(lineItems),
                        receiptFileUrl: body.receiptFileUrl || '',
                        bankLedgerId: body.bankLedgerId || null,
                        createdBy: userId || null,
                        paidBy: requiresGovtPaymentFields(finalStatus) ? userId : null,
                        paidAt: requiresGovtPaymentFields(finalStatus) ? new Date() : null,
                    },
                ],
                { session },
            );
            created = docs[0];

            if (requiresGovtPaymentFields(finalStatus)) {
                await applyAllocations(created._id, normalized, session);
                if (body.postAccounting !== false && body.bankLedgerId) {
                    await postChallanAccounting(created.toObject(), userId, session);
                }
            }

            await tdsThreshold.logTdsAudit({
                action: 'CHALLAN_CREATE',
                financialYear: fySave,
                userId,
                details: { challanId: created._id, challanNo, status: finalStatus, amountDeposited },
            });
        });
    } finally {
        await session.endSession();
    }
    return created.toObject();
}

export async function markChallanPaid(challanId, body, userId, companyId) {
    const session = await mongoose.startSession();
    let updated;
    try {
        await session.withTransaction(async () => {
            const ch = await TdsChallan.findById(challanId).session(session);
            if (!ch) throw new ApiError(httpStatus.NOT_FOUND, 'Challan not found');
            if (ch.status === 'Cancelled') throw new ApiError(httpStatus.BAD_REQUEST, 'Cancelled challan cannot be paid');
            if (ch.status === 'Paid') throw new ApiError(httpStatus.BAD_REQUEST, 'Challan is already marked paid');
            if (ch.accountingPosted) {
                throw new ApiError(httpStatus.CONFLICT, 'Accounting already posted; edit linked voucher manually if needed');
            }

            const bsr = body.bsrCode != null ? body.bsrCode : ch.bsrCode;
            const serial = body.challanSerial != null ? body.challanSerial : ch.challanSerial;
            const cin = body.cinNumber != null ? body.cinNumber : ch.cinNumber;
            if (!String(bsr || '').trim()) throw new ApiError(httpStatus.BAD_REQUEST, 'BSR code required');
            if (!String(serial || '').trim() && !String(cin || '').trim()) {
                throw new ApiError(httpStatus.BAD_REQUEST, 'Challan serial or CIN required');
            }
            if (!String(body.bankName != null ? body.bankName : ch.bankName).trim()) {
                throw new ApiError(httpStatus.BAD_REQUEST, 'Bank name required');
            }

            await validateDuplicateGovtRef(companyId || ch.companyId, ch.financialYear, bsr, serial || cin, ch._id);

            const paidAmt = Math.round((Number(body.amountDeposited ?? ch.amountDeposited) || 0) * 100) / 100;
            ch.bsrCode = String(bsr || '').trim();
            ch.challanSerial = String(serial || '').trim();
            ch.cinNumber = String(cin || '').trim();
            ch.bankName = String(body.bankName != null ? body.bankName : ch.bankName).trim();
            if (body.challanDate) ch.challanDate = new Date(body.challanDate);
            ch.amountDeposited = paidAmt;
            ch.paymentMode = body.paymentMode || ch.paymentMode;
            ch.remarks = body.remarks != null ? body.remarks : ch.remarks;
            ch.receiptFileUrl = body.receiptFileUrl || ch.receiptFileUrl;
            ch.bankLedgerId = body.bankLedgerId || ch.bankLedgerId;
            const totalTds = Number(ch.totalTdsAmount) || ch.lineItems?.reduce((a, x) => a + (Number(x.tdsAmount) || 0), 0);
            ch.balanceAmount = Math.max(0, Math.round((totalTds - paidAmt) * 100) / 100);
            ch.status = ch.balanceAmount > RUPEE_EPS ? 'Part Paid' : 'Paid';
            ch.paidBy = userId;
            ch.paidAt = new Date();
            await ch.save({ session });

            const normalized = (ch.lineItems || []).map((li) => ({
                src: li.source,
                id: li.sourceId,
                amt: Number(li.payAmount) || 0,
            }));
            await applyAllocations(ch._id, normalized, session);

            if (body.bankLedgerId) {
                await postChallanAccounting(ch.toObject(), userId, session);
            }

            updated = ch.toObject();
            await tdsThreshold.logTdsAudit({
                action: 'CHALLAN_MARK_PAID',
                financialYear: ch.financialYear,
                userId,
                details: { challanId: ch._id, challanNo: ch.challanNo },
            });
        });
    } finally {
        await session.endSession();
    }
    return updated;
}

export async function getChallanDetail(challanId) {
    const ch = await TdsChallan.findById(challanId).lean();
    if (!ch) throw new ApiError(httpStatus.NOT_FOUND, 'Challan not found');
    const fy = ch.financialYear || getFYFromDate(ch.challanDate);
    return {
        ...ch,
        displayFinancialYear: fy,
        displayAssessmentYear: ch.assessmentYear || assessmentYearFromFinancialYear(fy),
    };
}

export async function listChallanRegister(filters = {}) {
    const q = {};
    if (filters.financialYear) q.financialYear = String(filters.financialYear).trim();
    if (filters.assessmentYear) q.assessmentYear = String(filters.assessmentYear).trim();
    if (filters.quarter) q.primaryQuarter = new RegExp(filters.quarter, 'i');
    if (filters.status) q.status = filters.status;
    if (filters.challanNo) q.challanNo = new RegExp(filters.challanNo.trim(), 'i');
    if (filters.bsrCode) q.bsrCode = new RegExp(filters.bsrCode.trim(), 'i');
    if (filters.cinNumber) q.cinNumber = new RegExp(filters.cinNumber.trim(), 'i');
    if (filters.fromDate || filters.toDate) {
        q.challanDate = {};
        if (filters.fromDate) q.challanDate.$gte = new Date(filters.fromDate);
        if (filters.toDate) {
            const t = new Date(filters.toDate);
            t.setHours(23, 59, 59, 999);
            q.challanDate.$lte = t;
        }
    }
    if (filters.section) {
        q['lineItems.section'] = String(filters.section).toUpperCase();
    }
    if (filters.supplierName) {
        q['lineItems.supplierName'] = new RegExp(filters.supplierName.trim(), 'i');
    }

    const rows = await TdsChallan.find(q).sort({ challanDate: -1, challanNo: -1 }).limit(500).lean();
    return rows.map((r) => {
        const fy = r.financialYear || getFYFromDate(r.challanDate);
        return {
            ...r,
            displayFinancialYear: fy,
            displayAssessmentYear: r.assessmentYear || assessmentYearFromFinancialYear(fy),
            paidAmount: Number(r.amountDeposited) || 0,
        };
    });
}

export async function listChallans() {
    return listChallanRegister({});
}

export async function getChallanPdfContext(challanId, companyId) {
    const ch = await getChallanDetail(challanId);
    const company = companyId ? await Company.findById(companyId).lean() : null;
    return { challan: ch, company };
}
