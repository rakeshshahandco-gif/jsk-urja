/**
 * Apply Master Alteration — save master, selective open propagation, protect filed/locked, audit.
 */
import crypto from 'crypto';
import mongoose from 'mongoose';
import httpStatus from 'http-status';
import { ApiError } from '../../utils/ApiError.js';
import Customer from '../../models/customer.model.js';
import { Supplier } from '../../models/supplier.model.js';
import { AccountLedger } from '../../models/accountLedger.model.js';
import { AccountGroup } from '../../models/accountGroup.model.js';
import { Item } from '../../models/item.model.js';
import { AuditLog } from '../../models/auditLog.model.js';
import { GstStatusHistory } from '../../models/gstStatusHistory.model.js';
import { CustomerGstRegistration } from '../../models/customerGstRegistration.model.js';
import { SalesInvoice } from '../../models/salesInvoice.model.js';
import { SalesOrder } from '../../models/salesOrder.model.js';
import { PurchaseInvoice } from '../../models/purchaseInvoice.model.js';
import { PurchaseOrder } from '../../models/purchaseOrder.model.js';
import { GRN } from '../../models/grn.model.js';
import { Gstr1PeriodStatus } from '../../models/gstr1PeriodStatus.model.js';
import { LedgerEntry } from '../../models/ledgerEntry.model.js';
import { Voucher } from '../../models/voucher.model.js';
import { AccountingPeriodLock } from '../../models/accountingPeriodLock.model.js';
import { checkUserPermission } from '../../utils/permissionUtils.js';
import { MASTER_TYPES, detectChangedFields, requiresReason } from './fieldCategories.js';
import { permissionKeysForChanges, MASTER_ALTERATION_PERMISSIONS } from './permissions.js';
import { buildImpactPreview } from './impactPreview.service.js';
import { buildNextGroupHistory } from './ledgerGroupHistory.js';
import {
    revalidateCustomerOpenGst,
    propagateItemHsnOpen,
} from './gstOpenRevalidation.service.js';
import {
    getAccountGroupChain,
    classifyFromGroupChain,
    deriveLedgerFieldsFromClassification,
} from '../../utils/ledgerClassification.utils.js';
import { applyBlankGstinConsumerRule } from '../../utils/customerGstConsistency.js';
import { appendGstHistoryIfChanged } from './embeddedGstHistory.js';

async function applyGroupDerivedClassification(body) {
    if (!body?.underGroup) return;
    const chain = await getAccountGroupChain(body.underGroup);
    const classification = classifyFromGroupChain(chain);
    const derived = deriveLedgerFieldsFromClassification(classification);
    body.groupName = derived.groupName;
    body.type = derived.type;
    body.isSupplier = !!derived.isSupplier;
    body.isCustomer = !!derived.isCustomer;
    body.isBank = !!derived.isBank;
    body.isCashLedger = !!derived.isCashLedger;
    body.isTaxLedger = !!derived.isTaxLedger;
    if (Object.prototype.hasOwnProperty.call(derived, 'expenseCategory')) {
        body.expenseCategory = derived.expenseCategory;
    }
}

