import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { autoLinkEntityLedger } from './src/utils/ledgerLinking.utils.js';
import Customer from './src/models/customer.model.js';
import { Supplier } from './src/models/supplier.model.js';
import { AccountLedger } from './src/models/accountLedger.model.js';

dotenv.config();

const MONGODB_URL = process.env.MONGODB_URL;

async function repairAllLinks() {
    try {
        await mongoose.connect(MONGODB_URL);
        console.log('Connected to MongoDB');

        // --- REPAIR CUSTOMERS ---
        console.log('\n--- Repairing Customer Links ---');
        const customers = await Customer.find({ isDeleted: { $ne: true } });
        let cSuccess = 0;

        for (const c of customers) {
            let needsRepair = false;
            if (!c.ledgerId) {
                needsRepair = true;
            } else {
                const ledger = await AccountLedger.findById(c.ledgerId);
                if (!ledger || ledger.isDeleted || ledger.referenceId?.toString() !== c._id.toString()) {
                    needsRepair = true;
                }
            }

            if (needsRepair) {
                process.stdout.write(`Repairing ${c.company || c.customerName || c._id}... `);
                const ledgerId = await autoLinkEntityLedger(c, 'Customer');
                if (ledgerId) {
                    console.log('✅ Fixed');
                    cSuccess++;
                } else {
                    console.log('❌ Failed');
                }
            }
        }

        // --- REPAIR SUPPLIERS ---
        console.log('\n--- Repairing Supplier Links ---');
        const suppliers = await Supplier.find({ isDeleted: { $ne: true } });
        let sSuccess = 0;

        for (const s of suppliers) {
            let needsRepair = false;
            if (!s.ledgerId) {
                needsRepair = true;
            } else {
                const ledger = await AccountLedger.findById(s.ledgerId);
                if (!ledger || ledger.isDeleted || ledger.referenceId?.toString() !== s._id.toString()) {
                    needsRepair = true;
                }
            }

            if (needsRepair) {
                process.stdout.write(`Repairing ${s.supplierName || s._id}... `);
                const ledgerId = await autoLinkEntityLedger(s, 'Supplier');
                if (ledgerId) {
                    console.log('✅ Fixed');
                    sSuccess++;
                } else {
                    console.log('❌ Failed');
                }
            }
        }

        console.log('\n--- Repair Summary ---');
        console.log(`Customers Repaired: ${cSuccess}`);
        console.log(`Suppliers Repaired: ${sSuccess}`);

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

repairAllLinks();
