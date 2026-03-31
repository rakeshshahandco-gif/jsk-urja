import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

const MONGODB_URL = process.env.MONGODB_URL;

if (!MONGODB_URL) {
    console.error('❌ MONGODB_URL not found in backend/.env');
    process.exit(1);
}

async function runAuditSearch() {
    try {
        await mongoose.connect(MONGODB_URL);
        const db = mongoose.connection.db;

        console.log('--- Searching Audit Logs for "GST" ---');
        const logs = await db.collection('auditlogs').find({
            $or: [
                { module: /gst/i },
                { action: /gst/i },
                { 'details.message': /gst/i },
                { 'details.old.gstNumber': { $exists: true } },
                { 'details.new.gstNumber': { $exists: true } },
                { 'details.updates.gstNumber': { $exists: true } }
            ]
        }).sort({ createdAt: -1 }).limit(100).toArray();

        console.log(`Found ${logs.length} relevant audit logs.`);

        if (logs.length > 0) {
            console.log('\n--- Sample Log Found ---');
            logs.slice(0, 5).forEach(log => {
                console.log(`Time: ${log.createdAt} | Module: ${log.module} | Action: ${log.action}`);
                console.log(`Details: ${JSON.stringify(log.details, null, 2).slice(0, 200)}...`);
            });
        }

        // --- Check for specialized GSTImportLog collection ---
        const importLogs = await db.collection('gstimportlogs').find({}).toArray();
        console.log(`\nGST Import Logs: ${importLogs.length}`);

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

runAuditSearch();
