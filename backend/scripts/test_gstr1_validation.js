import 'dotenv/config';
import mongoose from 'mongoose';
import { validateGSTR1 } from '../src/services/gstReport.service.js';

async function testValidation() {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✅ Connected!\n');

    try {
        console.log('🔍 Running GSTR-1 Validation for April 2025...');
        const errors = await validateGSTR1('2025-04-01', '2025-04-30');
        
        if (errors.length > 0) {
            console.log(`❌ Found ${errors.length} validation errors:`);
            console.table(errors);
        } else {
            console.log('✅ Validation passed! No blocking errors found.');
        }

    } catch (err) {
        console.error('❌ Error:', err.message);
    }

    await mongoose.disconnect();
    console.log('\n✅ Done');
}

testValidation();
