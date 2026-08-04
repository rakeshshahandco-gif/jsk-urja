/**
 * Credit Note ledger configuration — map/create/default via system codes.
 * Stored on Company.creditNoteLedgerConfig (no separate Mongo collection — Atlas 500-coll limit).
 */
import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { AccountGroup } from '../models/accountGroup.model.js';
import { AuditLog } from '../models/auditLog.model.js';
import { Company } from '../models/company.model.js';
import { checkUserPermission } from '../utils/permissionUtils.js';
import {
    SYSTEM_LEDGER_CODES,
    findLedgerBySystemCode,
    findLedgerByAliases,
    mapLedgerToSystemCode,
    createSalesReturnLedger,
    isAuthorisedLedgerAdmin,
} from './systemLedger.service.js';

export const CN_REASON_KEYS = [
    'Sales Return',
    'Quantity Difference',
    'Post Sale Discount',
    'Rate Difference',
    'Other',
];

/** Extended codes used by reason mapping (create defaults when needed). */
export const CN_SYSTEM_CODES = {
    ...SYSTEM_LEDGER_CODES,
    DISCOUNT_ALLOWED: {
        code: 'DISCOUNT_ALLOWED',
        displayName: 'Discount Allowed',
        groupName: 'Indirect Expenses',
        type: 'Expense',
        aliases: ['Discount Allowed', 'Sales Discount', 'Discount on Sales', 'Post Sale Discount'],
    },
    SALES_RATE_DIFFERENCE: {
        code: 'SALES_RATE_DIFFERENCE',
        displayName: 'Sales Rate Difference',
        groupName: 'Sales Accounts',
        type: 'Income',
        aliases: ['Rate Difference', 'Sales Rate Difference', 'Rate Diff'],
    },
};

function assertCanConfigure(user) {
    const role = String(user?.role?.name || user?.roleName || '').toLowerCase();
    if (role === 'admin' || role === 'superadmin') return;
    if (checkUserPermission(user, 'accounts.system_ledger.configure')) return;
    if (isAuthorisedLedgerAdmin(user)) return;
    throw new ApiError(httpStatus.FORBIDDEN, 'Permission denied: accounts.system_ledger.configure required');
}

function defaultReasonMappings() {
    return [
        { reasonKey: 'Sales Return', systemCode: 'SALES_RETURN' },
        { reasonKey: 'Quantity Difference', systemCode: 'SALES_RETURN' },
        { reasonKey: 'Post Sale Discount', systemCode: 'DISCOUNT_ALLOWED' },
        { reasonKey: 'Rate Difference', systemCode: 'SALES_RATE_DIFFERENCE' },
        { reasonKey: 'Other', systemCode: 'SALES_RETURN' },
    ];
}

function emptyConfigShape() {
    return {
        mode: 'default_system',
        defaultSystemCode: 'SALES_RETURN',
        mappedLedgerId: null,
        reasonMappings: defaultReasonMappings(),
        updatedBy: null,
    };
}

/**
 * Load company-wise CN ledger config (in-memory defaults if never saved).
 * Does not write until an admin applies a mode / mapping.
 */
export async function getOrCreateConfig(companyId) {
    if (!companyId) throw new ApiError(httpStatus.BAD_REQUEST, 'Company is required');
    const company = await Company.findById(companyId).select('creditNoteLedgerConfig');
    if (!company) throw new ApiError(httpStatus.BAD_REQUEST, 'Company not found');

    const raw = company.creditNoteLedgerConfig;
    if (!raw || (!raw.mode && !raw.mappedLedgerId && !(raw.reasonMappings || []).length)) {
        return { company, config: emptyConfigShape(), isNew: true };
    }
    return {
        company,
        config: {
            mode: raw.mode || 'default_system',
            defaultSystemCode: raw.defaultSystemCode || 'SALES_RETURN',
            mappedLedgerId: raw.mappedLedgerId || null,
            reasonMappings: (raw.reasonMappings || []).length ? raw.reasonMappings : defaultReasonMappings(),
            updatedBy: raw.updatedBy || null,
        },
        isNew: false,
    };
}

async function saveConfig(company, config, userId) {
    company.creditNoteLedgerConfig = {
        mode: config.mode || 'default_system',
        defaultSystemCode: config.defaultSystemCode || 'SALES_RETURN',
        mappedLedgerId: config.mappedLedgerId || null,
        reasonMappings: config.reasonMappings?.length ? config.reasonMappings : defaultReasonMappings(),
        updatedBy: userId || null,
        updatedAt: new Date(),
    };
    company.markModified('creditNoteLedgerConfig');
    await company.save();
    return company.creditNoteLedgerConfig;
}

