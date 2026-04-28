import 'dotenv/config';
import mongoose from 'mongoose';

async function fixIds() {
    await mongoose.connect(process.env.MONGODB_URL);
    const db = mongoose.connection.db;
    
    // Fix Users
    const users = await db.collection('users').find({}).toArray();
    for (const u of users) {
        if (typeof u._id === 'string') {
            console.log(`Fixing user: ${u.username}`);
            const oldId = u._id;
            const newId = new mongoose.Types.ObjectId(oldId);
            await db.collection('users').deleteOne({ _id: oldId });
            u._id = newId;
            // Also fix role and department ids if they are strings
            if (typeof u.role === 'string') u.role = new mongoose.Types.ObjectId(u.role);
            if (typeof u.department === 'string') u.department = new mongoose.Types.ObjectId(u.department);
            await db.collection('users').insertOne(u);
        }
    }

    console.log('✅ Users fixed!');
    await mongoose.disconnect();
}

fixIds();
