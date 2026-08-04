/**
 * Stable system ledger resolution (company-scoped).
 * Prefer systemCode over display-name matching; map aliases safely; optional auto-create.
 */
import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { AccountGroup } from '../models/accountGroup.model.js';
import { checkUserPermission } from '../utils/permissionUtils.js';

const SALES_RETURN_ALIASES = [
    'Sales Return',
    'Sales Returns',
    'Return Inward',
    'Sales Return Account',
    'Return Inwards',
];

export const SYSTEM_LEDGER_CODES = {
    SALES_RETURN: {
        code: 'SALES_RETURN',
        displayName: 'Sales Return',
        groupName: 'Sales Accounts',
        type: 'Income',
        aliases: SALES_RETURN_ALIASES,
    },
};

function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isAuthorisedLedgerAdmin(user) {
    const role = String(user?.role?.name || user?.roleName || '').toLowerCase();
    if (role === 'admin' || role === 'superadmin') return true;
    return (
        checkUserPermission(user, 'accounts.ledger_master.add') ||
        checkUserPermission(user, 'accounts.ledger_master.edit') ||
        checkUserPermission(user, 'accounts.account_master.manage')
    );
}

/**
 * Find ledger by systemCode within current company scope (tenant plugin).
 */
export async function findLedgerBySystemCode(systemCode, session = null) {
    if (!systemCode) return null;
    let q = AccountLedger.findOne({
        systemCode: String(systemCode).trim().toUpperCase(),
        status: { $ne: 'Inactive' },
    });
    if (session) q = q.session(session);
    return q;
}

/**
 * Case-insensitive exact name / alias match among known alias list.
 */
export async function findLedgerByAliases(aliases, session = null) {
    const names = (aliases || []).map((a) => String(a || '').trim()).filter(Boolean);
    if (!names.length) return null;
    const or = names.flatMap((n) => [
        { name: new RegExp(`^${escapeRegex(n)}$`, 'i') },
        { alias: new RegExp(`^${escapeRegex(n)}$`, 'i') },
        { printName: new RegExp(`^${escapeRegex(n)}$`, 'i') },
    ]);
    // Also allow "Sales Returns" group-style contains for Sales Return code only via exact aliases above
    let q = AccountLedger.findOne({
        $or: or,
        status: { $ne: 'Inactive' },
    });
    if (session) q = q.session(session);
    return q;
}

async function resolveSalesAccountsGroup(session = null) {
    let q = AccountGroup.findOne({ name: /^Sales Accounts$/i });
    if (session) q = q.session(session);
    let group = await q;
    if (group) return group;
    let q2 = AccountGroup.findOne({ name: /Sales/i, nature: 'Income' });
    if (session) q2 = q2.session(session);
    group = await q2;
    return group;
}

/**
 * Stamp systemCode on an existing ledger (idempotent, no rename).
 */
export async function mapLedgerToSystemCode(ledgerId, systemCode, session = null) {
    const code = String(systemCode || '').trim().toUpperCase();
    if (!code || !SYSTEM_LEDGER_CODES[code]) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Unknown system ledger code: ${systemCode}`);
    }
    const existing = await findLedgerBySystemCode(code, session);
    if (existing && String(existing._id) !== String(ledgerId)) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            `System code ${code} is already mapped to ledger "${existing.name}".`,
        );
    }
    let q = AccountLedger.findById(ledgerId);
    if (session) q = q.session(session);
    const ledger = await q;
    if (!ledger) throw new ApiError(httpStatus.NOT_FOUND, 'Ledger not found');
    if (ledger.systemCode && ledger.systemCode !== code) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Ledger "${ledger.name}" already has system code ${ledger.systemCode}.`,
        );
    }
    ledger.systemCode = code;
    await ledger.save({ session });
    return ledger;
}

/**
 * Create Sales Return ledger once per company under Sales Accounts.
 */
