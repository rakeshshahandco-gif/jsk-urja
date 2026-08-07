/**
 * Master Alteration Impact Preview — no writes.
 */
import mongoose from 'mongoose';
import Customer from '../../models/customer.model.js';
import { Supplier } from '../../models/supplier.model.js';
import { AccountLedger } from '../../models/accountLedger.model.js';
import { Item } from '../../models/item.model.js';
import {
    MASTER_TYPES,
    detectChangedFields,
    highestCategory,
    requiresReason,
} from './fieldCategories.js';
import { discoverDependencies } from './dependencyDiscovery.service.js';
import { assessLedgerGroupChange } from './accountingImpact.service.js';
import { resolveCustomerGstOnInvoiceDate } from './gstOpenRevalidation.service.js';
import { applyBlankGstinConsumerRule } from '../../utils/customerGstConsistency.js';

function oid(id) {
    try {
        return new mongoose.Types.ObjectId(String(id));
    } catch {
        return null;
    }
}

async function loadMaster(masterType, masterId, companyId) {
    const id = oid(masterId);
    // Load by _id first (bypass ALS company filter via lean + or-null companyId match),
    // then enforce ownership explicitly — never treat missing companyId as cross-company OK.
    const ownershipGate = (doc) => {
        if (!doc) return null;
        if (companyId && !doc.companyId) {
            const err = new Error('Company ownership requires review');
            err.statusCode = 409;
            throw err;
        }
        if (doc && companyId && doc.companyId && String(doc.companyId) !== String(companyId)) return null;
        return doc;
    };

    switch (masterType) {
        case MASTER_TYPES.CUSTOMER: {
            // Prefer scoped find; if not found, check raw for missing-companyId legacy stop.
            let doc = await Customer.findOne({ _id: id, isDeleted: { $ne: true } });
            if (!doc && companyId) {
                const raw = await mongoose.connection.db.collection('customers').findOne({
                    _id: id,
                    isDeleted: { $ne: true },
                });
                if (raw && !raw.companyId) {
                    const err = new Error('Company ownership requires review');
                    err.statusCode = 409;
                    throw err;
                }
            }
            return ownershipGate(doc);
        }
        case MASTER_TYPES.SUPPLIER: {
            let doc = await Supplier.findOne({ _id: id, isDeleted: { $ne: true } });
            if (!doc && companyId) {
                const raw = await mongoose.connection.db.collection('suppliers').findOne({
                    _id: id,
                    isDeleted: { $ne: true },
                });
                if (raw && !raw.companyId) {
                    const err = new Error('Company ownership requires review');
                    err.statusCode = 409;
                    throw err;
                }
            }
            return ownershipGate(doc);
        }
        case MASTER_TYPES.LEDGER: {
            let ledger = await AccountLedger.findById(id);
            if (!ledger && companyId) {
                const raw = await mongoose.connection.db.collection('accountledgers').findOne({ _id: id });
                if (raw && !raw.companyId) {
                    const err = new Error('Company ownership requires review');
                    err.statusCode = 409;
                    throw err;
                }
            }
            return ownershipGate(ledger);
        }
        case MASTER_TYPES.ITEM: {
            let doc = await Item.findById(id);
            if (!doc && companyId) {
                const raw = await mongoose.connection.db.collection('items').findOne({ _id: id });
                if (raw && !raw.companyId) {
                    const err = new Error('Company ownership requires review');
                    err.statusCode = 409;
                    throw err;
                }
            }
            return ownershipGate(doc);
        }
        default:
            return null;
    }
}

function masterDisplayName(masterType, doc) {
    if (!doc) return '';
    if (masterType === MASTER_TYPES.CUSTOMER) return doc.company || doc.customerName || '';
    if (masterType === MASTER_TYPES.SUPPLIER) return doc.supplierName || '';
    if (masterType === MASTER_TYPES.LEDGER) return doc.name || '';
    if (masterType === MASTER_TYPES.ITEM) return doc.name || doc.itemName || '';
    return '';
}

