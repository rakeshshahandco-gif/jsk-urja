/**
 * DRY-RUN ONLY — WhatsApp historical archive/media eligibility report.
 * Does not upload, delete, or migrate Mongo WhatsApp messages.
 *
 * Usage: node backend/scripts/whatsappArchiveBackfillDryRun.mjs
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(root, 'backend', '.env') });
dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, 'backend', '.env.local'), override: true });

const mongoUrl = process.env.MONGODB_URL || process.env.MONGO_URI || process.env.MONGODB_URI;
if (!mongoUrl) {
    console.error('Missing MONGODB_URL');
    process.exit(1);
}
if (/jskurja-prod/i.test(mongoUrl)) {
    console.error('Refusing jskurja-prod');
    process.exit(1);
}

const { dryRunWhatsAppArchiveBackfill } = await import('../src/services/whatsappChatArchive.service.js');
const WhatsAppMessage = (await import('../src/models/whatsappMessage.model.js')).default;

await mongoose.connect(mongoUrl);
try {
    const users = await WhatsAppMessage.aggregate([
        { $match: { mediaType: { $ne: 'placeholder' } } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
    ]);
    console.log('=====================================');
    console.log('WHATSAPP ARCHIVE BACKFILL DRY-RUN');
    console.log('=====================================');
    console.log('db:', mongoose.connection.name);
    for (const u of users) {
        const report = await dryRunWhatsAppArchiveBackfill({ userId: u._id });
        console.log('');
        console.log('userId:', String(u._id));
        console.log(JSON.stringify(report, null, 2));
    }
    if (!users.length) {
        console.log('No WhatsApp messages found.');
    }
    console.log('=====================================');
    console.log('NO MIGRATION / NO DELETE performed.');
    console.log('=====================================');
} finally {
    await mongoose.disconnect();
}
