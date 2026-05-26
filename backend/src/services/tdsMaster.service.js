import { TdsMasterSection } from '../models/tdsMasterSection.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { TDS_MASTER_DEFAULTS } from '../constants/tds.constants.js';
import { ApiError } from '../utils/ApiError.js';
import httpStatus from 'http-status';

function mapDefaultRow(r) {
    return {
        sectionCode: r.sectionCode,
        sectionName: r.sectionName || r.description || '',
        description: r.description || '',
        defaultRate: r.defaultRate ?? r.rateIndividualHuf ?? 0,
        rateIndividualHuf: r.rateIndividualHuf ?? r.defaultRate ?? 0,
        rateOthers: r.rateOthers ?? r.defaultRate ?? 0,
        rateTechnicalServices: r.rateTechnicalServices ?? 0,
        singleBillThreshold: r.singleBillThreshold ?? 0,
        thresholdAmount: r.thresholdAmount ?? 0,
        thresholdCalculationMethod: r.thresholdCalculationMethod || 'AggregateFY',
        calculationType: r.calculationType || 'YearlyCumulative',
        natureOfPayment: r.natureOfPayment || '',
        panMandatory: Boolean(r.panMandatory),
        panMissingRate: r.panMissingRate ?? 20,
        autoDeductTds: r.autoDeductTds !== false,
        thresholdDeductMode: r.thresholdDeductMode || 'FullAfterCrossing',
        isActive: true,
    };
}

export async function ensureTdsMasterDefaults() {
    if (!TDS_MASTER_DEFAULTS.length) return;
    /** Single round-trip: avoids N sequential upserts on every preview (was a common 10s+ timeout cause on slow DB). */
    const ops = TDS_MASTER_DEFAULTS.map((r) => {
        const payload = mapDefaultRow(r);
        return {
            updateOne: {
                filter: { sectionCode: payload.sectionCode },
                update: { $setOnInsert: payload },
                upsert: true,
            },
        };
    });
    await TdsMasterSection.bulkWrite(ops, { ordered: false });
}

export async function listMasterSections() {
    await ensureTdsMasterDefaults();
    return TdsMasterSection.find()
        .sort({ sectionCode: 1 })
        .populate({
            path: 'tdsPayableLedgerId',
            select: 'name printName status isTdsPayableLedger tdsPayableSectionCode',
        })
        .lean();
}

export async function updateMasterSection(sectionCode, body, userId) {
    const code = String(sectionCode || '').trim().toUpperCase();
    await ensureTdsMasterDefaults();
    const patch = {};
    const fields = [
        'description',
        'sectionName',
        'defaultRate',
        'rateIndividualHuf',
        'rateOthers',
        'rateTechnicalServices',
        'singleBillThreshold',
        'thresholdAmount',
        'thresholdCalculationMethod',
        'calculationType',
        'natureOfPayment',
        'tdsLedgerMapping',
        'panMandatory',
        'panMissingRate',
        'lowerDeductionCertificateAllowed',
        'thresholdDeductMode',
        'autoDeductTds',
        'isActive',
        'remarks',
    ];
    if (body.applicableFinancialYears != null) patch.applicableFinancialYears = body.applicableFinancialYears;
    for (const f of fields) {
        if (body[f] != null) patch[f] = body[f];
    }
    if (Object.prototype.hasOwnProperty.call(body, 'tdsPayableLedgerId')) {
        const lid = body.tdsPayableLedgerId;
        if (lid == null || lid === '') {
            patch.tdsPayableLedgerId = null;
        } else {
            const L = await AccountLedger.findById(lid).select('_id name').lean();
            if (!L) throw new ApiError(httpStatus.BAD_REQUEST, 'TDS Payable ledger not found.');
            patch.tdsPayableLedgerId = L._id;
            if (body.tdsLedgerMapping == null) patch.tdsLedgerMapping = L.name;
        }
    }
    if (body.applicableLedgerGroups != null) patch.applicableLedgerGroups = body.applicableLedgerGroups;
    if (body.effectiveFrom != null) patch.effectiveFrom = body.effectiveFrom ? new Date(body.effectiveFrom) : null;
    if (body.effectiveTo != null) patch.effectiveTo = body.effectiveTo ? new Date(body.effectiveTo) : null;

    const doc = await TdsMasterSection.findOneAndUpdate(
        { sectionCode: code },
        { $set: patch },
        { new: true, runValidators: true },
    ).lean();

    if (userId) {
        const { logTdsAudit } = await import('./tdsThreshold.service.js');
        await logTdsAudit({
            action: 'MASTER_SECTION_UPDATE',
            section: code,
            userId,
            details: patch,
        });
    }
    if (!doc) return null;
    return TdsMasterSection.findById(doc._id)
        .populate({
            path: 'tdsPayableLedgerId',
            select: 'name printName status isTdsPayableLedger tdsPayableSectionCode',
        })
        .lean();
}

export async function getMasterSectionOrDefaults(sectionCode) {
    await ensureTdsMasterDefaults();
    const code = String(sectionCode || '').trim().toUpperCase();
    if (!code) return null;

    const doc = await TdsMasterSection.findOne({ sectionCode: code }).lean();
    if (doc && doc.isActive === false) {
        throw new ApiError(httpStatus.BAD_REQUEST, `TDS Master ${code} missing or inactive.`);
    }
    if (doc && doc.isActive !== false) {
        return doc;
    }

    const d = TDS_MASTER_DEFAULTS.find((x) => x.sectionCode === code);
    if (!d) {
        throw new ApiError(httpStatus.BAD_REQUEST, `TDS Master ${code} missing or inactive.`);
    }
    return { ...mapDefaultRow(d), sectionCode: code };
}
