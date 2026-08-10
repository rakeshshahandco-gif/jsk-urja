/**
 * READ-ONLY: check one module lock key.
 * Usage: npm run module-lock:check -- salesOrder
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

const moduleKey = process.argv.slice(2).find((a) => !a.startsWith('-')) || '';
if (!moduleKey) {
    console.error('Usage: npm run module-lock:check -- <moduleKey>');
    console.error('Example: npm run module-lock:check -- salesOrder');
    process.exit(1);
}

const mongoUrl = process.env.MONGODB_URL || process.env.MONGO_URI || process.env.MONGODB_URI;
if (!mongoUrl) {
    console.error('Missing MONGODB_URL / MONGO_URI');
    process.exit(1);
}
if (/jskurja-prod/i.test(mongoUrl)) {
    console.error('Refusing to run against jskurja-prod');
    process.exit(1);
}

const { getModuleLock } = await import('../src/services/moduleLock.service.js');

await mongoose.connect(mongoUrl);
try {
    const entry = await getModuleLock(moduleKey);
    if (entry.locked) {
        console.log('MODULE LOCK CHECK: BLOCKED');
        console.log('');
        console.log('Module:');
        console.log(` ${entry.moduleName}`);
        console.log('');
        console.log('Status:');
        console.log(' LOCKED');
        console.log('');
        console.log('Reason:');
        console.log(` ${entry.lockReason || 'Approved Golden Module'}`);
        console.log('');
        console.log('Owner unlock required before modification.');
        console.log('Settings → System Protection → Module Lock');
        process.exitCode = 2;
    } else {
        console.log('MODULE LOCK CHECK: OPEN');
        console.log('');
        console.log('Module:');
        console.log(` ${entry.moduleName}`);
        console.log('');
        console.log('Status:');
        console.log(' OPEN');
        console.log('');
        console.log('Development may proceed within requested scope.');
    }
} finally {
    await mongoose.disconnect();
}
