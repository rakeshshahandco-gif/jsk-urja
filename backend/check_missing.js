import mongoose from 'mongoose';
import Reminder from './src/models/reminder.model.js';
import dotenv from 'dotenv';

dotenv.config();

const checkMissingFields = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/jsk-urja');
        console.log('Connected to MongoDB');

        const missingIsClosed = await Reminder.countDocuments({ isClosed: { $exists: false } });
        const existsFalse = await Reminder.countDocuments({ isClosed: false });
        const existsTrue = await Reminder.countDocuments({ isClosed: true });
        const total = await Reminder.countDocuments({});

        console.log(`Total Reminders: ${total}`);
        console.log(`isClosed True: ${existsTrue}`);
        console.log(`isClosed False (Explicit): ${existsFalse}`);
        console.log(`isClosed Missing: ${missingIsClosed}`);

        if (missingIsClosed > 0) {
            console.log('\n--- Sample Missing Fields ---');
            const samples = await Reminder.find({ isClosed: { $exists: false } }).limit(5).lean();
            samples.forEach(s => console.log(JSON.stringify(s)));
        }

    } catch (error) {
        console.error('Check failed:', error);
    } finally {
        await mongoose.disconnect();
    }
};

checkMissingFields();
