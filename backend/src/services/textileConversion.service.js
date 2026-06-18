import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { TextileConversionMaster } from '../models/textileConversionMaster.model.js';
import { TextileTransformationEntry } from '../models/textileTransformationEntry.model.js';
import { Item } from '../models/item.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { recalculateStockLedger, rollbackStockLedger } from '../utils/stockUtils.js';
import { assertTextileCompany } from './textileProductionLot.service.js';
import {
    TEXTILE_TRANSFORMATION_PROCESSES,
    TEXTILE_CONVERSION_UOMS,
    TEXTILE_FORMULA_TYPES,
    TEXTILE_FORMULA_TYPE_LABELS,
    calculateTransformationOutput,
    formatConversionFormula,
} from '../constants/textileConversion.constants.js';

export async function assertTextileConversionAccess(companyId) {
    return assertTextileCompany(companyId);
}

export function getTextileConversionMeta() {
    return {
        processes: TEXTILE_TRANSFORMATION_PROCESSES,
        uoms: TEXTILE_CONVERSION_UOMS,
        formulaTypes: TEXTILE_FORMULA_TYPES,
        formulaTypeLabels: TEXTILE_FORMULA_TYPE_LABELS,
    };
}

async function generateReferenceNo(companyId, session) {
    const y = new Date().getFullYear();
    const prefix = `TT-${y}-`;
    const last = await TextileTransformationEntry.findOne({
        companyId,
        referenceNo: new RegExp(`^${prefix}`),
    })
        .sort({ referenceNo: -1 })
        .session(session)
        .lean();
    let seq = 1;
    if (last?.referenceNo) {
        const part = last.referenceNo.split('-').pop();
        const n = parseInt(part, 10);
        if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(5, '0')}`;
}

async function assertItemBelongsToCompany(itemId, companyId, session) {
    const item = await Item.findById(itemId).session(session);
    if (!item) throw new ApiError(httpStatus.NOT_FOUND, 'Item not found');
    if (String(item.companyId) !== String(companyId)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Item does not belong to this company');
    }
    return item;
}

function buildMasterPayload(body, userId, isUpdate = false) {
    const formulaType = body.formulaType || 'RATIO';
    const inputQtyPerOutput = formulaType === 'RATIO' ? Number(body.inputQtyPerOutput) || 0 : 0;
    const conversionFormula = formatConversionFormula({
        formulaType,
        inputQtyPerOutput,
        inputUom: body.inputUom,
        outputUom: body.outputUom,
    });
    const payload = {
        conversionName: String(body.conversionName).trim(),
        inputItemId: body.inputItemId,
        inputUom: body.inputUom,
        outputItemId: body.outputItemId,
        outputUom: body.outputUom,
        formulaType,
        inputQtyPerOutput,
        conversionFormula,
        expectedOutputQty: Number(body.expectedOutputQty) || 0,
        expectedLossPercent: Number(body.expectedLossPercent) || 0,
        remarks: body.remarks || '',
        isActive: body.isActive !== false,
        updatedBy: userId,
    };
    if (!isUpdate) payload.createdBy = userId;
    return payload;
}

// ── Conversion Master CRUD ───────────────────────────────────────────────────

export async function listConversionMasters(companyId, query = {}) {
    await assertTextileConversionAccess(companyId);
    const filter = { companyId };
    if (query.isActive === 'true' || query.isActive === 'false') {
        filter.isActive = query.isActive === 'true';
    }
    if (query.inputItemId) filter.inputItemId = query.inputItemId;
    if (query.outputItemId) filter.outputItemId = query.outputItemId;
    if (query.search) {
        const re = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ conversionName: re }, { conversionFormula: re }, { remarks: re }];
    }
    return TextileConversionMaster.find(filter)
        .populate('inputItemId', 'itemCode itemName uom currentStock')
        .populate('outputItemId', 'itemCode itemName uom currentStock')
        .sort({ conversionName: 1 })
        .lean();
}

export async function getConversionMaster(id, companyId) {
    await assertTextileConversionAccess(companyId);
    const doc = await TextileConversionMaster.findOne({ _id: id, companyId })
        .populate('inputItemId', 'itemCode itemName uom currentStock')
        .populate('outputItemId', 'itemCode itemName uom currentStock')
        .lean();
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Conversion master not found');
    return doc;
}

export async function createConversionMaster(companyId, body, userId) {
    await assertTextileConversionAccess(companyId);
    await assertItemBelongsToCompany(body.inputItemId, companyId);
    await assertItemBelongsToCompany(body.outputItemId, companyId);
    if (body.formulaType === 'RATIO' && !(Number(body.inputQtyPerOutput) > 0)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Input qty per output is required for ratio formula');
    }
    return TextileConversionMaster.create({
        companyId,
        ...buildMasterPayload(body, userId),
    });
}

export async function updateConversionMaster(id, companyId, body, userId) {
    await assertTextileConversionAccess(companyId);
    const doc = await TextileConversionMaster.findOne({ _id: id, companyId });
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Conversion master not found');
    if (body.inputItemId) await assertItemBelongsToCompany(body.inputItemId, companyId);
    if (body.outputItemId) await assertItemBelongsToCompany(body.outputItemId, companyId);
    const merged = {
        conversionName: body.conversionName ?? doc.conversionName,
        inputUom: body.inputUom ?? doc.inputUom,
        outputUom: body.outputUom ?? doc.outputUom,
        formulaType: body.formulaType ?? doc.formulaType,
        inputQtyPerOutput: body.inputQtyPerOutput ?? doc.inputQtyPerOutput,
        expectedOutputQty: body.expectedOutputQty ?? doc.expectedOutputQty,
        expectedLossPercent: body.expectedLossPercent ?? doc.expectedLossPercent,
        remarks: body.remarks ?? doc.remarks,
        isActive: body.isActive !== undefined ? body.isActive : doc.isActive,
    };
    if (body.inputItemId) doc.inputItemId = body.inputItemId;
    if (body.outputItemId) doc.outputItemId = body.outputItemId;
    Object.assign(doc, buildMasterPayload(merged, userId, true));
    await doc.save();
    return doc;
}

export async function deactivateConversionMaster(id, companyId) {
    await assertTextileConversionAccess(companyId);
    const doc = await TextileConversionMaster.findOne({ _id: id, companyId });
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Conversion master not found');
    doc.isActive = false;
    await doc.save();
    return doc;
}

// ── Preview calculation ──────────────────────────────────────────────────────

export async function previewTransformation(companyId, body) {
    await assertTextileConversionAccess(companyId);
    const inputQty = Number(body.inputQty) || 0;
    let master = null;
    if (body.conversionMasterId) {
        master = await TextileConversionMaster.findOne({
            _id: body.conversionMasterId,
            companyId,
            isActive: true,
        }).lean();
        if (!master) throw new ApiError(httpStatus.NOT_FOUND, 'Conversion master not found');
    }
    const formulaType = master?.formulaType || body.formulaType || 'VARIABLE';
    const calc = calculateTransformationOutput({
        formulaType,
        inputQtyPerOutput: master?.inputQtyPerOutput ?? body.inputQtyPerOutput,
        expectedLossPercent: master?.expectedLossPercent,
        inputQty,
        outputQtyOverride: body.outputQty,
    });
    return {
        inputQty,
        ...calc,
        formulaType,
        conversionFormula: master?.conversionFormula || formatConversionFormula({
            formulaType,
            inputQtyPerOutput: master?.inputQtyPerOutput ?? body.inputQtyPerOutput,
            inputUom: master?.inputUom || body.inputUom,
            outputUom: master?.outputUom || body.outputUom,
        }),
    };
}

// ── Transformation Entry + Stock ─────────────────────────────────────────────

async function postTransformationStock(entry, inputItem, outputItem, userId, session) {
    const date = entry.date || new Date();
    const refNo = entry.referenceNo;
    const refId = entry._id;
    const fy = entry.financialYear || '';

    if (entry.inputQty > 0) {
        const available = Number(inputItem.currentStock) || 0;
        if (available < entry.inputQty) {
            throw new ApiError(
                httpStatus.BAD_REQUEST,
                `Insufficient stock for ${inputItem.itemCode}. Available: ${available}, required: ${entry.inputQty}`,
            );
        }
        await StockLedger.create([{
            date,
            itemId: entry.inputItemId,
            itemCode: inputItem.itemCode,
            itemName: inputItem.itemName,
            transactionType: 'TEXTILE_TRANSFORMATION',
            referenceNo: refNo,
            referenceId: refId,
            inQty: 0,
            outQty: Number(entry.inputQty),
            uom: entry.inputUom,
            remarks: `Textile transformation OUT — ${entry.process} → ${outputItem.itemCode}`,
            financialYear: fy,
            createdBy: userId,
        }], { session });
    }

    if (entry.outputQty > 0) {
        await StockLedger.create([{
            date,
            itemId: entry.outputItemId,
            itemCode: outputItem.itemCode,
            itemName: outputItem.itemName,
            transactionType: 'TEXTILE_TRANSFORMATION',
            referenceNo: refNo,
            referenceId: refId,
            inQty: Number(entry.outputQty),
            outQty: 0,
            uom: entry.outputUom,
            remarks: `Textile transformation IN — ${entry.process} ← ${inputItem.itemCode}`,
            financialYear: fy,
            createdBy: userId,
        }], { session });
    }

    await recalculateStockLedger(entry.inputItemId, session);
    if (String(entry.outputItemId) !== String(entry.inputItemId)) {
        await recalculateStockLedger(entry.outputItemId, session);
    }
}

export async function listTransformations(companyId, query = {}) {
    await assertTextileConversionAccess(companyId);
    const filter = { companyId };
    if (query.status) filter.status = query.status;
    if (query.process) filter.process = query.process;
    if (query.lotNo) filter['traceability.lotNo'] = new RegExp(query.lotNo, 'i');
    if (query.fromDate || query.toDate) {
        filter.date = {};
        if (query.fromDate) filter.date.$gte = new Date(query.fromDate);
        if (query.toDate) filter.date.$lte = new Date(query.toDate);
    }
    if (query.search) {
        const re = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [
            { referenceNo: re },
            { remarks: re },
            { 'traceability.lotNo': re },
            { 'traceability.rollNo': re },
            { 'traceability.barcode': re },
        ];
    }
    return TextileTransformationEntry.find(filter)
        .populate('inputItemId', 'itemCode itemName uom')
        .populate('outputItemId', 'itemCode itemName uom')
        .populate('conversionMasterId', 'conversionName conversionFormula')
        .populate('productionLotId', 'lotNo')
        .sort({ date: -1, createdAt: -1 })
        .lean();
}

export async function getTransformation(id, companyId) {
    await assertTextileConversionAccess(companyId);
    const doc = await TextileTransformationEntry.findOne({ _id: id, companyId })
        .populate('inputItemId', 'itemCode itemName uom currentStock')
        .populate('outputItemId', 'itemCode itemName uom currentStock')
        .populate('conversionMasterId')
        .populate('productionLotId', 'lotNo')
        .lean();
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Transformation entry not found');
    return doc;
}

export async function createTransformation(companyId, body, userId) {
    await assertTextileConversionAccess(companyId);

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const inputItem = await assertItemBelongsToCompany(body.inputItemId, companyId, session);
        const outputItem = await assertItemBelongsToCompany(body.outputItemId, companyId, session);

        let master = null;
        if (body.conversionMasterId) {
            master = await TextileConversionMaster.findOne({
                _id: body.conversionMasterId,
                companyId,
                isActive: true,
            }).session(session).lean();
            if (!master) throw new ApiError(httpStatus.NOT_FOUND, 'Conversion master not found');
        }

        const inputQty = Number(body.inputQty);
        if (!(inputQty > 0)) throw new ApiError(httpStatus.BAD_REQUEST, 'Input quantity must be greater than zero');

        const preview = calculateTransformationOutput({
            formulaType: master?.formulaType || 'VARIABLE',
            inputQtyPerOutput: master?.inputQtyPerOutput,
            expectedLossPercent: master?.expectedLossPercent,
            inputQty,
            outputQtyOverride: body.outputQty,
        });

        let outputQty = body.outputQty != null ? Number(body.outputQty) : preview.outputQty;
        if (!(outputQty >= 0)) throw new ApiError(httpStatus.BAD_REQUEST, 'Output quantity is required');

        let lossQty = body.lossQty != null ? Number(body.lossQty) : (preview.lossQty ?? 0);
        let lossPercent = body.lossPercent != null ? Number(body.lossPercent) : (preview.lossPercent ?? 0);

        if (body.inputUom === body.outputUom && lossQty === 0 && inputQty > outputQty) {
            lossQty = inputQty - outputQty;
            lossPercent = inputQty > 0 ? Math.round((lossQty / inputQty) * 10000) / 100 : 0;
        }

        const referenceNo = await generateReferenceNo(companyId, session);

        const [entry] = await TextileTransformationEntry.create([{
            companyId,
            referenceNo,
            date: body.date ? new Date(body.date) : new Date(),
            process: body.process,
            inputItemId: body.inputItemId,
            inputQty,
            inputUom: body.inputUom || master?.inputUom || inputItem.uom || 'Meter',
            outputItemId: body.outputItemId,
            outputQty,
            outputUom: body.outputUom || master?.outputUom || outputItem.uom || 'PCS',
            conversionMasterId: body.conversionMasterId || null,
            lossQty,
            lossPercent,
            remarks: body.remarks || '',
            traceability: {
                lotNo: body.traceability?.lotNo || '',
                rollNo: body.traceability?.rollNo || '',
                barcode: body.traceability?.barcode || '',
                vendor: body.traceability?.vendor || '',
                worker: body.traceability?.worker || '',
            },
            productionLotId: body.productionLotId || null,
            financialYear: body.financialYear || '',
            status: 'ACTIVE',
            stockPosted: false,
            createdBy: userId,
            updatedBy: userId,
        }], { session });

        await postTransformationStock(entry, inputItem, outputItem, userId, session);
        entry.stockPosted = true;
        await entry.save({ session });

        await session.commitTransaction();
        return getTransformation(entry._id, companyId);
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
}

export async function cancelTransformation(id, companyId, userId) {
    await assertTextileConversionAccess(companyId);

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const entry = await TextileTransformationEntry.findOne({ _id: id, companyId }).session(session);
        if (!entry) throw new ApiError(httpStatus.NOT_FOUND, 'Transformation entry not found');
        if (entry.status === 'CANCELLED') {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Transformation already cancelled');
        }

        if (entry.stockPosted) {
            await rollbackStockLedger(entry._id, session);
        }

        entry.status = 'CANCELLED';
        entry.stockPosted = false;
        entry.updatedBy = userId;
        await entry.save({ session });

        await session.commitTransaction();
        return getTransformation(entry._id, companyId);
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
}

/** MRP-ready: item transformation chain summary (input → output edges). */
export async function getTransformationChainReport(companyId) {
    await assertTextileConversionAccess(companyId);
    const masters = await TextileConversionMaster.find({ companyId, isActive: true })
        .populate('inputItemId', 'itemCode itemName uom')
        .populate('outputItemId', 'itemCode itemName uom')
        .lean();
    return masters.map((m) => ({
        conversionName: m.conversionName,
        input: m.inputItemId,
        output: m.outputItemId,
        inputUom: m.inputUom,
        outputUom: m.outputUom,
        formula: m.conversionFormula,
        formulaType: m.formulaType,
        inputQtyPerOutput: m.inputQtyPerOutput,
        expectedLossPercent: m.expectedLossPercent,
    }));
}
