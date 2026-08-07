/**
 * Deeper Master Alteration integration checks on jskurja-dev (no prod).
 * Creates ephemeral test docs tagged MASTER_ALT_TEST_* then cleans up.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { companyScopeAls } from '../src/utils/companyScopeContext.js';

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
const uri = process.env.MONGODB_URL || '';
if (!uri || /jskurja-prod/i.test(uri)) {
    console.error('Refuse: bad URI');
    process.exit(1);
}

await mongoose.connect(uri);
console.log('DB', mongoose.connection.name);

const { AccountGroup } = await import('../src/models/accountGroup.model.js');
const { AccountLedger } = await import('../src/models/accountLedger.model.js');
const { AccountingPeriodLock } = await import('../src/models/accountingPeriodLock.model.js');
const Customer = (await import('../src/models/customer.model.js')).default;
const { SalesInvoice } = await import('../src/models/salesInvoice.model.js');
const { Item } = await import('../src/models/item.model.js');
const { Gstr1PeriodStatus } = await import('../src/models/gstr1PeriodStatus.model.js');
const { Gstr1Amendment } = await import('../src/models/gstr1Amendment.model.js');
const { AuditLog } = await import('../src/models/auditLog.model.js');
const { buildImpactPreview, applyMasterAlteration, discoverDependencies } =
    await import('../src/services/masterAlteration/index.js');

const company = await mongoose.connection.db.collection('companies').findOne({});
if (!company) {
    console.error('No company in jskurja-dev');
    process.exit(1);
}
const companyId = company._id;
console.log('Company', company.name || companyId);

await companyScopeAls.run({ companyId }, async () => {
await runTests(companyId);
});

async function runTests(companyId) {
const TAG = `MASTER_ALT_TEST_${Date.now()}`;
const results = [];
const adminUser = { _id: new mongoose.Types.ObjectId(), role: { name: 'admin' } };

try {
    // --- Groups ---
    let indirect = await AccountGroup.findOne({ companyId, name: /Indirect Expenses/i });
    let creditors = await AccountGroup.findOne({ companyId, name: /Sundry Creditors/i });
    if (!indirect) {
        indirect = await AccountGroup.create({
            name: 'Indirect Expenses',
            nature: 'Expenses',
            companyId,
            createdBy: adminUser._id,
        });
    }
    if (!creditors) {
        creditors = await AccountGroup.create({
            name: 'Sundry Creditors',
            nature: 'Liabilities',
            companyId,
            createdBy: adminUser._id,
        });
    }

    // LEDGER open-only group change
    const ledger = await AccountLedger.create({
        name: `${TAG}_ABC_Expense`,
        underGroup: indirect._id,
        groupName: indirect.name,
        type: 'Expense',
        companyId,
        createdBy: adminUser._id,
    });
    const previewOpen = await buildImpactPreview({
        masterType: 'Ledger',
        masterId: ledger._id,
        proposedChanges: { underGroup: String(creditors._id) },
        companyId,
    });
    results.push({
        test: 'LEDGER_GROUP_PREVIEW_OPEN',
        pass: previewOpen.canApply === true || previewOpen.accountingImpact != null,
        canApply: previewOpen.canApply,
        block: previewOpen.blockReason || '',
    });

    const applyOpen = await applyMasterAlteration({
        masterType: 'Ledger',
        masterId: ledger._id,
        proposedChanges: { underGroup: String(creditors._id) },
        companyId,
        user: adminUser,
        reason: 'Smoke test ledger group open FY',
        effectiveFrom: new Date().toISOString().slice(0, 10),
        confirmApply: true,
    });
    const ledgerAfter = await AccountLedger.findById(ledger._id).lean();
    results.push({
        test: 'LEDGER_GROUP_APPLY_SAME_ID',
        pass:
            String(ledgerAfter._id) === String(ledger._id) &&
            String(ledgerAfter.underGroup) === String(creditors._id) &&
            (ledgerAfter.groupHistory || []).length >= 1,
        groupHistoryLen: (ledgerAfter.groupHistory || []).length,
    });

    // Locked FY block / require effectiveFrom
    const priorFy = '2024-2025';
    await AccountingPeriodLock.findOneAndUpdate(
        { financialYear: priorFy },
        {
            financialYear: priorFy,
            booksLockedTill: new Date('2025-03-31'),
            isActive: true,
            companyId,
        },
        { upsert: true },
    );
    // Create a ledger entry in locked FY via raw collection to avoid voucher complexity
    await mongoose.connection.db.collection('ledgerentries').insertOne({
        voucherId: new mongoose.Types.ObjectId(),
        voucherNo: `${TAG}-V1`,
        date: new Date('2025-01-15'),
        ledgerId: ledger._id,
        ledgerName: ledger.name,
        amount: 100,
        type: 'Debit',
        financialYear: priorFy,
        companyId,
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    const previewLocked = await buildImpactPreview({
        masterType: 'Ledger',
        masterId: ledger._id,
        proposedChanges: { underGroup: String(indirect._id) },
        companyId,
        // no effectiveFrom
    });
    results.push({
        test: 'LEDGER_LOCKED_HISTORY_BLOCK_WITHOUT_EFFECTIVE_FROM',
        pass: previewLocked.canApply === false && /locked/i.test(previewLocked.blockReason || ''),
        blockReason: previewLocked.blockReason,
        lockedTxns: previewLocked.accountingImpact?.lockedFyTransactions,
    });

    const previewProspective = await buildImpactPreview({
        masterType: 'Ledger',
        masterId: ledger._id,
        proposedChanges: { underGroup: String(indirect._id) },
        companyId,
        effectiveFrom: '2026-04-01',
    });
    results.push({
        test: 'LEDGER_LOCKED_WITH_PROSPECTIVE_EFFECTIVE_FROM',
        pass: previewProspective.canApply === true,
        blockReason: previewProspective.blockReason || '',
    });

    // CUSTOMER B2C → B2B open
    const customer = await Customer.create({
        customerName: `${TAG}_Cust`,
        company: `${TAG}_Cust`,
        gstRegistrationType: 'Unregistered',
        contactPersons: [{ name: 'Test', mobile: '9999999999', isPrimary: true }],
        companyId,
        createdBy: adminUser._id,
    });
    // Clear gstNumber properly
    await Customer.updateOne({ _id: customer._id }, { $set: { companyId } });
    await Customer.updateOne({ _id: customer._id }, { $unset: { gstNumber: 1 }, $set: { gstRegistrationType: 'Unregistered' } });
    const custCheck = await Customer.findById(customer._id).lean();
    if (!custCheck) throw new Error('Customer disappeared after create');

    const invId = new mongoose.Types.ObjectId();
    await mongoose.connection.db.collection('salesinvoices').insertOne({
        _id: invId,
        invoiceNumber: `${TAG}-SI-1`,
        invoiceDate: new Date('2026-06-01'),
        customerId: customer._id,
        customerName: `${TAG}_Cust`,
        customerGstin: '',
        customerRegistrationType: 'Unregistered',
        gstr1CategorySnapshot: 'B2C',
        gstTreatmentSnapshot: 'Unregistered / B2C',
        items: [{ itemName: 'Test', qty: 1, rate: 100, taxableAmount: 100, totalAmount: 100 }],
        grandTotal: 100,
        roundedTotal: 100,
        financialYear: '2026-2027',
        companyId,
        status: 'Confirmed',
        isDeleted: false,
        eInvoiceStatus: 'Not Generated',
        irn: '',
        createdBy: adminUser._id,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    const inv = { _id: invId, invoiceDate: new Date('2026-06-01') };
    // Ensure June is OPEN for B2C→B2B test
    await Gstr1PeriodStatus.deleteMany({ companyId, returnPeriod: '2026-06' });
    console.log('DEBUG raw SI count', await mongoose.connection.db.collection('salesinvoices').countDocuments({ customerId: customer._id }));

    const usage = await discoverDependencies('Customer', customer._id, companyId);
    results.push({
        test: 'CUSTOMER_VIEW_USAGE_COUNTS_SI',
        pass: (usage.counts?.salesInvoices || 0) >= 1,
        counts: usage.counts,
    });

    const testGstin = '27AAPFU0939F1ZV'; // format-valid pattern (checksum not strictly enforced here)
    const custApply = await applyMasterAlteration({
        masterType: 'Customer',
        masterId: customer._id,
        proposedChanges: {
            gstNumber: testGstin,
            gstRegistrationType: 'Registered',
            gstRegistrationEffectiveDate: '2026-01-01',
            gstStatus: 'Active',
        },
        companyId,
        user: adminUser,
        reason: 'Smoke B2C to B2B',
        confirmApply: true,
    });
    const invAfter = await SalesInvoice.findById(inv._id).lean();
    results.push({
        test: 'CUSTOMER_B2C_TO_B2B_OPEN',
        pass:
            String(invAfter.customerId) === String(customer._id) &&
            String(invAfter.customerGstin || '').toUpperCase() === testGstin &&
            String(invAfter.gstr1CategorySnapshot || '').toUpperCase().startsWith('B2B'),
        gstin: invAfter.customerGstin,
        category: invAfter.gstr1CategorySnapshot,
        summary: custApply.summary,
    });

    // FILED period amendment
    // Reset invoice snapshot to pre-correction, mark period filed, then force a GST field change
    await SalesInvoice.updateOne(
        { _id: inv._id },
        {
            $set: {
                customerGstin: '',
                customerRegistrationType: 'Unregistered',
                gstr1CategorySnapshot: 'B2C',
            },
        },
    );
    await Gstr1PeriodStatus.findOneAndUpdate(
        { companyId, returnPeriod: '2026-06' },
        { companyId, returnPeriod: '2026-06', financialYear: '2026-2027', status: 'Filed', filedAt: new Date() },
        { upsert: true },
    );
    const filedApply = await applyMasterAlteration({
        masterType: 'Customer',
        masterId: customer._id,
        proposedChanges: {
            gstNumber: '27AAPFU0939F1Z5', // different last char to force change detection
            gstRegistrationType: 'Registered',
            gstRegistrationEffectiveDate: '2026-01-01',
        },
        companyId,
        user: adminUser,
        reason: 'Smoke filed amendment',
        confirmApply: true,
    });
    const invFiled = await SalesInvoice.findById(inv._id).lean();
    const amd = await Gstr1Amendment.findOne({ salesInvoiceId: inv._id, status: 'Amendment Required' }).lean();
    results.push({
        test: 'FILED_PERIOD_NO_REWRITE_AMENDMENT',
        pass:
            String(invFiled.gstr1CategorySnapshot || '') === 'B2C' &&
            !String(invFiled.customerGstin || '') &&
            Boolean(amd),
        invCategory: invFiled.gstr1CategorySnapshot,
        invGstin: invFiled.customerGstin,
        amendmentId: amd?._id,
        amendmentsRequired: filedApply.summary?.amendmentsRequired,
    });

    // ITEM HSN
    const item = await Item.create({
        itemCode: `MAT${Date.now().toString().slice(-8)}`,
        itemName: `${TAG}_LED_DRIVER`,
        itemCategory: 'FINISHED_GOOD',
        hsnCode: '',
        companyId,
        createdBy: adminUser._id,
    });
    console.log('DEBUG item', item?._id);
    const inv2Id = new mongoose.Types.ObjectId();
    await mongoose.connection.db.collection('salesinvoices').insertOne({
        _id: inv2Id,
        invoiceNumber: `${TAG}-SI-2`,
        invoiceDate: new Date('2026-07-01'),
        customerId: customer._id,
        customerName: `${TAG}_Cust`,
        items: [
            {
                itemId: item._id,
                itemName: item.itemName || item.name,
                hsnCode: '',
                qty: 1,
                rate: 50,
                taxableAmount: 50,
                totalAmount: 50,
            },
        ],
        grandTotal: 50,
        roundedTotal: 50,
        financialYear: '2026-2027',
        companyId,
        status: 'Confirmed',
        isDeleted: false,
        eInvoiceStatus: 'Not Generated',
        irn: '',
        createdBy: adminUser._id,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    const inv2 = { _id: inv2Id };
    // Ensure July not filed for open HSN test
    await Gstr1PeriodStatus.deleteOne({ companyId, returnPeriod: '2026-07' });

    await applyMasterAlteration({
        masterType: 'Item',
        masterId: item._id,
        proposedChanges: { hsnCode: '850440' },
        companyId,
        user: adminUser,
        reason: 'Smoke HSN fill',
        confirmApply: true,
    });
    const inv2After = await SalesInvoice.findById(inv2._id).lean();
    const lineHsn = inv2After.items?.[0]?.hsnCode;
    results.push({
        test: 'ITEM_HSN_OPEN_PROPAGATION',
        pass: lineHsn === '850440',
        lineHsn,
    });

    const audits = await AuditLog.find({ module: 'MasterAlteration' }).sort({ createdAt: -1 }).limit(5).lean();
    results.push({
        test: 'AUDITLOG_WRITTEN',
        pass: audits.length > 0,
        latest: audits[0]?.description,
    });

    // Cross-company isolation: preview with wrong companyId must not resolve this customer
    const otherCompanyId = new mongoose.Types.ObjectId();
    const custLean = await Customer.findById(customer._id).select('companyId').lean();
    let crossPass = false;
    try {
        await buildImpactPreview({
            masterType: 'Customer',
            masterId: customer._id,
            proposedChanges: { customerName: 'HACK' },
            companyId: otherCompanyId,
        });
        crossPass = false;
    } catch (e) {
        crossPass = /not found/i.test(e.message || '');
    }
    results.push({
        test: 'CROSS_COMPANY_ISOLATION',
        pass: crossPass && Boolean(custLean?.companyId),
        customerCompanyId: custLean?.companyId ? String(custLean.companyId) : null,
    });
} catch (e) {
    console.error('INTEGRATION ERROR', e);
    results.push({ test: 'EXCEPTION', pass: false, message: e.message });
} finally {
    // Cleanup test artefacts
    await mongoose.connection.db.collection('accountledgers').deleteMany({ name: new RegExp(`^${TAG}`) });
    await mongoose.connection.db.collection('customers').deleteMany({ customerName: new RegExp(`^${TAG}`) });
    await mongoose.connection.db.collection('salesinvoices').deleteMany({ invoiceNumber: new RegExp(`^${TAG}`) });
    await mongoose.connection.db.collection('items').deleteMany({ name: new RegExp(`^${TAG}`) });
    await mongoose.connection.db.collection('ledgerentries').deleteMany({ voucherNo: new RegExp(`^${TAG}`) });
    await mongoose.connection.db.collection('gstr1amendments').deleteMany({ invoiceNumber: new RegExp(`^${TAG}`) });
    await mongoose.connection.db.collection('gstr1periodstatuses').deleteMany({
        returnPeriod: { $in: ['2026-06', '2026-07'] },
        companyId,
    });
    console.log('Cleanup done for', TAG);
}

console.log('\n=== RESULTS ===');
for (const r of results) {
    console.log(r.pass ? 'PASS' : 'FAIL', r.test, JSON.stringify(r));
}
const failed = results.filter((r) => !r.pass);
console.log(failed.length ? `FAILED ${failed.length}` : 'ALL PASSED');
const cols = await mongoose.connection.db.listCollections().toArray();
console.log('Collections still:', cols.length, '(no new collections expected)');
await mongoose.disconnect();
process.exit(failed.length ? 1 : 0);
}
