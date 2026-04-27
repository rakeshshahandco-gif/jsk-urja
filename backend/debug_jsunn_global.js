import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Collections:', collections.map(c => c.name));
        
        for (const col of collections) {
            const data = await mongoose.connection.db.collection(col.name).findOne({
                $or: [
                    { itemCode: /JSUNN/i },
                    { itemName: /JSUNN/i },
                    { productName: /JSUNN/i },
                    { productCode: /JSUNN/i }
                ]
            });
            if (data) {
                console.log(`Found JSUNN in collection: ${col.name}`);
                console.log(JSON.stringify(data, null, 2));
            }
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
