/**
 * One-time seed script: Creates the default company from CompanyProfile.
 * Run: node seed_default_company.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './backend/.env' });

const MONGODB_URL = process.env.MONGODB_URL;
if (!MONGODB_URL) { console.error('No MONGODB_URL in .env'); process.exit(1); }

await mongoose.connect(MONGODB_URL);
console.log('✅ Connected to MongoDB');

// Load models
const { Company } = await import('./backend/src/models/company.model.js');
const { CompanyProfile } = await import('./backend/src/models/companyProfile.model.js');

const existing = await Company.countDocuments();
if (existing > 0) {
    console.log(`ℹ️  Companies already exist (${existing} found). Listing them:`);
    const list = await Company.find({}, 'companyName isDefault isActive');
    list.forEach(c => console.log(`  - ${c.companyName} | default=${c.isDefault} | active=${c.isActive}`));
    await mongoose.disconnect();
    process.exit(0);
}

const profile = await CompanyProfile.findOne();
console.log('📋 Found CompanyProfile:', profile?.companyName || '(none)');

const company = await Company.create({
    companyName: profile?.companyName || 'JSK Innovative Technology Pvt. Ltd.',
    companyType: 'Pvt Ltd',
    legalName: profile?.companyName || '',
    address: profile?.address || '',
    city: profile?.city || '',
    state: profile?.state || '',
    pincode: profile?.pincode || '',
    country: 'India',
    gstNumber: profile?.gstNumber || '',
    panNumber: profile?.panNumber || '',
    cinNumber: profile?.cin || '',
    email: profile?.email || '',
    mobile: profile?.phone || '',
    logoUrl: profile?.logoUrl || '',
    bankDetails: {
        bankName: profile?.bankName || '',
        accountNo: profile?.accountNo || '',
        branchName: profile?.branchName || '',
        ifscCode: profile?.ifscCode || '',
    },
    isDefault: true,
    isActive: true,
});

console.log('✅ Default company created:', company.companyName, '| _id:', company._id.toString());
await mongoose.disconnect();
console.log('✅ Done. Refresh your browser to see the Company Switcher in the header.');
