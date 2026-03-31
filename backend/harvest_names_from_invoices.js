import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

const MONGODB_URL = process.env.MONGODB_URL;

if (!MONGODB_URL) {
    console.error('❌ MONGODB_URL not found in backend/.env');
    process.exit(1);
}

async function run() {
    try {
        await mongoose.connect(MONGODB_URL);
        const db = mongoose.connection.db;

        console.log('\n--- Harvesting Names from Sales Invoices ---');
        
        const invoices = await db.collection('salesinvoices').find({
            customerId: { $exists: true }
        }).toArray();

        console.log(`Found ${invoices.length} Sales Invoices.`);

        const idToNameMap = new Map();

        invoices.forEach(inv => {
            if (inv.customerId && inv.customerName) {
                const id = inv.customerId.toString();
                if (!idToNameMap.has(id)) {
                    idToNameMap.set(id, {
                        name: inv.customerName,
                        source: 'SalesInvoice'
                    });
                }
            }
        });

        console.log(`✅ Extracted ${idToNameMap.size} unique customer names from Sales Invoices.`);

        // --- Cross Check with Corrupted Active ---
        const corruptedIds = (await db.collection('customers').find({
             isDeleted: { $ne: true },
             company: /^CUST-/
        }).toArray()).map(c => c._id.toString());

        let recoverableCount = 0;
        corruptedIds.forEach(id => {
            if (idToNameMap.has(id)) {
                recoverableCount++;
            }
        });

        console.log(`📊 Recoverable names for corrupted records using Invoices: ${recoverableCount} out of ${corruptedIds.length}`);

        if (recoverableCount > 0) {
            console.log('\n--- Recovery Sample ---');
            let sampleCount = 0;
            for (const [id, data] of idToNameMap) {
                if (corruptedIds.includes(id)) {
                    console.log(`ID: ${id} -> Recovered Name: ${data.name}`);
                    sampleCount++;
                    if (sampleCount >= 5) break;
                }
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

run();
