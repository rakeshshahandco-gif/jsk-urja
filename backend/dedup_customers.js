/**
 * dedup_customers.js
 * ==================
 * Finds all duplicate customers (same company name or same mobile),
 * keeps the best record (most data, oldest created), merges contacts,
 * reassigns all linked Sales Orders & Sales Invoices to the keeper,
 * then soft-deletes the duplicates.
 *
 * Run from: c:\Users\Admin\Desktop\Project\backend
 *   node dedup_customers.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const MONGODB_URL = process.env.MONGODB_URL;
if (!MONGODB_URL) { console.error('❌ MONGODB_URL not found'); process.exit(1); }

// ─── Tiny inline schemas (no validators, safe for admin scripts) ────────────
const Customer = mongoose.model('Customer', new mongoose.Schema({}, { strict: false }));
const SalesOrder = mongoose.model('SalesOrder', new mongoose.Schema({}, { strict: false }));
const SalesInvoice = mongoose.model('SalesInvoice', new mongoose.Schema({}, { strict: false }));

// ─── Helpers ────────────────────────────────────────────────────────────────
const norm = (s) => (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
const normMobile = (s) => (s || '').toString().replace(/\D/g, '').slice(-10);

function scoreCust(c) {
    // Higher = more complete record = prefer to keep
    let s = 0;
    if (c.company) s += 3;
    if (c.customerName) s += 2;
    if (c.gstNumber) s += 5;
    if (c.address) s += 1;
    if (c.city) s += 1;
    if (c.state) s += 1;
    if (c.status && c.status !== 'lead') s += 2;
    const contacts = c.contactPersons || [];
    s += contacts.length * 2;
    contacts.forEach(cp => {
        if (cp.mobile) s += 2;
        if (cp.email) s += 1;
    });
    return s;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function run() {
    await mongoose.connect(MONGODB_URL, { serverSelectionTimeoutMS: 30000 });
    console.log('✅ Connected to MongoDB\n');

    // Fetch all active customers
    const allCustomers = await Customer.find({ isDeleted: { $ne: true } }).lean();
    console.log(`📊 Total active customers: ${allCustomers.length}`);

    // ── Step 1: Group duplicates by normalised company name ──────────────────
    const companyMap = new Map(); // normCompany → [ customers ]
    const mobileMap = new Map();  // normMobile  → [ customers ]

    for (const c of allCustomers) {
        const co = norm(c.company);
        if (co && co.length > 2) {
            if (!companyMap.has(co)) companyMap.set(co, []);
            companyMap.get(co).push(c);
        }
        const contacts = c.contactPersons || [];
        for (const cp of contacts) {
            const mob = normMobile(cp.mobile);
            if (mob && mob.length === 10) {
                if (!mobileMap.has(mob)) mobileMap.set(mob, []);
                mobileMap.get(mob).push(c._id.toString());
            }
        }
    }

    // ── Step 2: Collect all duplicate sets ───────────────────────────────────
    const dupSets = []; // Each is an array of customer docs that are duplicates

    // By company name
    for (const [key, group] of companyMap.entries()) {
        if (group.length > 1) {
            dupSets.push({ reason: `Company: "${key}"`, group });
        }
    }

    // By mobile (not already covered by company name)
    for (const [mob, ids] of mobileMap.entries()) {
        const unique = [...new Set(ids)];
        if (unique.length > 1) {
            const docs = allCustomers.filter(c => unique.includes(c._id.toString()));
            // Check if already covered by company name duplicate
            const alreadyCovered = dupSets.some(ds =>
                ds.group.some(d => unique.includes(d._id.toString())) &&
                ds.group.length === docs.length &&
                docs.every(d => ds.group.some(g => g._id.toString() === d._id.toString()))
            );
            if (!alreadyCovered) {
                dupSets.push({ reason: `Mobile: "${mob}"`, group: docs });
            }
        }
    }

    if (dupSets.length === 0) {
        console.log('✅ No duplicates found. Database is clean!');
        await mongoose.disconnect();
        return;
    }

    console.log(`\n🔍 Found ${dupSets.length} duplicate groups:\n`);

    let totalMerged = 0;
    let totalSOReassigned = 0;
    let totalSIReassigned = 0;

    for (const { reason, group } of dupSets) {
        // ── Pick the "keeper": highest score, tie-break = oldest createdAt ──
        const sorted = [...group].sort((a, b) => {
            const diff = scoreCust(b) - scoreCust(a);
            if (diff !== 0) return diff;
            return new Date(a.createdAt) - new Date(b.createdAt); // older first
        });

        const keeper = sorted[0];
        const dupes = sorted.slice(1);

        console.log(`\n── ${reason} (${group.length} records) ──`);
        console.log(`   ✅ KEEP  : [${keeper.customerCode}] ${keeper.company || keeper.customerName} (score=${scoreCust(keeper)})`);

        // ── Merge contacts from dupes into keeper ────────────────────────────
        const existingMobiles = new Set(
            (keeper.contactPersons || []).map(cp => normMobile(cp.mobile))
        );
        const newContacts = [];
        for (const dupe of dupes) {
            for (const cp of (dupe.contactPersons || [])) {
                const m = normMobile(cp.mobile);
                if (m && !existingMobiles.has(m)) {
                    existingMobiles.add(m);
                    newContacts.push({ ...cp, isPrimary: false }); // never change existing primary
                }
            }
        }

        if (newContacts.length > 0) {
            // Merge GST if keeper doesn't have one
            const keeperUpdate = {
                contactPersons: [...(keeper.contactPersons || []), ...newContacts]
            };
            if (!keeper.gstNumber) {
                const gstDonor = dupes.find(d => d.gstNumber);
                if (gstDonor) {
                    keeperUpdate.gstNumber = gstDonor.gstNumber;
                    keeperUpdate.gstType = gstDonor.gstType || keeper.gstType;
                    keeperUpdate.gstRegistrationType = gstDonor.gstRegistrationType || keeper.gstRegistrationType;
                    console.log(`   🔄 Merged GST ${gstDonor.gstNumber} from duplicate`);
                }
            }
            await Customer.updateOne(
                { _id: keeper._id },
                { $set: keeperUpdate }
            );
            console.log(`   🔄 Merged ${newContacts.length} contact(s) into keeper`);
        }

        // ── Reassign Sales Orders & Invoices from dupes to keeper ────────────
        for (const dupe of dupes) {
            const dupeId = dupe._id;
            const keeperId = keeper._id;

            // Sales Orders
            const soResult = await SalesOrder.updateMany(
                { customerId: dupeId, isDeleted: { $ne: true } },
                { $set: { customerId: keeperId } }
            );
            if (soResult.modifiedCount > 0) {
                console.log(`   🔄 Reassigned ${soResult.modifiedCount} Sales Order(s) from [${dupe.customerCode}] → [${keeper.customerCode}]`);
                totalSOReassigned += soResult.modifiedCount;
            }

            // Sales Invoices
            const siResult = await SalesInvoice.updateMany(
                { customerId: dupeId, isDeleted: { $ne: true } },
                { $set: { customerId: keeperId } }
            );
            if (siResult.modifiedCount > 0) {
                console.log(`   🔄 Reassigned ${siResult.modifiedCount} Sales Invoice(s) from [${dupe.customerCode}] → [${keeper.customerCode}]`);
                totalSIReassigned += siResult.modifiedCount;
            }

            // Soft-delete the duplicate
            await Customer.updateOne(
                { _id: dupeId },
                {
                    $set: {
                        isDeleted: true,
                        deletedAt: new Date(),
                        restoredReason: `Duplicate of ${keeper.customerCode} (${keeper.company || keeper.customerName}). Merged by dedup script.`
                    }
                }
            );
            console.log(`   🗑️  Soft-deleted duplicate: [${dupe.customerCode}] ${dupe.company || dupe.customerName}`);
            totalMerged++;
        }
    }

    // ── Final summary ──────────────────────────────────────────────────────
    const finalCount = await Customer.countDocuments({ isDeleted: { $ne: true } });
    console.log('\n═══════════════════════════════════════════════');
    console.log(`✅ De-duplication complete!`);
    console.log(`   Duplicate records removed : ${totalMerged}`);
    console.log(`   Sales Orders reassigned   : ${totalSOReassigned}`);
    console.log(`   Sales Invoices reassigned : ${totalSIReassigned}`);
    console.log(`   Active customers now      : ${finalCount}`);
    console.log('═══════════════════════════════════════════════\n');

    await mongoose.disconnect();
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
