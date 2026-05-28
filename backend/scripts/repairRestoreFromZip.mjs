/**
 * Re-import database from a downloaded backup ZIP (fixes corrupted _id after bad restore).
 * Usage: node scripts/repairRestoreFromZip.mjs "path-to-backup.zip"
 */
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { repairDatabaseFromZip } from '../src/services/backup.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const zipArg = process.argv[2];
if (!zipArg) {
    console.error('Usage: node scripts/repairRestoreFromZip.mjs "<path-to-backup.zip>"');
    process.exit(1);
}

const url = process.env.MONGODB_URL;
if (!url) {
    console.error('MONGODB_URL missing in backend/.env');
    process.exit(1);
}

console.log('Connecting to', url.replace(/:[^:@]+@/, ':****@'));
await mongoose.connect(url);
console.log('Database:', mongoose.connection.name);

try {
    const result = await repairDatabaseFromZip(zipArg);
    console.log('SUCCESS:', result.message);
    console.log('Collections:', result.collectionCount, '| Documents:', result.totalDocs);
} catch (err) {
    console.error('FAILED:', err.message);
    process.exit(1);
} finally {
    await mongoose.disconnect();
}