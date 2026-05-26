import { TdsVendorSectionBalance } from '../models/tdsVendorSectionBalance.model.js';
import { TdsAuditLog } from '../models/tdsAuditLog.model.js';
import { TdsSettings } from '../models/tdsSettings.model.js';
import { TdsDeduction } from '../models/tdsDeduction.model.js';
import { PaymentEntry } from '../models/paymentEntry.model.js';
import { TDS_MASTER_DEFAULTS } from '../constants/tds.constants.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export async function getTdsSettings() {
    let doc = await TdsSettings.findOne().lean();
    if (!doc) {
        doc = (await TdsSettings.create({})).toObject();
    }
    return doc;
}

export async function updateTdsSettings(body, userId) {
    const patch = {};
    if (body.tdsCalculationBasis != null) patch.tdsCalculationBasis = body.tdsCalculationBasis;
    if (body.tdsPostingMode != null) patch.tdsPostingMode = body.tdsPostingMode;
    if (body.panAbsentRate != null) patch.panAbsentRate = Number(body.panAbsentRate);
    if (body.gstExcludedFromTdsBase != null) patch.gstExcludedFromTdsBase = Boolean(body.gstExcludedFromTdsBase);

    let doc = await TdsSettings.findOne();
    if (!doc) doc = await TdsSettings.create(patch);
    else {
        Object.assign(doc, patch);
        await doc.save();
    }
    await logTdsAudit({
        action: 'MASTER_SECTION_UPDATE',
        userId,
        details: { type: 'settings', patch },
    });
    return doc.toObject();
}

export async function logTdsAudit({ action, supplierId, section, financialYear, paymentEntryId, voucherId, details, userId }) {
    try {
        await TdsAuditLog.create({
            action,
            supplierId: supplierId || null,
            section: section || '',
            financialYear: financialYear || '',
            paymentEntryId: paymentEntryId || null,
            voucherId: voucherId || null,
            details: details || {},
            userId: userId || null,
        });
    } catch {
        /* non-fatal */
    }
}

export async function getSectionBalance(supplierId, section, financialYear) {
    if (!supplierId || !section || !financialYear) return { cumulativePaid: 0, transactionCount: 0 };
    const row = await TdsVendorSectionBalance.findOne({
        supplierId,
        section: String(section).trim().toUpperCase(),
        financialYear: String(financialYear).trim(),
    })
        .select('cumulativePaid cumulativeTdsDeducted transactionCount')
        .lean();
    return row || { cumulativePaid: 0, cumulativeTdsDeducted: 0, transactionCount: 0 };
}

export async function applyPaymentToBalance(paymentEntry, userId) {
    if (!paymentEntry?.supplierId || paymentEntry.paymentStatus === 'Failed') return;
    const section = String(paymentEntry.tdsSection || '').trim().toUpperCase();
    if (!section) return;

    /** Skip if purchase invoice already counted this bill toward FY TDS aggregate */
    try {
        if (paymentEntry.invoiceId) {
            const { PurchaseInvoice } = await import('../models/purchaseInvoice.model.js');
            const pi = await PurchaseInvoice.findById(paymentEntry.invoiceId).select('tdsFYThresholdIncluded').lean();
            if (pi?.tdsFYThresholdIncluded) return;
        }
    } catch {
        /* non-fatal */
    }

    const base = paymentEntry.tdsBaseAmount > 0 ? paymentEntry.tdsBaseAmount : paymentEntry.amountPaid;
    const fy = paymentEntry.financialYear;
    const inc = r2(base);

    await TdsVendorSectionBalance.findOneAndUpdate(
        {
            supplierId: paymentEntry.supplierId,
            section,
            financialYear: fy,
        },
        {
            $inc: { cumulativePaid: inc, cumulativeTdsDeducted: r2(paymentEntry.tdsAmount || 0), transactionCount: 1 },
            $set: { lastPaymentEntryId: paymentEntry._id, lastUpdatedAt: new Date() },
        },
        { upsert: true, new: true },
    );

    await logTdsAudit({
        action: 'PAYMENT_TDS_APPLIED',
        supplierId: paymentEntry.supplierId,
        section,
        financialYear: fy,
        paymentEntryId: paymentEntry._id,
        userId,
        details: { base: inc, tdsAmount: paymentEntry.tdsAmount },
    });
}

