/**
 * Read-only diagnostics: Customer collection counts by companyId and isDeleted.
 * Run from backend/: node src/scripts/diagCustomerTenant.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const { connectDB } = await import('../config/db.js');
const { Company } = await import('../models/company.model.js');

const modelsDir = path.join(__dirname, '../models');
for (const f of fs.readdirSync(modelsDir)) {
    if (!f.endsWith('.model.js')) continue;
    await import(pathToFileURL(path.join(modelsDir, f)).href);
}

const Customer = mongoose.models.Customer;
if (!Customer) {
    console.error('Customer model not loaded');
    process.exit(1);
}

const ok = await connectDB();
if (!ok) {
    console.error('DB connection failed');
    process.exit(1);
}

const coll = Customer.collection;

const total = await coll.countDocuments({});
const nullCompany = await coll.countDocuments({
    $or: [{ companyId: { $exists: false } }, { companyId: null }],
});
const missingIsDeleted = await coll.countDocuments({ isDeleted: { $exists: false } });
const isDeletedFalse = await coll.countDocuments({ isDeleted: false });
const isDeletedTrue = await coll.countDocuments({ isDeleted: true });

console.log('--- Customer diagnostics (raw collection, no tenant middleware) ---');
console.log('total customers:', total);
console.log('companyId null/missing:', nullCompany);
console.log('isDeleted field missing:', missingIsDeleted);
console.log('isDeleted === false:', isDeletedFalse);
console.log('isDeleted === true:', isDeletedTrue);

const companies = await Company.find({}).select('companyName isDefault isActive _id').lean();
console.log('\nCompanies:');
for (const c of companies) {
    const n = await coll.countDocuments({ companyId: c._id });
    console.log(`  ${c._id}  "${c.companyName}"  default=${!!c.isDefault}  customers=${n}`);
}

await mongoose.disconnect();
process.exit(0);
