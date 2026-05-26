/**
 * Assign companyId on tenant collections to target Company (merge pre-multi-company data into JSK).
 * Only updateMany $set companyId - no deletes, no business row inserts.
 *
 * From backend/:
 *   npm run migrate:to-company -- --dry-run
 *   npm run migrate:to-company
 *   npm run migrate:to-company -- --reassign-from-default
 *   npm run migrate:to-company -- --company-name="Exact name from Company Master"
 *   npm run migrate:to-company -- --company-id=<MongoObjectId>
 *
 * Auto-resolve (no --company-name / --company-id): tries JSK INNOVATIVE TECHNOLOGY PVT. LTD.,
 * JSK INNOVATIVE TECH PVT. LTD., then a small fuzzy match on active companies.
 *
 * Legacy data often sat on null companyId OR on the old isDefault company after first backfill.
 * Phase 1 fills nulls; --reassign-from-default moves rows from isDefault company to target (other companies untouched).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NAME_CANDIDATES = [
    'JSK INNOVATIVE TECHNOLOGY PVT. LTD.',
    'JSK INNOVATIVE TECH PVT. LTD.',
    'JSK INNOVATIVE TECHNOLOGIES PVT. LTD.',
];

function parseArgs() {
    const args = process.argv.slice(2);
    const out = {
        dryRun: false,
        reassignFromDefault: false,
        companyName: null,
        companyId: null,
    };
    for (const a of args) {
        if (a === '--dry-run') out.dryRun = true;
        else if (a === '--reassign-from-default') out.reassignFromDefault = true;
        else if (a.startsWith('--company-name=')) {
            out.companyName = a.slice('--company-name='.length).replace(/^"|"$/g, '');
        } else if (a.startsWith('--company-id=')) {
            out.companyId = a.slice('--company-id='.length).trim();
        }
    }
    return out;
}

const missingFilter = { $or: [{ companyId: { $exists: false } }, { companyId: null }] };

function tenantModels() {
    const list = [];
    for (const name of Object.keys(mongoose.models)) {
        const Model = mongoose.models[name];
        if (Model.schema.options.disableTenant) continue;
        if (!Model.schema.path('companyId')) continue;
        list.push({ name, Model });
    }
    return list;
}

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function printCompanies(Company) {
    const all = await Company.find({}).select('companyName isDefault isActive _id').sort({ companyName: 1 }).lean();
    console.error('Companies in database:');
    all.forEach((c) => {
        console.error('  ' + c._id + '  "' + c.companyName + '"  default=' + !!c.isDefault + ' active=' + c.isActive);
    });
}

/**
 * Resolve target company: explicit id, explicit name, then auto candidates / fuzzy JSK match.
 */
async function resolveTargetCompany(Company, opts) {
    if (opts.companyId) {
        const id = opts.companyId.trim();
        if (!mongoose.Types.ObjectId.isValid(id)) {
            console.error('Invalid --company-id (not a 24-char hex ObjectId): ' + id);
            await printCompanies(Company);
            process.exit(1);
        }
        const c = await Company.findById(id);
        if (c) return c;
        console.error('No company found for --company-id=' + id);
        await printCompanies(Company);
        process.exit(1);
    }

    if (opts.companyName && String(opts.companyName).trim()) {
        const nm = String(opts.companyName).trim();
        const nameRegex = new RegExp('^' + escapeRegex(nm) + '$', 'i');
        const c = await Company.findOne({ companyName: nameRegex });
        if (c) return c;
        console.error('Target company not found for --company-name=' + nm);
        await printCompanies(Company);
        process.exit(1);
    }

    for (const candidate of NAME_CANDIDATES) {
        const nameRegex = new RegExp('^' + escapeRegex(candidate) + '$', 'i');
        const c = await Company.findOne({ companyName: nameRegex, isActive: true });
        if (c) {
            console.log('[Resolve] Matched built-in name candidate:', c.companyName, String(c._id));
            return c;
        }
    }

    const fuzzy = await Company.find({
        isActive: true,
        companyName: { $regex: /JSK|INNOVATIVE|INNOVAT/i },
    })
        .select('companyName _id')
        .limit(20)
        .lean();

    const best = fuzzy.find(
        (x) =>
            /jsk/i.test(x.companyName) &&
            (/innovative|innovativ|innovat/i.test(x.companyName) || /tech/i.test(x.companyName))
    );
    if (best) {
        const full = await Company.findById(best._id);
        console.log('[Resolve] Fuzzy match:', full.companyName, String(full._id));
        return full;
    }

    console.error(
        'Could not resolve target company automatically. Use --company-name="Exact name" or --company-id=<id>.'
    );
    await printCompanies(Company);
    process.exit(1);
}

