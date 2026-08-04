/**
 * Phase 2B-B/2C — resolve / optionally create company RCM ledgers.
 * Creation requires explicit confirmCreate=true.
 * Never falls back to ordinary Input/Output GST ledgers.
 */
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { AccountGroup } from '../models/accountGroup.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { PROPOSED_RCM_LEDGERS } from '../config/rcmAccountingDesign.js';

function companyFilter(companyId) {
    if (!companyId) return {};
    try {
        const oid = new mongoose.Types.ObjectId(String(companyId));
        return { companyId: oid };
    } catch {
        return { companyId };
    }
}

export function requiredRcmLedgerNames({ igst = false, cess = false, includeInput = false } = {}) {
    const names = [PROPOSED_RCM_LEDGERS.control.recoverable.name];
    if (igst) {
        names.push(PROPOSED_RCM_LEDGERS.liability.igst.name);
        if (includeInput) names.push(PROPOSED_RCM_LEDGERS.input.igst.name);
    } else {
        names.push(PROPOSED_RCM_LEDGERS.liability.cgst.name);
        names.push(PROPOSED_RCM_LEDGERS.liability.sgst.name);
        if (includeInput) {
            names.push(PROPOSED_RCM_LEDGERS.input.cgst.name);
            names.push(PROPOSED_RCM_LEDGERS.input.sgst.name);
        }
    }
    if (cess) {
        names.push(PROPOSED_RCM_LEDGERS.liability.cess.name);
        if (includeInput) names.push(PROPOSED_RCM_LEDGERS.input.cess.name);
    }
    return names;
}

export async function resolveRcmLedgerMap(companyId, { igst = false, cess = false, includeInput = false } = {}) {
    const allNames = [
        PROPOSED_RCM_LEDGERS.liability.cgst.name,
        PROPOSED_RCM_LEDGERS.liability.sgst.name,
        PROPOSED_RCM_LEDGERS.liability.igst.name,
        PROPOSED_RCM_LEDGERS.liability.cess.name,
        PROPOSED_RCM_LEDGERS.control.recoverable.name,
        PROPOSED_RCM_LEDGERS.input.cgst.name,
        PROPOSED_RCM_LEDGERS.input.sgst.name,
        PROPOSED_RCM_LEDGERS.input.igst.name,
        PROPOSED_RCM_LEDGERS.input.cess.name,
    ];
    const needed = requiredRcmLedgerNames({ igst, cess, includeInput });
    const rows = await AccountLedger.find({
        ...companyFilter(companyId),
        name: { $in: allNames },
    }).lean();

    const byName = Object.fromEntries((rows || []).map((r) => [r.name, r]));
    const missing = needed.filter((n) => !byName[n]);

    for (const banned of PROPOSED_RCM_LEDGERS.doNotUse) {
        if (needed.includes(banned)) {
            throw new ApiError(500, `Invalid RCM ledger design references banned ledger ${banned}`);
        }
    }

    return {
        complete: missing.length === 0,
        missing,
        map: {
            recoverable: byName[PROPOSED_RCM_LEDGERS.control.recoverable.name] || null,
            cgst: byName[PROPOSED_RCM_LEDGERS.liability.cgst.name] || null,
            sgst: byName[PROPOSED_RCM_LEDGERS.liability.sgst.name] || null,
            igst: byName[PROPOSED_RCM_LEDGERS.liability.igst.name] || null,
            cess: byName[PROPOSED_RCM_LEDGERS.liability.cess.name] || null,
            inputCgst: byName[PROPOSED_RCM_LEDGERS.input.cgst.name] || null,
            inputSgst: byName[PROPOSED_RCM_LEDGERS.input.sgst.name] || null,
            inputIgst: byName[PROPOSED_RCM_LEDGERS.input.igst.name] || null,
            inputCess: byName[PROPOSED_RCM_LEDGERS.input.cess.name] || null,
        },
        createInThisCall: false,
    };
}

async function findOrCreateGroup(companyId, { name, parent, nature }, userId, session) {
    let group = await AccountGroup.findOne({ ...companyFilter(companyId), name }).session(session || null);
    if (group) return group;

    let parentId = null;
    if (parent) {
        const p = await AccountGroup.findOne({ ...companyFilter(companyId), name: parent }).session(session || null);
        if (!p) {
            throw new ApiError(
                400,
                `Parent group "${parent}" not found for company. Create chart hierarchy before RCM ledgers.`,
            );
        }
        parentId = p._id;
    }

    const [created] = await AccountGroup.create(
        [
            {
                name,
                nature,
                parentGroup: parentId,
                companyId,
                createdBy: userId || null,
                isActive: true,
            },
        ],
        session ? { session } : undefined,
    );
    return created;
}

