import { PaymentEntry } from '../models/paymentEntry.model.js';
import { TdsDeduction } from '../models/tdsDeduction.model.js';
import { TdsChallan } from '../models/tdsChallan.model.js';
import { TdsAuditLog } from '../models/tdsAuditLog.model.js';
import { getThresholdTrackingReport } from './tdsThreshold.service.js';
import { getPanMissingReport } from './tdsReports.service.js';
import { isValidPan, normalizePan } from '../constants/tds.constants.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Live exception dashboard + recent audit overrides.
 */
export async function getTdsExceptionDashboard(financialYear) {
    const fy = String(financialYear || '').trim();
    const exceptions = [];

    const peQ = {
        paymentStatus: 'Completed',
        tdsApplicableComputed: true,
        $or: [{ tdsAmount: { $lte: 0 } }, { tdsSection: { $in: [null, ''] } }],
    };
    if (fy) peQ.financialYear = fy;
    const pendingTds = await PaymentEntry.find(peQ)
        .select('invoiceNumber supplierName amountPaid paymentDate financialYear tdsWarningThresholdCross')
        .limit(100)
        .lean();
    for (const p of pendingTds) {
        exceptions.push({
            severity: 'high',
            code: 'THRESHOLD_NO_TDS',
            message: 'TDS applicable payment completed without TDS deduction',
            entity: 'payment',
            reference: p.invoiceNumber || String(p._id),
            supplierName: p.supplierName,
            amount: p.amountPaid,
            date: p.paymentDate,
            financialYear: p.financialYear,
        });
    }

    const warnQ = { tdsWarningThresholdCross: true, tdsAmount: { $lte: 0 } };
    if (fy) warnQ.financialYear = fy;
    const crossedNoTds = await PaymentEntry.find(warnQ).select('supplierName amountPaid paymentDate').limit(50).lean();
    for (const p of crossedNoTds) {
        exceptions.push({
            severity: 'high',
            code: 'THRESHOLD_CROSSED_SKIPPED',
            message: 'Threshold crossed but TDS amount is zero',
            entity: 'payment',
            supplierName: p.supplierName,
            amount: p.amountPaid,
            date: p.paymentDate,
        });
    }

    const panIssues = await getPanMissingReport(fy);
    for (const p of panIssues.slice(0, 80)) {
        exceptions.push({
            severity: 'medium',
            code: 'PAN_ISSUE',
            message: p.issue,
            entity: p.type,
            name: p.name,
            pan: p.pan,
            section: p.section,
        });
    }

    const dedQ = fy ? { financialYear: fy, tdsAmount: { $lt: 0 } } : { tdsAmount: { $lt: 0 } };
    const negative = await TdsDeduction.find(dedQ).select('supplierName tdsAmount section').limit(20).lean();
    for (const d of negative) {
        exceptions.push({
            severity: 'critical',
            code: 'NEGATIVE_TDS',
            message: 'Negative TDS amount on deduction row',
            entity: 'deduction',
            supplierName: d.supplierName,
            tdsAmount: d.tdsAmount,
            section: d.section,
        });
    }

    const challans = await TdsChallan.find(fy ? { financialYear: fy } : {})
        .select('challanNo cinNumber bsrCode amountDeposited')
        .lean();
    const cinSeen = new Map();
    for (const c of challans) {
        const cin = String(c.cinNumber || '').trim();
        if (!cin) continue;
        if (cinSeen.has(cin)) {
            exceptions.push({
                severity: 'medium',
                code: 'DUPLICATE_CHALLAN_CIN',
                message: `Duplicate CIN ${cin} on challans ${cinSeen.get(cin)} and ${c.challanNo}`,
                entity: 'challan',
            });
        } else {
            cinSeen.set(cin, c.challanNo);
        }
    }

    const thresholdRows = await getThresholdTrackingReport(fy);
    for (const t of thresholdRows.filter((r) => r.crossed && r.cumulativeTdsDeducted <= 0).slice(0, 40)) {
        exceptions.push({
            severity: 'medium',
            code: 'AGGREGATE_CROSSED_NO_TDS',
            message: 'FY aggregate threshold crossed with no TDS recorded',
            entity: 'vendor_balance',
            supplierName: t.supplierName,
            section: t.section,
            cumulativePaid: t.cumulativePaid,
        });
    }

    const auditQ = fy ? { financialYear: fy } : {};
    const auditRows = await TdsAuditLog.find({
        ...auditQ,
        action: { $in: ['POPUP_SKIPPED', 'THRESHOLD_OVERRIDE', 'MANUAL_TDS_EDIT', 'LOCK_OVERRIDE'] },
    })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

    const invalidPanPayments = await PaymentEntry.find({
        ...(fy ? { financialYear: fy } : {}),
        tdsDeducteePan: { $exists: true, $ne: '' },
    })
        .select('tdsDeducteePan supplierName paymentDate')
        .limit(200)
        .lean();
    for (const p of invalidPanPayments) {
        const pan = normalizePan(p.tdsDeducteePan);
        if (pan && !isValidPan(pan)) {
            exceptions.push({
                severity: 'medium',
                code: 'INVALID_PAN',
                message: 'Invalid PAN on payment',
                entity: 'payment',
                supplierName: p.supplierName,
                pan,
                date: p.paymentDate,
            });
        }
    }

    return {
        financialYear: fy,
        summary: {
            total: exceptions.length,
            critical: exceptions.filter((e) => e.severity === 'critical').length,
            high: exceptions.filter((e) => e.severity === 'high').length,
            medium: exceptions.filter((e) => e.severity === 'medium').length,
        },
        exceptions: exceptions.slice(0, 300),
        recentAudit: auditRows,
    };
}
