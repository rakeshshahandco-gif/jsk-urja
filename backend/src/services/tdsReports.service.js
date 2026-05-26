import mongoose from 'mongoose';
import { TdsDeduction } from '../models/tdsDeduction.model.js';
import { TdsChallan } from '../models/tdsChallan.model.js';
import { TdsVendorSectionBalance } from '../models/tdsVendorSectionBalance.model.js';
import { PaymentEntry } from '../models/paymentEntry.model.js';
import { Supplier } from '../models/supplier.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { TdsMasterSection } from '../models/tdsMasterSection.model.js';
import { isValidPan, normalizePan } from '../constants/tds.constants.js';
import { getThresholdTrackingReport } from './tdsThreshold.service.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export async function getPayableReport(financialYear) {
    const fy = String(financialYear || '').trim();
    const match = fy ? { financialYear: fy } : {};
    const rows = await TdsDeduction.aggregate([
        { $match: match },
        {
            $group: {
                _id: { section: '$section', quarter: '$quarter', challanPaid: { $cond: [{ $ifNull: ['$challanId', false] }, 'paid', 'unpaid'] } },
                totalTds: { $sum: '$tdsAmount' },
                count: { $sum: 1 },
            },
        },
        { $sort: { '_id.section': 1, '_id.quarter': 1 } },
    ]);
    return rows.map((r) => ({
        section: r._id.section,
        quarter: r._id.quarter,
        status: r._id.challanPaid,
        totalTds: r2(r.totalTds),
        count: r.count,
    }));
}

export async function getSectionWiseSummary(financialYear) {
    const fy = String(financialYear || '').trim();
    const match = fy ? { financialYear: fy } : {};
    return TdsDeduction.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$section',
                totalPaid: { $sum: '$amountPaid' },
                totalTds: { $sum: '$tdsAmount' },
                deducteeCount: { $addToSet: '$supplierId' },
                paidViaChallan: {
                    $sum: { $cond: [{ $ifNull: ['$challanId', false] }, '$tdsAmount', 0] },
                },
                unpaidTds: {
                    $sum: { $cond: [{ $ifNull: ['$challanId', false] }, 0, '$tdsAmount'] },
                },
            },
        },
        {
            $project: {
                section: '$_id',
                totalPaid: 1,
                totalTds: 1,
                deducteeCount: { $size: '$deducteeCount' },
                paidViaChallan: 1,
                unpaidTds: 1,
            },
        },
        { $sort: { totalTds: -1 } },
    ]);
}

export async function getDeducteeWiseSummary(financialYear) {
    const fy = String(financialYear || '').trim();
    const match = fy ? { financialYear: fy } : {};
    return TdsDeduction.aggregate([
        { $match: match },
        {
            $group: {
                _id: { supplierId: '$supplierId', section: '$section' },
                supplierName: { $first: '$supplierName' },
                deducteePan: { $first: '$deducteePan' },
                totalPaid: { $sum: '$amountPaid' },
                totalTds: { $sum: '$tdsAmount' },
                count: { $sum: 1 },
            },
        },
        { $sort: { totalTds: -1 } },
        { $limit: 500 },
    ]);
}

export async function getPanMissingReport(financialYear) {
    const fy = String(financialYear || '').trim();
    const ledgers = await AccountLedger.find({ tdsApplicable: true, status: 'Active' })
        .select('name pan tdsPanStatus tdsSection tdsPanAssumedAvailable referenceModel referenceId')
        .lean();
    const suppliers = await Supplier.find({ tdsApplicable: true, isDeleted: { $ne: true } })
        .select('supplierName panNumber panVerificationStatus tdsSection ledgerId')
        .lean();

    const issues = [];
    for (const l of ledgers) {
        const pan = normalizePan(l.pan || '');
        const status = String(l.tdsPanStatus || '').trim();
        const missing = !pan || status === 'NotAvailable' || status === 'Invalid' || l.tdsPanAssumedAvailable === false;
        const invalid = pan && !isValidPan(pan);
        if (missing || invalid) {
            issues.push({
                type: 'ledger',
                name: l.name,
                section: l.tdsSection,
                pan: pan || '—',
                panStatus: status || (missing ? 'NotAvailable' : invalid ? 'Invalid' : ''),
                issue: invalid ? 'Invalid PAN format' : 'PAN missing or not available',
            });
        }
    }
    for (const s of suppliers) {
        const pan = normalizePan(s.panNumber || '');
        const invalid = pan && !isValidPan(pan);
        const missing = !pan || ['Invalid', 'Pending'].includes(String(s.panVerificationStatus || ''));
        if (missing || invalid) {
            issues.push({
                type: 'supplier',
                name: s.supplierName,
                section: s.tdsSection,
                pan: pan || '—',
                panStatus: s.panVerificationStatus || '',
                issue: invalid ? 'Invalid PAN format' : 'PAN missing or unverified',
            });
        }
    }

    if (fy) {
        const badDeductions = await TdsDeduction.find({
            financialYear: fy,
            $or: [{ deducteePan: { $in: ['', 'PANNOTAVBL', 'PANNOTAVAILABLE'] } }, { deducteePan: { $not: /^[A-Z]{5}[0-9]{4}[A-Z]$/ } }],
        })
            .select('supplierName deducteePan section tdsAmount paymentDate')
            .limit(200)
            .lean();
        for (const d of badDeductions) {
            issues.push({
                type: 'deduction',
                name: d.supplierName,
                section: d.section,
                pan: d.deducteePan,
                paymentDate: d.paymentDate,
                tdsAmount: d.tdsAmount,
                issue: 'Deduction with missing/invalid PAN',
            });
        }
    }
    return issues;
}

