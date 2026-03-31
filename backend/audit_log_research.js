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

        console.log('\n--- Checking Audit Log Modules ---');
        const modules = await db.collection('auditlogs').distinct('module');
        console.log(`Modules found: ${modules.join(', ')}`);

        console.log('\n--- Checking Recent Audit Log Actions ---');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 2);

        const recentActions = await db.collection('auditlogs').aggregate([
            { $match: { createdAt: { $gte: yesterday } } },
            { $group: { _id: { action: '$action', module: '$module' }, count: { $sum: 1 } } }
        ]).toArray();

        recentActions.forEach(a => {
            console.log(`Action: ${a._id.action}, Module: ${a._id.module}, Count: ${a.count}`);
        });

        // Search for specific keywords in descriptions
        const keywordLogs = await db.collection('auditlogs').find({
            $or: [
                { description: /gst/i },
                { description: /customer/i },
                { module: /gst/i }
            ],
            createdAt: { $gte: yesterday }
        }).limit(20).toArray();

        console.log(`\nFound ${keywordLogs.length} keyword-matching logs recently.`);
        keywordLogs.forEach(log => {
            console.log(`Log: ${log.action} | ${log.module} | ${log.description}`);
        });

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

run();
