import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import Customer from '../models/customer.model.js';
import { Supplier } from '../models/supplier.model.js';
import { CashBankAccount } from '../models/cashBankAccount.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { findMatchingLedger, autoLinkEntityLedger, autoLinkCashBankLedger, normalizeName } from '../utils/ledgerLinking.utils.js';
import mongoose from 'mongoose';

/**
 * Preview auto-linking for all customers and suppliers
 */
export const previewAutoLink = asyncHandler(async (req, res) => {
    const customers = await Customer.find({ 
        $or: [
            { isDeleted: { $ne: true } },
            { isDeleted: { $exists: false } }
        ]
    }).lean();
    const suppliers = await Supplier.find({ 
        $or: [
            { isDeleted: { $ne: true } },
            { isDeleted: { $exists: false } }
        ]
    }).lean();

    const results = {
        customers: [],
        suppliers: [],
        summary: {
            totalCustomers: customers.length,
            customersAlreadyLinked: 0,
            customersToLink: 0,
            customersToCreate: 0,
            totalSuppliers: suppliers.length,
            suppliersAlreadyLinked: 0,
            suppliersToLink: 0,
            suppliersToCreate: 0
        }
    };

    // Process Customers
    console.log(`[LedgerLink] Scanning ${customers.length} customers...`);
    for (const c of customers) {
        const name = c.company || c.customerName;
        const city = c.city || '';
        const primaryContact = c.contactPersons?.find(cp => cp.isPrimary) || c.contactPersons?.[0];
        const mobile = primaryContact?.mobile || '';
        const email = c.companyEmail || primaryContact?.email || '';

        if (c.ledgerId && c.ledgerId.toString() !== '') {
            results.summary.customersAlreadyLinked++;
            continue;
        }

        const match = await findMatchingLedger({
            name, city, gstin: c.gstNumber, type: 'Customer',
            mobile, email
        });

        if (match) {
            results.summary.customersToLink++;
            results.customers.push({
                id: c._id,
                name,
                city,
                existingLedgerFound: true,
                ledgerName: match.name,
                action: 'Link Existing',
                group: 'Sundry Debtors'
            });
        } else {
            results.summary.customersToCreate++;
            results.customers.push({
                id: c._id,
                name,
                city,
                existingLedgerFound: false,
                proposedLedgerName: city ? `${name} - ${city}` : name,
                action: 'Create New',
                group: 'Sundry Debtors'
            });
        }
    }

    // Process Suppliers
    console.log(`[LedgerLink] Scanning ${suppliers.length} suppliers...`);
    for (const s of suppliers) {
        if (s.ledgerId && s.ledgerId.toString() !== '') {
            results.summary.suppliersAlreadyLinked++;
            continue;
        }

        const match = await findMatchingLedger({
            name: s.supplierName, city: s.city, gstin: s.gstNumber, pan: s.panNumber,
            mobile: s.phone, email: s.email, type: 'Supplier'
        });

        if (match) {
            results.summary.suppliersToLink++;
            results.suppliers.push({
                id: s._id,
                name: s.supplierName,
                city: s.city,
                existingLedgerFound: true,
                ledgerName: match.name,
                action: 'Link Existing',
                group: 'Sundry Creditors'
            });
        } else {
            results.summary.suppliersToCreate++;
            results.suppliers.push({
                id: s._id,
                name: s.supplierName,
                city: s.city,
                existingLedgerFound: false,
                proposedLedgerName: s.city ? `${s.supplierName} - ${s.city}` : s.supplierName,
                action: 'Create New',
                group: 'Sundry Creditors'
            });
        }
    }

    res.json(new ApiResponse(200, results, 'Auto-link preview generated'));
});

/**
 * Apply auto-linking for all customers and suppliers
 */
export const applyAutoLink = asyncHandler(async (req, res) => {
    const customers = await Customer.find({ 
        isDeleted: { $ne: true }, 
        $or: [
            { ledgerId: null },
            { ledgerId: { $exists: false } },
            { ledgerId: "" }
        ]
    });
    const suppliers = await Supplier.find({ 
        isDeleted: { $ne: true }, 
        $or: [
            { ledgerId: null },
            { ledgerId: { $exists: false } },
            { ledgerId: "" }
        ]
    });

    const stats = {
        customersLinked: 0,
        customersCreated: 0,
        suppliersLinked: 0,
        suppliersCreated: 0,
        errors: []
    };

    // Link Customers
    for (const c of customers) {
        try {
            const name = c.company || c.customerName;
            const match = await findMatchingLedger({
                name, city: c.city, gstin: c.gstNumber, type: 'Customer'
            });
            
            await autoLinkEntityLedger(c, 'Customer');
            if (match) stats.customersLinked++;
            else stats.customersCreated++;
        } catch (err) {
            stats.errors.push(`Customer ${c.customerCode}: ${err.message}`);
        }
    }

    // Link Suppliers
    for (const s of suppliers) {
        try {
            const match = await findMatchingLedger({
                name: s.supplierName, city: s.city, gstin: s.gstNumber, type: 'Supplier'
            });
            await autoLinkEntityLedger(s, 'Supplier');
            if (match) stats.suppliersLinked++;
            else stats.suppliersCreated++;
        } catch (err) {
            stats.errors.push(`Supplier ${s.supplierCode}: ${err.message}`);
        }
    }

    res.json(new ApiResponse(200, stats, 'Auto-linking completed'));
});

