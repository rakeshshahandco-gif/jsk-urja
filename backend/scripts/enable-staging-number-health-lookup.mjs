import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import mongoose from 'mongoose';
import { Company } from '../src/models/company.model.js';
import WhatsAppBulkSettings from '../src/models/whatsappBulkSettings.model.js';

await mongoose.connect(process.env.MONGODB_URL, { family: 4 });
if (mongoose.connection.name !== 'jsk_esarthi_wa_ai_staging') {
  throw new Error(`Refusing to run outside staging DB (got ${mongoose.connection.name})`);
}

const company = await Company.findOne({
  $or: [{ companyName: /JSK Innovative Tech/i }, { companyName: /WA AI Staging Co A/i }],
});
if (!company) throw new Error('staging company missing');

const before = await WhatsAppBulkSettings.findOne({ companyId: company._id }).lean();
await WhatsAppBulkSettings.findOneAndUpdate(
  { companyId: company._id },
  {
    $set: {
      whatsappAvailabilityCheckEnabled: true,
      numberHealthEnabled: true,
      availabilityLookupDailyLimit: 20,
      availabilityLookupMinDelaySeconds: 2,
      availabilityLookupMaxDelaySeconds: 5,
      stopOnThrottle: true,
      stopOnSessionError: true,
    },
  },
  { upsert: true, new: true },
);
const after = await WhatsAppBulkSettings.findOne({ companyId: company._id }).lean();
console.log(JSON.stringify({
  ok: true,
  database: mongoose.connection.name,
  company: company.companyName,
  companyId: String(company._id),
  before: before?.whatsappAvailabilityCheckEnabled === true,
  after: after?.whatsappAvailabilityCheckEnabled === true,
  note: 'Staging only — production not modified',
}, null, 2));
await mongoose.disconnect();