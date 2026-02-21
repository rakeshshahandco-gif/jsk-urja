import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const audit = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to MongoDB');

        const User = mongoose.connection.collection('users');

        const allUsers = await User.find({}).toArray();
        console.log(`Table Dump (${allUsers.length} users):`);
        allUsers.forEach((u, i) => {
            console.log(`${i + 1}. ID: ${u._id}, Name: ${u.name}, Username: "${u.username}", Email: "${u.email}", Mobile: "${u.mobile}"`);
        });

        const indexes = await User.getIndexes();
        console.log('Detailed Indexes:', JSON.stringify(indexes, null, 2));

    } catch (error) {
        console.error('Audit failed:', error);
    } finally {
        await mongoose.disconnect();
    }
};

audit();
