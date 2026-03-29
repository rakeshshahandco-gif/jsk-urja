import mongoose from 'mongoose';

async function run() {
    try {
        await mongoose.connect('mongodb://localhost:27017/jsk-urja');
        const db = mongoose.connection.db;
        const c = await db.collection('customers').findOne({ customerName: /IPREALM TECHNOLOGIES/i });
        console.log(JSON.stringify(c, null, 2));
    } catch(e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}
run();
