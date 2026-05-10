
import mongoose from 'mongoose';
import { ItemType } from './backend/src/models/itemType.model.js';

async function test() {
    try {
        await mongoose.connect('mongodb+srv://admin:admin123@cluster0.wsugxms.mongodb.net/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true');
        console.log('Connected');

        const newType = await ItemType.create({
            name: 'Test Type ' + Date.now(),
            code: 'TEST_' + Date.now(),
            description: 'Test description',
            isActive: true
        });

        console.log('Created:', newType);

        const all = await ItemType.find({});
        console.log('Total types now:', all.length);

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

test();
