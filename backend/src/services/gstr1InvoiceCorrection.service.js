/**
 * GSTR-1 invoice GST correction from Customer Master — controlled workflow only.
 * Never silently cascade master updates into historical invoices.
 */
import mongoose from 'mongoose';
import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import Customer from '../models/customer.model.js';
import { InvoiceSeries } from '../models/invoiceSeries.model.js';
import { AuditLog } from '../models/auditLog.model.js';
import { Gstr1Amendment } from '../models/gstr1Amendment.model.js';
import { Gstr1PeriodStatus } from '../models/gstr1PeriodStatus.model.js';
import { getFYFromDate } from '../utils/fyUtils.js';

const OUR_STATE_CODE = '27';
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const oid = (v) => {
    if (!v) return null;
    if (typeof v === 'object' && v._id) return String(v._id);
    return String(v);
};

function toDateOnly(d) {
    if (!d) return null;
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return null;
    return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}

function returnPeriodFromDate(d) {
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return '';
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function classifyFromGstin(gstin) {
    const g = String(gstin || '').trim().toUpperCase();
    return g.length === 15 && GSTIN_RE.test(g) ? 'B2B' : 'B2C';
}

function derivePosFromCustomer(customer) {
    const pos = String(customer.defaultPlaceOfSupply || '').trim();
    if (pos.length >= 2) return pos.substring(0, 2).toUpperCase();
    const gst = String(customer.gstNumber || '').trim().toUpperCase();
    if (gst.length >= 2) return gst.substring(0, 2);
    const code = String(customer.billingStateCode || '').trim();
    if (code.length >= 2) return code.substring(0, 2);
    return '';
}

function deriveGstType(placeOfSupply) {
    const code = String(placeOfSupply || '').substring(0, 2);
    if (!code) return '';
    return code === OUR_STATE_CODE ? 'CGST / SGST' : 'IGST';
}

function invoiceSnapshot(inv) {
    const gstin = inv.customerGstin || '';
    return {
        customerName: inv.customerName || '',
        invoiceNumber: inv.invoiceNumber || '',
        invoiceDate: inv.invoiceDate,
        customerGstin: gstin,
        customerRegistrationType: inv.customerRegistrationType || '',
        billingState: inv.billingState || '',
        billingStateCode: inv.billingStateCode || '',
        placeOfSupply: inv.placeOfSupply || '',
        gstType: inv.gstType || '',
        classification: classifyFromGstin(gstin),
        totalCgst: Number(inv.totalCgst) || 0,
        totalSgst: Number(inv.totalSgst) || 0,
        totalIgst: Number(inv.totalIgst) || 0,
        totalTaxableAmount: Number(inv.totalTaxableAmount) || 0,
        grandTotal: Number(inv.roundedTotal || inv.grandTotal) || 0,
    };
}

function masterSnapshot(customer) {
    const gstin = String(customer.gstNumber || '').trim().toUpperCase();
    const placeOfSupply = derivePosFromCustomer(customer);
    const gstType = customer.gstType || deriveGstType(placeOfSupply);
    return {
        customerGstin: gstin,
        customerRegistrationType: customer.gstRegistrationType || (gstin ? 'Registered' : ''),
        billingState: customer.gstState || customer.state || '',
        billingStateCode: customer.billingStateCode || (gstin ? gstin.substring(0, 2) : placeOfSupply.substring(0, 2)),
        placeOfSupply,
        gstType,
        gstRegistrationEffectiveDate: customer.gstRegistrationEffectiveDate || null,
        gstCancellationDate: customer.gstCancellationDate || null,
        gstStatus: customer.gstStatus || 'Unknown',
        gstVerificationDate: customer.gstVerificationDate || null,
        gstVerificationSource: customer.gstVerificationSource || '',
        customerActivityType: customer.customerActivityType || '',
        classification: classifyFromGstin(gstin) || customer.customerActivityType || '',
    };
}

function evaluateEffectiveDate(effectiveDate, invoiceDate) {
    const invD = toDateOnly(invoiceDate);
    const effD = toDateOnly(effectiveDate);
    if (!effD) {
        return {
            code: 'BLANK_EFFECTIVE_DATE',
            allowed: false,
            requiresConfirmation: true,
            message: 'GST Registration Effective Date is blank. Authorised confirmation is required before applying GSTIN to this invoice.',
        };
    }
    if (!invD) {
        return {
            code: 'INVALID_INVOICE_DATE',
            allowed: false,
            requiresConfirmation: false,
            message: 'Invoice date is invalid.',
        };
    }
    if (effD.getTime() <= invD.getTime()) {
        return {
            code: 'EFFECTIVE_ON_OR_BEFORE',
            allowed: true,
            requiresConfirmation: false,
            message: 'GST registration was effective on the invoice date.',
        };
    }
    return {
        code: 'EFFECTIVE_AFTER_INVOICE',
        allowed: false,
        requiresConfirmation: false,
        message: 'This GST registration became effective after the invoice date. The original invoice cannot be converted to B2B using this GSTIN.',
    };
}

async function isPeriodFiled(companyId, returnPeriod) {
    if (!companyId || !returnPeriod) return false;
    const row = await Gstr1PeriodStatus.findOne({ companyId, returnPeriod, status: 'Filed' }).lean();
    return Boolean(row);
}

function assessTaxImpact(invSnap, masterSnap) {
    const oldType = String(invSnap.gstType || '').trim();
    const proposedType = String(masterSnap.gstType || deriveGstType(masterSnap.placeOfSupply) || '').trim();
    // If invoice already has a GST type and master proposes a different split, flag it —
    // metadata (GSTIN/POS) can still be applied while preserving invoice gstType.
    if (oldType && proposedType && oldType !== proposedType) {
        return {
            taxImpact: 'GstTypeChange',
            accountingImpact: 'Requires reverse/repost approval if GST type is changed',
            gstr1SheetImpact: 'B2B/B2C sheet classification may change; tax columns unchanged if type kept',
            message: `Master proposes GST type ${proposedType} but invoice has ${oldType}. Metadata (GSTIN/POS) can be applied without changing tax split. Full CGST↔IGST change needs dedicated recalculation approval.`,
            proposedGstType: proposedType,
            canApplyMetadataOnly: true,
        };
    }
    return {
        taxImpact: 'MetadataOnly',
        accountingImpact: 'None',
        gstr1SheetImpact: 'Classification / GSTIN / POS metadata only — no GL repost',
        message: 'Only missing GST metadata will be filled; tax calculation remains unchanged.',
        proposedGstType: proposedType || oldType,
        canApplyMetadataOnly: true,
    };
}

async function assertNotEstimate(inv) {
    if (!inv.seriesId) return;
    const seriesDoc = await InvoiceSeries.findById(inv.seriesId).lean();
    if (seriesDoc && (seriesDoc.isEstimate || seriesDoc.documentType === 'Estimate' || seriesDoc.gstApplicable === false)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'GST details cannot be corrected on an Estimate document.');
    }
}

