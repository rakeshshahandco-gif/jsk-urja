import 'dotenv/config';
import mongoose from 'mongoose';

async function checkUsers() {
    await mongoose.connect(process.env.MONGODB_URL);
    const users = await mongoose.connection.db.collection('users').find({}).toArray();
    console.log('👥 Total Users:', users.length);
    users.forEach(u => {
        console.log(`- ${u.username} (${u._id})`);
    });
    await mongoose.disconnect();
}

checkUsers();
