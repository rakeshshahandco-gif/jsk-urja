/**
 * Backfill process output stock rows from existing challan returns.
 * Run: node src/scripts/backfillTextileProcessOutputStock.js
 * Apply: node src/scripts/backfillTextileProcessOutputStock.js --apply
 * Company: node src/scripts/backfillTextileProcessOutputStock.js --company=COMPANY_ID --apply
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { TextileDyeingChallan } from '../models/textileDyeingChallan.model.js';
import { TextileProcessOutputStock } from '../models/textileProcessOutputStock.model.js';
import { registerProcessOutputFromReturn } from '../services/textileProcessOutput.service.js';

dotenv.config();

const apply = process.argv.includes('--apply');
const companyArg = process.argv.find((a) => a.startsWith('--company='));
const companyFilter = companyArg ? companyArg.split('=')[1] : null;

async function main() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
        console.error('MONGODB_URI not set');
        process.exit(1);
    }
    await mongoose.connect(uri);

    const filter = { 'returns.0': { $exists: true } };
    if (companyFilter) filter.companyId = new mongoose.Types.ObjectId(companyFilter);

    const challans = await TextileDyeingChallan.find(filter).lean();
    let scanned = 0;
    let skipped = 0;
    let created = 0;
    const errors = [];

    for (const doc of challans) {
        for (const ret of doc.returns || []) {
            scanned += 1;
            const exists = await TextileProcessOutputStock.findOne({
                companyId: doc.companyId,
                sourceReturnId: ret._id,
            }).lean();
            if (exists) {
                skipped += 1;
                continue;
            }
            if (!apply) {
                created += 1;
                continue;
            }
            try {
                const full = await TextileDyeingChallan.findById(doc._id).lean();
                const rows = await registerProcessOutputFromReturn({
                    companyId: String(doc.companyId),
                    challan: full,
                    returnNo: ret.returnNo,
                    userId: null,
                    nextAction: 'KEEP_OUTPUT_STOCK',
                });
                created += rows.length;
            } catch (err) {
                errors.push({ challanNo: doc.challanNo, returnNo: ret.returnNo, message: err.message });
            }
        }
    }

    console.log(JSON.stringify({
        dryRun: !apply,
        companyFilter,
        challans: challans.length,
        returnsScanned: scanned,
        skippedExisting: skipped,
        rowsToCreateOrCreated: created,
        errors,
    }, null, 2));

    await mongoose.disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
