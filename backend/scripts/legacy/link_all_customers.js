import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Customer from './src/models/customer.model.js';
import { autoLinkEntityLedger } from './src/utils/ledgerLinking.utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
dotenv.config({ path: path.join(__dirname, '.env') });

const MONGODB_URL = process.env.MONGODB_URL;

async function run() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URL);
        console.log('Connected to MongoDB.');

        const allCustomers = await Customer.find({
            isDeleted: { $ne: true }
        }).lean();

        // Safe filtering in JS to avoid CastError in Mongoose query
        const customers = allCustomers.filter(c => !c.ledgerId || String(c.ledgerId).trim() === "" || String(c.ledgerId) === "null");

        console.log(`Found ${customers.length} unlinked customers.`);

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < customers.length; i++) {
            const customer = customers[i];
            const name = customer.company || customer.customerName || 'Unknown';
            process.stdout.write(`[${i + 1}/${customers.length}] Linking: ${name}... `);

            try {
                // Fetch fresh doc because autoLinkEntityLedger might need to update it
                const customerDoc = await Customer.findById(customer._id);
                const ledgerId = await autoLinkEntityLedger(customerDoc, 'Customer');
                if (ledgerId) {
                    console.log('✅ Linked');
                    successCount++;
                } else {
                    console.log('❌ Failed');
                    failCount++;
                }
            } catch (err) {
                console.log(`❌ Error: ${err.message}`);
                failCount++;
            }
        }

        console.log('\n--- Result Summary ---');
        console.log(`Total Processed: ${customers.length}`);
        console.log(`Successfully Linked: ${successCount}`);
        console.log(`Failed: ${failCount}`);

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

run();
