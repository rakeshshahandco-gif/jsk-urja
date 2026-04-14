import mongoose from 'mongoose';
import { ItemGroup } from '../src/models/itemGroup.model.js';
import { Item } from '../src/models/item.model.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const OLD_NAME = 'TEST_GROUP_OLD';
const NEW_NAME = 'TEST_GROUP_NEW';

async function runTest() {
    console.log('--- Verification Test: Cascading Item Group Update ---');
    
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to DB');

        // 1. Cleanup old tests
        await ItemGroup.deleteOne({ $or: [{ name: OLD_NAME }, { name: NEW_NAME }] });
        await Item.deleteMany({ itemGroupName: { $in: [OLD_NAME, NEW_NAME] } });

        // 2. Create Group
        const group = await ItemGroup.create({
            name: OLD_NAME,
            code: 'TGOLD',
            description: 'Test'
        });
        console.log(`Created Item Group: ${OLD_NAME}`);

        // 3. Create Items
        await Item.create([
            { itemCode: 'TI-001', itemName: 'Test Item 1', itemGroupName: OLD_NAME, itemCategory: 'RAW_MATERIAL' },
            { itemCode: 'TI-002', itemName: 'Test Item 2', itemGroupName: OLD_NAME, itemCategory: 'RAW_MATERIAL' }
        ]);
        console.log(`Created 2 items under ${OLD_NAME}`);

        // 4. Perform Update (Simulating the controller logic)
        console.log(`Renaming Group to ${NEW_NAME}...`);
        
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const g = await ItemGroup.findById(group._id).session(session);
            const old = g.name;
            g.name = NEW_NAME;
            await g.save({ session });
            
            await Item.updateMany(
                { itemGroupName: old },
                { itemGroupName: NEW_NAME },
                { session }
            );
            await session.commitTransaction();
            console.log('Transaction committed successfully.');
        } catch (err) {
            await session.abortTransaction();
            throw err;
        } finally {
            session.endSession();
        }

        // 5. Verify
        const items = await Item.find({ itemGroupName: NEW_NAME });
        console.log(`Count of items with ${NEW_NAME}: ${items.length}`);
        
        if (items.length === 2 && items[0].itemGroupName === NEW_NAME) {
            console.log('SUCCESS: Cascading update verified.');
        } else {
            console.log('FAILURE: Items did not update correctly.');
        }

        // 6. Cleanup
        await ItemGroup.deleteOne({ _id: group._id });
        await Item.deleteMany({ itemGroupName: NEW_NAME });

    } catch (err) {
        console.error('Test FAILED:', err);
    } finally {
        await mongoose.disconnect();
    }
}

runTest();
