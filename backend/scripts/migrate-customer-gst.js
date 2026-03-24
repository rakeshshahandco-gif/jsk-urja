import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Customer from '../src/models/customer.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend root
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/jsk-urja';

const migrate = async () => {
    try {
        console.log('Connecting to MongoDB at:', MONGODB_URL);
        await mongoose.connect(MONGODB_URL);
        console.log('✅ Connected to MongoDB');

        const customers = await Customer.find({ isDeleted: false });
        console.log(`🔍 Found ${customers.length} non-deleted customers`);

        let updatedCount = 0;
        let skipCount = 0;

        for (const customer of customers) {
            let changed = false;

            // 1. GST Type based on state
            if (customer.state) {
                const newState = String(customer.state).trim().toLowerCase();
                const expectedGstType = newState === 'maharashtra' ? 'CGST / SGST' : 'IGST';
                
                if (customer.gstType !== expectedGstType) {
                    // console.log(`  - Updating GST Type for ${customer.company || customer.customerName}: ${customer.gstType || 'Empty'} -> ${expectedGstType}`);
                    customer.gstType = expectedGstType;
                    changed = true;
                }
            }

            // 2. GST Registration Type based on GST Number
            const hasGst = customer.gstNumber && customer.gstNumber.trim().length > 0;
            const expectedRegType = hasGst ? 'Registered' : 'Unregistered';
            
            if (customer.gstRegistrationType !== expectedRegType) {
                // console.log(`  - Updating Registration Type for ${customer.company || customer.customerName}: ${customer.gstRegistrationType || 'Empty'} -> ${expectedRegType}`);
                customer.gstRegistrationType = expectedRegType;
                changed = true;
            }

            if (changed) {
                await customer.save();
                updatedCount++;
            } else {
                skipCount++;
            }
        }

        console.log('-----------------------------------------');
        console.log(`✅ Migration completed.`);
        console.log(`   - Total Processed: ${customers.length}`);
        console.log(`   - Updated: ${updatedCount}`);
        console.log(`   - Unchanged: ${skipCount}`);
        console.log('-----------------------------------------');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
};

migrate();
