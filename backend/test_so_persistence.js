const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const soItemSchema = new mongoose.Schema({
    itemCode: String,
    itemName: String,
    additionalNotes: String,
    qty: Number,
    rate: Number
});

const salesOrderSchema = new mongoose.Schema({
    soNumber: String,
    customerName: String,
    items: [soItemSchema],
    status: { type: String, default: 'Confirmed' }
}, { timestamps: true });

const SalesOrder = mongoose.model('SalesOrder', salesOrderSchema);

async function test() {
    try {
        await mongoose.connect(process.env.MONGODB_URL || 'mongodb://localhost:27017/jsk_urja');
        console.log('Connected to DB');
        
        const testSO = new SalesOrder({
            soNumber: 'TEST-SO-001',
            customerName: 'Test Customer',
            items: [{
                itemCode: 'TEST-ITEM',
                itemName: 'Test Product',
                additionalNotes: 'STILL ADDITIONAL NOTES NOT PULL FROM SALES ORDER - TEST',
                qty: 1,
                rate: 100
            }]
        });
        
        const saved = await testSO.save();
        console.log('Saved SO ID:', saved._id);
        console.log('Saved Item Notes:', saved.items[0].additionalNotes);
        
        const fetched = await SalesOrder.findById(saved._id);
        console.log('Fetched Item Notes:', fetched.items[0].additionalNotes);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
