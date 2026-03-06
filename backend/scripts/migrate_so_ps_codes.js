import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { SalesOrder } from '../src/models/salesOrder.model.js';
import { ProductionSheet } from '../src/models/productionSheet.model.js';
import Customer from '../src/models/customer.model.js';
import logger from '../src/utils/logger.js';

const migrate = async () => {
    try {
        await connectDB();
        logger.info('🚀 Starting Sales Order & Production Sheet Customer Code Migration...');

        // 1. Update Sales Orders
        const sos = await SalesOrder.find({
            $or: [
                { customerCode: { $exists: false } },
                { customerCode: null },
                { customerCode: '' }
            ]
        });

        logger.info(`🔍 Found ${sos.length} Sales Orders needing customer codes.`);

        for (const so of sos) {
            const customer = await Customer.findById(so.customerId);
            if (customer && customer.customerCode) {
                so.customerCode = customer.customerCode;
                await so.save();
            }
        }
        logger.info('✅ Sales Orders updated.');

        // 2. Update Production Sheets
        const pss = await ProductionSheet.find({
            $or: [
                { customerCode: { $exists: false } },
                { customerCode: null },
                { customerCode: '' }
            ]
        });

        logger.info(`🔍 Found ${pss.length} Production Sheets needing customer codes.`);

        for (const ps of pss) {
            const so = await SalesOrder.findById(ps.soId);
            if (so && so.customerCode) {
                ps.customerCode = so.customerCode;
                await ps.save();
            } else {
                // Fallback to customer model if SO doesn't help
                const soData = await SalesOrder.findById(ps.soId).lean();
                if (soData && soData.customerId) {
                    const customer = await Customer.findById(soData.customerId).lean();
                    if (customer && customer.customerCode) {
                        ps.customerCode = customer.customerCode;
                        await ps.save();
                    }
                }
            }
        }

        logger.info('✅ Migration complete!');
        process.exit(0);
    } catch (error) {
        logger.error('❌ Migration failed:', error);
        process.exit(1);
    }
};

migrate();
