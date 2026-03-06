const mongoose = require('mongoose');

const mongoURL = 'mongodb://localhost:27017/jsk_crm';

async function check() {
    try {
        await mongoose.connect(mongoURL);
        console.log('Connected to DB');

        const Item = mongoose.model('Item', new mongoose.Schema({
            itemCategory: String,
            itemName: String,
            itemCode: String,
            isActive: Boolean
        }), 'items');

        const counts = await Item.aggregate([
            { $group: { _id: "$itemCategory", count: { $sum: 1 } } }
        ]);

        console.log('--- Item Counts by Category ---');
        console.log(JSON.stringify(counts, null, 2));

        const samples = await Item.find({ itemCategory: 'FINISHED_GOOD' }).limit(5);
        console.log('--- Sample Finished Goods ---');
        console.log(JSON.stringify(samples, null, 2));

        const total = await Item.countDocuments();
        console.log('Total items:', total);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