function serializeLedger(ledger) {
    if (!ledger) return null;
    return {
        _id: ledger._id,
        name: ledger.name,
        groupName: ledger.groupName || '',
        type: ledger.type || '',
        systemCode: ledger.systemCode || '',
        status: ledger.status || 'Active',
        nature: ledger.type || '',
    };
}

/**
 * Validate ledger is usable for CN income reversal posting.
 */
export function assertLedgerSuitableForCreditNote(ledger) {
    if (!ledger) throw new ApiError(httpStatus.BAD_REQUEST, 'Ledger not found');
    if (ledger.status === 'Inactive') {
        throw new ApiError(httpStatus.BAD_REQUEST, `Ledger "${ledger.name}" is inactive and cannot be mapped.`);
    }
    const type = String(ledger.type || '').toLowerCase();
    const group = String(ledger.groupName || '').toLowerCase();
    const name = String(ledger.name || '').toLowerCase();
    const okType = ['income', 'expense', 'general'].includes(type) || type === '';
    const okGroup =
        /sales|income|discount|indirect/.test(group) ||
        /return|discount|rate diff|sales/.test(name);
    if (!okType && !okGroup) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Ledger "${ledger.name}" does not look suitable for Credit Note income posting (expected Sales/Income/Discount related).`,
        );
    }
}

export async function getCreditNoteLedgerConfigStatus(companyId) {
    const { config } = await getOrCreateConfig(companyId);
    const defaultCode = config.defaultSystemCode || 'SALES_RETURN';
    let mapped = null;
    if (config.mappedLedgerId) {
        mapped = await AccountLedger.findById(config.mappedLedgerId);
    }
    if (!mapped) {
        mapped = await findLedgerBySystemCode(defaultCode);
    }
    const ready = Boolean(mapped && mapped.status !== 'Inactive');

    const reasonStatus = [];
    for (const rm of config.reasonMappings || []) {
        let led = null;
        if (rm.ledgerId) led = await AccountLedger.findById(rm.ledgerId);
        if (!led) led = await findLedgerBySystemCode(rm.systemCode);
        reasonStatus.push({
            reasonKey: rm.reasonKey,
            systemCode: rm.systemCode,
            ledger: serializeLedger(led),
            ready: Boolean(led && led.status !== 'Inactive'),
        });
    }

    return {
        ready,
        mode: config.mode,
        defaultSystemCode: defaultCode,
        mappedLedger: serializeLedger(mapped),
        reasonMappings: reasonStatus,
        message: ready
            ? `Mapped to "${mapped.name}" (${defaultCode})`
            : 'Credit Note ledger is not configured.',
    };
}

export async function searchLedgersForMapping({ q = '', limit = 50 } = {}) {
    const filter = { status: { $ne: 'Inactive' } };
    if (q && String(q).trim()) {
        const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ name: rx }, { alias: rx }, { printName: rx }, { groupName: rx }];
    } else {
        filter.$or = [
            { name: /return|discount|rate diff|sales/i },
            { systemCode: { $in: Object.keys(CN_SYSTEM_CODES) } },
        ];
    }
    const rows = await AccountLedger.find(filter)
        .select('name alias groupName type systemCode status')
        .sort({ name: 1 })
        .limit(Math.min(100, Number(limit) || 50))
        .lean();
    return rows.map((r) => serializeLedger(r));
}

async function audit(userId, action, description, details) {
    if (!userId) return;
    try {
        await AuditLog.create({
            user: userId,
            action,
            module: 'CreditNoteLedgerConfig',
            description,
            details,
        });
    } catch {
        /* non-blocking — may fail on Atlas collection limits */
    }
}

/**
 * Map existing ledger to default SALES_RETURN and save config.
 */
export async function selectExistingLedger({
    companyId,
    user,
    ledgerId,
    systemCode = 'SALES_RETURN',
}) {
    assertCanConfigure(user);
    const code = String(systemCode || 'SALES_RETURN').trim().toUpperCase() || 'SALES_RETURN';
    const ledger = await AccountLedger.findById(ledgerId);
    assertLedgerSuitableForCreditNote(ledger);

    const mapped = await mapLedgerToSystemCode(ledgerId, code);

    const { company, config } = await getOrCreateConfig(companyId);
    const before = { ...config };
    config.mode = 'select_existing';
    if (code === 'SALES_RETURN') {
        config.mappedLedgerId = mapped._id;
        config.defaultSystemCode = 'SALES_RETURN';
    }
    await saveConfig(company, config, user?.id || user?._id);

    await audit(user?.id || user?._id, 'UPDATE', `Mapped ledger "${mapped.name}" to ${code}`, {
        before,
        after: { mode: config.mode, mappedLedgerId: config.mappedLedgerId, systemCode: code, ledgerName: mapped.name },
    });

    return getCreditNoteLedgerConfigStatus(companyId);
}

/**
 * Create new Sales Return ledger and set as default mapping.
 */
export async function createNewSalesReturnLedger({
    companyId,
    user,
    name = 'Sales Return',
    groupName = 'Sales Accounts',
}) {
    assertCanConfigure(user);
    const userId = user?.id || user?._id;

    const existingCode = await findLedgerBySystemCode('SALES_RETURN');
    if (existingCode) {
        const { company, config } = await getOrCreateConfig(companyId);
        config.mode = 'create_new';
        config.mappedLedgerId = existingCode._id;
        config.defaultSystemCode = 'SALES_RETURN';
        await saveConfig(company, config, userId);
        return getCreditNoteLedgerConfigStatus(companyId);
    }

    const displayName = String(name || 'Sales Return').trim() || 'Sales Return';
    const nameTaken = await AccountLedger.findOne({
        name: new RegExp(`^${displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });
    if (nameTaken) {
        assertLedgerSuitableForCreditNote(nameTaken);
        nameTaken.systemCode = nameTaken.systemCode || 'SALES_RETURN';
        await nameTaken.save();
        const { company, config } = await getOrCreateConfig(companyId);
        config.mode = 'select_existing';
        config.mappedLedgerId = nameTaken._id;
        config.defaultSystemCode = 'SALES_RETURN';
        await saveConfig(company, config, userId);
        await audit(userId, 'UPDATE', 'Mapped existing same-name ledger to SALES_RETURN', {
            ledgerId: nameTaken._id,
            name: nameTaken.name,
        });
        return getCreditNoteLedgerConfigStatus(companyId);
    }

    let group = await AccountGroup.findOne({ name: new RegExp(`^${String(groupName || 'Sales Accounts').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (!group) group = await AccountGroup.findOne({ name: /^Sales Accounts$/i });
    if (!group) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Account Group "Sales Accounts" is missing. Initialize Account Masters first.');
    }

    const [created] = await AccountLedger.create([{
        name: displayName,
        printName: displayName,
        alias: 'Sales Returns',
        underGroup: group._id,
        groupName: group.name,
        type: 'Income',
        systemCode: 'SALES_RETURN',
        status: 'Active',
        createdBy: userId,
    }]);

    const { company, config } = await getOrCreateConfig(companyId);
    config.mode = 'create_new';
    config.mappedLedgerId = created._id;
    config.defaultSystemCode = 'SALES_RETURN';
    await saveConfig(company, config, userId);

    await audit(userId, 'CREATE', 'Created Sales Return ledger for Credit Notes', {
        ledgerId: created._id,
        name: created.name,
        systemCode: 'SALES_RETURN',
    });

    return getCreditNoteLedgerConfigStatus(companyId);
}

/**
 * Use default system ledger mode — ensure SALES_RETURN exists (map alias or create).
 */
export async function useDefaultSystemLedger({ companyId, user }) {
    assertCanConfigure(user);
    const userId = user?.id || user?._id;
    const ledger = await createSalesReturnLedger({ userId });
    const { company, config } = await getOrCreateConfig(companyId);
    config.mode = 'default_system';
    config.mappedLedgerId = ledger._id;
    config.defaultSystemCode = 'SALES_RETURN';
    await saveConfig(company, config, userId);
    await audit(userId, 'UPDATE', 'Set Credit Note to use default SALES_RETURN system ledger', {
        ledgerId: ledger._id,
        name: ledger.name,
    });
    return getCreditNoteLedgerConfigStatus(companyId);
}

/**
 * Update reason → systemCode / ledger mappings.
 */
export async function saveReasonMappings({ companyId, user, reasonMappings }) {
    assertCanConfigure(user);
    if (!Array.isArray(reasonMappings)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'reasonMappings[] required');
    }
    const { company, config } = await getOrCreateConfig(companyId);
    const cleaned = reasonMappings.map((r) => ({
        reasonKey: String(r.reasonKey || '').trim(),
        systemCode: String(r.systemCode || 'SALES_RETURN').trim().toUpperCase(),
        ledgerId: r.ledgerId || null,
    })).filter((r) => r.reasonKey);
    config.reasonMappings = cleaned.length ? cleaned : defaultReasonMappings();
    await saveConfig(company, config, user?.id || user?._id);
    await audit(user?.id || user?._id, 'UPDATE', 'Updated Credit Note reason ledger mappings', {
        reasonMappings: config.reasonMappings,
    });
    return getCreditNoteLedgerConfigStatus(companyId);
}

function matchReasonKey(reason, mappings) {
    const r = String(reason || '').trim().toLowerCase();
    if (!r) return mappings.find((m) => m.reasonKey === 'Sales Return') || mappings[0];
    const exact = mappings.find((m) => String(m.reasonKey).toLowerCase() === r);
    if (exact) return exact;
    if (r.includes('discount')) return mappings.find((m) => /discount/i.test(m.reasonKey)) || null;
    if (r.includes('rate')) return mappings.find((m) => /rate/i.test(m.reasonKey)) || null;
    if (r.includes('quantity') || r.includes('qty')) return mappings.find((m) => /quantity/i.test(m.reasonKey)) || null;
    if (r.includes('return')) return mappings.find((m) => /return/i.test(m.reasonKey)) || null;
    return mappings.find((m) => m.reasonKey === 'Other') || mappings.find((m) => m.reasonKey === 'Sales Return');
}

/**
 * Resolve income ledger for posting — system code only (config-driven).
 */
export async function resolveConfiguredCreditNoteIncomeLedger(reason, { companyId, session = null } = {}) {
    let config = null;
    if (companyId) {
        let cq = Company.findById(companyId).select('creditNoteLedgerConfig');
        if (session) cq = cq.session(session);
        const company = await cq;
        const raw = company?.creditNoteLedgerConfig;
        if (raw && (raw.mode || raw.mappedLedgerId || (raw.reasonMappings || []).length)) {
            config = {
                mode: raw.mode || 'default_system',
                defaultSystemCode: raw.defaultSystemCode || 'SALES_RETURN',
                mappedLedgerId: raw.mappedLedgerId || null,
                reasonMappings: (raw.reasonMappings || []).length ? raw.reasonMappings : defaultReasonMappings(),
            };
        }
    }

    const mappings = config?.reasonMappings?.length ? config.reasonMappings : defaultReasonMappings();
    const matched = matchReasonKey(reason, mappings);
    let systemCode = matched?.systemCode || config?.defaultSystemCode || 'SALES_RETURN';

    let ledger = null;
    if (matched?.ledgerId) {
        let lq = AccountLedger.findById(matched.ledgerId);
        if (session) lq = lq.session(session);
        ledger = await lq;
        if (ledger?.status === 'Inactive') ledger = null;
    }
    if (!ledger) {
        ledger = await findLedgerBySystemCode(systemCode, session);
    }
    if (!ledger && systemCode !== 'SALES_RETURN') {
        systemCode = 'SALES_RETURN';
        if (config?.mappedLedgerId) {
            let mq = AccountLedger.findById(config.mappedLedgerId);
            if (session) mq = mq.session(session);
            ledger = await mq;
            if (ledger?.status === 'Inactive') ledger = null;
        }
        if (!ledger) ledger = await findLedgerBySystemCode('SALES_RETURN', session);
    }

    if (!ledger || ledger.status === 'Inactive') {
        const err = new ApiError(httpStatus.BAD_REQUEST, 'Credit Note ledger is not configured.');
        err.code = 'LEDGER_SALES_RETURN_MISSING';
        err.details = {
            systemCode: 'SALES_RETURN',
            actions: ['select_existing', 'create_new', 'cancel'],
        };
        throw err;
    }

    return {
        ledger,
        systemCode: ledger.systemCode || systemCode,
        usedFallback: Boolean(matched?.systemCode && matched.systemCode !== (ledger.systemCode || systemCode)),
    };
}

export { createSalesReturnLedger, mapLedgerToSystemCode, findLedgerByAliases };
