const mongoose = require('mongoose');
const BOM = mongoose.model('BOM', new mongoose.Schema({
    components: [{
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
        componentType: String
    }]
}));
const Item = mongoose.model('Item', new mongoose.Schema({
    itemType: String
}));

const MONGODB_URL = 'mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true';

async function migrate() {
    try {
        await mongoose.connect(MONGODB_URL);
        console.log('Connected to MongoDB');

        const boms = await BOM.find({});
        console.log(`Found ${boms.length} BOMs`);

        const items = await Item.find({});
        const itemMap = new Map(items.map(i => [i._id.toString(), i.itemType]));
        console.log(`Found ${items.length} Items`);

        let updatedCount = 0;
        let componentCount = 0;

        for (let bom of boms) {
            let changed = false;
            for (let comp of bom.components) {
                if (!comp.componentType && comp.itemId) {
                    const masterType = itemMap.get(comp.itemId.toString());
                    if (masterType) {
                        const utype = masterType.toUpperCase();
                        if (utype.includes('SMD')) {
                            comp.componentType = 'SMD';
                            changed = true;
                        } else if (utype.includes('TH')) {
                            comp.componentType = 'TH';
                            changed = true;
                        }
                    }
                }
                componentCount++;
            }
            if (changed) {
                await bom.save();
                updatedCount++;
            }
        }

        console.log(`Migration complete!`);
        console.log(`Updated ${updatedCount} BOMs`);
        console.log(`Processed ${componentCount} components`);
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
