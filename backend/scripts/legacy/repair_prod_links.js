import mongoose from 'mongoose';
import { autoLinkEntityLedger } from './src/utils/ledgerLinking.utils.js';
import Customer from './src/models/customer.model.js';
import { Supplier } from './src/models/supplier.model.js';
import { AccountLedger } from './src/models/accountLedger.model.js';

// EXPLICIT PRODUCTION URL
const PROD_URL = 'mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-prod?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true';

async function repairProductionLinks() {
    try {
        console.log('Connecting to PRODUCTION DB:', PROD_URL.split('@')[1]);
        await mongoose.connect(PROD_URL);
        console.log('Connected to MongoDB');

        // --- REPAIR CUSTOMERS ---
        console.log('\n--- Repairing Customer Links (PRODUCTION) ---');
        const customers = await Customer.find({ isDeleted: { $ne: true } });
        let cSuccess = 0;
        let cTotal = 0;

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
                cTotal++;
                process.stdout.write(`Repairing [${c.customerCode}] ${c.company || c.customerName || c._id}... `);
                try {
                    const ledgerId = await autoLinkEntityLedger(c, 'Customer');
                    if (ledgerId) {
                        console.log('✅ Fixed');
                        cSuccess++;
                    } else {
                        console.log('❌ Failed (No match)');
                    }
                } catch (err) {
                    console.log(`❌ Error: ${err.message}`);
                }
            }
        }

        // --- REPAIR SUPPLIERS ---
        console.log('\n--- Repairing Supplier Links (PRODUCTION) ---');
        const suppliers = await Supplier.find({ isDeleted: { $ne: true } });
        let sSuccess = 0;
        let sTotal = 0;

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
                sTotal++;
                process.stdout.write(`Repairing [${s.supplierCode}] ${s.supplierName || s._id}... `);
                try {
                    const ledgerId = await autoLinkEntityLedger(s, 'Supplier');
                    if (ledgerId) {
                        console.log('✅ Fixed');
                        sSuccess++;
                    } else {
                        console.log('❌ Failed (No match)');
                    }
                } catch (err) {
                    console.log(`❌ Error: ${err.message}`);
                }
            }
        }

        console.log('\n--- Production Repair Summary ---');
        console.log(`Customers: Total Unlinked ${cTotal}, Repaired ${cSuccess}`);
        console.log(`Suppliers: Total Unlinked ${sTotal}, Repaired ${sSuccess}`);

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

repairProductionLinks();
