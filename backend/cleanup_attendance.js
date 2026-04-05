import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

async function cleanup() {
    try {
        console.log('Connecting to MongoDB: ' + process.env.MONGODB_URL?.substring(0, 20) + '...');
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected.');

        const Attendance = mongoose.model('Attendance', new mongoose.Schema({ date: Date }));
        
        // Target: December 2026 (leakage source)
        const start = new Date('2026-11-01');
        const end = new Date('2027-01-01');
        
        const count = await Attendance.countDocuments({ date: { $gte: start, $lte: end } });
        console.log(`Found ${count} future records in range ${start.toISOString()} - ${end.toISOString()}`);
        
        if (count > 0) {
            const result = await Attendance.deleteMany({ date: { $gte: start, $lte: end } });
            console.log(`Successfully deleted ${result.deletedCount} future/ghost records.`);
        } else {
            console.log('No future records found to delete.');
        }

    } catch (error) {
        console.error('Cleanup failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected.');
    }
}

cleanup();
