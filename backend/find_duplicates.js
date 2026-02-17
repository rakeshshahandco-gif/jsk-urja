import mongoose from 'mongoose';
import Reminder from './src/models/reminder.model.js';
import dotenv from 'dotenv';

dotenv.config();

const findDuplicates = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/jsk-urja');
        console.log('Connected to MongoDB');

        const duplicates = await Reminder.aggregate([
            { $match: { isClosed: false } },
            {
                $group: {
                    _id: '$customerId',
                    count: { $sum: 1 },
                    reminders: { $push: '$_id' }
                }
            },
            { $match: { count: { $gt: 1 } } },
            {
                $lookup: {
                    from: 'customers',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'customer'
                }
            },
            { $unwind: '$customer' }
        ]);

        console.log(`Found ${duplicates.length} customers with multiple open reminders.`);

        duplicates.forEach(d => {
            console.log(`Customer: ${d.customer.customerName} (${d.customer.company}) - Count: ${d.count}`);
            console.log(`Reminder IDs: ${d.reminders.join(', ')}`);
        });

    } catch (error) {
        console.error('Check failed:', error);
    } finally {
        await mongoose.disconnect();
    }
};

findDuplicates();
