import mongoose from 'mongoose';
import httpStatus from 'http-status';
import { AccountGroup } from '../models/accountGroup.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { TdsMasterSection } from '../models/tdsMasterSection.model.js';
import { ApiError } from '../utils/ApiError.js';
import { suggestedTdsPayableLedgerName } from '../constants/tds.constants.js';
import { ensureTdsMasterDefaults } from './tdsMaster.service.js';

/**
 * Move / ensure "TDS Payable" sits under Duties & Taxes (trial balance hierarchy).
 */
export async function ensureTdsPayableGroupUnderDuties() {
    const duties = await AccountGroup.findOne({ name: 'Duties & Taxes' });
    if (!duties) return null;
    let tdsPay = await AccountGroup.findOne({ name: 'TDS Payable' });
    if (!tdsPay) {
        tdsPay = await AccountGroup.create({
            name: 'TDS Payable',
            nature: 'Liabilities',
            parentGroup: duties._id,
        });
        return tdsPay._id;
    }
    if (String(tdsPay.parentGroup || '') !== String(duties._id)) {
        await AccountGroup.findByIdAndUpdate(tdsPay._id, { parentGroup: duties._id });
    }
    return tdsPay._id;
}

export async function getSuggestedPayableName(sectionCode) {
    await ensureTdsMasterDefaults();
    const code = String(sectionCode || '').trim().toUpperCase();
    const row = await TdsMasterSection.findOne({ sectionCode: code }).select('sectionName').lean();
    const sectionName = row?.sectionName || '';
    return { suggestedName: suggestedTdsPayableLedgerName(code, sectionName), sectionName };
}

async function assertNoOtherPayableForSection(sectionCode, exceptLedgerId) {
    const code = String(sectionCode || '').trim().toUpperCase();
    const q = { isTdsPayableLedger: true, tdsPayableSectionCode: code };
    if (exceptLedgerId) q._id = { $ne: exceptLedgerId };
    const other = await AccountLedger.findOne(q).select('name').lean();
    if (other) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            `This section already has a TDS payable ledger (${other.name}). Map that ledger or remove its section flag first.`,
        );
    }
}

/**
 * Create a new TDS Payable ledger and map it on TdsMasterSection, or map an existing ledger.
 * Enforces at most one isTdsPayableLedger per section (partial unique index).
 */
export async function createOrMapSectionPayableLedger({
    sectionCode,
    ledgerName,
    printName,
    status,
    mapExistingLedgerId,
    userId,
}) {
    await ensureTdsMasterDefaults();
    const code = String(sectionCode || '').trim().toUpperCase();
    if (!code) throw new ApiError(httpStatus.BAD_REQUEST, 'sectionCode is required');

    const master = await TdsMasterSection.findOne({ sectionCode: code });
    if (!master) throw new ApiError(httpStatus.NOT_FOUND, `TDS Master row ${code} not found`);

    const groupId = await ensureTdsPayableGroupUnderDuties();
    if (!groupId) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Could not resolve group Duties & Taxes → TDS Payable. Run Accounting Initialize.',
        );
    }

    if (mapExistingLedgerId) {
        if (!mongoose.Types.ObjectId.isValid(String(mapExistingLedgerId))) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid mapExistingLedgerId');
        }
        const ex = await AccountLedger.findById(mapExistingLedgerId);
        if (!ex) throw new ApiError(httpStatus.NOT_FOUND, 'Ledger not found');

        if (
            ex.isTdsPayableLedger &&
            ex.tdsPayableSectionCode &&
            String(ex.tdsPayableSectionCode).toUpperCase() !== code
        ) {
            throw new ApiError(
                httpStatus.BAD_REQUEST,
                `This ledger is already flagged as TDS payable for section ${ex.tdsPayableSectionCode}.`,
            );
        }
        await assertNoOtherPayableForSection(code, ex._id);

        await AccountLedger.findByIdAndUpdate(ex._id, {
            isTdsPayableLedger: true,
            tdsPayableSectionCode: code,
            type: 'Tax',
            isTaxLedger: true,
            underGroup: groupId,
            groupName: 'TDS Payable',
            ...(status ? { status } : {}),
        });

        const updMaster = await TdsMasterSection.findOneAndUpdate(
            { sectionCode: code },
            { $set: { tdsPayableLedgerId: ex._id, tdsLedgerMapping: ex.name } },
            { new: true },
        )
            .populate('tdsPayableLedgerId', 'name printName status')
            .lean();

        return { master: updMaster, ledger: ex, reused: false, mapped: true };
    }

    const existingForSection = await AccountLedger.findOne({
        isTdsPayableLedger: true,
        tdsPayableSectionCode: code,
    }).lean();
    if (existingForSection) {
        const updMaster = await TdsMasterSection.findOneAndUpdate(
            { sectionCode: code },
            {
                $set: {
                    tdsPayableLedgerId: existingForSection._id,
                    tdsLedgerMapping: existingForSection.name,
                },
            },
            { new: true },
        )
            .populate('tdsPayableLedgerId', 'name printName status')
            .lean();
        return {
            master: updMaster,
            ledger: existingForSection,
            reused: true,
            message: 'A TDS payable ledger for this section already exists — it was linked on TDS Master.',
        };
    }

    const name = String(ledgerName || '').trim();
    if (!name) throw new ApiError(httpStatus.BAD_REQUEST, 'Ledger name is required');

    const nameClash = await AccountLedger.findOne({ name });
    if (nameClash) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            `A ledger named "${name}" already exists. Map it with mapExistingLedgerId or choose another name.`,
        );
    }

    const ledger = await AccountLedger.create({
        name,
        printName: printName != null ? String(printName).trim() : '',
        underGroup: groupId,
        groupName: 'TDS Payable',
        type: 'Tax',
        isTaxLedger: true,
        isTdsPayableLedger: true,
        tdsPayableSectionCode: code,
        status: status === 'Inactive' ? 'Inactive' : 'Active',
        createdBy: userId,
        currentBalance: 0,
        openingBalance: 0,
        drCr: 'Cr',
    });

    const updMaster = await TdsMasterSection.findOneAndUpdate(
        { sectionCode: code },
        { $set: { tdsPayableLedgerId: ledger._id, tdsLedgerMapping: name } },
        { new: true },
    )
        .populate('tdsPayableLedgerId', 'name printName status')
        .lean();

    return { master: updMaster, ledger, created: true };
}

export async function getMasterSectionDetail(sectionCode) {
    await ensureTdsMasterDefaults();
    const code = String(sectionCode || '').trim().toUpperCase();
    const row = await TdsMasterSection.findOne({ sectionCode: code })
        .populate('tdsPayableLedgerId', 'name printName status isTdsPayableLedger tdsPayableSectionCode')
        .lean();
    if (!row) return null;
    return row;
}
