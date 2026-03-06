import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import Customer from '../src/models/customer.model.js';
import logger from '../src/utils/logger.js';

const migrate = async () => {
    try {
        await connectDB();
        logger.info('🚀 Starting Customer Code Migration...');

        // Find customers without customerCode
        const customers = await Customer.find({
            $or: [
                { customerCode: { $exists: false } },
                { customerCode: null },
                { customerCode: '' }
            ]
        }).sort({ createdAt: 1 });

        logger.info(`🔍 Found ${customers.length} customers needing codes.`);

        if (customers.length === 0) {
            logger.info('✅ No customers to migrate.');
            process.exit(0);
        }

        // Get the starting number
        const lastWithCode = await Customer.findOne({ customerCode: { $regex: /^CU\d+$/ } }).sort({ customerCode: -1 });
        let nextNum = 1;
        if (lastWithCode && lastWithCode.customerCode) {
            const numericPart = lastWithCode.customerCode.replace('CU', '');
            nextNum = parseInt(numericPart, 10) + 1;
        }

        logger.info(`🔢 Starting codes from CU${String(nextNum).padStart(3, '0')}`);

        let count = 0;
        for (const customer of customers) {
            const newCode = `CU${String(nextNum).padStart(3, '0')}`;
            customer.customerCode = newCode;
            await customer.save();
            nextNum++;
            count++;
            if (count % 10 === 0) logger.info(`⚡ Processed ${count} customers...`);
        }

        logger.info(`✅ Migration complete! Generated codes for ${count} customers.`);
        process.exit(0);
    } catch (error) {
        logger.error('❌ Migration failed:', error);
        process.exit(1);
    }
};

migrate();
