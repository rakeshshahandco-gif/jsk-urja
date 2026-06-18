/**
 * Handloom-only bootstrap. NEVER run against JSK MongoDB.
 * HANDLOOM_MONGODB_URL="mongodb+srv://.../handloom_crm?..." node src/scripts/seedHandloomInitial.mjs --confirm-handloom
 */
import mongoose from 'mongoose';
import { User } from '../models/user.model.js';
import { Role } from '../models/role.model.js';
import { Company } from '../models/company.model.js';
import { FinancialYear } from '../models/financialYear.model.js';
import { IndustryTemplate } from '../models/industryTemplate.model.js';
import { ensureDefaultIndustryTemplates } from '../services/industryTemplate.service.js';

const REQUIRED_DB_NAME = 'handloom_crm';
const BLOCKED_URI_PARTS = [/jskurja/i, /jsk-urja/i, /jsk_urja/i, /jskurja-dev/i, /jskurja-prod/i];
const HANDLOOM_RENDER_BACKEND = 'handloom-crm-backend.onrender.com';
const JSK_RENDER_BACKEND = 'jsk-urja-backend.onrender.com';

const ADMIN = {
    name: 'System Admin',
    username: 'admin',
    email: 'admin@handloomcrm.com',
    password: 'admin123',
    roleName: 'superadmin',
};

const COMPANY = {
    companyName: 'Handloom Group',
    templateCode: 'TEXTILE',
    isActive: true,
    isDefault: true,
};

const FY = {
    name: '2026-2027',
    startDate: new Date('2026-04-01T00:00:00.000Z'),
    endDate: new Date('2027-03-31T23:59:59.999Z'),
    status: 'Active',
    isCurrent: true,
};

function parseDbName(uri) {
    const withoutQuery = String(uri || '').split('?')[0];
    const slash = withoutQuery.lastIndexOf('/');
    if (slash === -1 || slash === withoutQuery.length - 1) return '';
    return decodeURIComponent(withoutQuery.slice(slash + 1)).trim();
}

function maskUri(uri) {
    return String(uri || '').replace(/:([^:@/]+)@/, ':****@');
}

function assertHandloomSafe(uri) {
    if (!uri) {
        throw new Error('HANDLOOM_MONGODB_URL is required. Do not use local JSK .env MONGODB_URL.');
    }
    for (const re of BLOCKED_URI_PARTS) {
        if (re.test(uri)) {
            throw new Error('ABORT: URI matches blocked JSK pattern. Refusing to seed.');
        }
    }
    const dbName = parseDbName(uri);
    if (dbName !== REQUIRED_DB_NAME) {
        throw new Error(`ABORT: database name must be ${REQUIRED_DB_NAME} but got ${dbName || '(none)'}`);
    }
    return dbName;
}

function printPreflight(uri, dbName) {
    console.log('\n=== HANDLOOM SEED PREFLIGHT ===');
    console.log(`1. MongoDB database name: ${dbName} ${dbName === REQUIRED_DB_NAME ? 'OK' : 'FAIL'}`);
    console.log(`2. MongoDB URI (masked): ${maskUri(uri)}`);
    console.log(`3. JSK database name in URI: ${BLOCKED_URI_PARTS.some((re) => re.test(uri)) ? 'YES - BLOCKED' : 'NO - OK'}`);
    console.log(`4. Target Render backend: ${HANDLOOM_RENDER_BACKEND}`);
    console.log(`5. JSK Render backend: ${JSK_RENDER_BACKEND} - NOT modified`);
    console.log('================================\n');
}

async function ensureSuperadminRole() {
    let role = await Role.findOne({ name: 'superadmin' });
    if (!role) {
        role = await Role.create({ name: 'superadmin', description: 'Full access', isSystemRole: true, isActive: true });
        console.log('Created role: superadmin');
    }
    return role;
}

async function seedAdmin(roleId) {
    const byEmail = await User.findOne({ email: ADMIN.email });
    if (byEmail) {
        console.log(`Admin already exists: ${ADMIN.email}`);
        return { created: false, user: byEmail };
    }
    const byUsername = await User.findOne({ username: ADMIN.username });
    if (byUsername) {
        console.log(`Admin username already exists: ${ADMIN.username}`);
        return { created: false, user: byUsername };
    }
    const user = await User.create({
        name: ADMIN.name,
        username: ADMIN.username,
        email: ADMIN.email,
        password: ADMIN.password,
        role: roleId,
        roleName: ADMIN.roleName,
        isActive: true,
        allowLogin: true,
    });
    console.log(`Admin created: ${ADMIN.email}`);
    return { created: true, user };
}

async function seedCompany() {
    const textileTpl = await IndustryTemplate.findOne({ templateCode: COMPANY.templateCode, isActive: true });
    if (!textileTpl) throw new Error('TEXTILE template not found');
    let company = await Company.findOne({ companyName: COMPANY.companyName });
    if (company) {
        let updated = false;
        if (String(company.industryTemplateRef || '') !== String(textileTpl._id)) {
            company.industryTemplateRef = textileTpl._id;
            updated = true;
        }
        if (!company.isActive) {
            company.isActive = true;
            updated = true;
        }
        if (updated) {
            await company.save();
            console.log(`Company updated: ${COMPANY.companyName}`);
        } else {
            console.log(`Company already exists: ${COMPANY.companyName}`);
        }
        return { created: false, company };
    }
    company = await Company.create({
        companyName: COMPANY.companyName,
        legalName: COMPANY.companyName,
        industryTemplateRef: textileTpl._id,
        isActive: COMPANY.isActive,
        isDefault: COMPANY.isDefault,
        defaultFinancialYear: FY.name,
    });
    console.log(`Company created: ${COMPANY.companyName}`);
    return { created: true, company };
}

async function seedFinancialYear(userId) {
    let fy = await FinancialYear.findOne({ name: FY.name });
    if (fy) {
        let updated = false;
        if (!fy.isCurrent) {
            fy.isCurrent = true;
            updated = true;
        }
        if (fy.status !== 'Active') {
            fy.status = 'Active';
            updated = true;
        }
        if (updated) {
            await fy.save();
            console.log(`Financial year updated: ${FY.name}`);
        } else {
            console.log(`Financial year already exists: ${FY.name}`);
        }
        return { created: false, fy };
    }
    fy = await FinancialYear.create({ ...FY, createdBy: userId || null });
    console.log(`Financial year created: ${FY.name}`);
    return { created: true, fy };
}

async function main() {
    if (!process.argv.includes('--confirm-handloom')) {
        console.error('ABORT: pass --confirm-handloom');
        process.exit(1);
    }
    const uri = process.env.HANDLOOM_MONGODB_URL || '';
    const dbName = assertHandloomSafe(uri);
    printPreflight(uri, dbName);
    await mongoose.connect(uri);
    console.log(`Connected to database: ${dbName}\n`);
    await ensureDefaultIndustryTemplates();
    const role = await ensureSuperadminRole();
    const adminResult = await seedAdmin(role._id);
    const companyResult = await seedCompany();
    const fyResult = await seedFinancialYear(adminResult.user?._id);
    console.log('\n=== HANDLOOM SEED COMPLETE ===');
    console.log(JSON.stringify({
        database: dbName,
        admin: { email: ADMIN.email, created: adminResult.created },
        company: { name: COMPANY.companyName, created: companyResult.created },
        financialYear: { name: FY.name, created: fyResult.created },
        jskLiveTouched: false,
    }, null, 2));
    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('HANDLOOM SEED FAILED:', err.message);
    process.exit(1);
});