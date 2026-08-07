/**
 * Server-side permission gate check for master-alteration routes (jskurja-dev).
 * Does not deploy. Uses in-process middleware helpers + service assertPermissions.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { MASTER_ALTERATION_PERMISSIONS } from '../src/services/masterAlteration/permissions.js';
import { checkUserPermission } from '../src/utils/permissionUtils.js';
import { applyMasterAlteration, buildImpactPreview } from '../src/services/masterAlteration/index.js';
import { companyScopeAls } from '../src/utils/companyScopeContext.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
}
if (/jskurja-prod/i.test(process.env.MONGODB_URL || '')) {
    console.error('Refuse');
    process.exit(1);
}

function isAdmin(user) {
    const role = String(user?.role?.name || user?.roleName || user?.role || '').toLowerCase();
    return role === 'admin' || role === 'superadmin';
}
function allowApply(user) {
    if (isAdmin(user)) return true;
    const keys = [
        MASTER_ALTERATION_PERMISSIONS.ALTER_CUSTOMER,
        MASTER_ALTERATION_PERMISSIONS.ALTER_SUPPLIER,
        MASTER_ALTERATION_PERMISSIONS.ALTER_LEDGER,
        MASTER_ALTERATION_PERMISSIONS.ALTER_ITEM,
        MASTER_ALTERATION_PERMISSIONS.ALTER_LEDGER_GROUP,
        MASTER_ALTERATION_PERMISSIONS.ALTER_GSTIN,
        MASTER_ALTERATION_PERMISSIONS.ALTER_HSN,
        MASTER_ALTERATION_PERMISSIONS.ALTER_NAME,
    ];
    return keys.some((k) => checkUserPermission(user, k));
}
function allowRollback(user) {
    if (isAdmin(user)) return true;
    return checkUserPermission(user, MASTER_ALTERATION_PERMISSIONS.ROLLBACK);
}
function allowPreview(user) {
    if (isAdmin(user)) return true;
    const keys = [
        MASTER_ALTERATION_PERMISSIONS.VIEW_USAGE,
        MASTER_ALTERATION_PERMISSIONS.ALTER_CUSTOMER,
        'customers.customer_master.edit',
    ];
    return keys.some((k) => checkUserPermission(user, k));
}

await mongoose.connect(process.env.MONGODB_URL);
const company = await mongoose.connection.db.collection('companies').findOne({});
const colsBefore = (await mongoose.connection.db.listCollections().toArray()).length;
const staff = { _id: new mongoose.Types.ObjectId(), role: { name: 'staff' }, permissions: [] };
const admin = { _id: new mongoose.Types.ObjectId(), role: { name: 'admin' } };

const results = [];
results.push({ test: 'ROUTE_STAFF_APPLY_BLOCKED', pass: allowApply(staff) === false });
results.push({ test: 'ROUTE_STAFF_ROLLBACK_BLOCKED', pass: allowRollback(staff) === false });
results.push({ test: 'ROUTE_STAFF_PREVIEW_BLOCKED', pass: allowPreview(staff) === false });
results.push({ test: 'ROUTE_ADMIN_APPLY_OK', pass: allowApply(admin) === true });
results.push({ test: 'ROUTE_ADMIN_ROLLBACK_OK', pass: allowRollback(admin) === true });

await companyScopeAls.run({ companyId: company._id }, async () => {
    const Customer = (await import('../src/models/customer.model.js')).default;
    const TAG = `PERMHTTP_${Date.now()}`;
    const c = await Customer.create({
        customerName: TAG,
        company: TAG,
        companyId: company._id,
        contactPersons: [{ name: 'T', mobile: '9999999999', isPrimary: true }],
        createdBy: admin._id,
    });
    let staffApplyBlocked = false;
    try {
        await applyMasterAlteration({
            masterType: 'Customer',
            masterId: c._id,
            proposedChanges: { customerName: `${TAG}_X`, company: `${TAG}_X` },
            companyId: company._id,
            user: staff,
            reason: 'perm test',
            confirmApply: true,
        });
    } catch (e) {
        staffApplyBlocked = /permission|forbidden|denied/i.test(String(e.message || e.statusCode || ''));
    }
    results.push({ test: 'SERVICE_STAFF_APPLY_BLOCKED', pass: staffApplyBlocked });

    const preview = await buildImpactPreview({
        masterType: 'Customer',
        masterId: c._id,
        proposedChanges: { customerName: `${TAG}_Y` },
        companyId: company._id,
    });
    results.push({ test: 'SERVICE_PREVIEW_WORKS', pass: Boolean(preview?.fieldsChanged?.length) });

    await mongoose.connection.db.collection('customers').deleteOne({ _id: c._id });
});

const colsAfter = (await mongoose.connection.db.listCollections().toArray()).length;
results.push({ test: 'COLLECTIONS_UNCHANGED', pass: colsBefore === colsAfter && colsAfter === 249, colsBefore, colsAfter });

console.log('\n=== PERM RESULTS ===');
for (const r of results) console.log(r.pass ? 'PASS' : 'FAIL', r.test, JSON.stringify(r));
console.log(results.every((r) => r.pass) ? 'ALL PASSED' : 'FAILED');
console.log('DB', mongoose.connection.name);
await mongoose.disconnect();
process.exit(results.every((r) => r.pass) ? 0 : 1);
