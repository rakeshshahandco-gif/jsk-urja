/**
 * One-time Render data alignment for JSK company setup.
 *
 * What it does:
 * 1) Finds target company by name (default: "JSK INNOVATIVE TECH")
 * 2) Marks it as default + active
 * 3) Backfills missing companyId on all tenant-scoped collections
 * 4) Repairs CompanyProfile for target company (adopts legacy singleton if needed)
 * 5) Ensures current financial year exists and is marked isCurrent
 *
 * Usage:
 *   # Dry run (recommended first)
 *   node src/scripts/forceRenderCompanySetup.mjs
 *
 *   # Apply changes
 *   node src/scripts/forceRenderCompanySetup.mjs --apply
 *
 * Optional env:
 *   TARGET_COMPANY_NAME="JSK INNOVATIVE TECH. PVT. LTD."
 *   TARGET_FY_NAME="2026-2027"
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const APPLY = process.argv.includes('--apply');
const TARGET_COMPANY_NAME = (process.env.TARGET_COMPANY_NAME || 'JSK INNOVATIVE TECH').trim();
const TARGET_FY_NAME = (process.env.TARGET_FY_NAME || '').trim();

const log = (...args) => console.log('[forceRenderCompanySetup]', ...args);
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Load plugins + models same way backend boot does.
const { connectDB } = await import('../config/db.js');
const { Company } = await import('../models/company.model.js');
const { CompanyProfile } = await import('../models/companyProfile.model.js');
const { FinancialYear } = await import('../models/financialYear.model.js');

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

const companyRegex = new RegExp(esc(TARGET_COMPANY_NAME), 'i');
let targetCompany = await Company.findOne({ companyName: companyRegex });
if (!targetCompany) {
    // Fallback: match by brand/legal name
    targetCompany = await Company.findOne({
        $or: [
            { brandName: companyRegex },
            { legalName: companyRegex },
            { companyName: /JSK.*INNOVATIVE/i },
        ],
    });
}

if (!targetCompany) {
    console.error(`Target company not found for name "${TARGET_COMPANY_NAME}".`);
    process.exit(1);
}

log('Target company:', targetCompany._id.toString(), targetCompany.companyName);
log('Mode:', APPLY ? 'APPLY' : 'DRY-RUN');

// 1) Mark target company default+active
if (APPLY) {
    await Company.updateMany({ _id: { $ne: targetCompany._id } }, { $set: { isDefault: false } });
    await Company.updateOne(
        { _id: targetCompany._id },
        { $set: { isDefault: true, isActive: true } }
    );
}
log('Company default switch:', APPLY ? 'applied' : 'planned');

// 2) Backfill missing companyId on all tenant-scoped models
for (const name of Object.keys(mongoose.models)) {
    const Model = mongoose.models[name];
    if (Model.schema.options.disableTenant) continue;
    if (!Model.schema.path('companyId')) continue;

    const filter = { $or: [{ companyId: { $exists: false } }, { companyId: null }] };
    const matchCount = await Model.collection.countDocuments(filter);
    if (matchCount === 0) continue;

    let modifiedCount = 0;
    if (APPLY) {
        const r = await Model.collection.updateMany(
            filter,
            { $set: { companyId: targetCompany._id } }
        );
        modifiedCount = r.modifiedCount || 0;
    }
    log(`${name}: missing companyId matched=${matchCount} modified=${modifiedCount}`);
}

// 3) CompanyProfile repair
let profile = await CompanyProfile.findOne({ companyId: targetCompany._id });
if (!profile) {
    const legacy = await CompanyProfile.findOne({
        $or: [{ companyId: { $exists: false } }, { companyId: null }],
        companyName: new RegExp(esc(targetCompany.companyName), 'i'),
    });
    if (legacy) {
        if (APPLY) {
            legacy.companyId = targetCompany._id;
            await legacy.save();
            profile = legacy;
        }
        log('CompanyProfile: legacy singleton found and will be attached to target company');
    } else {
        if (APPLY) {
            profile = await CompanyProfile.create({
                companyId: targetCompany._id,
                companyName: targetCompany.companyName || 'Company',
            });
        }
        log('CompanyProfile: missing profile will be created');
    }
}

if (!profile && !APPLY) {
    // for dry-run we still need pseudo profile shape for merge decision
    profile = { companyName: '', address: '', city: '', state: '', pincode: '', gstNumber: '', panNumber: '', email: '', phone: '', cin: '', logoUrl: '', bankName: '', accountNo: '', branchName: '', ifscCode: '' };
}

const bank = targetCompany.bankDetails || {};
const profilePairs = [
    ['companyName', targetCompany.companyName],
    ['address', targetCompany.address],
    ['city', targetCompany.city],
    ['state', targetCompany.state],
    ['pincode', targetCompany.pincode],
    ['gstNumber', targetCompany.gstNumber],
    ['panNumber', targetCompany.panNumber],
    ['email', targetCompany.email],
    ['phone', targetCompany.mobile],
    ['cin', targetCompany.cinNumber],
    ['logoUrl', targetCompany.logoUrl],
    ['bankName', bank.bankName],
    ['accountNo', bank.accountNo],
    ['branchName', bank.branchName],
    ['ifscCode', bank.ifscCode],
];

let profilePatched = 0;
for (const [k, v] of profilePairs) {
    const src = v != null ? String(v).trim() : '';
    const cur = String(profile?.[k] || '').trim();
    if (!cur && src) {
        profile[k] = src;
        profilePatched += 1;
    }
}
if (profilePatched > 0 && APPLY && profile?.save) {
    await profile.save();
}
log(`CompanyProfile field backfill: patched=${profilePatched}`);

// 4) FinancialYear normalization + current FY
const fyRows = await FinancialYear.find().sort({ startDate: -1 });
const shortFY = /^(\d{4})-(\d{2})$/;
let normalized = 0;
for (const fy of fyRows) {
    const m = shortFY.exec(String(fy.name || '').trim());
    if (!m) continue;
    const longName = `${m[1]}-20${m[2]}`;
    const existsLong = await FinancialYear.findOne({ name: longName });
    if (existsLong) continue;
    if (APPLY) {
        fy.name = longName;
        await fy.save();
    }
    normalized += 1;
}
if (normalized > 0) log(`FinancialYear name normalized short->long: ${normalized}`);

let currentFY = null;
if (TARGET_FY_NAME) {
    currentFY = await FinancialYear.findOne({ name: TARGET_FY_NAME });
}
if (!currentFY) {
    currentFY = await FinancialYear.findOne({ isCurrent: true });
}
if (!currentFY) {
    const now = new Date();
    currentFY = await FinancialYear.findOne({ startDate: { $lte: now }, endDate: { $gte: now } });
}
if (!currentFY) {
    currentFY = await FinancialYear.findOne().sort({ startDate: -1 });
}
if (currentFY) {
    if (APPLY) {
        await FinancialYear.updateMany({ _id: { $ne: currentFY._id } }, { $set: { isCurrent: false } });
        await FinancialYear.updateOne({ _id: currentFY._id }, { $set: { isCurrent: true, status: 'Active' } });
    }
    log('Current FY:', currentFY.name, APPLY ? '(applied)' : '(planned)');
} else {
    log('No financial years found to set current.');
}

log('Done.');
await mongoose.disconnect();
process.exit(0);