/**
 * Expense / bill voucher: add TDS-applicable base to FY cumulative for supplier+section.
 */
export async function applyVoucherBillToTdsBalance(
    { supplierId, section, financialYear, baseAmount, tdsAmount, voucherId },
    userId,
    session = null,
) {
    if (!supplierId || !section || !financialYear) return;
    const sec = String(section).trim().toUpperCase();
    const inc = r2(Number(baseAmount) || 0);
    if (!(inc > 0)) return;

    const q = TdsVendorSectionBalance.findOneAndUpdate(
        { supplierId, section: sec, financialYear: String(financialYear).trim() },
        {
            $inc: {
                cumulativePaid: inc,
                cumulativeTdsDeducted: r2(Number(tdsAmount) || 0),
                transactionCount: 1,
            },
            $set: { lastUpdatedAt: new Date() },
        },
        { upsert: true, new: true },
    );
    if (session) await q.session(session);
    else await q;

    await logTdsAudit({
        action: 'VOUCHER_TDS_THRESHOLD_APPLIED',
        supplierId,
        section: sec,
        financialYear: String(financialYear).trim(),
        voucherId: voucherId || null,
        userId,
        details: { base: inc, tdsAmount: r2(Number(tdsAmount) || 0) },
    });
}

export async function reverseVoucherBillFromTdsBalance(voucherLean, userId, session = null) {
    if (!voucherLean?.tdsSupplierId || !voucherLean.tdsSection) return;
    const base = r2(Number(voucherLean.tdsThresholdBaseAmount || 0));
    if (!(base > 0)) return;
    const sec = String(voucherLean.tdsSection).trim().toUpperCase();
    const fy = String(voucherLean.financialYear || '').trim();
    const tdsAmt = r2(Number(voucherLean.tdsAmount || 0));

    const q = TdsVendorSectionBalance.findOneAndUpdate(
        {
            supplierId: voucherLean.tdsSupplierId,
            section: sec,
            financialYear: fy,
        },
        {
            $inc: {
                cumulativePaid: -base,
                cumulativeTdsDeducted: -tdsAmt,
                transactionCount: -1,
            },
            $set: { lastUpdatedAt: new Date() },
        },
    );
    if (session) await q.session(session);
    else await q;

    await logTdsAudit({
        action: 'VOUCHER_TDS_THRESHOLD_REVERSED',
        supplierId: voucherLean.tdsSupplierId,
        section: sec,
        financialYear: fy,
        voucherId: voucherLean._id,
        userId,
        details: { base, tdsAmount: tdsAmt },
    });
}

/** Purchase invoice bill posted TDS — same cumulative bucket */
export async function applyPurchaseInvoiceToTdsBalance(docLean, userId, session = null) {
    if (!docLean?.supplierId || !docLean.tdsSection || !docLean.financialYear) return;
    const base = r2(Number(docLean.tdsThresholdBaseAmount || docLean.tdsBaseAmount || 0));
    if (!(base > 0)) return;
    await applyVoucherBillToTdsBalance(
        {
            supplierId: docLean.supplierId,
            section: docLean.tdsSection,
            financialYear: docLean.financialYear,
            baseAmount: base,
            tdsAmount: docLean.tdsAmount || 0,
            voucherId: null,
        },
        userId,
        session,
    );
}

