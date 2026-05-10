
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const fixAllDates = async () => {
    try {
        const mongoUri = process.env.MONGODB_URL;
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const collectionsToFix = [
            { name: 'ledgerentries', dateField: 'date' },
            { name: 'stockledgers', dateField: 'date' },
            { name: 'vouchers', dateField: 'date' },
            { name: 'salesorders', dateField: 'orderDate' },
            { name: 'purchaseinvoices', dateField: 'invoiceDate' },
            { name: 'purchaseorders', dateField: 'orderDate' },
            { name: 'grns', dateField: 'grnDate' },
            { name: 'productionplannings', dateField: 'planDate' },
            { name: 'workorders', dateField: 'date' }
        ];

        for (const collInfo of collectionsToFix) {
            const collection = mongoose.connection.db.collection(collInfo.name);
            const cursor = collection.find({ [collInfo.dateField]: { $type: 'string' } });
            
            let count = 0;
            while (await cursor.hasNext()) {
                const doc = await cursor.next();
                const dateObj = new Date(doc[collInfo.dateField]);
                if (!isNaN(dateObj.getTime())) {
                    await collection.updateOne(
                        { _id: doc._id },
                        { $set: { [collInfo.dateField]: dateObj } }
                    );
                    count++;
                }
            }
            console.log(`Collection ${collInfo.name}: Fixed ${count} documents.`);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

fixAllDates();
