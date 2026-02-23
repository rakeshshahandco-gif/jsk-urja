import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const check = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to MongoDB');

        const indexes = await mongoose.connection.db.collection('users').listIndexes().toArray();
        console.log('Full Index Details:');
        console.log(JSON.stringify(indexes, null, 2));

    } catch (error) {
        console.error('Check failed:', error);
    } finally {
        await mongoose.disconnect();
    }
};

check();
