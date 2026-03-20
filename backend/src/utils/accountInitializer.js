import { AccountGroup } from '../models/accountGroup.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import logger from './logger.js';

const initializeAccountingMasters = async (userId) => {
    try {
        logger.info('Initializing accounting masters...');

        const groupsData = [
            // Primary: Assets
            { name: 'Assets', nature: 'Assets' },
            { name: 'Fixed Assets', nature: 'Assets', parent: 'Assets' },
            { name: 'Plant & Machinery', nature: 'Assets', parent: 'Fixed Assets' },
            { name: 'Furniture & Fixtures', nature: 'Assets', parent: 'Fixed Assets' },
            { name: 'Computers', nature: 'Assets', parent: 'Fixed Assets' },
            { name: 'Office Equipment', nature: 'Assets', parent: 'Fixed Assets' },
            { name: 'Current Assets', nature: 'Assets', parent: 'Assets' },
            { name: 'Cash-in-Hand', nature: 'Assets', parent: 'Current Assets' },
            { name: 'Bank Accounts', nature: 'Assets', parent: 'Current Assets' },
            { name: 'Stock-in-Hand', nature: 'Assets', parent: 'Current Assets' },
            { name: 'Accounts Receivable', nature: 'Assets', parent: 'Current Assets' },
            { name: 'Loans & Advances', nature: 'Assets', parent: 'Current Assets' },
            { name: 'Deposits', nature: 'Assets', parent: 'Current Assets' },
            { name: 'Input Tax', nature: 'Assets', parent: 'Current Assets' },

            // Primary: Liabilities
            { name: 'Liabilities', nature: 'Liabilities' },
            { name: 'Capital Account', nature: 'Liabilities', parent: 'Liabilities' },
            { name: 'Loans (Liability)', nature: 'Liabilities', parent: 'Liabilities' },
            { name: 'Secured Loans', nature: 'Liabilities', parent: 'Loans (Liability)' },
            { name: 'Unsecured Loans', nature: 'Liabilities', parent: 'Loans (Liability)' },
            { name: 'Current Liabilities', nature: 'Liabilities', parent: 'Liabilities' },
            { name: 'Accounts Payable', nature: 'Liabilities', parent: 'Current Liabilities' },
            { name: 'Duties & Taxes', nature: 'Liabilities', parent: 'Current Liabilities' },
            { name: 'Outstanding Expenses', nature: 'Liabilities', parent: 'Current Liabilities' },
            { name: 'Salary Payable', nature: 'Liabilities', parent: 'Current Liabilities' },
            { name: 'Advances from Customers', nature: 'Liabilities', parent: 'Current Liabilities' },

            // Primary: Income
            { name: 'Income', nature: 'Income' },
            { name: 'Sales Accounts', nature: 'Income', parent: 'Income' },
            { name: 'Local Sales', nature: 'Income', parent: 'Sales Accounts' },
            { name: 'Export Sales', nature: 'Income', parent: 'Sales Accounts' },
            { name: 'Direct Income', nature: 'Income', parent: 'Income' },
            { name: 'Job Work Income', nature: 'Income', parent: 'Direct Income' },
            { name: 'Indirect Income', nature: 'Income', parent: 'Income' },
            { name: 'Interest Income', nature: 'Income', parent: 'Indirect Income' },
            { name: 'Discount Received', nature: 'Income', parent: 'Indirect Income' },

            // Primary: Expenses
            { name: 'Expenses', nature: 'Expenses' },
            { name: 'Purchase Accounts', nature: 'Expenses', parent: 'Expenses' },
            { name: 'Raw Material Purchase', nature: 'Expenses', parent: 'Purchase Accounts' },
            { name: 'Consumable Purchase', nature: 'Expenses', parent: 'Purchase Accounts' },
            { name: 'Direct Expenses', nature: 'Expenses', parent: 'Expenses' },
            { name: 'Wages', nature: 'Expenses', parent: 'Direct Expenses' },
            { name: 'Freight Inward', nature: 'Expenses', parent: 'Direct Expenses' },
            { name: 'Packing Material', nature: 'Expenses', parent: 'Direct Expenses' },
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
            { name: 'Freight', group: 'Direct Expenses', type: 'Expense' },
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
        return { success: true };
    } catch (error) {
        logger.error('Error initializing accounting masters:', error);
        throw error;
    }
};

export { initializeAccountingMasters };