async function migrateCompanyProfilePhase1(targetId, dryRun) {
    const Model = mongoose.models.CompanyProfile;
    if (!Model || Model.schema.options.disableTenant || !Model.schema.path('companyId')) return;

    const coll = Model.collection;
    const docs = await coll.find(missingFilter).toArray();
    if (docs.length === 0) return;

    if (docs.length === 1) {
        console.log('[Phase1] CompanyProfile: 1 document missing companyId');
        if (!dryRun) {
            await coll.updateOne({ _id: docs[0]._id }, { $set: { companyId: targetId } });
            console.log('[Phase1] CompanyProfile: updated 1');
        }
        return;
    }

    const sorted = [...docs].sort((a, b) => {
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return tb - ta;
    });
    const keep = sorted[0];
    console.warn(
        '[Phase1] CompanyProfile: ' +
            docs.length +
            ' documents without companyId (unique index). Assigning target only to _id=' +
            keep._id +
            '. Others unchanged - merge manually if needed.'
    );
    if (!dryRun) {
        await coll.updateOne({ _id: keep._id }, { $set: { companyId: targetId } });
    }
}

async function main() {
    const opts = parseArgs();
    dotenv.config({ path: path.resolve(__dirname, '../../.env') });
    dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

    const { connectDB } = await import('../config/db.js');
    const { Company } = await import('../models/company.model.js');
    const { CompanyProfile } = await import('../models/companyProfile.model.js');

    const modelsDir = path.join(__dirname, '../models');
    for (const f of fs.readdirSync(modelsDir)) {
        if (!f.endsWith('.model.js')) continue;
        await import(pathToFileURL(path.join(modelsDir, f)).href);
    }

    const connected = await connectDB();
    if (!connected) {
        console.error('Database connection failed');
        process.exit(1);
    }

    const target = await resolveTargetCompany(Company, opts);

    if (!target.isActive) {
        console.warn('Warning: target company is not isActive=true; continuing.');
    }

    console.log('--- migrateDataToCompany ---');
    console.log('Target:', target.companyName, String(target._id));
    console.log('Dry run:', opts.dryRun);
    console.log('Reassign from default:', opts.reassignFromDefault);

    const models = tenantModels();
    console.log('Tenant models:', models.map((m) => m.name).join(', '));

    await migrateCompanyProfilePhase1(target._id, opts.dryRun);

    for (const { name, Model } of models) {
        if (name === 'CompanyProfile') continue;

        const count = await Model.countDocuments(missingFilter);
        if (count === 0) continue;

        console.log('[Phase1] ' + name + ': missing companyId count=' + count);
        if (!opts.dryRun) {
            const r = await Model.collection.updateMany(missingFilter, { $set: { companyId: target._id } });
            console.log('[Phase1] ' + name + ': matched=' + r.matchedCount + ' modified=' + r.modifiedCount);
        }
    }

    if (opts.reassignFromDefault) {
        const defaultCo = await Company.findOne({ isDefault: true });
        if (!defaultCo) {
            console.log('[Phase2] No isDefault company; skip.');
        } else if (defaultCo._id.equals(target._id)) {
            console.log('[Phase2] Target is default company; skip.');
        } else {
            const filter = { companyId: defaultCo._id };
            console.log(
                '[Phase2] Reassign from default "' + defaultCo.companyName + '" (' + defaultCo._id + ') -> target'
            );
            const existingTargetProfiles = await mongoose.models.CompanyProfile.countDocuments({
                companyId: target._id,
            });
            for (const { name, Model } of models) {
                if (name === 'CompanyProfile' && existingTargetProfiles > 0) {
                    const cnt = await Model.countDocuments(filter);
                    if (cnt > 0) {
                        console.warn(
                            '[Phase2] CompanyProfile: skip bulk reassign (' +
                                cnt +
                                ' rows on default company) - target already has a profile (unique companyId). Merge in UI if needed.'
                        );
                    }
                    continue;
                }
                const cnt = await Model.countDocuments(filter);
                if (cnt === 0) continue;
                console.log('[Phase2] ' + name + ': count=' + cnt);
                if (!opts.dryRun) {
                    const r = await Model.collection.updateMany(filter, { $set: { companyId: target._id } });
                    console.log('[Phase2] ' + name + ': modified=' + r.modifiedCount);
                }
            }
        }
    }

    if (!opts.dryRun) {
        const pc = await CompanyProfile.countDocuments({ companyId: target._id });
        if (pc === 0) {
            await CompanyProfile.create({
                companyName: target.companyName || 'Company',
                companyId: target._id,
            });
            console.log('[Ensure] Created minimal CompanyProfile for target company.');
        }
    } else {
        const pc = await CompanyProfile.countDocuments({ companyId: target._id });
        console.log('[Dry-run] CompanyProfile rows for target would be: ' + pc);
    }

    console.log('');
    console.log('--- Counts for target companyId ---');
    for (const { name, Model } of models) {
        const n = await Model.countDocuments({ companyId: target._id });
        if (n > 0) console.log(name + ': ' + n);
    }

    console.log('');
    console.log('Finished.');
    await mongoose.disconnect();
    process.exit(0);
}

main().catch(async (e) => {
    console.error(e);
    try {
        await mongoose.disconnect();
    } catch {
        /* ignore */
    }
    process.exit(1);
});
