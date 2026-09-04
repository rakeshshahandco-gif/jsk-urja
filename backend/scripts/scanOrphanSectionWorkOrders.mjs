/**
 * READ-ONLY orphan scanner for Section / Supplementary Work Orders.
 * Never writes. Safe to run against jskurja-dev or (later) jskurja-prod.
 *
 * Usage (from backend/):
 *   node scripts/scanOrphanSectionWorkOrders.mjs
 *   node scripts/scanOrphanSectionWorkOrders.mjs --db jskurja-dev
 *   node scripts/scanOrphanSectionWorkOrders.mjs --db jskurja-prod
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import {
    hasSectionProductionActivity,
    canHardDeleteSectionWorkOrder,
} from '../src/services/workOrderSection.service.js';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const dbArg = process.argv.find((a) => a.startsWith('--db='))?.slice(5)
    || (process.argv.includes('--db') ? process.argv[process.argv.indexOf('--db') + 1] : null);

const uri = process.env.MONGODB_URL || process.env.MONGO_URI || process.env.MONGODB_URI;
if (!uri) {
    console.error('NO_MONGO_URI');
    process.exit(1);
}

const connectOpts = dbArg ? { dbName: dbArg } : {};
await mongoose.connect(uri, connectOpts);
const db = mongoose.connection.db;
console.log(JSON.stringify({
    mode: 'READ_ONLY',
    database: db.databaseName,
    requestedDb: dbArg || null,
}, null, 2));

const woCol = db.collection('workorders');
const all = await woCol.find({
    woKind: { $in: ['section', 'supplementary'] },
}).project({
    woNumber: 1,
    woKind: 1,
    status: 1,
    bomSectionNo: 1,
    bomSectionName: 1,
    parentWorkOrderId: 1,
    sourceSectionWorkOrderId: 1,
    inventorySynced: 1,
    targetQty: 1,
    createdAt: 1,
    updatedAt: 1,
    stages: 1,
    materialStatus: 1,
    materialEventHistory: 1,
    mandatoryChangeHistory: 1,
}).toArray();

const parentIds = [...new Set(all.map((w) => w.parentWorkOrderId).filter(Boolean).map(String))];
const sourceIds = [...new Set(all.map((w) => w.sourceSectionWorkOrderId).filter(Boolean).map(String))];
const existing = new Set();
const lookupIds = [...new Set([...parentIds, ...sourceIds])].map((id) => new mongoose.Types.ObjectId(id));
if (lookupIds.length) {
    const found = await woCol.find({ _id: { $in: lookupIds } }).project({ _id: 1 }).toArray();
    for (const f of found) existing.add(String(f._id));
}

const orphans = [];
for (const wo of all) {
    const parentMissing = wo.parentWorkOrderId ? !existing.has(String(wo.parentWorkOrderId)) : wo.woKind === 'section';
    const sourceMissing = wo.woKind === 'supplementary' && wo.sourceSectionWorkOrderId
        ? !existing.has(String(wo.sourceSectionWorkOrderId))
        : false;
    if (!parentMissing && !sourceMissing) continue;

    const supplementaryCount = await woCol.countDocuments({
        sourceSectionWorkOrderId: wo._id,
        woKind: 'supplementary',
    });
    const hasHistory = hasSectionProductionActivity(wo, { supplementaryCount });
    const idleDraft = canHardDeleteSectionWorkOrder(wo, { supplementaryCount });
    orphans.push({
        _id: String(wo._id),
        woNumber: wo.woNumber,
        woKind: wo.woKind,
        status: wo.status,
        bomSectionName: wo.bomSectionName || '',
        bomSectionNo: wo.bomSectionNo,
        inventorySynced: !!wo.inventorySynced,
        parentWorkOrderId: wo.parentWorkOrderId ? String(wo.parentWorkOrderId) : null,
        sourceSectionWorkOrderId: wo.sourceSectionWorkOrderId ? String(wo.sourceSectionWorkOrderId) : null,
        parentMissing,
        sourceMissing,
        class: idleDraft ? 'Idle Draft / no history' : (hasHistory ? 'Has production/history' : 'Not idle (status/other)'),
        supplementaryCount,
        eventCount: (wo.materialEventHistory || []).length,
        mandatoryChangeCount: (wo.mandatoryChangeHistory || []).length,
        startedStages: (wo.stages || [])
            .filter((s) => s?.status && s.status !== 'Not Started')
            .map((s) => ({ seq: s.seq, name: s.stageName, status: s.status })),
    });
}

const counts = orphans.reduce((acc, o) => {
    acc[o.class] = (acc[o.class] || 0) + 1;
    return acc;
}, {});

console.log(JSON.stringify({
    scanned: all.length,
    orphanCount: orphans.length,
    counts,
    orphans,
    autoFix: false,
}, null, 2));

await mongoose.disconnect();
