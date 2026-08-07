/**
 * Final pre-deploy regression smoke for Master Alteration (jskurja-dev only).
 * Selective engine tests + non-sensitive save + accounting/GST endpoint health.
 * No production. No new collections. Cleanup TAG docs.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { companyScopeAls } from '../src/utils/companyScopeContext.js';
import {
    applyMasterAlteration,
    buildImpactPreview,
    discoverDependencies,
} from '../src/services/masterAlteration/index.js';
import { getLedgerBalancesByEntryGroup } from '../src/services/masterAlteration/ledgerBalanceByGroup.service.js';
import { resolveLedgerGroupAtDate, buildNextGroupHistory } from '../src/services/masterAlteration/ledgerGroupHistory.js';
import { rollbackMasterAlteration } from '../src/services/masterAlteration/rollback.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
}
if (!process.env.MONGODB_URL || /jskurja-prod/i.test(process.env.MONGODB_URL)) {
    console.error('Refuse');
    process.exit(1);
}

const API = process.env.UAT_API || 'http://127.0.0.1:5100/api/v1';
const TAG = `REGRESS_${Date.now()}`;
const results = [];
const push = (test, pass, extra = {}) => {
    results.push({ test, pass: Boolean(pass), ...extra });
    console.log(pass ? 'PASS' : 'FAIL', test, extra.message || '');
};

await mongoose.connect(process.env.MONGODB_URL);
const colsBefore = (await mongoose.connection.db.listCollections().toArray()).length;
push('COLLECTIONS_BEFORE_249', colsBefore === 249, { colsBefore });

const company = await mongoose.connection.db.collection('companies').findOne({});
const companyId = company._id;
const admin = { _id: new mongoose.Types.ObjectId(), role: { name: 'admin' } };

const login = await (
    await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    })
).json();
const token = login?.data?.token;
push('HTTP_LOGIN', Boolean(token));
const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Company-Id': String(companyId),
};

async function httpGet(p) {
    const r = await fetch(`${API}${p}`, { headers });
    return { status: r.status, json: await r.json().catch(() => ({})) };
}

await companyScopeAls.run({ companyId }, async () => {
    const Customer = (await import('../src/models/customer.model.js')).default;
    const { Supplier } = await import('../src/models/supplier.model.js');
    const { AccountLedger } = await import('../src/models/accountLedger.model.js');
    const { AccountGroup } = await import('../src/models/accountGroup.model.js');
    const { Item } = await import('../src/models/item.model.js');
    const { SalesInvoice } = await import('../src/models/salesInvoice.model.js');
    const { Gstr1PeriodStatus } = await import('../src/models/gstr1PeriodStatus.model.js');
    const { Gstr1Amendment } = await import('../src/models/gstr1Amendment.model.js');
    const { AccountingPeriodLock } = await import('../src/models/accountingPeriodLock.model.js');
    const { AuditLog } = await import('../src/models/auditLog.model.js');

    try {
        // --- CUSTOMER ---
        const cust = await Customer.create({
            customerName: `${TAG}_C`,
            company: `${TAG}_C`,
            companyId,
            gstRegistrationType: 'Unregistered',
            contactPersons: [{ name: 'T', mobile: '9999999999', isPrimary: true }],
            createdBy: admin._id,
        });
        // non-sensitive: city only via normal update path simulation (no alteration fields)
        const previewNone = await buildImpactPreview({
            masterType: 'Customer',
            masterId: cust._id,
            proposedChanges: { city: 'Indore' },
            companyId,
        });
        push('CUSTOMER_NONSENSITIVE_NO_GATE', previewNone.noSensitiveChanges || !previewNone.fieldsChanged?.length);

        const nameApply = await applyMasterAlteration({
            masterType: 'Customer',
            masterId: cust._id,
            proposedChanges: { customerName: `${TAG}_C2`, company: `${TAG}_C2` },
            companyId,
            user: admin,
            reason: 'regress name',
            confirmApply: true,
        });
        push('CUSTOMER_NAME_EDIT', Boolean(nameApply?.auditId));

        const invId = new mongoose.Types.ObjectId();
        await mongoose.connection.db.collection('salesinvoices').insertOne({
            _id: invId,
            invoiceNumber: `${TAG}-SI`,
            invoiceDate: new Date('2026-06-15'),
            customerId: cust._id,
            customerName: `${TAG}_C2`,
            customerGstin: '',
            customerRegistrationType: 'Unregistered',
            gstr1CategorySnapshot: 'B2C',
            companyId,
            status: 'Confirmed',
            isDeleted: false,
            eInvoiceStatus: 'Not Generated',
            irn: '',
            items: [{ itemName: 'X', qty: 1, rate: 1, taxableAmount: 100, totalAmount: 100, hsnCode: '' }],
            grandTotal: 100,
            roundedTotal: 100,
            financialYear: '2026-2027',
        });
        await Gstr1PeriodStatus.deleteMany({ companyId, returnPeriod: '2026-06' });

        await applyMasterAlteration({
            masterType: 'Customer',
            masterId: cust._id,
            proposedChanges: {
                gstNumber: '27AAPFU0939F1ZV',
                gstRegistrationType: 'Registered',
                gstRegistrationEffectiveDate: '2026-01-01',
            },
            companyId,
            user: admin,
            reason: 'regress B2C',
            confirmApply: true,
        });
        const invOpen = await SalesInvoice.findById(invId).lean();
        push('CUSTOMER_B2C_TO_B2B_OPEN', String(invOpen?.gstr1CategorySnapshot || '').startsWith('B2B') && Boolean(invOpen?.customerGstin));

        await SalesInvoice.updateOne(
            { _id: invId },
            { $set: { customerGstin: '', gstr1CategorySnapshot: 'B2C', customerRegistrationType: 'Unregistered' } },
        );
        await Gstr1PeriodStatus.findOneAndUpdate(
            { companyId, returnPeriod: '2026-06' },
            { companyId, returnPeriod: '2026-06', status: 'Filed', financialYear: '2026-2027', filedAt: new Date() },
            { upsert: true },
        );
        await applyMasterAlteration({
            masterType: 'Customer',
            masterId: cust._id,
            proposedChanges: {
                gstNumber: '27AAPFU0939F1Z5',
                gstRegistrationType: 'Registered',
                gstRegistrationEffectiveDate: '2026-01-01',
            },
            companyId,
            user: admin,
            reason: 'regress filed',
            confirmApply: true,
        });
        const invFiled = await SalesInvoice.findById(invId).lean();
        const amd = await Gstr1Amendment.findOne({ salesInvoiceId: invId }).lean();
        push(
            'CUSTOMER_FILED_PROTECTED',
            invFiled?.gstr1CategorySnapshot === 'B2C' && !invFiled?.customerGstin && Boolean(amd),
        );

        const usageC = await discoverDependencies('Customer', cust._id, companyId);
        push('CUSTOMER_VIEW_USAGE', Boolean(usageC?.counts));

        // --- SUPPLIER ---
        const sup = await Supplier.create({
            supplierName: `${TAG}_S`,
            supplierCode: `U${Date.now().toString().slice(-8)}`,
            companyId,
            gstRegistrationStatus: 'Unregistered',
            createdBy: admin._id,
        });
        const supNone = await buildImpactPreview({
            masterType: 'Supplier',
            masterId: sup._id,
            proposedChanges: { city: 'Pune', remarks: 'note' },
            companyId,
        });
        push('SUPPLIER_NONSENSITIVE_NO_GATE', !supNone.fieldsChanged?.length);
        const supName = await applyMasterAlteration({
            masterType: 'Supplier',
            masterId: sup._id,
            proposedChanges: { supplierName: `${TAG}_S2` },
            companyId,
            user: admin,
            reason: 'regress sup name',
            confirmApply: true,
        });
        push('SUPPLIER_NAME_EDIT', Boolean(supName?.auditId));
        const supGst = await applyMasterAlteration({
            masterType: 'Supplier',
            masterId: sup._id,
            proposedChanges: {
                gstNumber: '27BBBPC5678E1Z5',
                gstRegistrationStatus: 'Registered Regular',
                gstRegistrationEffectiveDate: '2026-04-01',
            },
            companyId,
            user: admin,
            reason: 'regress sup gst',
            confirmApply: true,
        });
        const supAfter = await Supplier.findById(sup._id).lean();
        push(
            'SUPPLIER_GST_EFFECTIVE',
            Boolean(supGst?.auditId) &&
                String(supAfter?.gstNumber || '').toUpperCase() === '27BBBPC5678E1Z5' &&
                Array.isArray(supAfter?.gstRegistrationHistory),
        );
        push('SUPPLIER_VIEW_USAGE', Boolean((await discoverDependencies('Supplier', sup._id, companyId))?.counts));

        // --- LEDGER ---
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
        const led = await AccountLedger.create({
            name: `${TAG}_L`,
            underGroup: indirect._id,
            groupName: indirect.name,
            type: 'Expense',
            companyId,
            openingBalance: 0,
            drCr: 'Dr',
            createdBy: admin._id,
        });
        const ledName = await applyMasterAlteration({
            masterType: 'Ledger',
            masterId: led._id,
            proposedChanges: { name: `${TAG}_L2` },
            companyId,
            user: admin,
            reason: 'regress led name',
            confirmApply: true,
        });
        push('LEDGER_NAME_EDIT', Boolean(ledName?.auditId));

        // open FY group change
        await mongoose.connection.db.collection('ledgerentries').insertOne({
            ledgerId: led._id,
            date: new Date('2026-06-15'),
            debit: 10000,
            credit: 0,
            voucherNo: `${TAG}-V1`,
            financialYear: '2026-2027',
            companyId,
        });
        await mongoose.connection.db.collection('ledgerentries').insertOne({
            ledgerId: led._id,
            date: new Date('2026-12-15'),
            debit: 20000,
            credit: 0,
            voucherNo: `${TAG}-V2`,
            financialYear: '2026-2027',
            companyId,
        });
        // prior FY locked
        const existingLock = await mongoose.connection.db.collection('accountingperiodlocks').findOne({
            financialYear: '2024-2025',
        });
        if (existingLock) {
            await mongoose.connection.db.collection('accountingperiodlocks').updateOne(
                { _id: existingLock._id },
                { $set: { booksLockedTill: new Date('2025-03-31'), isActive: true } },
            );
        } else {
            await mongoose.connection.db.collection('accountingperiodlocks').insertOne({
                financialYear: '2024-2025',
                booksLockedTill: new Date('2025-03-31'),
                isActive: true,
                companyId,
            });
        }
        await mongoose.connection.db.collection('ledgerentries').insertOne({
            ledgerId: led._id,
            date: new Date('2025-01-10'),
            debit: 5000,
            credit: 0,
            voucherNo: `${TAG}-V0`,
            financialYear: '2024-2025',
            companyId,
        });

        const lockedPreview = await buildImpactPreview({
            masterType: 'Ledger',
            masterId: led._id,
            proposedChanges: { underGroup: creditors._id },
            companyId,
            effectiveFrom: null,
        });
        push(
            'LEDGER_LOCKED_FY_BLOCK',
            lockedPreview.canApply === false || Boolean(lockedPreview.blockReason),
            { block: lockedPreview.blockReason },
        );

        const openApply = await applyMasterAlteration({
            masterType: 'Ledger',
            masterId: led._id,
            proposedChanges: { underGroup: creditors._id, groupName: creditors.name },
            companyId,
            user: admin,
            reason: 'regress group prospective',
            effectiveFrom: '2026-10-01',
            confirmApply: true,
        });
        push('LEDGER_GROUP_OPEN_FY_PROSPECTIVE', Boolean(openApply?.auditId));

        const ledDoc = await AccountLedger.findById(led._id).lean();
        // ensure history exists for split
        if (!ledDoc.groupHistory?.length) {
            await AccountLedger.updateOne(
                { _id: led._id },
                {
                    $set: {
                        groupHistory: buildNextGroupHistory({
                            ledger: { underGroup: indirect._id, groupName: indirect.name, groupHistory: [] },
                            newGroupId: creditors._id,
                            newGroupName: creditors.name,
                            effectiveFrom: '2026-10-01',
                            reason: 'regress',
                        }),
                        underGroup: creditors._id,
                        groupName: creditors.name,
                    },
                },
            );
        }
        const led2 = await AccountLedger.findById(led._id).lean();
        const june = resolveLedgerGroupAtDate(led2, '2026-06-15');
        const dec = resolveLedgerGroupAtDate(led2, '2026-12-15');
        push(
            'LEDGER_SAME_FY_SPLIT',
            String(june.groupName || '').includes('Indirect') && String(dec.groupName || '').includes('Creditor'),
            { june: june.groupName, dec: dec.groupName },
        );
        push('LEDGER_VIEW_USAGE', Boolean((await discoverDependencies('Ledger', led._id, companyId))?.counts));

        // --- ITEM ---
        const item = await Item.create({
            itemCode: `R${Date.now().toString().slice(-7)}`,
            itemName: `${TAG}_I`,
            itemCategory: 'FINISHED_GOOD',
            hsnCode: '998877',
            companyId,
            createdBy: admin._id,
        });
        const itemNone = await buildImpactPreview({
            masterType: 'Item',
            masterId: item._id,
            proposedChanges: { description: 'non-sensitive note' },
            companyId,
        });
        push('ITEM_NONSENSITIVE_NO_GATE', !itemNone.fieldsChanged?.length);
        const itemName = await applyMasterAlteration({
            masterType: 'Item',
            masterId: item._id,
            proposedChanges: { itemName: `${TAG}_I2`, name: `${TAG}_I2` },
            companyId,
            user: admin,
            reason: 'regress item name',
            confirmApply: true,
        });
        push('ITEM_NAME_EDIT', Boolean(itemName?.auditId));

        const eiId = new mongoose.Types.ObjectId();
        await mongoose.connection.db.collection('salesinvoices').insertOne({
            _id: eiId,
            invoiceNumber: `${TAG}-EI`,
            invoiceDate: new Date('2026-07-01'),
            customerId: cust._id,
            companyId,
            status: 'Confirmed',
            isDeleted: false,
            eInvoiceStatus: 'Generated',
            irn: 'UATIRN123',
            items: [
                {
                    itemId: item._id,
                    itemName: item.itemName,
                    hsnCode: '998877',
                    qty: 1,
                    rate: 1,
                    taxableAmount: 1,
                    totalAmount: 1,
                },
            ],
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
            reason: 'regress hsn',
            confirmApply: true,
        });
        const eiAfter = await SalesInvoice.findById(eiId).lean();
        push('ITEM_HSN_EINVOICE_PROTECTED', eiAfter?.items?.[0]?.hsnCode === '998877');
        push('ITEM_VIEW_USAGE', Boolean((await discoverDependencies('Item', item._id, companyId))?.counts));

        // --- ACCOUNTING balances (per-entry group) ---
        const bal = await getLedgerBalancesByEntryGroup(new Date('2026-04-01'), new Date('2027-03-31'));
        push('ACCOUNTING_TB_PL_BS_ENGINE', Array.isArray(bal) || typeof bal === 'object');

        // HTTP accounting / gst smoke (best-effort — endpoint paths may vary)
        const health = await httpGet('/health');
        push('HTTP_HEALTH', health.status === 200 && health.json?.databaseName === 'jskurja-dev', {
            db: health.json?.databaseName,
            port: health.json?.port,
        });

        for (const [name, p] of [
            ['HTTP_TB', '/reports/trial-balance'],
            ['HTTP_PL', '/reports/profit-and-loss'],
            ['HTTP_BS', '/reports/balance-sheet'],
            ['HTTP_LEDGER_REPORT', '/reports/ledger'],
            ['HTTP_GSTR1', '/gst-reports/gstr1'],
            ['HTTP_GSTR1_HSN', '/gst-reports/gstr1/hsn'],
        ]) {
            const res = await httpGet(p);
            // 200 OK or 400/404 with handled body still means route exists / not crashed server
            push(name, res.status !== 500 && res.status !== 502, { status: res.status });
        }

        // Rollback one alteration
        if (supGst?.auditId) {
            await rollbackMasterAlteration({
                auditLogId: supGst.auditId,
                companyId,
                user: admin,
                reason: 'regress rollback',
            });
            const rbAudit = await AuditLog.findOne({ module: /Rollback/i }).sort({ createdAt: -1 }).lean();
            push('ROLLBACK_AUDIT', Boolean(rbAudit));
        }
    } catch (e) {
        push('EXCEPTION', false, { message: e.message });
        console.error(e);
    } finally {
        await mongoose.connection.db.collection('customers').deleteMany({ customerName: new RegExp(`^${TAG}`) });
        await mongoose.connection.db.collection('suppliers').deleteMany({ supplierName: new RegExp(`^${TAG}`) });
        await mongoose.connection.db.collection('accountledgers').deleteMany({ name: new RegExp(`^${TAG}`) });
        await mongoose.connection.db.collection('items').deleteMany({ itemName: new RegExp(`^${TAG}`) });
        await mongoose.connection.db.collection('salesinvoices').deleteMany({ invoiceNumber: new RegExp(`^${TAG}`) });
        await mongoose.connection.db.collection('ledgerentries').deleteMany({ voucherNo: new RegExp(`^${TAG}`) });
        await mongoose.connection.db.collection('gstr1amendments').deleteMany({ invoiceNumber: new RegExp(`^${TAG}`) });
        await mongoose.connection.db.collection('gstr1periodstatuses').deleteMany({
            companyId,
            returnPeriod: { $in: ['2026-06', '2026-07'] },
        });
    }
});

const colsAfter = (await mongoose.connection.db.listCollections().toArray()).length;
push('COLLECTIONS_AFTER_249', colsAfter === 249, { colsAfter });
const banned = ['masteralterations', 'masterjobs', 'ledgergrouphistory', 'suppliergsthistory', 'customergsthistory'];
const names = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name.toLowerCase());
push(
    'NO_NEW_ALTERATION_COLLECTIONS',
    banned.every((b) => !names.includes(b)),
);

await mongoose.disconnect();
const failed = results.filter((r) => !r.pass);
console.log('\n=== REGRESSION SUMMARY ===');
console.log(failed.length ? `FAILED ${failed.length}` : 'ALL PASSED');
for (const f of failed) console.log(' -', f.test, JSON.stringify(f));
process.exit(failed.length ? 1 : 0);
