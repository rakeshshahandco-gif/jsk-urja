import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import gstr1Service from './src/services/gstr1.service.js';

async function runTest() {
    console.log("Connecting DB...");
    await mongoose.connect(process.env.MONGODB_URL);
    console.log("DB Connected!");

    try {
        console.log("Triggering GSTR-1 Excel Generation...");
        const buf = await gstr1Service.generateGSTR1Excel({ financialYear: '2026-2027' });
        console.log("SUCCESS! Buffer Size:", buf.length);
    } catch(err) {
        console.error("FATAL ERROR IN GSTR1 SERVICE:");
        console.error(err);
    }

    process.exit(0);
}

runTest();