export async function getMonthlyLiabilityReport(financialYear) {
    const fy = String(financialYear || '').trim();
    const match = fy ? { financialYear: fy } : {};
    return TdsDeduction.aggregate([
        { $match: match },
        {
            $group: {
                _id: {
                    year: { $year: '$paymentDate' },
                    month: { $month: '$paymentDate' },
                    section: '$section',
                },
                totalTds: { $sum: '$tdsAmount' },
                totalPaid: { $sum: '$amountPaid' },
                count: { $sum: 1 },
            },
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.section': 1 } },
    ]);
}

export async function getQuarterWiseSummary(financialYear) {
    const fy = String(financialYear || '').trim();
    const match = fy ? { financialYear: fy } : {};
    return TdsDeduction.aggregate([
        { $match: match },
        {
            $group: {
                _id: { quarter: '$quarter', section: '$section' },
                totalTds: { $sum: '$tdsAmount' },
                totalPaid: { $sum: '$amountPaid' },
                count: { $sum: 1 },
            },
        },
        { $sort: { '_id.quarter': 1, '_id.section': 1 } },
    ]);
}

export async function getLowerDeductionCertificateReport() {
    const suppliers = await Supplier.find({
        $or: [
            { tdsLowerDeductionPercent: { $gt: 0 } },
            { 'tdsLowerDeductionCertificates.0': { $exists: true } },
        ],
    })
        .select('supplierName tdsSection tdsLowerDeductionPercent tdsLowerDeductionCertificates tdsLowerDeductionValidFrom tdsLowerDeductionValidTo')
        .lean();
    const ledgers = await AccountLedger.find({
        $or: [
            { tdsLowerDeductionPercent: { $gt: 0 } },
            { 'tdsLowerDeductionCertificates.0': { $exists: true } },
        ],
    })
        .select('name tdsSection tdsLowerDeductionPercent tdsLowerDeductionCertificates tdsLowerDeductionValidFrom tdsLowerDeductionValidTo')
        .lean();

    const now = new Date();
    const rows = [];
    const pushRow = (entity, type) => {
        const certs = entity.tdsLowerDeductionCertificates || [];
        if (certs.length) {
            for (const c of certs) {
                const to = c.validTo ? new Date(c.validTo) : null;
                rows.push({
                    entityType: type,
                    name: type === 'supplier' ? entity.supplierName : entity.name,
                    section: c.section || entity.tdsSection,
                    rate: c.rate,
                    certificateNo: c.certificateNo || '',
                    validFrom: c.validFrom,
                    validTo: c.validTo,
                    expired: to && to < now,
                });
            }
        } else if (Number(entity.tdsLowerDeductionPercent) > 0) {
            const to = entity.tdsLowerDeductionValidTo ? new Date(entity.tdsLowerDeductionValidTo) : null;
            rows.push({
                entityType: type,
                name: type === 'supplier' ? entity.supplierName : entity.name,
                section: entity.tdsSection,
                rate: entity.tdsLowerDeductionPercent,
                certificateNo: '(legacy flat %)',
                validFrom: entity.tdsLowerDeductionValidFrom,
                validTo: entity.tdsLowerDeductionValidTo,
                expired: to && to < now,
            });
        }
    };
    suppliers.forEach((s) => pushRow(s, 'supplier'));
    ledgers.forEach((l) => pushRow(l, 'ledger'));
    return rows;
}

export async function getChallanReconciliationReport(financialYear) {
    const fy = String(financialYear || '').trim();
    const q = fy ? { financialYear: fy } : {};
    const challans = await TdsChallan.find(q).sort({ challanDate: -1 }).limit(200).lean();
    const deductions = await TdsDeduction.find(fy ? { financialYear: fy } : {})
        .select('tdsAmount challanId challanAllocations section supplierName')
        .lean();

    const linkedByChallan = {};
    for (const d of deductions) {
        const ids = [];
        if (d.challanId) ids.push(String(d.challanId));
        for (const a of d.challanAllocations || []) {
            if (a.challanId) ids.push(String(a.challanId));
        }
        for (const cid of ids) {
            linkedByChallan[cid] = (linkedByChallan[cid] || 0) + r2(d.tdsAmount);
        }
    }

    return challans.map((c) => {
        const linked = r2(linkedByChallan[String(c._id)] || 0);
        const deposited = r2(c.amountDeposited || c.totalPaidAmount || 0);
        return {
            challanId: c._id,
            challanNo: c.challanNo,
            challanDate: c.challanDate,
            status: c.status,
            deposited,
            linkedDeductionTds: linked,
            variance: r2(deposited - linked),
            cinNumber: c.cinNumber,
            bsrCode: c.bsrCode,
        };
    });
}

export async function getThresholdCrossingReport(financialYear) {
    return getThresholdTrackingReport(financialYear);
}

export { getThresholdTrackingReport };
