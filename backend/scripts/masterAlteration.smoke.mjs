/**
 * Localhost Master Alteration Phase 2–3 smoke tests (jskurja-dev only).
 * Run: node backend/scripts/masterAlteration.smoke.mjs
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { resolveLedgerGroupAtDate, buildNextGroupHistory } from '../src/services/masterAlteration/ledgerGroupHistory.js';
import { resolveStatusOnDate } from '../src/services/masterAlteration/gstDateResolve.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (!process.env[m[1]]) process.env[m[1]] = v;
    }
}

loadEnv();

const uri = process.env.MONGODB_URL || process.env.MONGODB_URI || process.env.MONGO_URI || '';
if (!uri) {
    console.error('No MONGODB_URI');
    process.exit(1);
}
if (/jskurja-prod/i.test(uri)) {
    console.error('REFUSING: URI points at jskurja-prod');
    process.exit(1);
}

const oldGroup = new mongoose.Types.ObjectId();
const newGroup = new mongoose.Types.ObjectId();
const fakeLedger = {
    underGroup: oldGroup,
    groupName: 'Indirect Expenses',
    groupHistory: [],
};
const hist = buildNextGroupHistory({
    ledger: fakeLedger,
    newGroupId: newGroup,
    newGroupName: 'Sundry Creditors',
    effectiveFrom: '2026-04-01',
    reason: 'test',
});
const asOfLocked = resolveLedgerGroupAtDate(
    { ...fakeLedger, underGroup: newGroup, groupName: 'Sundry Creditors', groupHistory: hist },
    '2026-03-15',
);
const asOfOpen = resolveLedgerGroupAtDate(
    { ...fakeLedger, underGroup: newGroup, groupName: 'Sundry Creditors', groupHistory: hist },
    '2026-04-15',
);
console.log('LEDGER HISTORY TEST:', {
    beforeEffective: String(asOfLocked.groupId) === String(oldGroup) ? 'PASS' : 'FAIL',
    afterEffective: String(asOfOpen.groupId) === String(newGroup) ? 'PASS' : 'FAIL',
});

const before = resolveStatusOnDate({
    transactionDate: '2026-07-10',
    historyRows: [],
    currentStatus: 'Cancelled',
    cancellationDate: '2026-07-16',
    registrationDate: '2020-01-01',
});
const after = resolveStatusOnDate({
    transactionDate: '2026-07-20',
    historyRows: [],
    currentStatus: 'Cancelled',
    cancellationDate: '2026-07-16',
    registrationDate: '2020-01-01',
});
console.log('GST CANCELLATION DATE TEST:', {
    invoice_10Jul: before.statusOnTransactionDate,
    invoice_20Jul: after.statusOnTransactionDate,
    pass:
        before.statusOnTransactionDate === 'Active' && after.statusOnTransactionDate === 'Cancelled'
            ? 'PASS'
            : 'FAIL',
});

const siSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'models', 'salesInvoice.model.js'), 'utf8');
const requiredFields = [
    'gstr1CategorySnapshot',
    'gstTreatmentSnapshot',
    'gstStatusOnTransactionDate',
    'gstinUsed',
    'gstRevalidationRequired',
];
console.log('SI GST SNAPSHOT SCHEMA:', requiredFields.every((f) => siSrc.includes(f)) ? 'PASS' : 'FAIL');

await mongoose.connect(uri);
const dbName = mongoose.connection.name;
console.log('Connected DB:', dbName);
if (dbName === 'jskurja-prod') {
    console.error('REFUSING prod');
    process.exit(1);
}
const cols = await mongoose.connection.db.listCollections().toArray();
console.log('Collection count:', cols.length);
const forbidden = ['masteralterations', 'masterdependencies', 'masterjobs', 'suppliergsthistories', 'ledgergrouphistories'];
const found = cols.map((c) => c.name).filter((n) => forbidden.includes(n));
console.log('Forbidden new collections present:', found.length ? found : 'none (PASS)');
await mongoose.disconnect();
console.log('Done. jskurja-prod untouched. No deploy.');
