import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mock models for direct access
const StickerSchema = new mongoose.Schema({ name: String }, { collection: 'stickers' });
const CustomerSchema = new mongoose.Schema({
    company: String,
    customerName: String,
    sticker: String,
    stickers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Sticker' }]
}, { collection: 'customers' });

const Sticker = mongoose.model('Sticker', StickerSchema);
const Customer = mongoose.model('Customer', CustomerSchema);

async function run() {
    try {
        await mongoose.connect('mongodb://localhost:27017/jsk-urja');
        console.log('--- DB TRACE START ---');
        
        const lytus = await Customer.findOne({ company: /LYTUS/i }).populate('stickers');
        if (lytus) {
            console.log('Customer LYTUS found:');
            console.log('  ID:', lytus._id);
            console.log('  Sticker (String):', lytus.sticker);
            console.log('  Stickers (Array):', JSON.stringify(lytus.stickers.map(s => ({ id: s._id, name: s.name })), null, 2));
        } else {
            console.log('Customer LYTUS not found!');
        }
        
        const allStickers = await Sticker.find({});
        console.log('All available stickers:', JSON.stringify(allStickers.map(s => s.name), null, 2));
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
