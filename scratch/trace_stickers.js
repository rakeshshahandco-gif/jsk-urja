const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const StickerSchema = new mongoose.Schema({
    name: String
}, { collection: 'stickers' });

const CustomerSchema = new mongoose.Schema({
    customerName: String,
    company: String,
    sticker: String,
    stickers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Sticker' }]
}, { collection: 'customers' });

const Sticker = mongoose.model('Sticker', StickerSchema);
const Customer = mongoose.model('Customer', CustomerSchema);

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/jsk-urja');
        console.log('Connected to DB');
        
        const customers = await Customer.find({ 
            $or: [
                { stickers: { $exists: true, $not: { $size: 0 } } },
                { sticker: { $exists: true, $ne: '' } }
            ]
        }).populate('stickers').limit(10);
        
        console.log('TRACE RESULTS:');
        const results = customers.map(c => ({
            id: c._id,
            name: c.company || c.customerName,
            stickerField: c.sticker,
            stickersArray: c.stickers.map(s => s.name)
        }));
        console.log(JSON.stringify(results, null, 2));
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

check();
