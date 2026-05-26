import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: join(__dirname, '.env') });

const MONGODB_URL = process.env.MONGODB_URL;
if (!MONGODB_URL) { console.error('No MONGODB_URL in backend/.env'); process.exit(1); }

await mongoose.connect(MONGODB_URL);
console.log('✅ Connected to MongoDB');

const { Company } = await import('./src/models/company.model.js');
const { CompanyProfile } = await import('./src/models/companyProfile.model.js');

const existing = await Company.countDocuments();
if (existing > 0) {
    console.log(`ℹ️  ${existing} compan(y/ies) already exist:`);
    const list = await Company.find({}, 'companyName isDefault isActive');
    list.forEach(c => console.log(`   • ${c.companyName} | default=${c.isDefault} | active=${c.isActive}`));
    await mongoose.disconnect();
    process.exit(0);
}

const profile = await CompanyProfile.findOne();
console.log('📋 CompanyProfile found:', profile?.companyName || '(none — using fallback name)');

const co = await Company.create({
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

console.log('✅ Default company created:', co.companyName);
console.log('   _id:', co._id.toString());
await mongoose.disconnect();
console.log('\n🎉 Done! Refresh your browser now.');
