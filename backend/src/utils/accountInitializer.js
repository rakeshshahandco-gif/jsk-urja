import { AccountGroup } from '../models/accountGroup.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { initializeVoucherTypes } from './voucherTypeInitializer.js';
import logger from './logger.js';

/**
 * Returns the ObjectId of the Sundry Debtors group, creating it if missing.
 */
export const getSundryDebtorsGroupId = async (userId = null) => {
    let group = await AccountGroup.findOne({ name: 'Sundry Debtors' });
    if (!group) {
        const parent = await AccountGroup.findOne({ name: 'Current Assets' });
        group = await AccountGroup.create({
            name: 'Sundry Debtors',
            nature: 'Assets',
            parentGroup: parent ? parent._id : null,
            createdBy: userId
        });
    }
    return group._id;
};

const initializeAccountingMasters = async (userId) => {
    try {
        logger.info('Initializing accounting masters...');

        const groupsData = [
            // ────────── PRIMARY: ASSETS ────────────────────────────────────────
            { name: 'Assets', nature: 'Assets' },

            // Fixed Assets
            { name: 'Fixed Assets', nature: 'Assets', parent: 'Assets' },
            { name: 'Plant & Machinery', nature: 'Assets', parent: 'Fixed Assets' },
            { name: 'Furniture & Fixtures', nature: 'Assets', parent: 'Fixed Assets' },
            { name: 'Computers & IT Equipment', nature: 'Assets', parent: 'Fixed Assets' },
            { name: 'Office Equipment', nature: 'Assets', parent: 'Fixed Assets' },
            { name: 'Vehicles', nature: 'Assets', parent: 'Fixed Assets' },
            { name: 'Land & Building', nature: 'Assets', parent: 'Fixed Assets' },

            // Investments
            { name: 'Investments', nature: 'Assets', parent: 'Assets' },
            { name: 'Shares & Securities', nature: 'Assets', parent: 'Investments' },
            { name: 'Fixed Deposits', nature: 'Assets', parent: 'Investments' },

            // Current Assets
            { name: 'Current Assets', nature: 'Assets', parent: 'Assets' },

            // Cash Master Group
            { name: 'Cash-in-Hand', nature: 'Assets', parent: 'Current Assets' },
            { name: 'Petty Cash', nature: 'Assets', parent: 'Cash-in-Hand' },

            // Bank Master Group
            { name: 'Bank Accounts', nature: 'Assets', parent: 'Current Assets' },
            { name: 'Current Account', nature: 'Assets', parent: 'Bank Accounts' },
            { name: 'Savings Account', nature: 'Assets', parent: 'Bank Accounts' },
            { name: 'Overdraft Account', nature: 'Assets', parent: 'Bank Accounts' },

            // Stock / Inventory Master Group
            { name: 'Stock-in-Hand', nature: 'Assets', parent: 'Current Assets' },
            { name: 'Raw Material Stock', nature: 'Assets', parent: 'Stock-in-Hand' },
            { name: 'Work-in-Progress', nature: 'Assets', parent: 'Stock-in-Hand' },
            { name: 'Finished Goods Stock', nature: 'Assets', parent: 'Stock-in-Hand' },
            { name: 'Packing Material Stock', nature: 'Assets', parent: 'Stock-in-Hand' },
            { name: 'Scrap Stock', nature: 'Assets', parent: 'Stock-in-Hand' },

            // Customer Master Group
            { name: 'Accounts Receivable', nature: 'Assets', parent: 'Current Assets' },
            { name: 'Sundry Debtors', nature: 'Assets', parent: 'Current Assets' },
            { name: 'Customer Ledgers', nature: 'Assets', parent: 'Sundry Debtors' },
            { name: 'Advance from Customers (Asset)', nature: 'Assets', parent: 'Sundry Debtors' },

            // Loans & Advances (Asset Side)
            { name: 'Loans & Advances (Asset)', nature: 'Assets', parent: 'Current Assets' },
            { name: 'Staff Advances', nature: 'Assets', parent: 'Loans & Advances (Asset)' },
            { name: 'Advance to Suppliers', nature: 'Assets', parent: 'Loans & Advances (Asset)' },
            { name: 'Security Deposits', nature: 'Assets', parent: 'Loans & Advances (Asset)' },

            // Tax / GST (Input) Master Group
            { name: 'Input Tax', nature: 'Assets', parent: 'Current Assets' },
            { name: 'GST Input Credit', nature: 'Assets', parent: 'Input Tax' },
            { name: 'CGST Input', nature: 'Assets', parent: 'Input Tax' },
            { name: 'SGST Input', nature: 'Assets', parent: 'Input Tax' },
            { name: 'IGST Input', nature: 'Assets', parent: 'Input Tax' },
            { name: 'TDS Receivable', nature: 'Assets', parent: 'Input Tax' },

            // Deposits
            { name: 'Deposits', nature: 'Assets', parent: 'Current Assets' },

            // ────────── PRIMARY: LIABILITIES ───────────────────────────────────
            { name: 'Liabilities', nature: 'Liabilities' },

            // Capital Master Group
            { name: 'Capital Account', nature: 'Liabilities', parent: 'Liabilities' },
            { name: 'Owner Capital', nature: 'Liabilities', parent: 'Capital Account' },
            { name: 'Reserves & Surplus', nature: 'Liabilities', parent: 'Capital Account' },
            { name: 'Share Capital', nature: 'Liabilities', parent: 'Capital Account' },

            // Loans Master Group
            { name: 'Loans (Liability)', nature: 'Liabilities', parent: 'Liabilities' },
            { name: 'Secured Loans', nature: 'Liabilities', parent: 'Loans (Liability)' },
            { name: 'Unsecured Loans', nature: 'Liabilities', parent: 'Loans (Liability)' },
            { name: 'Bank Overdraft', nature: 'Liabilities', parent: 'Loans (Liability)' },

            // Current Liabilities
            { name: 'Current Liabilities', nature: 'Liabilities', parent: 'Liabilities' },

            // Supplier / Vendor Master Group
            { name: 'Accounts Payable', nature: 'Liabilities', parent: 'Current Liabilities' },
            { name: 'Sundry Creditors', nature: 'Liabilities', parent: 'Current Liabilities' },
            { name: 'Supplier Ledgers', nature: 'Liabilities', parent: 'Sundry Creditors' },
            { name: 'Vendor Advances Payable', nature: 'Liabilities', parent: 'Sundry Creditors' },

            // Employee / Payroll Master Group
            { name: 'Staff & Employee Payables', nature: 'Liabilities', parent: 'Current Liabilities' },
            { name: 'Salary Payable', nature: 'Liabilities', parent: 'Staff & Employee Payables' },
            { name: 'Employee Ledgers', nature: 'Liabilities', parent: 'Staff & Employee Payables' },
            { name: 'PF Payable', nature: 'Liabilities', parent: 'Staff & Employee Payables' },
            { name: 'ESIC Payable', nature: 'Liabilities', parent: 'Staff & Employee Payables' },
            { name: 'TDS Payable', nature: 'Liabilities', parent: 'Staff & Employee Payables' },

            // GST / Tax (Output) Master Group
            { name: 'Duties & Taxes', nature: 'Liabilities', parent: 'Current Liabilities' },
            { name: 'GST Output', nature: 'Liabilities', parent: 'Duties & Taxes' },
            { name: 'CGST Output', nature: 'Liabilities', parent: 'Duties & Taxes' },
            { name: 'SGST Output', nature: 'Liabilities', parent: 'Duties & Taxes' },
            { name: 'IGST Output', nature: 'Liabilities', parent: 'Duties & Taxes' },

            // Other Current Liabilities
            { name: 'Outstanding Expenses', nature: 'Liabilities', parent: 'Current Liabilities' },
            { name: 'Advances from Customers', nature: 'Liabilities', parent: 'Current Liabilities' },
            { name: 'Provisions', nature: 'Liabilities', parent: 'Current Liabilities' },
            { name: 'Provision for Tax', nature: 'Liabilities', parent: 'Provisions' },
            { name: 'Provision for Depreciation', nature: 'Liabilities', parent: 'Provisions' },

            // Branch / Divisions
            { name: 'Branch / Divisions', nature: 'Liabilities', parent: 'Liabilities' },

            // ────────── PRIMARY: INCOME ─────────────────────────────────────────
            { name: 'Income', nature: 'Income' },

            // Sales Master Group
            { name: 'Sales Accounts', nature: 'Income', parent: 'Income' },
            { name: 'Local Sales', nature: 'Income', parent: 'Sales Accounts' },
            { name: 'Export Sales', nature: 'Income', parent: 'Sales Accounts' },
            { name: 'Inter-state Sales', nature: 'Income', parent: 'Sales Accounts' },
            { name: 'Sales Returns', nature: 'Income', parent: 'Sales Accounts' },

            // Direct Income Master Group
            { name: 'Direct Income', nature: 'Income', parent: 'Income' },
            { name: 'Job Work Income', nature: 'Income', parent: 'Direct Income' },
            { name: 'Service Income', nature: 'Income', parent: 'Direct Income' },
            { name: 'Production Recovery', nature: 'Income', parent: 'Direct Income' },

            // Indirect Income Master Group
            { name: 'Indirect Income', nature: 'Income', parent: 'Income' },
            { name: 'Interest Income', nature: 'Income', parent: 'Indirect Income' },
            { name: 'Discount Received', nature: 'Income', parent: 'Indirect Income' },
            { name: 'Scrap Sale Income', nature: 'Income', parent: 'Indirect Income' },
            { name: 'Miscellaneous Income', nature: 'Income', parent: 'Indirect Income' },

            // ────────── PRIMARY: EXPENSES ───────────────────────────────────────
            { name: 'Expenses', nature: 'Expenses' },

            // Purchase Master Group
            { name: 'Purchase Accounts', nature: 'Expenses', parent: 'Expenses' },
            { name: 'Raw Material Purchase', nature: 'Expenses', parent: 'Purchase Accounts' },
            { name: 'Consumable Purchase', nature: 'Expenses', parent: 'Purchase Accounts' },
            { name: 'Import Purchase', nature: 'Expenses', parent: 'Purchase Accounts' },
            { name: 'Purchase Returns', nature: 'Expenses', parent: 'Purchase Accounts' },

            // Direct Expenses Master Group
            { name: 'Direct Expenses', nature: 'Expenses', parent: 'Expenses' },
            { name: 'Wages', nature: 'Expenses', parent: 'Direct Expenses' },
            { name: 'Freight Inward', nature: 'Expenses', parent: 'Direct Expenses' },
            { name: 'Packing Material Expense', nature: 'Expenses', parent: 'Direct Expenses' },
            { name: 'Production Expense', nature: 'Expenses', parent: 'Direct Expenses' },
            { name: 'Power & Fuel', nature: 'Expenses', parent: 'Direct Expenses' },

            // Indirect Expenses Master Group
            { name: 'Indirect Expenses', nature: 'Expenses', parent: 'Expenses' },
            { name: 'Salary Expense', nature: 'Expenses', parent: 'Indirect Expenses' },
            { name: 'Electricity Expense', nature: 'Expenses', parent: 'Indirect Expenses' },
            { name: 'Office Expense', nature: 'Expenses', parent: 'Indirect Expenses' },
            { name: 'Rent', nature: 'Expenses', parent: 'Indirect Expenses' },
            { name: 'Repair & Maintenance', nature: 'Expenses', parent: 'Indirect Expenses' },
            { name: 'Bank Charges', nature: 'Expenses', parent: 'Indirect Expenses' },
            { name: 'Commission', nature: 'Expenses', parent: 'Indirect Expenses' },
            { name: 'Transport Expense', nature: 'Expenses', parent: 'Indirect Expenses' },
            { name: 'Printing & Stationery', nature: 'Expenses', parent: 'Indirect Expenses' },
            { name: 'Depreciation', nature: 'Expenses', parent: 'Indirect Expenses' },
            { name: 'Advertisement Expense', nature: 'Expenses', parent: 'Indirect Expenses' },
            { name: 'Travelling Expense', nature: 'Expenses', parent: 'Indirect Expenses' },
            { name: 'Legal & Professional', nature: 'Expenses', parent: 'Indirect Expenses' },
            { name: 'Insurance Expense', nature: 'Expenses', parent: 'Indirect Expenses' },
            { name: 'Round Off', nature: 'Expenses', parent: 'Indirect Expenses' },
        ];

        const groupMap = new Map();

        for (const data of groupsData) {
            let group = await AccountGroup.findOne({ name: data.name });
            if (!group) {
                const parentId = data.parent ? groupMap.get(data.parent) : null;
                group = await AccountGroup.create({
                    name: data.name,
                    nature: data.nature,
                    parentGroup: parentId,
                    createdBy: userId
                });
                logger.info(`Created group: ${data.name}`);
            }
            groupMap.set(data.name, group._id);
        }

        const defaultLedgers = [
            { name: 'Cash', group: 'Cash-in-Hand', type: 'Cash', isCashLedger: true },
            { name: 'HDFC Bank', group: 'Bank Accounts', type: 'Bank', isBank: true },
            { name: 'Purchase Account', group: 'Purchase Accounts', type: 'General' },
            { name: 'Sales Account', group: 'Sales Accounts', type: 'General' },
            { name: 'CGST Output', group: 'Duties & Taxes', type: 'Tax', isTaxLedger: true },
            { name: 'SGST Output', group: 'Duties & Taxes', type: 'Tax', isTaxLedger: true },
            { name: 'IGST Output', group: 'Duties & Taxes', type: 'Tax', isTaxLedger: true },
            { name: 'CGST Input', group: 'Input Tax', type: 'Tax', isTaxLedger: true },
            { name: 'SGST Input', group: 'Input Tax', type: 'Tax', isTaxLedger: true },
            { name: 'IGST Input', group: 'Input Tax', type: 'Tax', isTaxLedger: true },
            { name: 'Round Off', group: 'Indirect Expenses', type: 'Expense' },
            { name: 'Freight Inward', group: 'Direct Expenses', type: 'Expense' },
            { name: 'Freight & Forwarding Charges', group: 'Direct Income', type: 'Income' },
            { name: 'Salary', group: 'Indirect Expenses', type: 'Expense' },
            { name: 'Electricity', group: 'Indirect Expenses', type: 'Expense' },
        ];

        for (const data of defaultLedgers) {
            let ledger = await AccountLedger.findOne({ name: data.name });
            if (!ledger) {
                const groupId = groupMap.get(data.group);
                if (!groupId) {
                    logger.error(`Group not found for ledger ${data.name}: ${data.group}`);
                    continue;
                }
                ledger = await AccountLedger.create({
                    ...data,
                    underGroup: groupId,
                    groupName: data.group,
                    createdBy: userId
                });
                logger.info(`Created ledger: ${data.name}`);
            }
        }

        logger.info('Accounting masters initialization completed.');

        // ── Migrate all customer ledgers to Sundry Debtors ──────────────────
        const sundryDebtorsId = groupMap.get('Sundry Debtors');
        if (sundryDebtorsId) {
            const migResult = await AccountLedger.updateMany(
                { referenceModel: 'Customer' },
                { $set: { underGroup: sundryDebtorsId, groupName: 'Sundry Debtors' } }
            );
            logger.info(`Migrated ${migResult.modifiedCount} customer ledgers → Sundry Debtors`);
        }

        // ── Initialize Voucher Types (Series) ──────────────────────────────
        await initializeVoucherTypes(userId);

        return { success: true };
    } catch (error) {
        logger.error('Error initializing accounting masters:', error);
        throw error;
    }
};

export { initializeAccountingMasters };
