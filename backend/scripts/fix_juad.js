import mongoose from 'mongoose';
const { Schema, model, connect, disconnect } = mongoose;

const MONGODB_URL = 'mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true';

async function fix() {
    try {
        await connect(MONGODB_URL);
        console.log('Connected to DB');

        const Item = model('Item', new Schema({}, { strict: false }));
        const BOM = model('BOM', new Schema({}, { strict: false }));

        const oldCode = 'JUAD1.2N_20V_1.2A_001';
        const targetCode = 'JUAD1.2N_20V_1.2A';

        const item = await Item.findOne({ itemCode: oldCode });
        if (item) {
            console.log(`Renaming Item ${item._id} (${oldCode}) to ${targetCode}...`);
            await Item.findOneAndUpdate(
                { _id: item._id },
                { $set: { itemCode: targetCode, itemName: targetCode } }
            );
            console.log('Item rename call finished.');

            const bom = await BOM.findOne({ finishedProductId: item._id });
            if (bom) {
                console.log(`Renaming BOM ${bom._id} to ${targetCode}...`);
                await BOM.findOneAndUpdate(
                    { _id: bom._id },
                    { $set: { bomNumber: targetCode } }
                );
                console.log('BOM rename call finished.');
            }
        } else {
            console.log('Item already renamed or not found.');
        }

        console.log('Verification:');
        const updatedItem = await Item.findOne({ itemCode: targetCode });
        if (updatedItem) {
            console.log(`Success: Found renamed item ${updatedItem.itemCode}`);
        } else {
            console.error('Failure: Renamed item NOT found.');
        }

    } catch (err) {
        console.error(err);
    } finally {
        await disconnect();
    }
}

fix();
