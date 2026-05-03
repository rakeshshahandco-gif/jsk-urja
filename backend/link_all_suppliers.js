import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { autoLinkEntityLedger } from './src/utils/ledgerLinking.utils.js';
import { Supplier } from './src/models/supplier.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const MONGODB_URL = process.env.MONGODB_URL;

async function linkAllSuppliers() {
    try {
        await mongoose.connect(MONGODB_URL);
        console.log('Connected to MongoDB');

        // Fetch all suppliers and filter in JS to avoid CastError with empty strings
        const allSuppliers = await Supplier.find({ isDeleted: { $ne: true } });
        
        const unlinkedSuppliers = allSuppliers.filter(s => {
            return !s.ledgerId || s.ledgerId === '' || s.ledgerId === 'null' || s.ledgerId === 'undefined';
        });

        console.log(`Found ${unlinkedSuppliers.length} unlinked suppliers out of ${allSuppliers.length} total.`);

        let success = 0;
        let failed = 0;

        for (const supplier of unlinkedSuppliers) {
            try {
                process.stdout.write(`Linking ${supplier.supplierName || supplier._id}... `);
                const ledgerId = await autoLinkEntityLedger(supplier, 'Supplier');
                if (ledgerId) {
                    console.log('✅ Success');
                    success++;
                } else {
                    console.log('❌ Failed');
                    failed++;
                }
            } catch (err) {
                console.log(`❌ Error: ${err.message}`);
                failed++;
            }
        }

        console.log('\n--- Supplier Linking Summary ---');
        console.log(`Total Unlinked: ${unlinkedSuppliers.length}`);
        console.log(`Successfully Linked: ${success}`);
        console.log(`Failed: ${failed}`);

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

linkAllSuppliers();