function oid(id) {
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

async function filedPeriodsSet(companyId) {
    const rows = await Gstr1PeriodStatus.find({
        companyId: oid(companyId),
        status: 'Filed',
    })
        .select('returnPeriod')
        .lean();
    return new Set(rows.map((r) => r.returnPeriod));
}

async function fyBooksLocked(financialYear) {
    if (!financialYear) return false;
    const lock = await AccountingPeriodLock.findOne({ financialYear, isActive: true }).lean();
    return Boolean(lock?.booksLockedTill);
}

/**
 * Name propagation that skips filed GST / e-invoice / locked FY documents.
 */
export async function propagateProtectedName({
    masterType,
    masterId,
    companyId,
    newName,
    userId,
}) {
    const filedSet = await filedPeriodsSet(companyId);
    let openUpdated = 0;
    let lockedSkipped = 0;

    if (masterType === MASTER_TYPES.CUSTOMER) {
        const invoices = await SalesInvoice.find({
            customerId: oid(masterId),
            companyId: oid(companyId),
            isDeleted: { $ne: true },
        });
        for (const inv of invoices) {
            const period = returnPeriodFromDate(inv.invoiceDate);
            const locked =
                filedSet.has(period) ||
                inv.irn ||
                inv.eInvoiceStatus === 'Generated' ||
                (await fyBooksLocked(inv.financialYear));
            if (locked) {
                lockedSkipped += 1;
                continue;
            }
            if (inv.customerName !== newName) {
                inv.customerName = newName;
                await inv.save();
                openUpdated += 1;
            }
        }
        await SalesOrder.updateMany(
            {
                customerId: oid(masterId),
                companyId: oid(companyId),
                isDeleted: { $ne: true },
                status: { $nin: ['Cancelled'] },
            },
            { $set: { customerName: newName } },
        );
        await AccountLedger.findOneAndUpdate(
            { referenceId: oid(masterId), referenceModel: 'Customer', companyId: oid(companyId) },
            { $set: { name: newName, printName: newName } },
        );
    }

    if (masterType === MASTER_TYPES.SUPPLIER) {
        const invoices = await PurchaseInvoice.find({
            supplierId: oid(masterId),
            companyId: oid(companyId),
            isDeleted: { $ne: true },
        });
        for (const inv of invoices) {
            const locked = await fyBooksLocked(inv.financialYear);
            if (locked) {
                lockedSkipped += 1;
                continue;
            }
            if (inv.supplierName !== newName) {
                inv.supplierName = newName;
                await inv.save();
                openUpdated += 1;
            }
        }
        await PurchaseOrder.updateMany(
            { supplierId: oid(masterId), companyId: oid(companyId), isDeleted: { $ne: true } },
            { $set: { supplierName: newName } },
        );
        await GRN.updateMany(
            { supplierId: oid(masterId), companyId: oid(companyId) },
            { $set: { supplierName: newName } },
        ).catch(() => {});
        await AccountLedger.findOneAndUpdate(
            { referenceId: oid(masterId), referenceModel: 'Supplier', companyId: oid(companyId) },
            { $set: { name: newName, printName: newName } },
        );
    }

    if (masterType === MASTER_TYPES.LEDGER) {
        const entries = await LedgerEntry.find({ ledgerId: oid(masterId), companyId: oid(companyId) });
        for (const le of entries) {
            if (await fyBooksLocked(le.financialYear)) {
                lockedSkipped += 1;
                continue;
            }
            if (le.ledgerName !== newName) {
                le.ledgerName = newName;
                await le.save();
                openUpdated += 1;
            }
        }
        await Voucher.updateMany(
            { partyId: oid(masterId), companyId: oid(companyId), status: { $ne: 'Cancelled' } },
            { $set: { partyName: newName } },
        );
    }

    if (masterType === MASTER_TYPES.ITEM) {
        const invoices = await SalesInvoice.find({
            'items.itemId': oid(masterId),
            companyId: oid(companyId),
            isDeleted: { $ne: true },
        });
        for (const inv of invoices) {
            const period = returnPeriodFromDate(inv.invoiceDate);
            const locked =
                filedSet.has(period) ||
                inv.irn ||
                inv.eInvoiceStatus === 'Generated';
            if (locked) {
                lockedSkipped += 1;
                continue;
            }
            let changed = false;
            for (const line of inv.items || []) {
                if (String(line.itemId) === String(masterId) && line.itemName !== newName) {
                    line.itemName = newName;
                    changed = true;
                }
            }
            if (changed) {
                await inv.save();
                openUpdated += 1;
            }
        }
    }

    return { openUpdated, lockedSkipped, userId };
}

function assertPermissions(user, masterType, changes) {
    const role = String(user?.role?.name || user?.role || '').toLowerCase();
    if (role === 'admin' || role === 'superadmin') return;

    const keys = permissionKeysForChanges(masterType, changes);
    for (const key of keys) {
        if (!checkUserPermission(user, key) && !checkUserPermission(user, key.replace('masters.alteration.', ''))) {
            // Also allow classic edit permission as soft gate for name-only Category A
            const isNameOnly = changes.every((c) => c.category === 'A');
            if (isNameOnly) {
                const editKeys = {
                    Customer: 'customers.customer_master.edit',
                    Supplier: 'purchase.suppliers.edit',
                    Ledger: 'accounts.ledger_master.edit',
                    Item: 'inventory.item_master.edit',
                };
                if (checkUserPermission(user, editKeys[masterType])) continue;
            }
            throw new ApiError(httpStatus.FORBIDDEN, `Missing permission: ${key}`);
        }
    }
}

async function collectionExists(name) {
    const cols = await mongoose.connection.db.listCollections({ name }).toArray();
    return cols.length > 0;
}

function assertCompanyOwnership(master, companyId, label) {
    if (!companyId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Company context is required for Master alteration');
    }
    if (!master.companyId) {
        throw new ApiError(
            httpStatus.CONFLICT,
            `Company ownership requires review for this ${label}. Master has no companyId — alteration stopped.`,
        );
    }
    if (String(master.companyId) !== String(companyId)) {
        throw new ApiError(httpStatus.FORBIDDEN, `${label} belongs to another company`);
    }
}

async function syncCustomerGstHistory({ companyId, customer, changes, userId, reason, priorSnapshot }) {
    const gstSensitive = changes.some((c) =>
        [
            'gstNumber',
            'gstRegistrationType',
            'gstStatus',
            'gstCancellationEffectiveDate',
            'gstRegistrationEffectiveDate',
            'state',
            'billingStateCode',
            'gstState',
        ].includes(c.field),
    );
    if (!gstSensitive) return;

    // Build history from prior → current (only when values actually changed)
    if (priorSnapshot) {
        const priorHist = Array.isArray(priorSnapshot.gstRegistrationHistory)
            ? priorSnapshot.gstRegistrationHistory
            : Array.isArray(customer.gstRegistrationHistory)
              ? customer.gstRegistrationHistory
              : [];
        const temp = {
            gstNumber: priorSnapshot.gstNumber,
            gstRegistrationType: priorSnapshot.gstRegistrationType,
            gstRegistrationStatus: priorSnapshot.gstRegistrationStatus,
            gstStatus: priorSnapshot.gstStatus,
            gstRegistrationEffectiveDate: priorSnapshot.gstRegistrationEffectiveDate,
            gstCancellationEffectiveDate: priorSnapshot.gstCancellationEffectiveDate,
            billingStateCode: priorSnapshot.billingStateCode,
            state: priorSnapshot.state,
            gstRegistrationHistory: priorHist.map((h) =>
                h && typeof h.toObject === 'function' ? h.toObject() : { ...(h || {}) },
            ),
        };
        appendGstHistoryIfChanged(temp, {
            nextGstin: customer.gstNumber,
            nextRegistrationType: customer.gstRegistrationType,
            nextStatus: customer.gstStatus,
            nextEffectiveFrom: customer.gstRegistrationEffectiveDate,
            nextCancellationDate: customer.gstCancellationEffectiveDate,
            nextStateCode: customer.billingStateCode,
            userId,
            reason,
        });
        customer.gstRegistrationHistory = temp.gstRegistrationHistory;
        await Customer.updateOne(
            { _id: customer._id },
            { $set: { gstRegistrationHistory: customer.gstRegistrationHistory } },
        );
    }

    const gstin = String(customer.gstNumber || '').trim().toUpperCase();
    if (!gstin) return;

    const effectiveFrom = customer.gstRegistrationEffectiveDate || new Date();
    const cancelFrom = customer.gstCancellationEffectiveDate || null;

    try {
        if (await collectionExists('customergstregistrations')) {
            await CustomerGstRegistration.findOneAndUpdate(
                { companyId: oid(companyId), customerId: customer._id, gstin },
                {
                    companyId: oid(companyId),
                    customerId: customer._id,
                    gstin,
                    state: customer.state || '',
                    stateCode: customer.billingStateCode || '',
                    effectiveFrom,
                    effectiveTo: cancelFrom ? new Date(new Date(cancelFrom).getTime() - 86400000) : null,
                    cancellationDate: cancelFrom,
                    status: cancelFrom ? 'Cancelled' : 'Active',
                    activeForBilling: !cancelFrom,
                },
                { upsert: true, new: true },
            );
        }
    } catch (err) {
        if (!/500 collections|cannot create a new collection/i.test(err.message || '')) throw err;
    }

    try {
        if (await collectionExists('gststatushistories')) {
            await GstStatusHistory.create({
                companyId: oid(companyId),
                customerId: customer._id,
                entityType: 'Customer',
                entityId: customer._id,
                gstin,
                status: cancelFrom ? 'Cancelled' : 'Active',
                registrationType: customer.gstRegistrationType || 'Registered',
                effectiveFrom: cancelFrom || effectiveFrom,
                cancellationDate: cancelFrom,
                registrationDate: effectiveFrom,
                source: 'master_alteration',
                providerName: 'MasterAlteration',
                notes: reason || '',
                createdBy: userId,
                manualOverride: true,
                manualOverrideReason: reason || 'Customer Master GST alteration',
            });
        }
    } catch (err) {
        if (!/500 collections|cannot create a new collection/i.test(err.message || '')) throw err;
    }
}

async function syncSupplierGstHistory({ companyId, supplier, changes, userId, reason, priorSnapshot }) {
    const gstChange = changes.find((c) =>
        ['gstNumber', 'gstRegistrationStatus', 'gstCancellationEffectiveDate', 'gstRegistrationEffectiveDate', 'state'].includes(c.field),
    );
    if (!gstChange) return;

    if (priorSnapshot) {
        const priorHist = Array.isArray(priorSnapshot.gstRegistrationHistory)
            ? priorSnapshot.gstRegistrationHistory
            : Array.isArray(supplier.gstRegistrationHistory)
              ? supplier.gstRegistrationHistory
              : [];
        const temp = {
            gstNumber: priorSnapshot.gstNumber,
            gstRegistrationType: priorSnapshot.gstRegistrationStatus,
            gstRegistrationStatus: priorSnapshot.gstRegistrationStatus,
            gstStatus: priorSnapshot.gstCancellationEffectiveDate ? 'Cancelled' : 'Active',
            gstRegistrationEffectiveDate: priorSnapshot.gstRegistrationEffectiveDate,
            gstCancellationEffectiveDate: priorSnapshot.gstCancellationEffectiveDate,
            billingStateCode: priorSnapshot.state,
            state: priorSnapshot.state,
            gstRegistrationHistory: priorHist.map((h) =>
                h && typeof h.toObject === 'function' ? h.toObject() : { ...(h || {}) },
            ),
        };
        appendGstHistoryIfChanged(temp, {
            nextGstin: supplier.gstNumber,
            nextRegistrationType: supplier.gstRegistrationStatus,
            nextStatus: supplier.gstCancellationEffectiveDate ? 'Cancelled' : 'Active',
            nextEffectiveFrom: supplier.gstRegistrationEffectiveDate,
            nextCancellationDate: supplier.gstCancellationEffectiveDate,
            nextStateCode: supplier.state,
            userId,
            reason,
        });
        supplier.gstRegistrationHistory = temp.gstRegistrationHistory;
        await supplier.save();
    }

    const gstin = String(supplier.gstNumber || '').trim().toUpperCase();
    if (gstin) {
        try {
            if (await collectionExists('gststatushistories')) {
                await GstStatusHistory.create({
                    companyId: oid(companyId),
                    customerId: null,
                    supplierId: supplier._id,
                    entityType: 'Supplier',
                    entityId: supplier._id,
                    gstin,
                    status: supplier.gstCancellationEffectiveDate ? 'Cancelled' : 'Active',
                    registrationType: supplier.gstRegistrationStatus || '',
                    effectiveFrom: supplier.gstRegistrationEffectiveDate || new Date(),
                    cancellationDate: supplier.gstCancellationEffectiveDate || null,
                    source: 'master_alteration',
                    providerName: 'MasterAlteration',
                    notes: reason || '',
                    createdBy: userId,
                    manualOverride: true,
                    manualOverrideReason: reason || 'Supplier Master GST alteration',
                });
            }
        } catch (err) {
            if (!/500 collections|cannot create a new collection/i.test(err.message || '')) throw err;
        }
    }
}

/**
 * Main apply entry.
 */
export async function applyMasterAlteration({
    masterType,
    masterId,
    proposedChanges,
    companyId,
    user,
    reason,
    effectiveFrom = null,
    confirmApply = false,
    ipAddress,
    userAgent,
}) {
    if (!confirmApply) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'confirmApply is required after Impact Preview');
    }

    const preview = await buildImpactPreview({
        masterType,
        masterId,
        proposedChanges,
        companyId,
        effectiveFrom,
    });

    if (!preview.fieldsChanged?.length) {
        return { preview, summary: { message: 'No sensitive changes' }, master: null };
    }

    if (!preview.canApply) {
        throw new ApiError(httpStatus.FORBIDDEN, preview.blockReason || 'Alteration blocked');
    }

    if (requiresReason(preview.fieldsChanged) && !String(reason || '').trim()) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Reason for Alteration is required for Category B/C changes');
    }

    assertPermissions(user, masterType, preview.fieldsChanged);

    const idempotencyKey = crypto
        .createHash('sha1')
        .update(`${masterType}:${masterId}:${JSON.stringify(proposedChanges)}:${reason || ''}`)
        .digest('hex');

    const summary = {
        dependentRecordsChecked: 0,
        openRecordsRecalculated: 0,
        gstRecordsRevalidated: 0,
        filedRecordsProtected: 0,
        amendmentsRequired: 0,
        lockedRecordsSkipped: 0,
        errors: 0,
        idempotencyKey,
    };

    let master = null;
    const userId = user?._id || user?.id;
    const changes = preview.fieldsChanged;

    // Strip confirmation meta from proposed payload
    const safeProposed = { ...proposedChanges };
    delete safeProposed.confirmApply;
    delete safeProposed._masterAlterationConfirmed;
    delete safeProposed._masterAlterationReason;
    delete safeProposed.effectiveFrom;
    delete safeProposed.reason;

    if (masterType === MASTER_TYPES.CUSTOMER) {
        const prior = await Customer.findOne({ _id: oid(masterId), isDeleted: { $ne: true } }).lean();
        if (!prior) throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
        assertCompanyOwnership(prior, companyId, 'Customer');

        // Blank GSTIN → Consumer (findOneAndUpdate bypasses model pre-save)
        if (Object.prototype.hasOwnProperty.call(safeProposed, 'gstNumber')) {
            applyBlankGstinConsumerRule(safeProposed);
        }

        master = await Customer.findOneAndUpdate(
            { _id: oid(masterId), isDeleted: { $ne: true } },
            { $set: { ...safeProposed, updatedBy: userId } },
            { new: true, runValidators: true },
        );
        if (!master) throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');

        await syncCustomerGstHistory({
            companyId,
            customer: master,
            changes,
            userId,
            reason,
            priorSnapshot: prior,
        });
        // reload after history write
        master = await Customer.findById(masterId);

        if (changes.some((c) => ['customerName', 'company'].includes(c.field))) {
            const newName = master.company || master.customerName;
            const nameRes = await propagateProtectedName({
                masterType,
                masterId,
                companyId,
                newName,
                userId,
            });
            summary.openRecordsRecalculated += nameRes.openUpdated;
            summary.lockedRecordsSkipped += nameRes.lockedSkipped;
        }

        if (
            changes.some((c) =>
                [
                    'gstNumber',
                    'gstRegistrationType',
                    'gstStatus',
                    'gstRegistrationEffectiveDate',
                    'gstCancellationEffectiveDate',
                    'state',
                    'billingStateCode',
                    'gstState',
                ].includes(c.field),
            )
        ) {
            const gst = await revalidateCustomerOpenGst({
                companyId,
                customerId: masterId,
                customer: master.toObject(),
                userId,
                reason,
                ipAddress,
                userAgent,
                idempotencyKey,
            });
            summary.dependentRecordsChecked += gst.dependentChecked;
            summary.gstRecordsRevalidated += gst.openRevalidated;
            summary.filedRecordsProtected += gst.filedProtected;
            summary.amendmentsRequired += gst.amendmentsCreated;
            summary.errors += gst.errors.length;
        } else {
            summary.dependentRecordsChecked += preview.affected?.salesInvoices || 0;
        }
    }

    if (masterType === MASTER_TYPES.SUPPLIER) {
        const prior = await Supplier.findOne({ _id: oid(masterId), isDeleted: { $ne: true } }).lean();
        if (!prior) throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found');
        assertCompanyOwnership(prior, companyId, 'Supplier');

        master = await Supplier.findOneAndUpdate(
            { _id: oid(masterId), isDeleted: { $ne: true } },
            { $set: { ...safeProposed, updatedBy: userId } },
            { new: true, runValidators: true },
        );
        if (!master) throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found');

        await syncSupplierGstHistory({
            companyId,
            supplier: master,
            changes,
            userId,
            reason,
            priorSnapshot: prior,
        });
        master = await Supplier.findById(masterId);

        if (changes.some((c) => c.field === 'supplierName')) {
            const nameRes = await propagateProtectedName({
                masterType,
                masterId,
                companyId,
                newName: master.supplierName,
                userId,
            });
            summary.openRecordsRecalculated += nameRes.openUpdated;
            summary.lockedRecordsSkipped += nameRes.lockedSkipped;
        }
        summary.dependentRecordsChecked += preview.affected?.purchaseInvoices || 0;
    }

    if (masterType === MASTER_TYPES.ITEM) {
        const priorItem = await Item.findById(masterId);
        if (!priorItem) throw new ApiError(httpStatus.NOT_FOUND, 'Item not found');
        assertCompanyOwnership(priorItem, companyId, 'Item');

        const itemUpdate = { ...safeProposed, updatedBy: userId };
        if (itemUpdate.itemName && !itemUpdate.name) itemUpdate.name = itemUpdate.itemName;
        master = await Item.findOneAndUpdate(
            { _id: oid(masterId) },
            { $set: itemUpdate },
            { new: true, runValidators: true },
        );
        if (!master) throw new ApiError(httpStatus.NOT_FOUND, 'Item not found');

        if (changes.some((c) => ['name', 'itemName'].includes(c.field))) {
            const nameRes = await propagateProtectedName({
                masterType,
                masterId,
                companyId,
                newName: master.name || master.itemName,
                userId,
            });
            summary.openRecordsRecalculated += nameRes.openUpdated;
            summary.lockedRecordsSkipped += nameRes.lockedSkipped;
        }

        if (changes.some((c) => ['hsnCode', 'hsnSacId'].includes(c.field))) {
            const hsn = await propagateItemHsnOpen({
                companyId,
                itemId: masterId,
                newHsnCode: master.hsnCode,
                newHsnSacId: master.hsnSacId,
                userId,
                reason,
            });
            summary.dependentRecordsChecked += hsn.dependentChecked;
            summary.openRecordsRecalculated += hsn.openLinesUpdated;
            summary.filedRecordsProtected += hsn.filedProtected;
            summary.errors += hsn.errors.length;
        }
    }

    if (masterType === MASTER_TYPES.LEDGER) {
        const ledger = await AccountLedger.findById(masterId);
        if (!ledger) throw new ApiError(httpStatus.NOT_FOUND, 'Ledger not found');
        assertCompanyOwnership(ledger, companyId, 'Ledger');

        if (changes.some((c) => c.field === 'underGroup')) {
            if (!checkUserPermission(user, MASTER_ALTERATION_PERMISSIONS.ALTER_LEDGER_GROUP)) {
                const role = String(user?.role?.name || user?.role || '').toLowerCase();
                if (role !== 'admin' && role !== 'superadmin') {
                    throw new ApiError(httpStatus.FORBIDDEN, 'Missing permission: Alter Ledger Group');
                }
            }
            const newGroupId = safeProposed.underGroup;
            const newGroup = await AccountGroup.findById(newGroupId).lean();
            const eff = effectiveFrom || new Date();
            ledger.groupHistory = buildNextGroupHistory({
                ledger,
                newGroupId,
                newGroupName: newGroup?.name || '',
                effectiveFrom: eff,
                changedBy: userId,
                reason,
            });
            const syncBody = { underGroup: newGroupId };
            await applyGroupDerivedClassification(syncBody);
            ledger.underGroup = newGroupId;
            ledger.groupName = syncBody.groupName;
            ledger.type = syncBody.type;
            if (syncBody.isSupplier !== undefined) ledger.isSupplier = syncBody.isSupplier;
            if (syncBody.isCustomer !== undefined) ledger.isCustomer = syncBody.isCustomer;
            summary.openRecordsRecalculated += 1;
            summary.lockedRecordsSkipped += preview.accountingImpact?.lockedFyTransactions || 0;
        }

        if (changes.some((c) => c.field === 'name') && safeProposed.name) {
            const oldName = ledger.name;
            ledger.name = safeProposed.name;
            if (safeProposed.printName) ledger.printName = safeProposed.printName;
            const nameRes = await propagateProtectedName({
                masterType,
                masterId,
                companyId: ledger.companyId || companyId,
                newName: ledger.name,
                userId,
            });
            summary.openRecordsRecalculated += nameRes.openUpdated;
            summary.lockedRecordsSkipped += nameRes.lockedSkipped;
            void oldName;
        }

        await ledger.save();
        master = ledger;
        summary.dependentRecordsChecked += preview.affected?.ledgerEntries || 0;
    }

    const audit = await AuditLog.create({
        user: userId,
        action: 'UPDATE',
        module: 'MasterAlteration',
        resourceId: oid(masterId),
        description: `${masterType} Master alteration applied: ${preview.masterName}`,
        details: {
            masterType,
            masterId: String(masterId),
            masterName: preview.masterName,
            fieldChanged: changes.map((c) => c.field),
            fields: changes.map((c) => ({
                field: c.field,
                oldValue: c.oldValue,
                newValue: c.newValue,
            })),
            oldValue: Object.fromEntries(changes.map((c) => [c.field, c.oldValue])),
            newValue: Object.fromEntries(changes.map((c) => [c.field, c.newValue])),
            changedBy: String(userId),
            changedAt: new Date().toISOString(),
            reason: reason || '',
            companyId: String(companyId),
            financialYearId: null,
            affectedDocuments: preview.affected,
            openRecordsRevalidated: summary.gstRecordsRevalidated + summary.openRecordsRecalculated,
            lockedRecordsSkipped: summary.lockedRecordsSkipped,
            filedRecordsProtected: summary.filedRecordsProtected,
            amendmentsCreated: summary.amendmentsRequired,
            validationResult: preview.gstPreviewSample || preview.accountingImpact || null,
            rollbackReference: {
                masterType,
                masterId: String(masterId),
                restoreValues: Object.fromEntries(changes.map((c) => [c.field, c.oldValue])),
                effectiveFrom: effectiveFrom || null,
            },
            idempotencyKey,
            summary,
        },
        ipAddress,
        userAgent,
    });

    return {
        message: 'Master Updated',
        preview,
        summary: {
            ...summary,
            resultLines: [
                `Dependent records checked: ${summary.dependentRecordsChecked}`,
                `Open records recalculated: ${summary.openRecordsRecalculated}`,
                `GST records revalidated: ${summary.gstRecordsRevalidated}`,
                `Filed records protected: ${summary.filedRecordsProtected}`,
                `Amendments required: ${summary.amendmentsRequired}`,
                `Errors: ${summary.errors}`,
            ],
        },
        master,
        auditId: audit._id,
    };
}