/**
 * Build comparison preview for one invoice (no writes).
 */
export async function previewFixFromCustomerMaster(invoiceId, companyId) {
    const inv = await SalesInvoice.findById(invoiceId);
    if (!inv || inv.isDeleted) throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
    if (companyId && inv.companyId && String(inv.companyId) !== String(companyId)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invoice belongs to another company');
    }
    await assertNotEstimate(inv);

    const customerId = oid(inv.customerId);
    if (!customerId) throw new ApiError(httpStatus.BAD_REQUEST, 'Invoice has no customer link');

    const customer = await Customer.findOne({ _id: customerId, isDeleted: { $ne: true } });
    if (!customer) throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');

    const left = invoiceSnapshot(inv);
    const right = masterSnapshot(customer);
    const effective = evaluateEffectiveDate(customer.gstRegistrationEffectiveDate, inv.invoiceDate);
    const impact = assessTaxImpact(left, right);
    const period = returnPeriodFromDate(inv.invoiceDate);
    const filed = await isPeriodFiled(companyId || inv.companyId, period);

    let action = 'ApplyToInvoice';
    let blocked = false;
    let blockReason = '';

    if (!right.customerGstin || !GSTIN_RE.test(right.customerGstin)) {
        blocked = true;
        blockReason = 'Customer Master does not have a valid GSTIN to apply.';
        action = 'Blocked';
    } else if (effective.code === 'EFFECTIVE_AFTER_INVOICE') {
        blocked = true;
        blockReason = effective.message;
        action = 'Blocked';
    } else if (impact.taxImpact === 'GstTypeChange') {
        action = filed ? 'CreateAmendmentRequiresTaxApproval' : 'ApplyRequiresTaxApproval';
    } else if (filed) {
        action = 'CreateAmendment';
    } else if (effective.requiresConfirmation) {
        action = 'ApplyRequiresConfirmation';
    }

    return {
        invoiceId: String(inv._id),
        customerId,
        returnPeriod: period,
        financialYear: inv.financialYear || getFYFromDate(inv.invoiceDate),
        gstr1Filed: filed,
        invoiceSnapshot: left,
        customerMaster: right,
        effectiveDateCheck: effective,
        impact,
        action,
        blocked,
        blockReason,
    };
}

