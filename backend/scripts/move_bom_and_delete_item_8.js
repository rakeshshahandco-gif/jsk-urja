import mongoose from 'mongoose';
const { Schema, model, connect, disconnect } = mongoose;

const MONGODB_URL = 'mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true';

async function migrate() {
    try {
        await connect(MONGODB_URL);
        console.log('Connected to DB');

        const Item = model('Item', new Schema({}, { strict: false }));
        const BOM = model('BOM', new Schema({}, { strict: false }));

        const item1Code = 'JUAD1.2_48V_1.2A_001';
        const item2Code = 'JUAD1.2_48V_1.2A';

        let item1 = await Item.findOne({ itemCode: item1Code });
        const item2 = await Item.findOne({ itemCode: item2Code });

        if (!item2) {
            console.error(`Target Item not found: ${item2Code}`);
            return;
        }

        let bom;
        if (item1) {
            console.log(`Item 1 found: ${item1.itemCode} (_id: ${item1._id})`);
            bom = await BOM.findOne({ finishedProductId: item1._id });
        } else {
            console.log(`Item 1 not found (already deleted). Searching for orphan BOM...`);
            bom = await BOM.findOne({ bomNumber: item1Code });
        }

        if (!bom) {
            console.log(`Checking if BOM is already moved to Item 2...`);
            bom = await BOM.findOne({ finishedProductId: item2._id });
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
                    finishedProductId: item2._id, 
                    bomNumber: item2Code 
                } 
            },
            { new: true }
        );
        
        if (updatedBom && updatedBom.finishedProductId.toString() === item2._id.toString()) {
            console.log(`BOM updated successfully to Item 2: ${updatedBom.finishedProductId}`);
        } else {
            console.error(`BOM update failed or verification failed.`);
        }

        // Delete item 1
        if (item1) {
            console.log(`Deleting Item 1...`);
            await Item.deleteOne({ _id: item1._id });
            console.log(`Item 1 deleted successfully.`);
        }

        console.log('Migration completed successfully.');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await disconnect();
    }
}

migrate();
