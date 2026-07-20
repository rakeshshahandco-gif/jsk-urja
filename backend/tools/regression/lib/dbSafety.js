/**
 * Read-only database safety snapshots (no writes, no migrations).
 */
import mongoose from 'mongoose';

const COUNT_COLLECTIONS = [
    'companies',
    'users',
    'salesorders',
    'salesinvoices',
    'printformats',
    'formprintlocks',
];

export async function snapshotCounts(mongoUrl) {
    if (!mongoUrl) return null;
    const conn = await mongoose.createConnection(mongoUrl).asPromise();
    try {
        const out = { database: conn.name, counts: {} };
        for (const name of COUNT_COLLECTIONS) {
            try {
                out.counts[name] = await conn.db.collection(name).countDocuments();
            } catch {
                out.counts[name] = null;
            }
        }
        // Orphan-ish checks (read-only)
        const companies = await conn.db.collection('companies')
            .find({}, { projection: { _id: 1, companyName: 1 } })
            .limit(200)
            .toArray();
        out.companyIds = companies.map((c) => String(c._id));
        out.companyNames = companies.map((c) => c.companyName);

        const dupNames = {};
        for (const n of out.companyNames) {
            const k = String(n || '').trim().toLowerCase();
            if (!k) continue;
            dupNames[k] = (dupNames[k] || 0) + 1;
        }
        out.duplicateCompanyNames = Object.entries(dupNames)
            .filter(([, n]) => n > 1)
            .map(([name, n]) => ({ name, n }));

        return out;
    } finally {
        await conn.close();
    }
}

export function compareSnapshots(before, after) {
    if (!before || !after) return { ok: true, deltas: [], notes: ['snapshot unavailable'] };
    const deltas = [];
    for (const key of Object.keys(before.counts || {})) {
        const a = before.counts[key];
        const b = after.counts?.[key];
        if (a == null || b == null) continue;
        if (a !== b) deltas.push({ collection: key, before: a, after: b, delta: b - a });
    }
    return {
        ok: deltas.every((d) => d.delta >= 0), // unexpected deletes flagged separately
        deltas,
        deletes: deltas.filter((d) => d.delta < 0),
        duplicateCompanyNames: after.duplicateCompanyNames || [],
    };
}
