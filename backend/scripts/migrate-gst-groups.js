import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Setup environment
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { AccountGroup } from '../src/models/accountGroup.model.js';
import { AccountLedger } from '../src/models/accountLedger.model.js';

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('MongoDB connected successfully');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

const migrateGSTGroups = async () => {
    try {
        await connectDB();

        console.log('--- Starting GST Groups Migration ---');

        // 1. Locate the Duties & Taxes Master Group
        let dutiesGrp = await AccountGroup.findOne({ name: 'Duties & Taxes' });
        if (!dutiesGrp) {
            console.error('Master group "Duties & Taxes" not found. Falling back to creating it under Current Liabilities...');
            const currLiab = await AccountGroup.findOne({ name: 'Current Liabilities' });
            if (!currLiab) throw new Error('Cannot find "Current Liabilities" either!');
            
            dutiesGrp = await AccountGroup.create({
                name: 'Duties & Taxes',
                nature: 'Liabilities',
                parentGroup: currLiab._id
            });
        }

        // 2. Ensure "GST Collection" sub-group exists
        let collectionGrp = await AccountGroup.findOne({ name: 'GST Collection' });
        if (!collectionGrp) {
            collectionGrp = await AccountGroup.create({
                name: 'GST Collection',
                nature: 'Liabilities',
                parentGroup: dutiesGrp._id
            });
            console.log('Created sub-group: GST Collection');
        } else if (String(collectionGrp.parentGroup) !== String(dutiesGrp._id)) {
            collectionGrp.parentGroup = dutiesGrp._id;
            await collectionGrp.save();
            console.log('Moved GST Collection under Duties & Taxes');
        }

        // 3. Ensure "GST Input" sub-group exists
        let inputGrp = await AccountGroup.findOne({ name: 'GST Input' });
        if (!inputGrp) {
            inputGrp = await AccountGroup.create({
                name: 'GST Input',
                nature: 'Liabilities',
                parentGroup: dutiesGrp._id
            });
            console.log('Created sub-group: GST Input');
        } else if (String(inputGrp.parentGroup) !== String(dutiesGrp._id)) {
            // Note: If they had this as an Asset, we update its nature to match Tally style
            inputGrp.parentGroup = dutiesGrp._id;
            inputGrp.nature = 'Liabilities';
            await inputGrp.save();
            console.log('Moved GST Input under Duties & Taxes');
        }

        // 4. Identify Tax Ledgers and Migrate Them
        const allLedgers = await AccountLedger.find({});
        let collectionUpdated = 0;
        let inputUpdated = 0;

        for (const ledger of allLedgers) {
            const nameUpper = ledger.name.toUpperCase();
            
            // Check if it's an Output / Collection tax (Sales side)
            if (
                nameUpper.includes('OUTPUT') || 
                (nameUpper.includes('GST') && ledger.groupName === 'Duties & Taxes' && !nameUpper.includes('INPUT')) ||
                ledger.groupName === 'GST Collection' 
            ) {
                // If it's something like "CGST Output", "Output SGST"
                // Ensure it's not actually an input ledger just sitting in the wrong place
                if (!nameUpper.includes('INPUT')) {
                    if (String(ledger.underGroup) !== String(collectionGrp._id)) {
                        ledger.underGroup = collectionGrp._id;
                        ledger.groupName = 'GST Collection';
                        await ledger.save();
                        collectionUpdated++;
                        console.log(`Migrated ${ledger.name} -> GST Collection`);
                    }
                }
            }

            // Check if it's an Input / Credit tax (Purchase/Expense side)
            if (
                nameUpper.includes('INPUT') || 
                ledger.groupName === 'Input Tax' || 
                (nameUpper.includes('GST') && ledger.groupName === 'Current Assets') ||
                ledger.groupName === 'GST Input'
            ) {
                // If it's something like "CGST Input", "Input SGST", "GST Input Credit"
                if (!nameUpper.includes('OUTPUT')) {
                    // Ignore TDS Receivable
                    if (nameUpper !== 'TDS RECEIVABLE') {
                        if (String(ledger.underGroup) !== String(inputGrp._id)) {
                            ledger.underGroup = inputGrp._id;
                            ledger.groupName = 'GST Input';
                            await ledger.save();
                            inputUpdated++;
                            console.log(`Migrated ${ledger.name} -> GST Input`);
                        }
                    }
                }
            }
        }

        console.log(`\nMigration Summary:`);
        console.log(`- ${collectionUpdated} Ledgers migrated to GST Collection`);
        console.log(`- ${inputUpdated} Ledgers migrated to GST Input`);
        console.log('--- Migration Complete ---');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
};

migrateGSTGroups();
