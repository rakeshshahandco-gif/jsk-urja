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
    console.log('🚀 Connecting to MongoDB...');
    try {
        await mongoose.connect(MONGODB_URL);
        console.log('✅ Connected.');

        const db = mongoose.connection.db;

        console.log('\n--- Searching Audit Logs for GST Updates (Mar 30 - Mar 31) ---');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 2); 

        const logs = await db.collection('auditlogs').find({
            action: 'UPDATE',
            module: 'Customer',
            createdAt: { $gte: yesterday }
        }).sort({ createdAt: -1 }).toArray();

        console.log(`📊 Found ${logs.length} update logs for Customers in the last 48 hours.`);

        const gstRestoreMap = new Map(); // resourceId -> { companyName, gstNumber }

        logs.forEach(log => {
            const details = log.details || {};
            // Check if GST was updated or exists in the log
            const gstFromDetails = (details.new && details.new.gstNumber) || (details.old && details.old.gstNumber);
            
            if (gstFromDetails) {
                // We want the most recent 'new' GST number
                const resourceId = log.resourceId.toString();
                if (!gstRestoreMap.has(resourceId)) {
                    gstRestoreMap.set(resourceId, {
                        gstNumber: gstFromDetails,
                        companyName: (details.new && (details.new.company || details.new.customerName)) || (details.old && (details.old.company || details.old.customerName)) || log.description,
                        updatedAt: log.createdAt
                    });
                }
            }
        });

        console.log(`✅ Found ${gstRestoreMap.size} unique customers with GST mentions in audit logs.`);

        if (gstRestoreMap.size > 0) {
            console.log('\n--- Restore Preview (from Audit Logs) ---');
            let count = 0;
            for (const [id, data] of gstRestoreMap) {
                console.log(`ID: ${id} | Company: ${data.companyName} | GST: ${data.gstNumber}`);
                count++;
                if (count >= 15) break;
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

run();