export async function reversePurchaseInvoiceFromTdsBalance(docLean, userId, session = null) {
    if (!docLean?.supplierId || !docLean.tdsSection) return;
    const base = r2(Number(docLean.tdsThresholdBaseAmount || 0));
    if (!(base > 0)) return;
    const sec = String(docLean.tdsSection).trim().toUpperCase();
    const fy = String(docLean.financialYear || '').trim();
    const tdsAmt = r2(Number(docLean.tdsAmount || 0));

    const q = TdsVendorSectionBalance.findOneAndUpdate(
        { supplierId: docLean.supplierId, section: sec, financialYear: fy },
        {
            $inc: {
                cumulativePaid: -base,
                cumulativeTdsDeducted: -tdsAmt,
                transactionCount: -1,
            },
            $set: { lastUpdatedAt: new Date() },
        },
    );
    if (session) await q.session(session);
    else await q;

    await logTdsAudit({
        action: 'PI_TDS_THRESHOLD_REVERSED',
        supplierId: docLean.supplierId,
        section: sec,
        financialYear: fy,
        userId,
        details: { base, tdsAmount: tdsAmt },
    });
}

/** Threshold tracking report */
export async function getThresholdTrackingReport(financialYear) {
    const fy = String(financialYear || '').trim();
    const rows = await TdsVendorSectionBalance.find(fy ? { financialYear: fy } : {})
        .populate('supplierId', 'supplierName panNumber')
        .sort({ cumulativePaid: -1 })
        .lean();

    const defaultsBySection = Object.fromEntries(TDS_MASTER_DEFAULTS.map((d) => [d.sectionCode, d]));

    return rows.map((r) => {
        const def = defaultsBySection[r.section] || {};
        const threshold = def.thresholdAmount || 0;
        const pct = threshold > 0 ? r2((r.cumulativePaid / threshold) * 100) : 0;
        return {
            ...r,
            supplierName: r.supplierId?.supplierName || '',
            aggregateThreshold: threshold,
            percentOfThreshold: pct,
            nearLimit: threshold > 0 && pct >= 80 && pct < 100,
            crossed: threshold > 0 && r.cumulativePaid > threshold,
        };
    });
}

export async function getVendorWiseSummary(financialYear) {
    const fy = String(financialYear || '').trim();
    const match = fy ? { financialYear: fy } : {};
    return TdsDeduction.aggregate([
        { $match: match },
        {
            $group: {
                _id: { supplierId: '$supplierId', section: '$section' },
                totalPaid: { $sum: '$amountPaid' },
                totalTds: { $sum: '$tdsAmount' },
                count: { $sum: 1 },
            },
        },
        { $sort: { totalTds: -1 } },
    ]);
}

export async function getPendingDeductionReport(financialYear) {
    const fy = String(financialYear || '').trim();
    const q = {
        paymentStatus: 'Completed',
        tdsApplicableComputed: true,
        $or: [{ tdsAmount: { $lte: 0 } }, { tdsSection: { $in: [null, ''] } }],
    };
    if (fy) q.financialYear = fy;
    return PaymentEntry.find(q)
        .select('invoiceNumber supplierName amountPaid paymentDate financialYear tdsWarningThresholdCross')
        .sort({ paymentDate: -1 })
        .limit(500)
        .lean();
}

export async function getNearLimitReport(financialYear) {
    const all = await getThresholdTrackingReport(financialYear);
    return all.filter((r) => r.nearLimit);
}

export async function getDeductedNotPaidReport(financialYear) {
    const fy = String(financialYear || '').trim();
    const match = fy ? { financialYear: fy, challanId: null } : { challanId: null };
    return TdsDeduction.find(match)
        .sort({ paymentDate: -1 })
        .limit(500)
        .lean();
}

export async function getExceptionReport(financialYear) {
    const { getTdsExceptionDashboard } = await import('./tdsException.service.js');
    return getTdsExceptionDashboard(financialYear);
}

export async function listAuditLogs(query = {}) {
    const q = {};
    if (query.financialYear) q.financialYear = query.financialYear;
    if (query.action) q.action = query.action;
    return TdsAuditLog.find(q).sort({ createdAt: -1 }).limit(300).lean();
}
