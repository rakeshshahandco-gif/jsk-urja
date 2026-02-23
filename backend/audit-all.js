import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const auditAll = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to MongoDB:', mongoose.connection.name);

        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Collections:', collections.map(c => c.name));

        // Check 'users'
        const users = await mongoose.connection.db.collection('users').find({}).toArray();
        console.log(`'users' collection content (${users.length} docs):`);
        users.forEach(u => console.log(`  - ${u.username} (${u.email})`));

        // Search for ANY record in ANY collection that has the field 'username'
        console.log('Searching all collections for "username" field...');
        for (const col of collections) {
            const count = await mongoose.connection.db.collection(col.name).countDocuments({ username: { $exists: true } });
            if (count > 0) {
                console.log(`  - Collection "${col.name}" has ${count} docs with "username"`);
                const docs = await mongoose.connection.db.collection(col.name).find({ username: { $exists: true } }).toArray();
                docs.forEach(d => console.log(`    - ${d.username} in ${col.name}`));
            }
        }

    } catch (error) {
        console.error('Audit failed:', error);
    } finally {
        await mongoose.disconnect();
    }
};

auditAll();
