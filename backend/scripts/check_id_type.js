import 'dotenv/config';
import mongoose from 'mongoose';

async function checkTypes() {
    await mongoose.connect(process.env.MONGODB_URL);
    const user = await mongoose.connection.db.collection('users').findOne({ username: 'admin' });
    console.log('User ID:', user._id);
    console.log('Type of _id:', typeof user._id);
    console.log('Is instance of ObjectId:', user._id instanceof mongoose.Types.ObjectId);
    await mongoose.disconnect();
}

checkTypes();
