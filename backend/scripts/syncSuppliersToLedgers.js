import mongoose from 'mongoose';
import { Supplier } from '../src/models/supplier.model.js';
import { AccountLedger } from '../src/models/accountLedger.model.js';

const url = 'mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true';

async function syncAll() {
    try {
        console.log('🚀 Starting Supplier-Ledger Sync (ESM Mode)...');
        await mongoose.connect(url);
        console.log('✅ Connected to Atlas');

        const suppliers = await Supplier.find({});
        console.log(`📊 Found ${suppliers.length} suppliers`);

        let updatedCount = 0;
        let linkedCount = 0;

        for (const s of suppliers) {
            let ledger = await AccountLedger.findOne({ referenceId: s._id });
            
            if (!ledger && s.supplierName) {
                ledger = await AccountLedger.findOne({ 
                    name: { $regex: new RegExp(`^${s.supplierName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                    $or: [{ type: 'Supplier' }, { isSupplier: true }]
                });
                
                if (ledger) {
                    ledger.referenceId = s._id;
                    ledger.referenceModel = 'Supplier';
                    linkedCount++;
                    console.log(`🔗 Linked missing reference for: ${s.supplierName}`);
                }
            }

            if (ledger) {
                const hasGst = !!(s.gstNumber && s.gstNumber.trim());
                
                ledger.gstin = s.gstNumber || '';
                ledger.pan = s.panNumber || '';
                ledger.gstApplicable = hasGst;
                ledger.registrationType = hasGst ? 'Regular' : 'Unregistered';
                
                ledger.mobile = s.phone || '';
                ledger.email = s.email || '';
                ledger.contactPerson = s.contactPerson || '';
                
                ledger.address = s.address || '';
                ledger.city = s.city || '';
                ledger.state = s.state || '';
                ledger.pincode = s.pincode || '';
                
                ledger.bankName = s.bankName || '';
                ledger.accountNo = s.bankAccountNo || '';
                ledger.ifsc = s.bankIfsc || '';
                
                if ((ledger.openingBalance === 0 || !ledger.openingBalance) && s.openingBalance > 0) {
                    ledger.openingBalance = s.openingBalance;
                    ledger.currentBalance = s.openingBalance;
                    ledger.drCr = s.openingBalanceDrCr || 'Cr';
                }

                await ledger.save();
                updatedCount++;
            }
        }

        console.log(`\n🎉 Sync Completed!`);
        console.log(`✅ Ledgers Updated: ${updatedCount}`);
        console.log(`🔗 New Links Created: ${linkedCount}`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Sync Failed:', err);
        process.exit(1);
    }
}

syncAll();
