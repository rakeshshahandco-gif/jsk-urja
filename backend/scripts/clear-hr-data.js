import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { Attendance } from '../src/models/attendance.model.js';
import { SalaryWorking } from '../src/models/salaryWorking.model.js';
import logger from '../src/utils/logger.js';

const cleanup = async () => {
    try {
        await connectDB();
        logger.info('🚀 Starting HR Data Cleanup (Attendance & Salary Working)...');

        // 1. Attendance
        const attCount = await Attendance.countDocuments();
        logger.info(`🔍 Found ${attCount} Attendance records. Deleting...`);
        await Attendance.deleteMany({});
        logger.info('✅ All Attendance records deleted.');

        // 2. Salary Working
        const swCount = await SalaryWorking.countDocuments();
        logger.info(`🔍 Found ${swCount} Salary Working records. Deleting...`);
        await SalaryWorking.deleteMany({});
        logger.info('✅ All Salary Working records deleted.');

        logger.info('✨ Cleanup complete! All HR-related attendance and salary data has been removed.');
        process.exit(0);
    } catch (error) {
        logger.error('❌ Cleanup failed:', error);
        process.exit(1);
    }
};

cleanup();
