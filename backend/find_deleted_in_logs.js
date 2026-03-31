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

        console.log('\n--- Searching Audit Logs for DELETE Action (Customer) ---');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 3); // Look back 3 days

        const logs = await db.collection('auditlogs').find({
            action: 'DELETE',
            createdAt: { $gte: yesterday }
        }).sort({ createdAt: -1 }).toArray();

        console.log(`Found ${logs.length} DELETE logs recently.`);

        if (logs.length > 0) {
            console.log('\n--- Sample DELETE Log Details ---');
            logs.slice(0, 10).forEach(log => {
                console.log(`Time: ${log.createdAt} | Module: ${log.module} | Details Old Name: ${log.details?.old?.company || log.details?.old?.name || 'N/A'}`);
            });
        }

        // --- Search for ALL actions in the last 48h and group by module ---
        console.log('\n--- Audit Activity Last 48h ---');
        const summary = await db.collection('auditlogs').aggregate([
            { $match: { createdAt: { $gte: yesterday } } },
            { $group: { _id: { action: '$action', module: '$module' }, count: { $sum: 1 } } }
        ]).toArray();

        summary.forEach(s => {
            console.log(`${s._id.action} on ${s._id.module}: ${s.count}`);
        });

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

run();
