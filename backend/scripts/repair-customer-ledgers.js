import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Customer from '../src/models/customer.model.js';
import { AccountLedger } from '../src/models/accountLedger.model.js';
import { AccountGroup } from '../src/models/accountGroup.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend root
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true';

const repair = async () => {
    try {
        console.log('Connecting to MongoDB at:', MONGODB_URL);
        await mongoose.connect(MONGODB_URL);
        console.log('✅ Connected to MongoDB');

        // 1. Group for Customers (using 'Current Assets' found in DB)
        const groupId = "69bcb30d32c5fc43f5405933"; // Current Assets ID
        const groupName = "Current Assets";

        const customers = await Customer.find({ isDeleted: false });
        console.log(`🔍 Processing ${customers.length} non-deleted customers...`);

        let createdCount = 0;
        let skipCount = 0;
        let updateCount = 0;

        for (const c of customers) {
            let ledgerName = (c.company || c.customerName || `Customer ${c.customerCode || c._id}`).trim();
            if (!ledgerName) {
                console.warn(`⚠️  Skipping customer with no name: ${c._id}`);
                continue;
            }

            // Check if ledger already exists by referenceId
            const existing = await AccountLedger.findOne({ referenceId: c._id });
            if (existing) {
                skipCount++;
                continue;
            }

            // Fallback: Check if ledger already exists by name
            const existingByName = await AccountLedger.findOne({ name: ledgerName });
            if (existingByName) {
                // Link the existing ledger to the customer if it wasn't linked
                existingByName.referenceId = c._id;
                existingByName.referenceModel = 'Customer';
                existingByName.isCustomer = true;
                existingByName.type = 'Customer';
                // Also ensure it has a group assignment if it was missing in the model sense
                if (!existingByName.underGroup) {
                    existingByName.underGroup = groupId;
                }
                await existingByName.save();
                updateCount++;
                continue;
            }

            try {
                // Create new ledger
                await AccountLedger.create({
                    name: ledgerName,
                    type: 'Customer',
                    group: groupName,        // legacy/denormalized string field
                    groupName: groupName,    // denormalized string field in current model
                    underGroup: groupId,     // mandatory ObjectId field in current model
                    referenceId: c._id,
                    referenceModel: 'Customer',
                    isCustomer: true,
                    isBillWise: true,
                    state: c.state,
                    gstin: c.gstNumber,
                    registrationType: c.gstRegistrationType === 'Registered' ? 'Regular' : 'Unregistered',
                    mobile: c.contactPersons?.[0]?.mobile || '',
                    email: c.companyEmail || c.contactPersons?.[0]?.email || '',
                    address: c.address,
                    city: c.city,
                    pincode: c.pincode,
                    status: 'Active'
                });
                createdCount++;
            } catch (err) {
                console.error(`❌ Failed to create ledger for ${ledgerName}:`, err.message);
            }
        }

        console.log('-----------------------------------------');
        console.log(`✅ Repair completed.`);
        console.log(`   - New Ledgers Created: ${createdCount}`);
        console.log(`   - Existing Ledgers Linked: ${updateCount}`);
        console.log(`   - Already Linked/Verified: ${skipCount}`);
        console.log('-----------------------------------------');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Repair failed:', error);
        process.exit(1);
    }
};

repair();