/**
 * Explicit admin/owner confirmation required via confirmCreate=true.
 * @param {boolean} [includeInputLedgers] — Phase 2C Input CGST/SGST/IGST under RCM
 */
export async function ensureRcmLedgers({
    companyId,
    userId,
    confirmCreate = false,
    includeOptionalCess = false,
    includeInputLedgers = false,
} = {}) {
    if (!companyId) throw new ApiError(400, 'companyId is required to ensure RCM ledgers');

    const check = await resolveRcmLedgerMap(companyId, {
        igst: true,
        cess: includeOptionalCess,
        includeInput: includeInputLedgers,
    });
    const checkIntra = await resolveRcmLedgerMap(companyId, {
        igst: false,
        cess: includeOptionalCess,
        includeInput: includeInputLedgers,
    });
    const missing = [...new Set([...(check.missing || []), ...(checkIntra.missing || [])])];

    if (missing.length === 0) {
        return {
            created: false,
            alreadyPresent: true,
            message: 'All required RCM ledgers already exist for this company.',
            map: check.map,
            missing: [],
        };
    }

    if (!confirmCreate) {
        return {
            created: false,
            alreadyPresent: false,
            blocked: true,
            message:
                'RCM ledger mapping incomplete. Confirm ledger creation (confirmCreate=true) as authorised admin before posting. Ledgers are not auto-created.',
            missing,
            proposed: PROPOSED_RCM_LEDGERS,
        };
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        for (const g of PROPOSED_RCM_LEDGERS.groups) {
            await findOrCreateGroup(companyId, g, userId, session);
        }

        const ledgerDefs = [
            { ...PROPOSED_RCM_LEDGERS.control.recoverable, drCr: 'Dr' },
            { ...PROPOSED_RCM_LEDGERS.liability.cgst, drCr: 'Cr' },
            { ...PROPOSED_RCM_LEDGERS.liability.sgst, drCr: 'Cr' },
            { ...PROPOSED_RCM_LEDGERS.liability.igst, drCr: 'Cr' },
        ];
        if (includeOptionalCess) {
            ledgerDefs.push({ ...PROPOSED_RCM_LEDGERS.liability.cess, drCr: 'Cr' });
        }
        if (includeInputLedgers) {
            ledgerDefs.push(
                { ...PROPOSED_RCM_LEDGERS.input.cgst, drCr: 'Dr' },
                { ...PROPOSED_RCM_LEDGERS.input.sgst, drCr: 'Dr' },
                { ...PROPOSED_RCM_LEDGERS.input.igst, drCr: 'Dr' },
            );
            if (includeOptionalCess) {
                ledgerDefs.push({ ...PROPOSED_RCM_LEDGERS.input.cess, drCr: 'Dr' });
            }
        }

        for (const def of ledgerDefs) {
            const existing = await AccountLedger.findOne({
                ...companyFilter(companyId),
                name: def.name,
            }).session(session);
            if (existing) continue;

            const group = await AccountGroup.findOne({
                ...companyFilter(companyId),
                name: def.group,
            }).session(session);
            if (!group) {
                throw new ApiError(400, `RCM group "${def.group}" missing after ensure`);
            }

            await AccountLedger.create(
                [
                    {
                        name: def.name,
                        printName: def.name,
                        underGroup: group._id,
                        groupName: group.name,
                        type: 'Tax',
                        gstApplicable: true,
                        companyId,
                        openingBalance: 0,
                        currentBalance: 0,
                        drCr: def.drCr || 'Cr',
                        createdBy: userId || null,
                    },
                ],
                { session },
            );
        }

        await session.commitTransaction();
    } catch (err) {
        await session.abortTransaction().catch(() => {});
        throw err;
    } finally {
        session.endSession();
    }

    const after = await resolveRcmLedgerMap(companyId, {
        igst: false,
        cess: includeOptionalCess,
        includeInput: includeInputLedgers,
    });
    return {
        created: true,
        alreadyPresent: false,
        message: includeInputLedgers
            ? 'RCM liability/control/input ledgers created after authorised confirmation.'
            : 'RCM liability/control ledgers created after authorised confirmation.',
        map: after.map,
        missing: after.missing,
    };
}

export default {
    resolveRcmLedgerMap,
    ensureRcmLedgers,
    requiredRcmLedgerNames,
};
