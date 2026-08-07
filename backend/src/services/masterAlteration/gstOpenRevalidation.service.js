/**
 * Open GSTR-1 revalidation + filed amendment flagging for Customer GST master changes.
 * Reuses gstr1InvoiceCorrection + GstStatusHistory date-effective treatment.
 * Does NOT change invoice tax amounts.
 */
import mongoose from 'mongoose';
import { SalesInvoice } from '../../models/salesInvoice.model.js';
import { Gstr1PeriodStatus } from '../../models/gstr1PeriodStatus.model.js';
import { Gstr1Amendment } from '../../models/gstr1Amendment.model.js';
import { GstStatusHistory } from '../../models/gstStatusHistory.model.js';
import { CustomerGstRegistration } from '../../models/customerGstRegistration.model.js';
import { AuditLog } from '../../models/auditLog.model.js';
import {
    buildTransactionGstSnapshot,
    resolveStatusOnDate,
} from './gstDateResolve.js';

function oid(id) {
    if (!id) return null;
    try {
        return new mongoose.Types.ObjectId(String(id));
    } catch {
        return null;
    }
}

function returnPeriodFromDate(d) {
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return '';
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}

function classifyFromSnapshots(gstin, registrationType, gstr1Category) {
    if (gstr1Category && String(gstr1Category).toUpperCase().startsWith('B2B')) return 'B2B';
    const g = String(gstin || '').trim().toUpperCase();
    if (g.length >= 15) return 'B2B';
    const rt = String(registrationType || '');
    if (['Registered', 'SEZ', 'UIN', 'Composite', 'Export'].includes(rt)) return 'B2B';
    return 'B2C';
}

async function isPeriodFiled(companyId, returnPeriod) {
    if (!companyId || !returnPeriod) return false;
    const row = await Gstr1PeriodStatus.findOne({
        companyId: oid(companyId),
        returnPeriod,
        status: 'Filed',
    }).lean();
    return Boolean(row);
}

/**
 * Evaluate GST status on invoice date.
 * Prefers embedded Customer.gstRegistrationHistory (no new collections).
 * Optionally reads existing GstStatusHistory / CustomerGstRegistration when present.
 */
