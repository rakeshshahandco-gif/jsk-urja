import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

const MONGODB_URL = process.env.MONGODB_URL;

if (!MONGODB_URL) {
    console.error('❌ MONGODB_URL not found in backend/.env');
    process.exit(1);
}

const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

async function runGlobalSearch() {
    try {
        await mongoose.connect(MONGODB_URL);
        const db = mongoose.connection.db;

        const collections = await db.listCollections().toArray();
        console.log(`Scanning ${collections.length} collections for GST numbers...`);

        const allGsts = new Set();
        const gstSourceMap = new Map(); // gst -> [{ coll, id, path }]

        for (const collInfo of collections) {
            const collName = collInfo.name;
            const docs = await db.collection(collName).find({}).toArray();

            docs.forEach(doc => {
                const scan = (obj, path = '') => {
                    for (const key in obj) {
                        const currentPath = path ? `${path}.${key}` : key;
                        const val = obj[key];
                        if (typeof val === 'string') {
                            const cleanVal = val.trim().toUpperCase().replace(/\s+/g, '');
                            if (gstRegex.test(cleanVal)) {
                                allGsts.add(cleanVal);
                                if (!gstSourceMap.has(cleanVal)) {
                                    gstSourceMap.set(cleanVal, []);
                                }
                                gstSourceMap.get(cleanVal).push({ coll: collName, id: doc._id, path: currentPath });
                            }
                        } else if (typeof val === 'object' && val !== null) {
                            scan(val, currentPath);
                        }
                    }
                };
                scan(doc);
            });
        }

        console.log(`\n✅ Found ${allGsts.size} unique GST numbers across the whole database!`);

        if (allGsts.size >= 600) {
            console.log('🎉 This matches the target count of around 650!');
        }

        // --- Summary of Sources ---
        const sourceStats = {};
        for (const [gst, sources] of gstSourceMap) {
            sources.forEach(s => {
                const key = `${s.coll}:${s.path}`;
                sourceStats[key] = (sourceStats[key] || 0) + 1;
            });
        }

        console.log('\n--- Sources Summary ---');
        Object.entries(sourceStats).sort((a,b) => b[1] - a[1]).forEach(([key, count]) => {
            console.log(`${key}: ${count} records`);
        });

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

runGlobalSearch();
