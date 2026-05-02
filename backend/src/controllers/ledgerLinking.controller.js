import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import Customer from '../models/customer.model.js';
import { Supplier } from '../models/supplier.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { findMatchingLedger, autoLinkEntityLedger, normalizeName } from '../utils/ledgerLinking.utils.js';
import mongoose from 'mongoose';

/**
 * Preview auto-linking for all customers and suppliers
 */
export const previewAutoLink = asyncHandler(async (req, res) => {
    const customers = await Customer.find({ isDeleted: { $ne: true } }).lean();
    const suppliers = await Supplier.find({ isDeleted: { $ne: true } }).lean();

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
    for (const c of customers) {
        const name = c.company || c.customerName;
        const city = c.city || '';
        const primaryContact = c.contactPersons?.find(cp => cp.isPrimary) || c.contactPersons?.[0];
        const mobile = primaryContact?.mobile || '';
        const email = c.companyEmail || primaryContact?.email || '';

        if (c.ledgerId) {
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
    for (const s of suppliers) {
        if (s.ledgerId) {
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
    const customers = await Customer.find({ isDeleted: { $ne: true }, ledgerId: null });
    const suppliers = await Supplier.find({ isDeleted: { $ne: true }, ledgerId: null });

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