export async function resolveCustomerGstOnInvoiceDate({
    companyId,
    customerId,
    gstin,
    invoiceDate,
    customerFallback = {},
}) {
    // Master correction (not statutory cancellation):
    // Current master has blank GSTIN and no cancellation date → open GSTR-1 must
    // follow corrected master as B2C. Do not keep prior Active embedded GSTIN on
    // the invoice date (that left HALOMAX / similar invoices stuck in B2B).
    const currentGstin = String(gstin || customerFallback.gstNumber || '')
        .trim()
        .toUpperCase();
    const hasCancellation = Boolean(customerFallback.gstCancellationEffectiveDate);
    if (!currentGstin && !hasCancellation) {
        const currentType = String(
            customerFallback.gstRegistrationType || customerFallback.gstRegistrationStatus || '',
        ).trim();
        return {
            statusOnTransactionDate: currentType === 'Consumer' ? 'Unknown' : 'Unknown',
            effectiveFrom: null,
            effectiveTo: null,
            sourceHistoryId: null,
            resolutionReason:
                'Master corrected to blank GSTIN (Consumer/unregistered) without cancellation date — open periods treat as B2C',
            gstinOnDate: '',
            recommendedCategory: 'B2C',
            recommendedTreatment: 'Unregistered / B2C (master correction)',
            historyRowCount: 0,
            embeddedSource: 'masterCorrectionUnregister',
        };
    }

    const { resolveEmbeddedGstOnDate } = await import('./embeddedGstHistory.js');
    const embedded = resolveEmbeddedGstOnDate(
        {
            ...customerFallback,
            gstNumber: gstin || customerFallback.gstNumber,
        },
        invoiceDate,
    );

    // Try optional collections only if they already exist — never create
    let historyRows = [];
    let regs = [];
    try {
        const cols = await mongoose.connection.db.listCollections({ name: 'gststatushistories' }).toArray();
        if (cols.length) {
            historyRows = await GstStatusHistory.find({
                companyId: oid(companyId),
                $or: [
                    { customerId: oid(customerId) },
                    ...(gstin ? [{ gstin: String(gstin).toUpperCase() }] : []),
                ],
            })
                .sort({ effectiveFrom: -1 })
                .lean();
        }
    } catch {
        /* skip */
    }
    try {
        const cols = await mongoose.connection.db.listCollections({ name: 'customergstregistrations' }).toArray();
        if (cols.length) {
            regs = await CustomerGstRegistration.find({
                companyId: oid(companyId),
                customerId: oid(customerId),
            }).lean();
        }
    } catch {
        /* skip */
    }

    const statusRes = historyRows.length
        ? resolveStatusOnDate({
            transactionDate: invoiceDate,
            historyRows,
            currentStatus: embedded.status || customerFallback.gstStatus || (gstin ? 'Active' : 'Unknown'),
            cancellationDate:
                customerFallback.gstCancellationEffectiveDate ||
                regs.find((r) => r.cancellationDate)?.cancellationDate ||
                null,
            registrationDate:
                customerFallback.gstRegistrationEffectiveDate ||
                regs.find((r) => r.effectiveFrom || r.registrationDate)?.effectiveFrom ||
                null,
        })
        : {
            statusOnTransactionDate: embedded.status,
            effectiveFrom: embedded.effectiveFrom,
            effectiveTo: embedded.effectiveTo,
            sourceHistoryId: null,
            resolutionReason: `Embedded history: ${embedded.source}`,
        };

    const gstinOnDate =
        statusRes.statusOnTransactionDate === 'Cancelled' ||
        statusRes.statusOnTransactionDate === 'Suspended' ||
        statusRes.statusOnTransactionDate === 'Invalid' ||
        statusRes.statusOnTransactionDate === 'NotYetEffective'
            ? ''
            : String(embedded.gstin || gstin || customerFallback.gstNumber || '').trim().toUpperCase();

    // Prefer embedded GSTIN when history row covers date
    const finalGstin =
        embedded.source === 'embeddedHistory' || embedded.source === 'currentNotYetEffective'
            ? embedded.gstin
            : gstinOnDate;

    let recommendedCategory = 'B2C';
    let recommendedTreatment = 'Unregistered / B2C';
    if (
        String(finalGstin).length >= 15 &&
        !['Cancelled', 'Suspended', 'Invalid', 'NotYetEffective'].includes(statusRes.statusOnTransactionDate || '')
    ) {
        recommendedCategory = 'B2B';
        recommendedTreatment = 'B2B Registered';
    }
    if (statusRes.statusOnTransactionDate === 'Cancelled' || statusRes.statusOnTransactionDate === 'NotYetEffective') {
        recommendedCategory = 'B2C';
        recommendedTreatment =
            statusRes.statusOnTransactionDate === 'NotYetEffective'
                ? 'GST registration effective after invoice date'
                : 'GSTIN cancelled on/before invoice date — B2C';
    }

    // Current master effectiveFrom after invoice date:
    // - If embedded history covers with a *different* GSTIN → keep historical period (multi-GSTIN).
    // - If covering GSTIN equals current master GSTIN → treat as corrected start date (not B2B yet).
    const masterEff = customerFallback.gstRegistrationEffectiveDate;
    if (masterEff && invoiceDate && new Date(masterEff) > new Date(invoiceDate)) {
        const currentG = String(customerFallback.gstNumber || gstin || '')
            .trim()
            .toUpperCase();
        const coveringSameAsCurrent =
            embedded.source === 'embeddedHistory' &&
            String(embedded.gstin || '')
                .trim()
                .toUpperCase() === currentG &&
            Boolean(currentG);
        if (embedded.source !== 'embeddedHistory' || coveringSameAsCurrent || embedded.source === 'currentNotYetEffective') {
            return {
                ...statusRes,
                statusOnTransactionDate: 'NotYetEffective',
                gstinOnDate: '',
                recommendedCategory: 'B2C',
                recommendedTreatment: 'GST registration effective after invoice date',
                historyRowCount: historyRows.length,
                embeddedSource: embedded.source,
            };
        }
    }

    // If embedded history explicitly says not yet effective
    if (embedded.source === 'currentNotYetEffective') {
        return {
            ...statusRes,
            statusOnTransactionDate: 'NotYetEffective',
            gstinOnDate: '',
            recommendedCategory: 'B2C',
            recommendedTreatment: 'GST registration effective after invoice date',
            historyRowCount: historyRows.length,
            embeddedSource: embedded.source,
        };
    }

    return {
        ...statusRes,
        gstinOnDate: finalGstin,
        recommendedCategory,
        recommendedTreatment,
        historyRowCount: historyRows.length,
        embeddedSource: embedded.source,
    };
}

/**
 * Revalidate all open invoices for a customer; create amendments for filed periods.
 * Idempotent via amendment uniqueness check + snapshot equality skip.
 */