/**
 * Apply approved correction (unfiled overwrite or filed amendment).
 */
export async function applyFixFromCustomerMaster({
    invoiceId,
    companyId,
    userId,
    reason,
    confirmBlankEffectiveDate = false,
    approveGstTypeChange = false,
    ipAddress,
    userAgent,
}) {
    if (!reason || !String(reason).trim()) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'A reason is required for the audit log.');
    }

    const preview = await previewFixFromCustomerMaster(invoiceId, companyId);
    if (preview.blocked) {
        throw new ApiError(httpStatus.BAD_REQUEST, preview.blockReason || 'Correction blocked');
    }
    if (preview.effectiveDateCheck.requiresConfirmation && !confirmBlankEffectiveDate) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Confirm that GST registration was valid on the invoice date (effective date is blank).',
        );
    }
    // v1: never auto-change CGST/SGST ↔ IGST here. Metadata (GSTIN/POS/registration) may still apply.
    if (preview.impact.taxImpact === 'GstTypeChange' && approveGstTypeChange) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'GST type change (CGST/SGST ↔ IGST) requires a dedicated tax recalculation workflow. Apply metadata (GSTIN/POS/registration) only, or correct GST type via existing GST Return Details with full review.',
        );
    }

    const inv = await SalesInvoice.findById(invoiceId);
    const master = preview.customerMaster;
    const oldState = {
        customerGstin: inv.customerGstin,
        customerRegistrationType: inv.customerRegistrationType,
        billingState: inv.billingState,
        billingStateCode: inv.billingStateCode,
        placeOfSupply: inv.placeOfSupply,
        gstType: inv.gstType,
    };

    // Preserve invoice tax split when master proposes a different GST type
    const newState = {
        customerGstin: master.customerGstin,
        customerRegistrationType: master.customerRegistrationType || 'Registered',
        billingState: master.billingState || inv.billingState,
        billingStateCode: master.billingStateCode || master.placeOfSupply?.substring(0, 2) || inv.billingStateCode,
        placeOfSupply: master.placeOfSupply || inv.placeOfSupply,
        gstType: inv.gstType || master.gstType || '',
    };

    if (preview.gstr1Filed || preview.action === 'CreateAmendment') {
        const amendment = await Gstr1Amendment.create({
            companyId: companyId || inv.companyId,
            financialYear: preview.financialYear,
            originalReturnPeriod: preview.returnPeriod,
            amendmentPeriod: '',
            salesInvoiceId: inv._id,
            invoiceNumber: inv.invoiceNumber,
            customerId: inv.customerId,
            originalValues: {
                customerGstin: oldState.customerGstin,
                customerRegistrationType: oldState.customerRegistrationType,
                billingState: oldState.billingState,
                billingStateCode: oldState.billingStateCode,
                placeOfSupply: oldState.placeOfSupply,
                gstType: oldState.gstType,
                classification: classifyFromGstin(oldState.customerGstin),
            },
            correctedValues: {
                customerGstin: newState.customerGstin,
                customerRegistrationType: newState.customerRegistrationType,
                billingState: newState.billingState,
                billingStateCode: newState.billingStateCode,
                placeOfSupply: newState.placeOfSupply,
                gstType: newState.gstType,
                classification: classifyFromGstin(newState.customerGstin),
            },
            amendmentReason: String(reason).trim(),
            status: 'Amendment Required',
            taxImpact: 'MetadataOnly',
            accountingImpact: 'None — invoice snapshot not overwritten (period filed)',
            gstr1SheetImpact: preview.impact.gstr1SheetImpact,
            createdBy: userId,
        });

        await AuditLog.create({
            user: userId,
            action: 'CREATE',
            module: 'Gstr1Amendment',
            resourceId: amendment._id,
            description: `GSTR-1 amendment required for filed period ${preview.returnPeriod}, invoice ${inv.invoiceNumber}`,
            details: {
                invoiceId: String(inv._id),
                customerId: oid(inv.customerId),
                oldValues: oldState,
                newValues: newState,
                reason: String(reason).trim(),
                returnFilingStatus: 'Filed',
                gstImpact: 'MetadataOnly',
                accountingImpact: 'None',
                amendmentId: String(amendment._id),
            },
            ipAddress,
            userAgent,
        });

        return {
            mode: 'amendment',
            message: 'GSTR-1 already filed for this period. Amendment record created — invoice snapshot was not overwritten.',
            amendment,
            preview,
        };
    }

    // Unfiled: update invoice snapshot metadata only
    inv.customerGstin = newState.customerGstin;
    inv.customerRegistrationType = newState.customerRegistrationType;
    if (newState.billingState) inv.billingState = newState.billingState;
    if (newState.billingStateCode) inv.billingStateCode = newState.billingStateCode;
    if (newState.placeOfSupply) inv.placeOfSupply = newState.placeOfSupply;
    inv.updatedBy = userId;
    await inv.save();

    await AuditLog.create({
        user: userId,
        action: 'UPDATE',
        module: 'SalesInvoice',
        resourceId: inv._id,
        description: `GSTR-1 Fix from Customer Master applied to Invoice ${inv.invoiceNumber}`,
        details: {
            invoiceId: String(inv._id),
            customerId: oid(inv.customerId),
            oldValues: oldState,
            newValues: {
                customerGstin: inv.customerGstin,
                customerRegistrationType: inv.customerRegistrationType,
                billingState: inv.billingState,
                billingStateCode: inv.billingStateCode,
                placeOfSupply: inv.placeOfSupply,
                gstType: inv.gstType,
            },
            reason: String(reason).trim(),
            returnFilingStatus: 'Open',
            gstImpact: 'MetadataOnly',
            accountingImpact: 'None',
            effectiveDateCheck: preview.effectiveDateCheck.code,
        },
        ipAddress,
        userAgent,
    });

    return {
        mode: 'invoice_updated',
        message: 'Invoice GST snapshot updated from Customer Master (metadata only).',
        invoice: inv,
        preview,
    };
}

