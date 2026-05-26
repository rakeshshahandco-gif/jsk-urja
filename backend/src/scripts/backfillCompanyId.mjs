/**
 * One-time migration: set companyId on all tenant-scoped documents to the default company,
 * then clone CompanyProfile rows for each active company that is missing one.
 *
 * Run from backend directory:
 *   node src/scripts/backfillCompanyId.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const { connectDB } = await import('../config/db.js');
const { Company } = await import('../models/company.model.js');
const { CompanyProfile } = await import('../models/companyProfile.model.js');

const modelsDir = path.join(__dirname, '../models');
for (const f of fs.readdirSync(modelsDir)) {
    if (!f.endsWith('.model.js')) continue;
    await import(pathToFileURL(path.join(modelsDir, f)).href);
}

const connected = await connectDB();
if (!connected) {
    console.error('Database connection failed');
    process.exit(1);
}

const defaultCompany =
    (await Company.findOne({ isDefault: true })) ||
    (await Company.findOne({ isActive: true }));

if (!defaultCompany) {
    console.error('No Company document found. Create a company in Company Master first.');
    process.exit(1);
}

console.log('Using default company:', defaultCompany._id.toString(), defaultCompany.companyName);

for (const name of Object.keys(mongoose.models)) {
    const Model = mongoose.models[name];
    if (Model.schema.options.disableTenant) continue;
    if (!Model.schema.path('companyId')) continue;

    const r = await Model.collection.updateMany(
        { $or: [{ companyId: { $exists: false } }, { companyId: null }] },
        { $set: { companyId: defaultCompany._id } }
    );
    if (r.matchedCount > 0) {
        console.log(`${name}: matched ${r.matchedCount}, modified ${r.modifiedCount}`);
    }
}

const companies = await Company.find({ isActive: true }).lean();
for (const c of companies) {
    const exists = await CompanyProfile.countDocuments({ companyId: c._id });
    if (exists) continue;

    const template = await CompanyProfile.findOne({ companyId: defaultCompany._id }).lean()
        || await CompanyProfile.findOne({}).lean();

    if (template) {
        const { _id, __v, ...rest } = template;
        await CompanyProfile.create({
            ...rest,
            companyName: rest.companyName || c.companyName || 'Company',
            companyId: c._id,
        });
        console.log(`CompanyProfile created for company ${c.companyName} (${c._id})`);
    } else {
        await CompanyProfile.create({
            companyName: c.companyName || 'Company',
            companyId: c._id,
        });
        console.log(`CompanyProfile (minimal) created for company ${c.companyName} (${c._id})`);
    }
}

console.log('Backfill finished.');
await mongoose.disconnect();
process.exit(0);