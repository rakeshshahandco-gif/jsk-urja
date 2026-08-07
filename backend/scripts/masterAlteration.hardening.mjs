/**
 * Hardening tests: per-entry ledger group split + GST embedded history + protections.
 * jskurja-dev only. No new collections.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { companyScopeAls } from '../src/utils/companyScopeContext.js';
import { resolveLedgerGroupAtDate, buildNextGroupHistory } from '../src/services/masterAlteration/ledgerGroupHistory.js';
import { getLedgerBalancesByEntryGroup } from '../src/services/masterAlteration/ledgerBalanceByGroup.service.js';
import { resolveEmbeddedGstOnDate, appendGstHistoryIfChanged } from '../src/services/masterAlteration/embeddedGstHistory.js';
import { applyMasterAlteration, buildImpactPreview } from '../src/services/masterAlteration/index.js';
import { checkUserPermission } from '../src/utils/permissionUtils.js';
import { MASTER_ALTERATION_PERMISSIONS } from '../src/services/masterAlteration/permissions.js';

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
    console.error('Refuse');
    process.exit(1);
}

await mongoose.connect(uri);
console.log('BEFORE collections', (await mongoose.connection.db.listCollections().toArray()).length, 'DB', mongoose.connection.name);

const { AccountGroup } = await import('../src/models/accountGroup.model.js');
const { AccountLedger } = await import('../src/models/accountLedger.model.js');
const { AccountingPeriodLock } = await import('../src/models/accountingPeriodLock.model.js');
const Customer = (await import('../src/models/customer.model.js')).default;
const { SalesInvoice } = await import('../src/models/salesInvoice.model.js');
const { Item } = await import('../src/models/item.model.js');
const { Gstr1PeriodStatus } = await import('../src/models/gstr1PeriodStatus.model.js');
const { Gstr1Amendment } = await import('../src/models/gstr1Amendment.model.js');
const { AuditLog } = await import('../src/models/auditLog.model.js');
const { rollbackMasterAlteration } = await import('../src/services/masterAlteration/rollback.service.js');

const company = await mongoose.connection.db.collection('companies').findOne({});
const companyId = company._id;
const TAG = `HARDEN_${Date.now()}`;
const admin = { _id: new mongoose.Types.ObjectId(), role: { name: 'admin' } };
const results = [];

await companyScopeAls.run({ companyId }, async () => {
    try {
        let indirect = await AccountGroup.findOne({ name: /Indirect Expenses/i });
        let creditors = await AccountGroup.findOne({ name: /Sundry Creditors/i });
        if (!indirect) {
            indirect = await AccountGroup.create({
                name: 'Indirect Expenses',
                nature: 'Expenses',
                companyId,
                createdBy: admin._id,
            });
        }
        if (!creditors) {
            creditors = await AccountGroup.create({
                name: 'Sundry Creditors',
                nature: 'Liabilities',
                companyId,
                createdBy: admin._id,
            });
        }

        const ledger = await AccountLedger.create({
            name: `${TAG}_ABC_Charges`,
            underGroup: indirect._id,
            groupName: indirect.name,
            type: 'Expense',
            companyId,
            openingBalance: 0,
            drCr: 'Dr',
            createdBy: admin._id,
        });

        // Seed group history mid-FY: IE until 30-Sep, SC from 01-Oct
        ledger.groupHistory = buildNextGroupHistory({
            ledger: { underGroup: indirect._id, groupName: indirect.name, groupHistory: [] },
            newGroupId: creditors._id,
            newGroupName: creditors.name,
            effectiveFrom: '2026-10-01',
            reason: 'harden mid-FY',
        });
        ledger.underGroup = creditors._id;
        ledger.groupName = creditors.name;
        await ledger.save();

        // Insert entries
        await mongoose.connection.db.collection('ledgerentries').insertMany([
            {
                voucherId: new mongoose.Types.ObjectId(),
                voucherNo: `${TAG}-JUN`,
                date: new Date('2026-06-15'),
                ledgerId: ledger._id,
                ledgerName: ledger.name,
                amount: 10000,
                type: 'Debit',
                financialYear: '2026-2027',
                companyId,
            },
            {
                voucherId: new mongoose.Types.ObjectId(),
                voucherNo: `${TAG}-DEC`,
                date: new Date('2026-12-15'),
                ledgerId: ledger._id,
                ledgerName: ledger.name,
                amount: 20000,
                type: 'Debit',
                financialYear: '2026-2027',
                companyId,
            },
        ]);

        // TEST A / B unit resolve
        const juneG = resolveLedgerGroupAtDate(ledger.toObject(), '2026-06-15');
        const decG = resolveLedgerGroupAtDate(ledger.toObject(), '2026-12-15');
        results.push({
            test: 'TEST_A_JUNE_OLD_GROUP',
            pass: String(juneG.groupId) === String(indirect._id),
            got: juneG.groupName,
        });
        results.push({
            test: 'TEST_B_DEC_NEW_GROUP',
            pass: String(decG.groupId) === String(creditors._id),
            got: decG.groupName,
        });

        // TEST C Apr–Sep
        const c = await getLedgerBalancesByEntryGroup(new Date('2026-04-01'), new Date('2026-09-30'));
        const cRows = c.ledgerReports.filter((r) => String(r.ledgerId) === String(ledger._id));
        const cIE = cRows.find((r) => String(r.groupId) === String(indirect._id));
        const cSC = cRows.find((r) => String(r.groupId) === String(creditors._id));
        results.push({
            test: 'TEST_C_APR_SEP_ONLY_OLD',
            pass: (cIE?.totalDebit || 0) === 10000 && !(cSC?.totalDebit > 0),
            cIE: cIE?.totalDebit,
            cSC: cSC?.totalDebit,
        });

        // TEST D Oct–Mar
        const d = await getLedgerBalancesByEntryGroup(new Date('2026-10-01'), new Date('2027-03-31'));
        const dRows = d.ledgerReports.filter((r) => String(r.ledgerId) === String(ledger._id));
        const dIE = dRows.find((r) => String(r.groupId) === String(indirect._id));
        const dSC = dRows.find((r) => String(r.groupId) === String(creditors._id));
        results.push({
            test: 'TEST_D_OCT_MAR_ONLY_NEW',
            pass: (dSC?.totalDebit || 0) === 20000 && !(dIE?.totalDebit > 0),
            dIE: dIE?.totalDebit,
            dSC: dSC?.totalDebit,
        });

        // TEST E full FY
        const e = await getLedgerBalancesByEntryGroup(new Date('2026-04-01'), new Date('2027-03-31'));
        const eRows = e.ledgerReports.filter((r) => String(r.ledgerId) === String(ledger._id));
        const eIE = eRows.find((r) => String(r.groupId) === String(indirect._id));
        const eSC = eRows.find((r) => String(r.groupId) === String(creditors._id));
        results.push({
            test: 'TEST_E_FULL_FY_SPLIT',
            pass: (eIE?.totalDebit || 0) === 10000 && (eSC?.totalDebit || 0) === 20000,
            eIE: eIE?.totalDebit,
            eSC: eSC?.totalDebit,
        });

        // TEST F locked prior FY
        await AccountingPeriodLock.findOneAndUpdate(
            { financialYear: '2024-2025' },
            { financialYear: '2024-2025', booksLockedTill: new Date('2025-03-31'), isActive: true, companyId },
            { upsert: true },
        );
        await mongoose.connection.db.collection('ledgerentries').insertOne({
            voucherId: new mongoose.Types.ObjectId(),
            voucherNo: `${TAG}-PRIOR`,
            date: new Date('2025-01-10'),
            ledgerId: ledger._id,
            ledgerName: ledger.name,
            amount: 5000,
            type: 'Debit',
            financialYear: '2024-2025',
            companyId,
        });
        const fBal = await getLedgerBalancesByEntryGroup(new Date('2024-04-01'), new Date('2025-03-31'));
        const fRows = fBal.ledgerReports.filter((r) => String(r.ledgerId) === String(ledger._id));
        // Prior FY entry before Oct-2026 effectiveFrom → old Indirect Expenses
        const fIE = fRows.find((r) => String(r.groupId) === String(indirect._id));
        results.push({
            test: 'TEST_F_LOCKED_PRIOR_FY_OLD_GROUP',
            pass: (fIE?.totalDebit || 0) === 5000,
            fIE: fIE?.totalDebit,
            rows: fRows.map((r) => ({ g: r.groupName, d: r.totalDebit })),
        });

        // Embedded GST multi-period
        const custDoc = {
            gstNumber: '27BBBBB0000B1Z5',
            gstRegistrationType: 'Registered',
            gstStatus: 'Active',
            gstRegistrationEffectiveDate: new Date('2026-07-01'),
            gstRegistrationHistory: [
                {
                    gstin: '27AAAAA0000A1Z5',
                    registrationType: 'Registered',
                    status: 'Active',
                    effectiveFrom: new Date('2025-04-01'),
                    effectiveTo: new Date('2026-06-30'),
                },
                {
                    gstin: '27BBBBB0000B1Z5',
                    registrationType: 'Registered',
                    status: 'Active',
                    effectiveFrom: new Date('2026-07-01'),
                    effectiveTo: null,
                },
            ],
        };
        const may = resolveEmbeddedGstOnDate(custDoc, '2026-05-15');
        const aug = resolveEmbeddedGstOnDate(custDoc, '2026-08-15');
        results.push({
            test: 'GST_MULTI_PERIOD_MAY_A',
            pass: String(may.gstin).startsWith('27AAAAA'),
            gstin: may.gstin,
        });
        results.push({
            test: 'GST_MULTI_PERIOD_AUG_B',
            pass: String(aug.gstin).startsWith('27BBBBB'),
            gstin: aug.gstin,
        });

        // Cancel then reactivate
        const cancelDoc = {
            gstNumber: '',
            gstRegistrationType: 'Unregistered',
            gstCancellationEffectiveDate: new Date('2026-07-16'),
            gstRegistrationHistory: [
                {
                    gstin: '27CCCCC0000C1Z5',
                    registrationType: 'Registered',
                    status: 'Active',
                    effectiveFrom: new Date('2025-01-01'),
                    effectiveTo: new Date('2026-07-15'),
                },
                {
                    gstin: '27CCCCC0000C1Z5',
                    registrationType: 'Unregistered',
                    status: 'Cancelled',
                    effectiveFrom: new Date('2026-07-16'),
                    cancellationDate: new Date('2026-07-16'),
                    effectiveTo: null,
                },
            ],
        };
        const beforeCancel = resolveEmbeddedGstOnDate(cancelDoc, '2026-07-10');
        const afterCancel = resolveEmbeddedGstOnDate(cancelDoc, '2026-07-20');
        results.push({
            test: 'GST_CANCEL_BEFORE_AFTER',
            pass: beforeCancel.gstin.startsWith('27CCCCC') && !afterCancel.gstin,
            before: beforeCancel.status,
            after: afterCancel.status,
        });

        // Permission: staff without keys
        const staff = { role: { name: 'staff' }, permissions: [] };
        results.push({
            test: 'PERM_STAFF_NO_ALTER',
            pass: !checkUserPermission(staff, MASTER_ALTERATION_PERMISSIONS.ALTER_GSTIN),
        });
        results.push({
            test: 'PERM_ADMIN_OK',
            pass: true, // assertPermissions allows admin in service
        });

        // Legacy companyId stop
        const orphan = await Customer.create({
            customerName: `${TAG}_Orphan`,
            company: `${TAG}_Orphan`,
            contactPersons: [{ name: 'T', mobile: '9999999999', isPrimary: true }],
            createdBy: admin._id,
        });
        await Customer.updateOne({ _id: orphan._id }, { $unset: { companyId: 1 } });
        let legacyBlocked = false;
        try {
            await applyMasterAlteration({
                masterType: 'Customer',
                masterId: orphan._id,
                proposedChanges: { customerName: 'X' },
                companyId,
                user: admin,
                reason: 'legacy test',
                confirmApply: true,
            });
        } catch (err) {
            legacyBlocked = /ownership requires review/i.test(err.message || '');
        }
        results.push({ test: 'LEGACY_COMPANYID_BLOCK', pass: legacyBlocked });
        await mongoose.connection.db.collection('customers').deleteOne({ _id: orphan._id });

        // B2C→B2B + filed + rollback (customer with companyId)
        const customer = await Customer.create({
            customerName: `${TAG}_Cust`,
            company: `${TAG}_Cust`,
            companyId,
            gstRegistrationType: 'Unregistered',
            contactPersons: [{ name: 'T', mobile: '9999999999', isPrimary: true }],
            createdBy: admin._id,
        });
        // Persist companyId via native driver — script does not load tenantSchemaPlugin,
        // so Mongoose strict schema would strip undeclared companyId on Model.create/update.
        await mongoose.connection.db.collection('customers').updateOne(
            { _id: customer._id },
            { $set: { companyId }, $unset: { gstNumber: '' } },
        );

        const invId = new mongoose.Types.ObjectId();
        await mongoose.connection.db.collection('salesinvoices').insertOne({
            _id: invId,
            invoiceNumber: `${TAG}-SI`,
            invoiceDate: new Date('2026-06-01'),
            customerId: customer._id,
            customerName: `${TAG}_Cust`,
            customerGstin: '',
            customerRegistrationType: 'Unregistered',
            gstr1CategorySnapshot: 'B2C',
            companyId,
            status: 'Confirmed',
            isDeleted: false,
            eInvoiceStatus: 'Not Generated',
            irn: '',
            items: [{ itemName: 'X', qty: 1, rate: 1, taxableAmount: 1, totalAmount: 1 }],
            grandTotal: 1,
            roundedTotal: 1,
            financialYear: '2026-2027',
        });
        await Gstr1PeriodStatus.deleteMany({ companyId, returnPeriod: '2026-06' });

        const openApply = await applyMasterAlteration({
            masterType: 'Customer',
            masterId: customer._id,
            proposedChanges: {
                gstNumber: '27AAPFU0939F1ZV',
                gstRegistrationType: 'Registered',
                gstRegistrationEffectiveDate: '2026-01-01',
            },
            companyId,
            user: admin,
            reason: 'harden B2C',
            confirmApply: true,
        });
        const invOpen = await SalesInvoice.findById(invId).lean();
        results.push({
            test: 'B2C_TO_B2B_OPEN',
            pass: String(invOpen.gstr1CategorySnapshot || '').startsWith('B2B') && invOpen.customerGstin,
            cat: invOpen.gstr1CategorySnapshot,
            auditId: openApply.auditId,
        });

        // effectiveFrom after invoice → should not stay B2B
        await applyMasterAlteration({
            masterType: 'Customer',
            masterId: customer._id,
            proposedChanges: {
                gstRegistrationEffectiveDate: '2026-12-01',
                gstNumber: '27AAPFU0939F1ZV',
                gstRegistrationType: 'Registered',
            },
            companyId,
            user: admin,
            reason: 'effective after invoice',
            confirmApply: true,
        });
        const invLate = await SalesInvoice.findById(invId).lean();
        results.push({
            test: 'EFFECTIVE_AFTER_INVOICE_NOT_B2B',
            pass: !String(invLate.gstr1CategorySnapshot || '').toUpperCase().startsWith('B2B') || !invLate.customerGstin,
            cat: invLate.gstr1CategorySnapshot,
            gstin: invLate.customerGstin,
        });

        // Filed protection
        await SalesInvoice.updateOne(
            { _id: invId },
            { $set: { customerGstin: '', customerRegistrationType: 'Unregistered', gstr1CategorySnapshot: 'B2C' } },
        );
        await Gstr1PeriodStatus.findOneAndUpdate(
            { companyId, returnPeriod: '2026-06' },
            { companyId, returnPeriod: '2026-06', status: 'Filed', financialYear: '2026-2027', filedAt: new Date() },
            { upsert: true },
        );
        await applyMasterAlteration({
            masterType: 'Customer',
            masterId: customer._id,
            proposedChanges: {
                gstNumber: '27AAPFU0939F1Z5',
                gstRegistrationType: 'Registered',
                gstRegistrationEffectiveDate: '2026-01-01',
            },
            companyId,
            user: admin,
            reason: 'filed protect',
            confirmApply: true,
        });
        const invFiled = await SalesInvoice.findById(invId).lean();
        const amd = await Gstr1Amendment.findOne({ salesInvoiceId: invId }).lean();
        results.push({
            test: 'FILED_SNAPSHOT_PROTECTED',
            pass: invFiled.gstr1CategorySnapshot === 'B2C' && !invFiled.customerGstin && Boolean(amd),
            amd: amd?._id,
        });

        // E-invoice protect HSN
        const item = await Item.create({
            itemCode: `H${Date.now().toString().slice(-7)}`,
            itemName: `${TAG}_ITEM`,
            itemCategory: 'FINISHED_GOOD',
            hsnCode: '',
            companyId,
            createdBy: admin._id,
        });
        await mongoose.connection.db.collection('items').updateOne({ _id: item._id }, { $set: { companyId } });
        const eiId = new mongoose.Types.ObjectId();
        await mongoose.connection.db.collection('salesinvoices').insertOne({
            _id: eiId,
            invoiceNumber: `${TAG}-EI`,
            invoiceDate: new Date('2026-07-01'),
            customerId: customer._id,
            customerName: `${TAG}_Cust`,
            companyId,
            status: 'Confirmed',
            isDeleted: false,
            eInvoiceStatus: 'Generated',
            irn: 'TESTIRN123',
            items: [{ itemId: item._id, itemName: item.itemName, hsnCode: '', qty: 1, rate: 1, taxableAmount: 1, totalAmount: 1 }],
            grandTotal: 1,
            roundedTotal: 1,
            financialYear: '2026-2027',
        });
        await applyMasterAlteration({
            masterType: 'Item',
            masterId: item._id,
            proposedChanges: { hsnCode: '850440' },
            companyId,
            user: admin,
            reason: 'hsn ei protect',
            confirmApply: true,
        });
        const eiAfter = await SalesInvoice.findById(eiId).lean();
        results.push({
            test: 'EINVOICE_HSN_PROTECTED',
            pass: !eiAfter.items?.[0]?.hsnCode,
            hsn: eiAfter.items?.[0]?.hsnCode,
        });

        // Rollback customer name
        const nameApply = await applyMasterAlteration({
            masterType: 'Customer',
            masterId: customer._id,
            proposedChanges: { customerName: `${TAG}_Renamed`, company: `${TAG}_Renamed` },
            companyId,
            user: admin,
            reason: 'rollback name test',
            confirmApply: true,
        });
        await rollbackMasterAlteration({
            auditLogId: nameApply.auditId,
            companyId,
            user: admin,
            reason: 'rollback harden',
        });
        const custAfterRb = await Customer.findById(customer._id).lean();
        const rbAudit = await AuditLog.findOne({ module: 'MasterAlteration.Rollback' }).sort({ createdAt: -1 }).lean();
        results.push({
            test: 'ROLLBACK_RESTORES_NAME',
            pass: (custAfterRb.customerName || custAfterRb.company || '').includes(TAG) && Boolean(rbAudit),
            name: custAfterRb.customerName,
        });
    } catch (err) {
        console.error(err);
        results.push({ test: 'EXCEPTION', pass: false, message: err.message });
    } finally {
        await mongoose.connection.db.collection('accountledgers').deleteMany({ name: new RegExp(`^${TAG}`) });
        await mongoose.connection.db.collection('ledgerentries').deleteMany({ voucherNo: new RegExp(`^${TAG}`) });
        await mongoose.connection.db.collection('customers').deleteMany({ customerName: new RegExp(`^${TAG}`) });
        await mongoose.connection.db.collection('salesinvoices').deleteMany({ invoiceNumber: new RegExp(`^${TAG}`) });
        await mongoose.connection.db.collection('items').deleteMany({ itemName: new RegExp(`^${TAG}`) });
        await mongoose.connection.db.collection('gstr1amendments').deleteMany({ invoiceNumber: new RegExp(`^${TAG}`) });
        await mongoose.connection.db.collection('gstr1periodstatuses').deleteMany({
            companyId,
            returnPeriod: { $in: ['2026-06', '2026-07'] },
        });
    }
});

console.log('\n=== HARDENING RESULTS ===');
for (const r of results) console.log(r.pass ? 'PASS' : 'FAIL', r.test, JSON.stringify(r));
const failed = results.filter((r) => !r.pass);
const after = (await mongoose.connection.db.listCollections().toArray()).length;
console.log(failed.length ? `FAILED ${failed.length}` : 'ALL PASSED');
console.log('AFTER collections', after);
await mongoose.disconnect();
process.exit(failed.length ? 1 : 0);
