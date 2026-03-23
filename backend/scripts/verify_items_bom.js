import mongoose from 'mongoose';
const { Schema, model, connect, disconnect } = mongoose;

const MONGODB_URL = 'mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true';

async function verify() {
    try {
        await connect(MONGODB_URL);
        console.log('Connected to DB');

        const Item = model('Item', new Schema({}, { strict: false }));
        const BOM = model('BOM', new Schema({}, { strict: false }));

        const items = [
            'JUNCTD15N5Y_55V_300MA',
            'JUNCTD15N_55V_300MA',
            'JUNCTD15N_45V_350MA',
            'JUAD1.2N_20V_1.2A',
            'JUBLE20N_45V/500MA',
            'JUAD20N_45V_500MA',
            'JUAD1.2_40V_700MA',
            'JUAD1.2_48V_1.2A'
        ];

        for (const itemCode of items) {
            console.log(`\nChecking Item: ${itemCode}`);
            const item = await Item.findOne({ itemCode: itemCode });

            if (item) {
                console.log(`- Item found: ${item.itemCode} (_id: ${item._id})`);
                const bom = await BOM.findOne({ finishedProductId: item._id });
                if (bom) {
                    console.log(`- BOM found: ${bom.bomNumber} (_id: ${bom._id})`);
                } else {
                    console.log(`- No BOM found for Item`);
                }
            } else {
                console.log(`- Item NOT found: ${itemCode}`);
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await disconnect();
    }
}

verify();
