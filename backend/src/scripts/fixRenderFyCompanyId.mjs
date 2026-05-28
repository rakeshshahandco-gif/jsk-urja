import mongoose from 'mongoose';

const MONGODB_URL = process.env.MONGODB_URL;
if (!MONGODB_URL) {
    console.error('MONGODB_URL is required');
    process.exit(1);
}

const TARGET_COMPANY_NAME = /JSK INNOVATIVE TECH/i;
const TARGET_FY_NAME = '2026-2027';

await mongoose.connect(MONGODB_URL);
const db = mongoose.connection.db;

const company = await db.collection('companies').findOne({ companyName: TARGET_COMPANY_NAME });
if (!company) {
    console.error('Target company not found');
    await mongoose.disconnect();
    process.exit(1);
}

const fyCollection = db.collection('financialyears');

const backfill = await fyCollection.updateMany(
    { $or: [{ companyId: { $exists: false } }, { companyId: null }] },
    { $set: { companyId: company._id } }
);

// normalize short FY names like 2026-27 -> 2026-2027 (only if long name missing)
const shortRows = await fyCollection.find({ name: { $regex: /^\d{4}-\d{2}$/ } }).toArray();
for (const fy of shortRows) {
    const [y1, y2] = String(fy.name).split('-');
    const longName = `${y1}-20${y2}`;
    const existsLong = await fyCollection.findOne({ name: longName });
    if (!existsLong) {
        await fyCollection.updateOne({ _id: fy._id }, { $set: { name: longName } });
    }
}

let current = await fyCollection.findOne({ name: TARGET_FY_NAME });
if (!current) {
    // fallback to latest by startDate
    current = await fyCollection.find().sort({ startDate: -1 }).limit(1).next();
}
if (current) {
    await fyCollection.updateMany({}, { $set: { isCurrent: false } });
    await fyCollection.updateOne({ _id: current._id }, { $set: { isCurrent: true, status: 'Active' } });
}

console.log('Company:', company._id.toString(), company.companyName);
console.log('financialyears matched:', backfill.matchedCount, 'modified:', backfill.modifiedCount);
console.log('Current FY:', current?.name || 'none');

await mongoose.disconnect();