/**
 * Bulk preview — safe matches only, never auto-apply.
 */
export async function previewBulkFixFromCustomerMaster({ companyId, startDate, endDate, invoiceIds }) {
    const filter = {
        isDeleted: { $ne: true },
        status: { $ne: 'Cancelled' },
    };
    if (companyId) filter.companyId = companyId;
    if (invoiceIds?.length) {
        filter._id = { $in: invoiceIds.map((id) => new mongoose.Types.ObjectId(String(id))) };
    } else if (startDate && endDate) {
        filter.invoiceDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
    } else {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Provide date range or invoiceIds');
    }

    // Candidates: missing GSTIN or POS
    filter.$or = [
        { customerGstin: { $in: [null, ''] } },
        { customerGstin: { $exists: false } },
        { placeOfSupply: { $in: [null, ''] } },
        { placeOfSupply: { $exists: false } },
    ];

    const invoices = await SalesInvoice.find(filter).limit(500).lean();
    const rows = [];
    for (const inv of invoices) {
        try {
            const p = await previewFixFromCustomerMaster(inv._id, companyId);
            if (!p.customerMaster.customerGstin) continue;
            rows.push({
                invoiceId: p.invoiceId,
                invoiceNo: p.invoiceSnapshot.invoiceNumber,
                invoiceDate: p.invoiceSnapshot.invoiceDate,
                customer: p.invoiceSnapshot.customerName,
                currentGstin: p.invoiceSnapshot.customerGstin || '',
                masterGstin: p.customerMaster.customerGstin || '',
                currentPos: p.invoiceSnapshot.placeOfSupply || '',
                masterPos: p.customerMaster.placeOfSupply || '',
                registrationEffectiveDate: p.customerMaster.gstRegistrationEffectiveDate,
                proposedClassification: p.customerMaster.classification,
                taxImpact: p.impact.taxImpact,
                action: p.blocked ? 'Skip' : (p.action === 'CreateAmendment' ? 'Amendment' : 'SafeFix'),
                blocked: p.blocked,
                blockReason: p.blockReason,
                gstr1Filed: p.gstr1Filed,
            });
        } catch {
            /* skip unreadable rows */
        }
    }

    return {
        totalCandidates: invoices.length,
        rows,
        safeCount: rows.filter((r) => !r.blocked && r.taxImpact === 'MetadataOnly').length,
        blockedCount: rows.filter((r) => r.blocked).length,
        taxChangeCount: rows.filter((r) => r.taxImpact === 'GstTypeChange').length,
    };
}

