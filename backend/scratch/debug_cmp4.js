import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const ComplaintSchema = new mongoose.Schema({
    complaintNo: String,
    serviceType: String,
    items: [{
        itemId: mongoose.Schema.Types.ObjectId,
        qtyFaultyReported: Number,
        dispatchedQty: Number,
        faultyReceivedQty: Number,
        inRepairQty: Number
    }]
}, { strict: false });

const Complaint = mongoose.model('Complaint', ComplaintSchema);

async function debugData() {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB');

    const cmp = await Complaint.findOne({ complaintNo: 'CMP-0004' });
    if (!cmp) {
        console.log('CMP-0004 not found');
    } else {
        console.log('CMP-0004 Data:');
        console.log(JSON.stringify(cmp, null, 2));
    }

    const dispatches = await mongoose.connection.collection('replacementdispatches').find({ complaintNo: 'CMP-0004' }).toArray();
    console.log('\nDispatches for CMP-0004:');
    console.log(JSON.stringify(dispatches, null, 2));

    await mongoose.disconnect();
}

debugData().catch(console.error);