export async function buildImpactPreview({
    masterType,
    masterId,
    proposedChanges,
    companyId,
    effectiveFrom = null,
}) {
    const master = await loadMaster(masterType, masterId, companyId);
    if (!master) {
        const err = new Error(`${masterType} not found`);
        err.statusCode = 404;
        throw err;
    }

    // Keep Impact Preview aligned with apply: blank GSTIN → Consumer (both fields visible).
    const proposed = { ...(proposedChanges || {}) };
    if (masterType === MASTER_TYPES.CUSTOMER && Object.prototype.hasOwnProperty.call(proposed, 'gstNumber')) {
        applyBlankGstinConsumerRule(proposed);
    }

    const changes = detectChangedFields(masterType, master, proposed);
    if (!changes.length) {
        return {
            masterType,
            masterId: String(masterId),
            masterName: masterDisplayName(masterType, master),
            fieldsChanged: [],
            noSensitiveChanges: true,
            message: 'No sensitive Master fields changed.',
            canApply: true,
            requiresReason: false,
        };
    }

    const deps = await discoverDependencies(masterType, masterId, companyId);
    const category = highestCategory(changes);
    const needReason = requiresReason(changes);

    const automaticAction = [];
    const protectedAction = [];
    const requiredAction = [];
    let canApply = true;
    let blockReason = '';
    let accountingImpact = null;
    let gstPreviewSample = null;

    const hasGstChange = changes.some((c) =>
        ['gstNumber', 'gstRegistrationType', 'gstStatus', 'gstRegistrationStatus', 'gstRegistrationEffectiveDate', 'gstCancellationEffectiveDate', 'state', 'billingStateCode', 'gstState'].includes(c.field),
    );
    const hasNameChange = changes.some((c) =>
        ['customerName', 'company', 'supplierName', 'name', 'itemName'].includes(c.field),
    );
    const hasHsnChange = changes.some((c) => ['hsnCode', 'hsnSacId'].includes(c.field));
    const hasGroupChange = changes.some((c) => c.field === 'underGroup' || c.field === 'groupName');

    if (masterType === MASTER_TYPES.CUSTOMER) {
        const c = deps.counts || {};
        if (hasGstChange) {
            automaticAction.push(
                `${c.openGstr1 || 0} Open GST records will be revalidated (invoice-date effective).`,
            );
            protectedAction.push(
                `${c.filedGstr1 || 0} Filed GSTR-1 records will NOT be rewritten.`,
            );
            if (c.eInvoiced) {
                protectedAction.push(`${c.eInvoiced} E-invoice documents protected.`);
            }
            requiredAction.push(
                `${c.filedGstr1 || 0} Amendment Required actions for filed/protected periods.`,
            );
            // Sample first invoice date-effective resolve
            if (deps.invoices?.[0]) {
                const inv = deps.invoices[0];
                const merged = { ...master.toObject(), ...proposed };
                gstPreviewSample = await resolveCustomerGstOnInvoiceDate({
                    companyId,
                    customerId: masterId,
                    gstin: merged.gstNumber,
                    invoiceDate: inv.invoiceDate,
                    customerFallback: merged,
                });
            }
        }
        if (hasNameChange) {
            automaticAction.push(
                'Open / unlocked lists and reports will show the corrected Master name via customerId.',
            );
            protectedAction.push(
                'Filed GST / e-invoice / locked-period name snapshots will NOT be overwritten.',
            );
        }
    }

    if (masterType === MASTER_TYPES.SUPPLIER) {
        const c = deps.counts || {};
        if (hasGstChange) {
            automaticAction.push(
                'Supplier GST evaluated by purchase invoice date via embedded gstRegistrationHistory (no new collection).',
            );
            automaticAction.push(
                `${c.purchaseOrders || 0} POs, ${c.purchaseInvoices || 0} purchase invoices, ${c.payments || 0} payments, ${c.debitNotes || 0} debit notes linked by supplierId.`,
            );
            protectedAction.push('Purchase GST / ITC amounts are not auto-rewritten in this phase — architecture only.');
            if (c.outstandingBills != null) {
                automaticAction.push(`Outstanding unpaid / partial bills: ${c.outstandingBills}`);
            }
        }
        if (hasNameChange) {
            automaticAction.push('Open supplier lists/reports show corrected name; protected docs keep snapshot.');
            protectedAction.push('Locked / statutory supplier name snapshots preserved where flagged.');
        }
    }

    if (masterType === MASTER_TYPES.ITEM && hasHsnChange) {
        const c = deps.counts || {};
        automaticAction.push(
            `Old HSN → New HSN: open sales lines to revalidate: ${c.openSalesInvoiceLines || 0}.`,
        );
        protectedAction.push(
            `Protected: filed sales lines ${c.filedInvoiceLines || 0}, e-invoice lines ${c.eInvoiceLines || c.eInvoiced || 0}.`,
        );
        protectedAction.push(
            `Open GSTR-1 HSN records may revalidate: ${c.openGstr1Hsn || c.openGstr1 || 0}; filed HSN history requires amendment.`,
        );
        if (c.purchaseInvoiceLines || c.purchaseReferences) {
            automaticAction.push(
                `Purchase references linked: ${c.purchaseInvoiceLines || c.purchaseReferences || 0} (no silent tax rewrite).`,
            );
        }
        requiredAction.push('Filed / e-invoice HSN: amendments or corrections required — snapshots not silently rewritten.');
    }

    if (masterType === MASTER_TYPES.ITEM && hasNameChange) {
        automaticAction.push('Open item name displays update via itemId where appropriate.');
        protectedAction.push('Filed/e-invoice line name snapshots preserved.');
    }

    if (masterType === MASTER_TYPES.LEDGER && hasGroupChange) {
        accountingImpact = await assessLedgerGroupChange({
            ledger: master,
            newGroupId: proposedChanges.underGroup,
            companyId,
            effectiveFrom,
        });
        if (!accountingImpact.retrospectiveAlterationPermitted) {
            canApply = false;
            blockReason = accountingImpact.blockReason;
        } else if (accountingImpact.requiresEffectiveFrom && !effectiveFrom) {
            canApply = false;
            blockReason = accountingImpact.blockReason;
        } else {
            automaticAction.push(
                'Current underGroup updated; groupHistory embeds prior classification for locked / earlier periods.',
            );
            automaticAction.push(
                'Trial Balance / P&L / Balance Sheet classify each LedgerEntry by transaction date (resolveLedgerGroupAtDate), not only period end.',
            );
            automaticAction.push(
                `Open entries: ${accountingImpact.openFyTransactions || 0}; Locked entries: ${accountingImpact.lockedFyTransactions || 0}.`,
            );
            if (accountingImpact.plImpact) automaticAction.push(`P&L impact: ${accountingImpact.plImpact}`);
            if (accountingImpact.bsImpact) automaticAction.push(`Balance Sheet impact: ${accountingImpact.bsImpact}`);
            if (accountingImpact.outstandingImpact) {
                automaticAction.push(`Outstanding impact: ${accountingImpact.outstandingImpact}`);
            }
            if (accountingImpact.hasLockedHistory) {
                protectedAction.push(
                    `${accountingImpact.lockedFyTransactions} locked-FY ledger entries keep prior group via effective dating.`,
                );
            }
        }
    }

    if (masterType === MASTER_TYPES.LEDGER && hasNameChange && !hasGroupChange) {
        automaticAction.push('Ledger name propagates to open vouchers/entries where unlocked.');
        protectedAction.push('Locked-period ledgerName snapshots are not blindly overwritten.');
    }

    return {
        title: 'MASTER ALTERATION IMPACT',
        masterType,
        masterId: String(masterId),
        masterName: masterDisplayName(masterType, master),
        companyId: companyId ? String(companyId) : null,
        fieldsChanged: changes,
        category,
        requiresReason: needReason,
        affected: deps.counts,
        financialYears: deps.financialYears || null,
        automaticAction,
        protectedAction,
        requiredAction,
        accountingImpact,
        gstPreviewSample,
        canApply,
        blockReason,
        buttons: ['Cancel', 'Review Details', 'Apply Change'],
        effectiveFrom: effectiveFrom || null,
    };
}
