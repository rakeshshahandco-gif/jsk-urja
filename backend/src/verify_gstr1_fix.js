import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { generateGSTR1Data, validateGSTR1 } from './services/gstReport.service.js';

dotenv.config();

async function testFix() {
    try {
        const url = process.env.MONGODB_URL || 'mongodb://localhost:27017/crm_test';
        console.log('Connecting to DB:', url);
        await mongoose.connect(url);
        console.log('Connected.');

        const startDate = '2026-04-01';
        const endDate = '2026-04-30';

        console.log(`\n--- GSTR-1 Preview for ${startDate} to ${endDate} ---`);
        const data = await generateGSTR1Data(startDate, endDate);
        
        console.log('Summary:', data.summary);
        
        const inv262701 = data.b2b.find(r => r['Invoice Number'] === '26-27/01' || r['Invoice Number'] === '01');
        if (inv262701) {
            console.log('\nFound Invoice 26-27/01 in B2B:');
            console.log(JSON.stringify(inv262701, null, 2));
        } else {
            console.log('\nInvoice 26-27/01 NOT found in B2B. Checking B2CS...');
            const inB2CS = data.b2cs.some(r => r['Taxable Value'] > 0);
            console.log('Any B2CS data?', inB2CS);
            if (data.b2b.length > 0) {
                console.log('Sample B2B row:', JSON.stringify(data.b2b[0], null, 2));
            }
        }

        console.log('\n--- HSN Summary (B2B) ---');
        console.log('HSN Rows:', data.hsnB2B.length);
        if (data.hsnB2B.length > 0) {
            console.log('Sample HSN row:', JSON.stringify(data.hsnB2B[0], null, 2));
        }

        console.log('\n--- Validation ---');
        const errors = await validateGSTR1(startDate, endDate);
        console.log('Total Errors:', errors.length);
        const blocking = errors.filter(e => e.severity === 'Blocking Error');
        console.log('Blocking Errors:', blocking.length);
        blocking.forEach(e => console.log(`[BLOCKING] ${e.invoiceNo}: ${e.message}`));

        await mongoose.disconnect();
    } catch (err) {
        console.error('Test Error:', err);
    }
}

testFix();