export async function createSalesReturnLedger({ userId, session = null }) {
    const def = SYSTEM_LEDGER_CODES.SALES_RETURN;
    const existingCode = await findLedgerBySystemCode(def.code, session);
    if (existingCode) return existingCode;

    const aliased = await findLedgerByAliases(def.aliases, session);
    if (aliased) {
        if (!aliased.systemCode) {
            aliased.systemCode = def.code;
            await aliased.save({ session });
        }
        return aliased;
    }

    const group = await resolveSalesAccountsGroup(session);
    if (!group) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Cannot create Sales Return ledger: Account Group "Sales Accounts" is missing. Initialize Account Masters first.',
        );
    }

    // Unique name per company — prefer display name; if taken, use alias check already done
    const nameTaken = await AccountLedger.findOne({ name: def.displayName }).session(session);
    if (nameTaken) {
        nameTaken.systemCode = nameTaken.systemCode || def.code;
        await nameTaken.save({ session });
        return nameTaken;
    }

    const [created] = await AccountLedger.create(
        [
            {
                name: def.displayName,
                printName: def.displayName,
                alias: 'Sales Returns',
                underGroup: group._id,
                groupName: group.name || def.groupName,
                type: 'Income',
                systemCode: def.code,
                status: 'Active',
                createdBy: userId,
            },
        ],
        session ? { session } : undefined,
    );
    return created;
}

/**
 * Resolve SALES_RETURN for posting. Optionally auto-create/map for authorised users.
 */
export async function resolveSalesReturnLedger({
    session = null,
    user = null,
    autoCreate = false,
} = {}) {
    const def = SYSTEM_LEDGER_CODES.SALES_RETURN;

    let ledger = await findLedgerBySystemCode(def.code, session);
    if (ledger) return { ledger, mapped: false, created: false };

    ledger = await findLedgerByAliases(def.aliases, session);
    if (ledger) {
        if (!ledger.systemCode) {
            ledger.systemCode = def.code;
            await ledger.save({ session });
            return { ledger, mapped: true, created: false };
        }
        return { ledger, mapped: false, created: false };
    }

    if (autoCreate && isAuthorisedLedgerAdmin(user)) {
        const created = await createSalesReturnLedger({ userId: user?.id || user?._id, session });
        return { ledger: created, mapped: false, created: true };
    }

    const err = new ApiError(
        httpStatus.BAD_REQUEST,
        'Credit Note cannot be finalised because the Sales Return ledger is not configured.',
    );
    err.code = 'LEDGER_SALES_RETURN_MISSING';
    err.details = {
        systemCode: def.code,
        displayName: def.displayName,
        searchedAliases: def.aliases,
        actions: ['configure', 'map_existing', 'cancel'],
    };
    throw err;
}

/**
 * Setup status for Credit Note module (no writes).
 */
export async function getSalesReturnLedgerSetupStatus() {
    const def = SYSTEM_LEDGER_CODES.SALES_RETURN;
    const byCode = await findLedgerBySystemCode(def.code);
    if (byCode) {
        return {
            ready: true,
            systemCode: def.code,
            ledger: { _id: byCode._id, name: byCode.name, systemCode: byCode.systemCode },
            source: 'systemCode',
        };
    }
    const byAlias = await findLedgerByAliases(def.aliases);
    if (byAlias) {
        return {
            ready: false,
            needsMapping: true,
            systemCode: def.code,
            ledger: { _id: byAlias._id, name: byAlias.name, systemCode: byAlias.systemCode || '' },
            source: 'alias',
            message: `Found "${byAlias.name}" — map it to system code ${def.code}.`,
        };
    }
    return {
        ready: false,
        needsCreate: true,
        systemCode: def.code,
        displayName: def.displayName,
        searchedAliases: def.aliases,
        message: 'Sales Return ledger is not configured for this company.',
    };
}

/**
 * Pick income ledger for CN reason — Sales Return is safe default for this release.
 * Post-sale discount may use Discount Allowed / Sales Discount if present; else Sales Return.
 */
export async function resolveCreditNoteIncomeLedger(reason, { session, user, autoCreate } = {}) {
    const r = String(reason || '').toLowerCase();
    if (r.includes('discount')) {
        const discount = await findLedgerByAliases(
            ['Sales Discount', 'Discount Allowed', 'Discount on Sales'],
            session,
        );
        if (discount) return { ledger: discount, systemCode: discount.systemCode || 'SALES_DISCOUNT', usedFallback: false };
    }
    const resolved = await resolveSalesReturnLedger({ session, user, autoCreate });
    return {
        ledger: resolved.ledger,
        systemCode: SYSTEM_LEDGER_CODES.SALES_RETURN.code,
        usedFallback: Boolean(r.includes('discount')),
        mapped: resolved.mapped,
        created: resolved.created,
    };
}

export { isAuthorisedLedgerAdmin };
