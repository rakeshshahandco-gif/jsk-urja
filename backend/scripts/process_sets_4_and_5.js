import mongoose from 'mongoose';
const { Schema, model, connect, disconnect } = mongoose;

const MONGODB_URL = 'mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true';

async function migrate() {
    try {
        await connect(MONGODB_URL);
        console.log('Connected to DB');

        const Item = model('Item', new Schema({}, { strict: false }));
        const BOM = model('BOM', new Schema({}, { strict: false }));

        // --- Set 4: JUAD1.2N_20V_1.2A_001 (Rename) ---
        console.log('\n--- Processing Set 4: JUAD1.2N_20V_1.2A_001 ---');
        const s4OldCode = 'JUAD1.2N_20V_1.2A_001';
        const s4TargetCode = 'JUAD1.2N_20V_1.2A';

        const s4Item = await Item.findOne({ itemCode: s4OldCode });
        if (s4Item) {
            console.log(`Renaming Item ${s4Item.itemCode} to ${s4TargetCode}...`);
            s4Item.itemCode = s4TargetCode;
            await s4Item.save();
            console.log('Item renamed successfully.');

            const s4Bom = await BOM.findOne({ finishedProductId: s4Item._id });
            if (s4Bom) {
                console.log(`Renaming BOM ${s4Bom.bomNumber} to ${s4TargetCode}...`);
                s4Bom.bomNumber = s4TargetCode;
                await s4Bom.save();
                console.log('BOM renamed successfully.');
            } else {
                console.log('No BOM found for Item 4.');
            }
        } else {
            console.log('Item 4 already renamed or not found.');
        }

        // --- Set 5: JUBLE20NHF_45V_500MA_001 (Move & Delete) ---
        console.log('\n--- Processing Set 5: JUBLE20NHF_45V_500MA_001 ---');
        const s5OldCode = 'JUBLE20NHF_45V_500MA_001';
        const s5TargetCode = 'JUBLE20N_45V/500MA';

        let s5ItemOld = await Item.findOne({ itemCode: s5OldCode });
        const s5ItemTarget = await Item.findOne({ itemCode: s5TargetCode });

        if (!s5ItemTarget) {
            console.error(`Target Item 5 not found: ${s5TargetCode}`);
        } else {
            let s5Bom;
            if (s5ItemOld) {
                console.log(`Item 5 found: ${s5ItemOld.itemCode} (_id: ${s5ItemOld._id})`);
                s5Bom = await BOM.findOne({ finishedProductId: s5ItemOld._id });
            } else {
                console.log(`Item 5 old not found. Searching for orphan BOM by name: ${s5OldCode}`);
                s5Bom = await BOM.findOne({ bomNumber: s5OldCode });
            }

            if (s5Bom) {
                console.log(`Moving BOM ${s5Bom.bomNumber} to Item 5 Target...`);
                await BOM.findOneAndUpdate(
                    { _id: s5Bom._id },
                    { 
                        $set: { 
                            finishedProductId: s5ItemTarget._id, 
                            bomNumber: s5TargetCode 
                        } 
                    }
                );
                console.log('BOM moved and renamed successfully.');
            } else {
                console.log('BOM 5 already moved or not found.');
            }

            if (s5ItemOld) {
                console.log(`Deleting Old Item 5...`);
                await Item.deleteOne({ _id: s5ItemOld._id });
                console.log('Old Item 5 deleted successfully.');
            }
        }

        console.log('\nMigration completed successfully.');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await disconnect();
    }
}

migrate();
