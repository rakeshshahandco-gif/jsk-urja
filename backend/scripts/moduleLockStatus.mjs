/**
 * READ-ONLY: print golden module lock status from PlatformFeatureSettings.settings.moduleLocks
 * Usage: npm run module-lock:status
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
dotenv.config({ path: path.join(root, '.env.local'), override: true });

const mongoUrl = process.env.MONGODB_URL || process.env.MONGO_URI || process.env.MONGODB_URI;
if (!mongoUrl) {
    console.error('Missing MONGODB_URL / MONGO_URI');
    process.exit(1);
}
if (/jskurja-prod/i.test(mongoUrl)) {
    console.error('Refusing to run against jskurja-prod');
    process.exit(1);
}

const { listModuleLocks } = await import('../src/services/moduleLock.service.js');

await mongoose.connect(mongoUrl);
try {
    const locks = await listModuleLocks();
    console.log('=====================================');
    console.log('MODULE PROTECTION STATUS');
    console.log('=====================================');
    console.log('');
    for (const row of locks) {
        if (row.testOnly && !row.locked) continue;
        console.log(row.moduleName);
        console.log(`Status: ${row.status}`);
        console.log(`Scope: ${row.scope}`);
        if (row.locked && row.lockReason) console.log(`Reason: ${row.lockReason}`);
        console.log('');
    }
    const locked = locks.filter((x) => x.locked);
    const open = locks.filter((x) => !x.locked);
    console.log('=====================================');
    console.log(`LOCKED: ${locked.length}  OPEN: ${open.length}`);
    console.log('Source: platformfeaturesettings.settings.moduleLocks');
    console.log('Runtime CRM: unaffected (dev protection only)');
    console.log('=====================================');
} finally {
    await mongoose.disconnect();
}
