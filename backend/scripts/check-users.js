import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

const countUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const count = await mongoose.connection.db.collection('users').countDocuments();
        console.log(`[DB] Total users count: ${count}`);

        const users = await mongoose.connection.db.collection('users').find({}).toArray();
        console.log('[DB] Users summary:', users.map(u => ({ id: u._id, name: u.name, username: u.username, role: u.role, isActive: u.isActive })));

        process.exit(0);
    } catch (err) {
        console.error('[DB] Error:', err);
        process.exit(1);
    }
};

countUsers();