export async function revalidateCustomerOpenGst({
    companyId,
    customerId,
    customer,
    userId,
    reason,
    ipAddress,
    userAgent,
    idempotencyKey,
}) {
    const invoices = await SalesInvoice.find({
        companyId: oid(companyId),
        customerId: oid(customerId),
        isDeleted: { $ne: true },
        status: { $ne: 'Cancelled' },
    }).lean(false);

    const summary = {
        dependentChecked: invoices.length,
        openRevalidated: 0,
        filedProtected: 0,
        amendmentsCreated: 0,
        skippedUnchanged: 0,
        errors: [],
        idempotencyKey: idempotencyKey || '',
    };

    for (const inv of invoices) {
        try {
            // Never rewrite e-invoice legal snapshot
            if (inv.irn || inv.eInvoiceStatus === 'Generated') {
                summary.filedProtected += 1;
                const period = returnPeriodFromDate(inv.invoiceDate);
                const filed = await isPeriodFiled(companyId, period);
                if (filed || inv.irn) {
                    await ensureAmendment({
                        inv,
                        companyId,
                        customer,
                        userId,
                        reason: reason || 'Master GST alteration — e-invoice/filed protected',
                        resolution: await resolveCustomerGstOnInvoiceDate({
                            companyId,
                            customerId,
                            gstin: customer.gstNumber,
                            invoiceDate: inv.invoiceDate,
                            customerFallback: customer,
                        }),
                    });
                    summary.amendmentsCreated += 1;
                }
                continue;
            }

            const period = returnPeriodFromDate(inv.invoiceDate);
            const filed = await isPeriodFiled(companyId, period);
            const resolution = await resolveCustomerGstOnInvoiceDate({
                companyId,
                customerId,
                gstin: customer.gstNumber,
                invoiceDate: inv.invoiceDate,
                customerFallback: customer,
            });

            const proposedGstin = String(resolution.gstinOnDate || '').trim().toUpperCase();
            const masterType = String(customer.gstRegistrationType || '').trim();
            const proposedReg =
                proposedGstin.length >= 15
                    ? (['Consumer', 'Unregistered', ''].includes(masterType) ? 'Registered' : masterType || 'Registered')
                    : (masterType || 'Consumer');
            const proposedCategory =
                proposedGstin.length >= 15 ? resolution.recommendedCategory || 'B2B' : 'B2C';

            if (filed) {
                summary.filedProtected += 1;
                const created = await ensureAmendment({
                    inv,
                    companyId,
                    customer,
                    userId,
                    reason,
                    resolution,
                });
                if (created) summary.amendmentsCreated += 1;
                continue;
            }

            const oldClass = classifyFromSnapshots(
                inv.customerGstin,
                inv.customerRegistrationType,
                inv.gstr1CategorySnapshot,
            );
            if (
                String(inv.customerGstin || '').toUpperCase() === String(proposedGstin || '').toUpperCase() &&
                oldClass === proposedCategory &&
                String(inv.customerRegistrationType || '') === String(proposedReg || '')
            ) {
                summary.skippedUnchanged += 1;
                continue;
            }

            const snap = buildTransactionGstSnapshot(
                {
                    gstin: proposedGstin,
                    statusOnTransactionDate: resolution.statusOnTransactionDate,
                    recommendedGSTTreatment: resolution.recommendedTreatment,
                    recommendedReturnCategory: proposedCategory,
                    cancellationDate: customer.gstCancellationEffectiveDate || null,
                    sourceHistoryId: resolution.sourceHistoryId,
                    resolutionReason: resolution.resolutionReason,
                },
                {},
            );

            inv.customerGstin = proposedGstin;
            inv.customerRegistrationType = proposedReg;
            inv.gstr1CategorySnapshot = snap.gstr1CategorySnapshot;
            inv.gstTreatmentSnapshot = snap.gstTreatmentSnapshot;
            inv.gstStatusOnTransactionDate = snap.gstStatusOnTransactionDate;
            inv.gstinUsed = snap.gstinUsed;
            inv.gstStatusSnapshot = snap.gstStatusSnapshot;
            inv.cancellationDateSnapshot = snap.cancellationDateSnapshot;
            inv.decisionReason = snap.decisionReason;
            inv.gstRevalidationRequired = false;
            inv.gstRevalidatedAt = new Date();
            inv.updatedBy = userId;
            // State/POS from master only when open and master has values — do not change tax split
            if (customer.state && !inv.billingState) inv.billingState = customer.state;
            if (customer.billingStateCode && !inv.billingStateCode) {
                inv.billingStateCode = customer.billingStateCode;
            }
            await inv.save();
            summary.openRevalidated += 1;
        } catch (err) {
            summary.errors.push({ invoiceId: String(inv._id), message: err.message });
        }
    }

    if (userId) {
        await AuditLog.create({
            user: userId,
            action: 'OTHER',
            module: 'MasterAlteration.GstRevalidation',
            resourceId: oid(customerId),
            description: `Customer GST open revalidation: ${summary.openRevalidated} open, ${summary.filedProtected} filed protected, ${summary.amendmentsCreated} amendments`,
            details: { ...summary, reason, companyId: String(companyId) },
            ipAddress,
            userAgent,
        });
    }

    return summary;
}

