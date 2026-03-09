import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { SalesOrder } from '../src/models/salesOrder.model.js';
import { ProductionSheet } from '../src/models/productionSheet.model.js';
import { SalesInvoice } from '../src/models/salesInvoice.model.js';
import logger from '../src/utils/logger.js';

const cleanup = async () => {
    try {
        await connectDB();
        logger.info('🚀 Starting Sales Data Cleanup...');

        // 1. Sales Orders
        const soCount = await SalesOrder.countDocuments();
        logger.info(`🔍 Found ${soCount} Sales Orders. Deleting...`);
        await SalesOrder.deleteMany({});
        logger.info('✅ All Sales Orders deleted.');

        // 2. Production Sheets
        const psCount = await ProductionSheet.countDocuments();
        logger.info(`🔍 Found ${psCount} Production Sheets. Deleting...`);
        await ProductionSheet.deleteMany({});
        logger.info('✅ All Production Sheets deleted.');

        // 3. Sales Invoices
        const siCount = await SalesInvoice.countDocuments();
        logger.info(`🔍 Found ${siCount} Sales Invoices. Deleting...`);
        await SalesInvoice.deleteMany({});
        logger.info('✅ All Sales Invoices deleted.');

        logger.info('✨ Cleanup complete! All sales-related data has been removed.');
        process.exit(0);
    } catch (error) {
        logger.error('❌ Cleanup failed:', error);
        process.exit(1);
    }
};

cleanup();
