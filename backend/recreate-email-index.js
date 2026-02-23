import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './src/models/user.model.js';

dotenv.config();

const recreateIndex = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to MongoDB');

        await User.syncIndexes();
        console.log('Synced indexes');

        const indexes = await mongoose.connection.collection('users').getIndexes();
        console.log('Current Indexes:', JSON.stringify(indexes, null, 2));

        if (indexes.email_1 && indexes.email_1.sparse) {
            console.log('SUCCESS: email_1 is sparse');
        } else {
            console.log('RETRYING: Creating index manually...');
            await mongoose.connection.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true });
            const finalIndexes = await mongoose.connection.collection('users').getIndexes();
            console.log('Final Indexes:', JSON.stringify(finalIndexes, null, 2));
        }

    } catch (error) {
        console.error('Failed to recreate index:', error);
    } finally {
        await mongoose.disconnect();
    }
};

recreateIndex();