/**
 * Invoices for a customer that lack GST snapshot fields (for master-update warning).
 */
export async function listAffectedInvoicesMissingGst(customerId, companyId) {
    const filter = {
        customerId,
        isDeleted: { $ne: true },
        $or: [
            { customerGstin: { $in: [null, ''] } },
            { customerGstin: { $exists: false } },
            { placeOfSupply: { $in: [null, ''] } },
            { placeOfSupply: { $exists: false } },
        ],
    };
    if (companyId) filter.companyId = companyId;
    const list = await SalesInvoice.find(filter)
        .select('invoiceNumber invoiceDate customerGstin placeOfSupply grandTotal roundedTotal status')
        .sort({ invoiceDate: -1 })
        .limit(200)
        .lean();
    return list;
}

export async function isGstr1PeriodFiled(companyId, invoiceDate) {
    const period = returnPeriodFromDate(invoiceDate);
    return isPeriodFiled(companyId, period);
}

export async function markGstr1PeriodFiled({ companyId, returnPeriod, financialYear, userId, remarks }) {
    if (!companyId || !returnPeriod) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'companyId and returnPeriod required');
    }
    const doc = await Gstr1PeriodStatus.findOneAndUpdate(
        { companyId, returnPeriod },
        {
            $set: {
                status: 'Filed',
                filedAt: new Date(),
                filedBy: userId,
                financialYear: financialYear || '',
                remarks: remarks || '',
            },
        },
        { upsert: true, new: true }
    );
    return doc;
}

export {
    evaluateEffectiveDate,
    masterSnapshot,
    invoiceSnapshot,
    returnPeriodFromDate,
    classifyFromGstin,
};
