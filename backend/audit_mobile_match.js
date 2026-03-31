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

        console.log('\n--- Auditing Mobile Match (Active Corrupted vs Deleted Names) ---');
        
        // 1. Get all active corrupted records
        const corrupted = await db.collection('customers').find({
             isDeleted: { $ne: true },
             company: /^CUST-/
        }).toArray();

        // 2. Get all deleted records with names
        const deleted = await db.collection('customers').find({
            isDeleted: true,
            company: { $not: /^CUST-/ }
        }).toArray();

        console.log(`Analyzing ${corrupted.length} corrupted active records and ${deleted.length} deleted named records...`);

        const matches = [];

        corrupted.forEach(act => {
            const actMobiles = (act.contactPersons || []).map(cp => (cp.mobile || '').replace(/[^0-9]/g, '')).filter(m => m.length >= 10);
            
            if (actMobiles.length === 0) return;

            const match = deleted.find(del => {
                const delMobiles = (del.contactPersons || []).map(cp => (cp.mobile || '').replace(/[^0-9]/g, '')).filter(m => m.length >= 10);
                return actMobiles.some(am => delMobiles.includes(am));
            });

            if (match) {
                matches.push({
                    activeId: act._id,
                    activeCode: act.company,
                    deletedId: match._id,
                    realName: match.company || match.customerName,
                    gstNumber: act.gstNumber || match.gstNumber
                });
            }
        });

        console.log(`\n✅ Found ${matches.length} matches using Mobile Numbers!`);

        if (matches.length > 0) {
            console.log('\n--- Sample Match ---');
            matches.slice(0, 10).forEach(m => {
                console.log(`Active ${m.activeCode} -> ${m.realName} (GST: ${m.gstNumber})`);
            });
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

run();
