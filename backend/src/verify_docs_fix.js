import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { generateGSTR1Data, validateGSTR1 } from './services/gstReport.service.js';

dotenv.config();

async function testFinal() {
    try {
        const url = process.env.MONGODB_URL;
        await mongoose.connect(url);

        const startDate = '2026-04-01';
        const endDate = '2026-04-30';

        console.log(`\n--- GSTR-1 Preview for ${startDate} to ${endDate} ---`);
        const data = await generateGSTR1Data(startDate, endDate);
        
        console.log('\n--- B2B Sorting Check ---');
        data.b2b.slice(0, 15).forEach(r => console.log(r['Invoice Number']));

        console.log('\n--- Docs Summary (Table 13) ---');
        console.table(data.docs);

        const inv01InB2B = data.b2b.find(r => r['Invoice Number'] === '26-27/01');
        const inv01InDocs = data.docs.some(d => {
            const from = parseInt(d['Sr. No. From'].replace(/\D/g, ''), 10);
            const to = parseInt(d['Sr. No. To'].replace(/\D/g, ''), 10);
            return 1 >= from && 1 <= to;
        });

        console.log('\nInvoice 26-27/01 presence:');
        console.log('In B2B:', !!inv01InB2B);
        console.log('In Docs Summary:', inv01InDocs);

        console.log('\n--- Validation ---');
        const errors = await validateGSTR1(startDate, endDate);
        const mismatches = errors.filter(e => e.errorType === 'Summary Mismatch');
        console.log('Summary Mismatches:', mismatches.length);
        mismatches.forEach(e => console.log(`[MISMATCH] ${e.invoiceNo}`));

        await mongoose.disconnect();
    } catch (err) {
        console.error('Test Error:', err);
    }
}

testFinal();
