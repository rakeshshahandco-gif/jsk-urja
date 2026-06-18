import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { TextileJobWorkRate } from '../models/textileJobWorkRate.model.js';
import { WorkflowProductionLot } from '../models/workflowProductionLot.model.js';
import { assertTextileCompany } from './textileProductionLot.service.js';
import {
    TEXTILE_JOB_WORK_PROCESSES,
    TEXTILE_RATE_TYPES,
    TEXTILE_RATE_TYPE_LABELS,
    TEXTILE_PARTY_TYPES,
    calculateLabourCost,
} from '../constants/textileJobWorkRate.constants.js';

export async function assertTextileJobWorkAccess(companyId) {
    return assertTextileCompany(companyId);
}

export async function listTextileJobWorkRates(companyId, query = {}) {
    await assertTextileJobWorkAccess(companyId);
    const filter = { companyId };
    if (query.processName) filter.processName = query.processName;
    if (query.partyType) filter.partyType = query.partyType;
    if (query.isActive === 'true' || query.isActive === 'false') {
        filter.isActive = query.isActive === 'true';
    }
    if (query.search) {
        const re = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ vendorWorker: re }, { processName: re }, { remarks: re }];
    }
    const rates = await TextileJobWorkRate.find(filter)
        .sort({ processName: 1, vendorWorker: 1, effectiveDate: -1 })
        .lean();
    return rates;
}

export async function createTextileJobWorkRate(companyId, body, userId) {
    await assertTextileJobWorkAccess(companyId);
    const doc = await TextileJobWorkRate.create({
        companyId,
        processName: body.processName,
        vendorWorker: String(body.vendorWorker).trim(),
        partyType: body.partyType || 'vendor',
        rateType: body.rateType,
        defaultRate: Number(body.defaultRate),
        effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : new Date(),
        remarks: body.remarks || '',
        isActive: body.isActive !== false,
        fabricRates: Array.isArray(body.fabricRates) ? body.fabricRates : [],
        createdBy: userId,
        updatedBy: userId,
    });
    return doc;
}

export async function updateTextileJobWorkRate(id, companyId, body, userId) {
    await assertTextileJobWorkAccess(companyId);
    const doc = await TextileJobWorkRate.findOne({ _id: id, companyId });
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Job work rate not found');
    const fields = ['processName', 'vendorWorker', 'partyType', 'rateType', 'defaultRate', 'remarks', 'isActive'];
    for (const f of fields) {
        if (body[f] !== undefined) doc[f] = body[f];
    }
    if (body.effectiveDate !== undefined) doc.effectiveDate = new Date(body.effectiveDate);
    if (body.defaultRate !== undefined) doc.defaultRate = Number(body.defaultRate);
    doc.updatedBy = userId;
    await doc.save();
    return doc;
}

export async function deleteTextileJobWorkRate(id, companyId) {
    await assertTextileJobWorkAccess(companyId);
    const doc = await TextileJobWorkRate.findOne({ _id: id, companyId });
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Job work rate not found');
    doc.isActive = false;
    await doc.save();
    return doc;
}

/**
 * Resolve active rate for vendor/worker + process (effective on or before today).
 * fabricType reserved for future fabric-wise rates.
 */
export async function lookupTextileJobWorkRate(companyId, { processName, vendorWorker, fabricType }) {
    await assertTextileJobWorkAccess(companyId);
    if (!processName || !vendorWorker) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'processName and vendorWorker are required');
    }
    const today = new Date();
    const escaped = vendorWorker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rate = await TextileJobWorkRate.findOne({
        companyId,
        processName,
        vendorWorker: new RegExp(`^${escaped}$`, 'i'),
        isActive: true,
        effectiveDate: { $lte: today },
    })
        .sort({ effectiveDate: -1 })
        .lean();

    if (!rate) return null;

    let appliedRate = rate.defaultRate;
    if (fabricType && rate.fabricRates?.length) {
        const fr = rate.fabricRates.find(
            (f) => String(f.fabricType).toLowerCase() === String(fabricType).toLowerCase(),
        );
        if (fr) appliedRate = fr.rate;
    }

    return {
        ...rate,
        appliedRate,
        rateTypeLabel: TEXTILE_RATE_TYPE_LABELS[rate.rateType] || rate.rateType,
        labourCostPreview: null,
    };
}

export function buildLabourCost(quantity, rate, rateType) {
    return calculateLabourCost(quantity, rate, rateType);
}

export async function getVendorRateListReport(companyId) {
    await assertTextileJobWorkAccess(companyId);
    return TextileJobWorkRate.find({ companyId, partyType: 'vendor', isActive: true })
        .sort({ processName: 1, vendorWorker: 1 })
        .lean();
}

export async function getWorkerRateListReport(companyId) {
    await assertTextileJobWorkAccess(companyId);
    return TextileJobWorkRate.find({ companyId, partyType: 'worker', isActive: true })
        .sort({ processName: 1, vendorWorker: 1 })
        .lean();
}

export async function getProcessCostSummaryReport(companyId, { fromDate, toDate } = {}) {
    await assertTextileJobWorkAccess(companyId);
    const lots = await WorkflowProductionLot.find({
        companyId,
        productionModule: 'textile',
    }).lean();

    const rows = [];
    const dateFilter = (d) => {
        if (!d) return true;
        const t = new Date(d).getTime();
        if (fromDate && t < new Date(fromDate).getTime()) return false;
        if (toDate && t > new Date(toDate).getTime()) return false;
        return true;
    };

    for (const lot of lots) {
        const t = lot.textile || {};
        for (const issue of t.dyeingIssues || []) {
            if (!issue.labourCost) continue;
            if (!dateFilter(issue.issuedAt)) continue;
            rows.push({
                lotNo: lot.lotNo,
                source: 'dyeing_issue',
                processName: issue.processName || 'Dyeing',
                vendorWorker: issue.vendorWorker || issue.dyerName || '',
                rateType: issue.rateType || '',
                rateApplied: issue.rateApplied || 0,
                quantity: issue.meterIssued || 0,
                labourCost: issue.labourCost || 0,
                recordedAt: issue.issuedAt,
            });
        }
        for (const entry of t.stageLabourCosts || []) {
            if (!entry.labourCost) continue;
            if (!dateFilter(entry.recordedAt)) continue;
            rows.push({
                lotNo: lot.lotNo,
                source: 'stage_complete',
                processName: entry.processName || '',
                vendorWorker: entry.vendorWorker || '',
                rateType: entry.rateType || '',
                rateApplied: entry.rateApplied || 0,
                quantity: entry.quantity || 0,
                labourCost: entry.labourCost || 0,
                recordedAt: entry.recordedAt,
            });
        }
    }

    const byProcess = {};
    let grandTotal = 0;
    for (const r of rows) {
        grandTotal += Number(r.labourCost) || 0;
        const key = r.processName || 'Other';
        if (!byProcess[key]) byProcess[key] = { processName: key, totalCost: 0, entries: 0 };
        byProcess[key].totalCost += Number(r.labourCost) || 0;
        byProcess[key].entries += 1;
    }

    return {
        rows,
        byProcess: Object.values(byProcess),
        grandTotal: Math.round(grandTotal * 100) / 100,
    };
}

export function getTextileJobWorkMeta() {
    return {
        processes: TEXTILE_JOB_WORK_PROCESSES,
        rateTypes: TEXTILE_RATE_TYPES.map((v) => ({
            value: v,
            label: TEXTILE_RATE_TYPE_LABELS[v] || v,
        })),
        partyTypes: TEXTILE_PARTY_TYPES,
    };
}
