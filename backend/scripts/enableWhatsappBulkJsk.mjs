import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

await mongoose.connect(process.env.MONGODB_URL);
const Company = mongoose.connection.collection('companies');
const Settings = mongoose.connection.collection('whatsappbulksettings');

const jsk = await Company.findOne({ companyName: /JSK INNOVATIVE/i });
if (!jsk) {
    console.error('JSK company not found');
    process.exit(1);
}

const cid = jsk._id;
await Settings.updateOne(
    { companyId: cid },
    { $set: { companyId: cid, enabled: true, updatedAt: new Date() } },
    { upsert: true },
);

const doc = await Settings.findOne({ companyId: cid });
console.log('Company:', jsk.companyName);
console.log('WhatsApp Bulk enabled:', doc?.enabled === true ? 'YES' : doc?.enabled);
await mongoose.disconnect();
