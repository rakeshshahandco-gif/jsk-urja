import mongoose from 'mongoose';
const { Schema, model, connect, disconnect } = mongoose;

const MONGODB_URL = 'mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true';

async function migrate() {
    try {
        await connect(MONGODB_URL);
        console.log('Connected to DB');

        const Item = model('Item', new Schema({}, { strict: false }));
        const BOM = model('BOM', new Schema({}, { strict: false }));

        const item1Code = 'JUNCTD15N5Y_55V_300MA_001';
        const item3Code = 'JUNCTD15N5Y_55V_300MA';

        let item1 = await Item.findOne({ itemCode: item1Code });
        const item3 = await Item.findOne({ itemCode: item3Code });

        if (!item3) {
            console.error(`Item 2 not found: ${item3Code}`);
            return;
        }

        let bom;
        if (item1) {
            console.log(`Item 1 found: ${item1.itemCode} (_id: ${item1._id})`);
            bom = await BOM.findOne({ finishedProductId: item1._id });
        } else {
            console.log(`Item 1 not found (already deleted). Searching for orphan BOM...`);
            // Search for BOM by bomNumber if item1 is gone
            bom = await BOM.findOne({ bomNumber: item1Code });
        }

        if (!bom) {
            console.log(`Checking if BOM is already moved to Item 2...`);
            bom = await BOM.findOne({ finishedProductId: item3._id });
            if (bom) {
                console.log(`BOM is already linked to Item 2: ${bom.bomNumber}`);
                return;
            }
            console.error(`No BOM found to migrate.`);
            return;
        }
        console.log(`BOM found: ${bom.bomNumber} (_id: ${bom._id})`);

        // Perform the transfer and rename
        console.log(`Updating BOM ${bom._id}...`);
        const updatedBom = await BOM.findOneAndUpdate(
            { _id: bom._id },
            { 
                $set: { 
                    finishedProductId: item3._id, 
                    bomNumber: item3Code 
                } 
            },
            { new: true }
        );
        
        if (updatedBom && updatedBom.finishedProductId.toString() === item3._id.toString()) {
            console.log(`BOM updated successfully to Item 2: ${updatedBom.finishedProductId}`);
        } else {
            console.error(`BOM update failed or verification failed.`);
            console.log('Updated BOM:', JSON.stringify(updatedBom, null, 2));
        }

        // Delete item 1 (Check if it still exists first)
        const checkItem1 = item1 ? await Item.findById(item1._id) : null;
        if (checkItem1) {
            console.log(`Deleting Item 1...`);
            await Item.deleteOne({ _id: item1._id });
            console.log(`Item 1 deleted successfully.`);
        } else {
            console.log(`Item 1 already deleted.`);
        }

        console.log('Migration completed successfully.');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await disconnect();
    }
}

migrate();