async function ensureAmendment({ inv, companyId, customer, userId, reason, resolution }) {
    const period = returnPeriodFromDate(inv.invoiceDate);
    const proposedGstin = resolution.gstinOnDate;
    const proposedClass = resolution.recommendedCategory;
    const existing = await Gstr1Amendment.findOne({
        companyId: oid(companyId),
        salesInvoiceId: inv._id,
        originalReturnPeriod: period,
        status: { $in: ['Amendment Required', 'Draft Amendment'] },
    }).lean();
    if (existing) return false;

    await Gstr1Amendment.create({
        companyId: oid(companyId),
        financialYear: inv.financialYear || '',
        originalReturnPeriod: period,
        salesInvoiceId: inv._id,
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customerId,
        originalValues: {
            customerGstin: inv.customerGstin || '',
            customerRegistrationType: inv.customerRegistrationType || '',
            billingState: inv.billingState || '',
            billingStateCode: inv.billingStateCode || '',
            placeOfSupply: inv.placeOfSupply || '',
            gstType: inv.gstType || '',
            classification: classifyFromSnapshots(
                inv.customerGstin,
                inv.customerRegistrationType,
                inv.gstr1CategorySnapshot,
            ),
        },
        correctedValues: {
            customerGstin: proposedGstin,
            customerRegistrationType:
                proposedGstin.length >= 15
                    ? customer.gstRegistrationType || 'Registered'
                    : 'Unregistered',
            billingState: customer.state || inv.billingState || '',
            billingStateCode: customer.billingStateCode || inv.billingStateCode || '',
            placeOfSupply: inv.placeOfSupply || '',
            gstType: inv.gstType || '',
            classification: proposedClass,
        },
        amendmentReason: String(reason || 'Master GST alteration — filed/protected period').trim(),
        status: 'Amendment Required',
        taxImpact: 'MetadataOnly',
        accountingImpact: 'None — filed/e-invoice snapshot not overwritten',
        gstr1SheetImpact: 'Amendment required for classification/GSTIN metadata',
        createdBy: userId,
    });
    return true;
}

/**
 * Propagate Item HSN to open (unfiled, non-e-invoice) sales invoice lines only.
 */
export async function propagateItemHsnOpen({
    companyId,
    itemId,
    newHsnCode,
    newHsnSacId,
    userId,
    reason,
}) {
    const invoices = await SalesInvoice.find({
        companyId: oid(companyId),
        'items.itemId': oid(itemId),
        isDeleted: { $ne: true },
        status: { $ne: 'Cancelled' },
    });

    const filedSet = new Set(
        (
            await Gstr1PeriodStatus.find({ companyId: oid(companyId), status: 'Filed' })
                .select('returnPeriod')
                .lean()
        ).map((r) => r.returnPeriod),
    );

    const summary = {
        dependentChecked: invoices.length,
        openLinesUpdated: 0,
        filedProtected: 0,
        amendmentsCreated: 0,
        errors: [],
    };

    for (const inv of invoices) {
        const period = returnPeriodFromDate(inv.invoiceDate);
        const protectedDoc =
            filedSet.has(period) || inv.irn || inv.eInvoiceStatus === 'Generated';
        if (protectedDoc) {
            summary.filedProtected += 1;
            continue;
        }
        let changed = false;
        for (const line of inv.items || []) {
            if (String(line.itemId) !== String(itemId)) continue;
            if (String(line.hsnCode || '') === String(newHsnCode || '')) continue;
            line.hsnCode = newHsnCode || '';
            if (newHsnSacId) line.hsnSacId = newHsnSacId;
            changed = true;
            summary.openLinesUpdated += 1;
        }
        if (changed) {
            inv.updatedBy = userId;
            inv.gstRevalidationRequired = true;
            await inv.save();
        }
    }

    if (userId) {
        await AuditLog.create({
            user: userId,
            action: 'OTHER',
            module: 'MasterAlteration.HsnPropagation',
            resourceId: oid(itemId),
            description: `Item HSN open propagation: ${summary.openLinesUpdated} lines; ${summary.filedProtected} filed protected`,
            details: { ...summary, reason, newHsnCode, companyId: String(companyId) },
        });
    }
    return summary;
}
