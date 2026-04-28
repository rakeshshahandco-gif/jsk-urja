import 'dotenv/config';
import mongoose from 'mongoose';

async function fixEntireDatabase() {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URL);
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    for (const colInfo of collections) {
        const colName = colInfo.name;
        if (colName.startsWith('system.')) continue;
        
        console.log(`🛠 Checking collection: ${colName}`);
        const docs = await db.collection(colName).find({}).toArray();
        let fixCount = 0;

        for (const doc of docs) {
            let needsUpdate = false;
            
            // Fix _id
            if (typeof doc._id === 'string' && doc._id.length === 24) {
                try {
                    const oldId = doc._id;
                    doc._id = new mongoose.Types.ObjectId(oldId);
                    await db.collection(colName).deleteOne({ _id: oldId });
                    needsUpdate = true;
                } catch (e) {}
            }

            // Recursively fix other common ID fields if needed? 
            // This is complex. For now let's focus on _id which is the main breaker.
            
            if (needsUpdate) {
                await db.collection(colName).insertOne(doc);
                fixCount++;
            }
        }
        
        if (fixCount > 0) {
            console.log(`✅ Fixed ${fixCount} documents in ${colName}`);
        }
    }

    console.log('🏁 Database recovery complete!');
    await mongoose.disconnect();
}

fixEntireDatabase();
