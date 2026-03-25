import mongoose from 'mongoose';
import { AccountGroup } from '../models/accountGroup.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { User } from '../models/user.model.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const createSystemLedgers = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected.');

        const admin = await User.findOne({ roleName: 'admin' });
        const userId = admin ? admin._id : null;

        // 1. Ensure Groups Exist
        const groups = [
            { name: 'Direct Expenses', nature: 'Expenses' },
            { name: 'Direct Income', nature: 'Income' },
            { name: 'Duties & Taxes', nature: 'Liabilities' },
            { name: 'Input Tax', nature: 'Assets', parent: 'Current Assets' },
            { name: 'Indirect Expenses', nature: 'Expenses' }
        ];

        const groupMap = new Map();
        for (const g of groups) {
            let group = await AccountGroup.findOne({ name: g.name });
            if (!group) {
                let parentId = null;
                if (g.parent) {
                    const parent = await AccountGroup.findOne({ name: g.parent });
                    parentId = parent ? parent._id : null;
                }
                group = await AccountGroup.create({
                    name: g.name,
                    nature: g.nature,
                    parentGroup: parentId,
                    createdBy: userId
                });
                console.log(`Created Group: ${g.name}`);
            }
            groupMap.set(g.name, group._id);
        }

        // 2. Ensure Ledgers Exist with correct names for ledgerDispatcher
        const ledgers = [
            { name: 'Freight Inward', group: 'Direct Expenses', type: 'Expense' },
            { name: 'Freight & Forwarding Charges', group: 'Direct Income', type: 'Income' },
            { name: 'Purchase Account', group: 'Purchase Accounts', type: 'General' },
            { name: 'Sales Account', group: 'Sales Accounts', type: 'General' },
            { name: 'Round Off', group: 'Indirect Expenses', type: 'Expense' }
        ];

        for (const l of ledgers) {
            let ledger = await AccountLedger.findOne({ name: l.name });
            if (!ledger) {
                // Check if it exists with the old name 'Freight'
                if (l.name === 'Freight Inward') {
                    const oldFreight = await AccountLedger.findOne({ name: 'Freight' });
                    if (oldFreight) {
                        oldFreight.name = 'Freight Inward';
                        await oldFreight.save();
                        console.log('Renamed "Freight" to "Freight Inward"');
                        continue;
                    }
                }

                const groupId = groupMap.get(l.group) || (await AccountGroup.findOne({ name: l.group }))?._id;
                if (!groupId) {
                    console.error(`Group not found for ${l.name}: ${l.group}`);
                    continue;
                }
                ledger = await AccountLedger.create({
                    name: l.name,
                    underGroup: groupId,
                    groupName: l.group,
                    type: l.type,
                    createdBy: userId
                });
                console.log(`Created Ledger: ${l.name}`);
            }
        }

        console.log('System ledgers verified successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

createSystemLedgers();
