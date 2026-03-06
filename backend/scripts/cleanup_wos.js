import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const woSchema = new mongoose.Schema({}, { strict: false });
const WorkOrder = mongoose.model('WorkOrder', woSchema, 'workorders');

const cleanupWOs = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to DB');

        // Sort by createdAt descending (keep the newest one)
        const wos = await WorkOrder.find({}).sort({ createdAt: -1 });
        console.log(`Found ${wos.length} Work Orders.`);

        if (wos.length <= 1) {
            console.log('Nothing to delete.');
            await mongoose.disconnect();
            return;
        }

        const toKeep = wos[0];
        const idsToDelete = wos.slice(1).map(w => w._id);

        console.log(`Keeping NEWEST WO: ${toKeep.woNumber} (${toKeep._id})`);

        const result = await WorkOrder.deleteMany({ _id: { $in: idsToDelete } });
        console.log(`Successfully deleted ${result.deletedCount} Work Orders.`);

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
};

cleanupWOs();
