/**
 * restoreProdToLocal.mjs
 * Copies all collections from jskurja-prod → jskurja-dev on the same Atlas cluster.
 * Safe: reads prod (read-only), drops+replaces only in dev.
 * Run from backend/: node src/scripts/restoreProdToLocal.mjs
 * Dry run:           node src/scripts/restoreProdToLocal.mjs --dry-run
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const DRY_RUN = process.argv.includes('--dry-run');

// --- Build connection string from env (strip db name, we'll pick it manually) ---
const BASE_URL = (process.env.MONGODB_URL || '')
    .replace(/\/jskurja-[^?]+/, '/');   // strip the db name part

if (!BASE_URL || !BASE_URL.startsWith('mongodb')) {
    console.error('MONGODB_URL not found in .env');
    process.exit(1);
}

const PROD_DB = 'jskurja-prod';
const DEV_DB  = 'jskurja-dev';

const PROD_URI = BASE_URL + PROD_DB + (BASE_URL.includes('?') ? '' : '?') + (process.env.MONGODB_URL?.split('?')[1] || '');
const DEV_URI  = BASE_URL + DEV_DB  + (BASE_URL.includes('?') ? '' : '?') + (process.env.MONGODB_URL?.split('?')[1] || '');

// Actually, simplest: use same URI but client.db() to switch databases
const RAW_URI = process.env.MONGODB_URL || '';

// Extract base without db name for dual-db access
function buildUri(dbName) {
    return RAW_URI.replace(/\/jskurja-[^?]+/, '/' + dbName);
}

const PROD_CONN = buildUri(PROD_DB);
const DEV_CONN  = buildUri(DEV_DB);

// Collections to SKIP (system/log collections - keep dev versions)
const SKIP_COLLECTIONS = new Set([
    'useractivitylogs',
    'loginhistories',
    'auditlogs',
    'sessions',
]);

async function run() {
    console.log('===========================================');
    console.log(' JSK Prod → Local Dev Restore');
    console.log('===========================================');
    console.log('Source  :', PROD_DB);
    console.log('Target  :', DEV_DB);
    console.log('Dry run :', DRY_RUN);
    console.log('');

    if (PROD_CONN === DEV_CONN) {
        console.error('ERROR: prod and dev connection strings are the same.');
        console.error('Make sure MONGODB_URL in .env contains "jskurja-dev" or "jskurja-prod".');
        console.error('Current MONGODB_URL:', RAW_URI.substring(0, 60) + '...');
        process.exit(1);
    }

    const prodClient = new MongoClient(PROD_CONN, { serverSelectionTimeoutMS: 15000 });
    const devClient  = new MongoClient(DEV_CONN,  { serverSelectionTimeoutMS: 15000 });

    try {
        console.log('Connecting to prod...');
        await prodClient.connect();
        console.log('Connecting to dev...');
        await devClient.connect();
        console.log('Both connected.');
        console.log('');

        const prodDb = prodClient.db(PROD_DB);
        const devDb  = devClient.db(DEV_DB);

        // List all collections from prod
        const collections = await prodDb.listCollections().toArray();
        console.log('Collections in prod (' + collections.length + '):');
        collections.forEach(c => console.log('  ' + c.name));
        console.log('');

        let totalDocs = 0;
        const results = [];

        for (const col of collections) {
            const name = col.name;

            if (SKIP_COLLECTIONS.has(name)) {
                console.log('[SKIP] ' + name);
                continue;
            }

            const docs = await prodDb.collection(name).find({}).toArray();
            const count = docs.length;
            totalDocs += count;

            if (DRY_RUN) {
                console.log('[DRY]  ' + name + ': ' + count + ' docs');
                results.push({ name, count, status: 'dry-run' });
                continue;
            }

            // Drop dev collection and re-insert
            try {
                await devDb.collection(name).drop();
            } catch (e) {
                // Ignore if doesn't exist
            }

            if (count > 0) {
                await devDb.collection(name).insertMany(docs, { ordered: false });
            }

            console.log('[DONE] ' + name + ': ' + count + ' docs copied');
            results.push({ name, count, status: 'copied' });
        }

        console.log('');
        console.log('===========================================');
        if (DRY_RUN) {
            console.log('DRY RUN complete. No data was changed.');
            console.log('Total docs that would be copied: ' + totalDocs);
            console.log('Run without --dry-run to apply.');
        } else {
            console.log('RESTORE COMPLETE!');
            console.log('Total docs copied: ' + totalDocs);
            console.log('');
            console.log('Next steps:');
            console.log('  1. Start local backend:  npm run dev');
            console.log('  2. Open app:             http://localhost:5173');
            console.log('  3. Login with your admin credentials');
            console.log('  4. Run migration script: npm run migrate:to-company');
            console.log('     (to ensure all docs have correct companyId)');
        }
        console.log('===========================================');

    } catch (err) {
        console.error('ERROR:', err.message);
        if (err.message.includes('ENOTFOUND') || err.message.includes('timed out')) {
            console.error('');
            console.error('Cannot reach MongoDB Atlas. Check:');
            console.error('  1. Internet connection is active');
            console.error('  2. Atlas IP whitelist includes your current IP (0.0.0.0/0 for open)');
            console.error('  3. MONGODB_URL in .env is correct');
        }
        process.exit(1);
    } finally {
        await prodClient.close();
        await devClient.close();
    }
}

run();
