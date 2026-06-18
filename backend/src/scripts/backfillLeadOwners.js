/**
 * Safe backfill: sets createdByUserId/owner fields from legacy createdBy only.
 * Run: node src/scripts/backfillLeadOwners.js
 * Dry-run (default): node src/scripts/backfillLeadOwners.js
 * Apply: node src/scripts/backfillLeadOwners.js --apply
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { backfillLeadOwnerFields } from '../services/lead.service.js';

dotenv.config();

const apply = process.argv.includes('--apply');

async function main() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
        console.error('MONGODB_URI not set');
        process.exit(1);
    }
    await mongoose.connect(uri);
    const result = await backfillLeadOwnerFields({ dryRun: !apply });
    console.log(JSON.stringify(result, null, 2));
    await mongoose.disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