/**
 * Auto-link a single entity (Customer or Supplier)
 */
export const autoLinkSingle = asyncHandler(async (req, res) => {
    const { entityId, entityType } = req.body;

    if (!entityId || !entityType) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Entity ID and Type are required');
    }

    let entity;
    let ledgerId;

    if (entityType === 'Customer') {
        entity = await Customer.findById(entityId);
        if (!entity) throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
        ledgerId = await autoLinkEntityLedger(entity, 'Customer');
    } else if (entityType === 'Supplier') {
        entity = await Supplier.findById(entityId);
        if (!entity) throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found');
        ledgerId = await autoLinkEntityLedger(entity, 'Supplier');
    } else if (entityType === 'CashBankAccount') {
        entity = await CashBankAccount.findById(entityId);
        if (!entity) throw new ApiError(httpStatus.NOT_FOUND, 'Cash/Bank account not found');
        ledgerId = await autoLinkCashBankLedger(entity);
    }

    if (!ledgerId) {
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to auto-link ledger');
    }

    res.json(new ApiResponse(200, { ledgerId }, `${entityType} linked successfully`));
});

/**
 * Preview auto-linking for all Cash and Bank accounts
 */
export const previewCashBankLink = asyncHandler(async (req, res) => {
    const accounts = await CashBankAccount.find({ status: 'Active' }).lean();

    const results = {
        accounts: [],
        summary: {
            totalAccounts: accounts.length,
            alreadyLinked: 0,
            toLink: 0,
            toCreate: 0
        }
    };

    for (const acc of accounts) {
        if (acc.ledgerId) {
            results.summary.alreadyLinked++;
            continue;
        }

        const isBank = acc.accountType === 'Bank';
        const exactNameRegex = new RegExp(`^\\s*${acc.accountName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
        const match = await AccountLedger.findOne({ 
            name: exactNameRegex, 
            type: isBank ? 'Bank' : 'Cash' 
        }).lean();

        if (match) {
            results.summary.toLink++;
            results.accounts.push({
                id: acc._id,
                name: acc.accountName,
                type: acc.accountType,
                existingLedgerFound: true,
                ledgerName: match.name,
                action: 'Link Existing',
                group: isBank ? 'Bank Accounts' : 'Cash-in-Hand'
            });
        } else {
            results.summary.toCreate++;
            results.accounts.push({
                id: acc._id,
                name: acc.accountName,
                type: acc.accountType,
                existingLedgerFound: false,
                proposedLedgerName: acc.accountName.trim(),
                action: 'Create New',
                group: isBank ? 'Bank Accounts' : 'Cash-in-Hand'
            });
        }
    }

    res.json(new ApiResponse(200, results, 'Cash/Bank auto-link preview generated'));
});

/**
 * Apply auto-linking for all Cash and Bank accounts
 */
export const applyCashBankLink = asyncHandler(async (req, res) => {
    const accounts = await CashBankAccount.find({ 
        $or: [
            { ledgerId: null },
            { ledgerId: { $exists: false } },
            { ledgerId: "" }
        ]
    });

    const stats = {
        linked: 0,
        created: 0,
        errors: []
    };

    for (const acc of accounts) {
        try {
            const isBank = acc.accountType === 'Bank';
            const exactNameRegex = new RegExp(`^\\s*${acc.accountName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
            const match = await AccountLedger.findOne({ 
                name: exactNameRegex, 
                type: isBank ? 'Bank' : 'Cash' 
            }).lean();

            await autoLinkCashBankLedger(acc);
            if (match) stats.linked++;
            else stats.created++;
        } catch (err) {
            stats.errors.push(`Account ${acc.accountName}: ${err.message}`);
        }
    }

    res.json(new ApiResponse(200, stats, 'Cash/Bank auto-linking completed'));
});
