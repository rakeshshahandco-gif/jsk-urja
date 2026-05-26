/**
 * Idempotently fills in the new top-level feature blocks (`workflow`, `ui`)
 * for every existing CompanyFeatureSettings document.
 *
 * SAFETY CONTRACT:
 *   - DRY-RUN BY DEFAULT. No writes happen unless you pass `--write`.
 *   - Only ADDS missing top-level blocks. If a company already has a
 *     `workflow` or `ui` block (even partially populated), THIS SCRIPT
 *     LEAVES IT ALONE. The runtime `mergeFeatureSettings` already fills
 *     any missing sub-keys from `DEFAULT_COMPANY_FEATURE_SETTINGS` on read,
 *     so there is no need to touch partially-filled blocks.
 *   - Idempotent. Running it 100 times has the same effect as running it
 *     once.
 *   - In production (`NODE_ENV=production`), the `--confirm-prod` flag is
 *     also required.
 *
 * USAGE (from the `backend/` directory):
 *
 *   # 1. Dry-run first (safe — just prints what would change):
 *   node src/scripts/seedFeatureDefaultsForCompanies.mjs
 *
 *   # 2. After reviewing the dry-run, actually persist:
 *   node src/scripts/seedFeatureDefaultsForCompanies.mjs --write
 *
 *   # 3. Production requires the extra confirmation flag:
 *   NODE_ENV=production node src/scripts/seedFeatureDefaultsForCompanies.mjs --write --confirm-prod
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// ----- CLI flags -----------------------------------------------------------
const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');
const CONFIRM_PROD = args.has('--confirm-prod');
const VERBOSE = args.has('--verbose') || args.has('-v');
const IS_PROD = process.env.NODE_ENV === 'production';

if (IS_PROD && WRITE && !CONFIRM_PROD) {
    console.error(
        '\nERROR: refusing to run with --write in production without --confirm-prod.\n' +
        '       Re-run as:\n' +
        '         NODE_ENV=production node src/scripts/seedFeatureDefaultsForCompanies.mjs --write --confirm-prod\n',
    );
    process.exit(2);
}

const banner = (msg) => {
    const bar = '='.repeat(72);
    console.log(`\n${bar}\n  ${msg}\n${bar}`);
};

banner(`seedFeatureDefaultsForCompanies — mode: ${WRITE ? 'WRITE' : 'DRY-RUN'}${IS_PROD ? ' (production)' : ''}`);

// ----- Lazy imports so we honour the env loaded above ---------------------
const { connectDB } = await import('../config/db.js');
const { CompanyFeatureSettings } = await import('../models/companyFeatureSettings.model.js');
const { DEFAULT_COMPANY_FEATURE_SETTINGS } = await import('../constants/companyFeatureSettings.defaults.js');
// Company model imported only so its schema is registered if needed.
await import('../models/company.model.js');

const connected = await connectDB();
if (!connected) {
    console.error('Database connection failed.');
    process.exit(1);
}

// ----- The seeding logic --------------------------------------------------
// Only these top-level keys are eligible for back-fill. Keep this list
// tight so the script can never be turned into a "rewrite everything"
// hammer.
const ELIGIBLE_TOP_LEVEL_KEYS = ['workflow', 'ui'];

const summary = {
    total: 0,
    untouched: 0,
    needsBackfill: 0,
    written: 0,
    skipped: 0,
    errors: 0,
};

const rows = [];

try {
    const docs = await CompanyFeatureSettings.find({}).lean(false);
    summary.total = docs.length;

    if (docs.length === 0) {
        console.log('No CompanyFeatureSettings documents found. Nothing to do.');
        process.exit(0);
    }

    for (const doc of docs) {
        const settings = doc.settings || {};
        const missing = ELIGIBLE_TOP_LEVEL_KEYS.filter((key) => {
            const v = settings[key];
            return v === undefined || v === null;
        });

        if (missing.length === 0) {
            summary.untouched += 1;
            if (VERBOSE) {
                rows.push({
                    companyId: String(doc.companyId),
                    status: 'OK (already has all blocks)',
                    fill: '',
                });
            }
            continue;
        }

        summary.needsBackfill += 1;
        const fillPreview = missing
            .map((k) => `${k}=${JSON.stringify(DEFAULT_COMPANY_FEATURE_SETTINGS[k])}`)
            .join(' | ');

        rows.push({
            companyId: String(doc.companyId),
            status: WRITE ? 'WILL WRITE' : 'WOULD WRITE',
            fill: fillPreview,
        });

        if (!WRITE) continue;

        try {
            for (const key of missing) {
                doc.settings[key] = JSON.parse(
                    JSON.stringify(DEFAULT_COMPANY_FEATURE_SETTINGS[key]),
                );
            }
            doc.markModified('settings');
            await doc.save();
            summary.written += 1;
        } catch (err) {
            summary.errors += 1;
            console.error(`  ! Failed to save companyId=${doc.companyId}: ${err.message}`);
        }
    }
} catch (err) {
    console.error('Fatal:', err);
    process.exit(1);
}

// ----- Print table --------------------------------------------------------
if (rows.length > 0) {
    banner('Per-company changes');
    const pad = (s, n) => String(s).padEnd(n);
    console.log(
        `${pad('companyId', 26)}  ${pad('status', 14)}  fill`,
    );
    console.log('-'.repeat(80));
    for (const r of rows) {
        console.log(`${pad(r.companyId, 26)}  ${pad(r.status, 14)}  ${r.fill}`);
    }
}

// ----- Summary ------------------------------------------------------------
banner('Summary');
console.log(`  total CompanyFeatureSettings docs : ${summary.total}`);
console.log(`  already complete                  : ${summary.untouched}`);
console.log(`  needed back-fill                  : ${summary.needsBackfill}`);
console.log(`  actually written this run         : ${summary.written}`);
console.log(`  errors                            : ${summary.errors}`);
console.log('');

if (!WRITE && summary.needsBackfill > 0) {
    console.log(`This was a DRY-RUN. To persist the ${summary.needsBackfill} change(s) above:`);
    console.log('    node src/scripts/seedFeatureDefaultsForCompanies.mjs --write');
    if (IS_PROD) {
        console.log('    (production also requires --confirm-prod)');
    }
} else if (WRITE && summary.written > 0) {
    console.log(`Wrote ${summary.written} document(s). The new blocks default every flag to false`);
    console.log('so existing CRM behaviour is unchanged. Admins can opt-in from:');
    console.log('  Admin -> Feature Settings -> Workflow / Kanban');
    console.log('  Admin -> Feature Settings -> UI Customization');
} else if (summary.needsBackfill === 0) {
    console.log('Nothing to do — every company already has the workflow + ui blocks.');
}

process.exit(0);
