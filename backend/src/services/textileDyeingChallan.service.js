import httpStatus from 'http-status';
import mongoose from 'mongoose';
import bwipjs from 'bwip-js';
import { ApiError } from '../utils/ApiError.js';
import { TextileDyeingChallan } from '../models/textileDyeingChallan.model.js';
import { Item } from '../models/item.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { recalculateStockLedger } from '../utils/stockUtils.js';
import { getFYFromDate } from '../utils/fyUtils.js';
import { assertTextileCompany } from './textileProductionLot.service.js';
import {
    buildChallanBarcodeValue,
    parseChallanBarcodeValue,
    TEXTILE_DYEING_COLOUR_INSTRUCTIONS,
    TEXTILE_DYEING_COLOUR_LABELS,
    TEXTILE_DYEING_CHALLAN_STATUS,
    TEXTILE_DYEING_RETURN_UOMS,
    TEXTILE_DYEING_PCS_ROUND_MODES,
    TEXTILE_DYEING_PCS_ROUND_LABELS,
    TEXTILE_DYEING_LABOUR_RATE_TYPES,
    TEXTILE_DYEING_LABOUR_RATE_LABELS,
    calculateLineExpectedPcs,
    calculateLineLabour,
} from '../constants/textileDyeingChallan.constants.js';
import {
    normalizeProcessType,
    getChallanNoPrefix,
    buildProcessBarcodeValue,
    parseProcessBarcodeValue,
    PROCESS_VENDOR_WAREHOUSE,
    TEXTILE_JOB_WORK_PROCESS_TYPES,
} from '../constants/textileJobWorkChallan.constants.js';
import { lookupTextileJobWorkRate } from './textileJobWorkRate.service.js';

async function assertAccess(companyId) {
    return assertTextileCompany(companyId);
}

function resolveProcessType(value, fallback = 'Dyeing') {
    return normalizeProcessType(value, fallback);
}

function stockTransactionTypes(processType) {
    if (resolveProcessType(processType) === 'Dyeing') {
        return { issue: 'TEXTILE_DYEING_ISSUE', ret: 'TEXTILE_DYEING_RETURN' };
    }
    return { issue: 'TEXTILE_JOB_WORK_ISSUE', ret: 'TEXTILE_JOB_WORK_RETURN' };
}

function returnNoPrefix(processType) {
    const map = {
        Dyeing: 'DR',
        Embroidery: 'ER',
        Printing: 'PR',
        Washing: 'WR',
        Pressing: 'PPR',
        Finishing: 'FR',
        Stitching: 'SR',
        Packing: 'PKR',
    };
    return map[resolveProcessType(processType)] || 'JR';
}

function resolveIssuedQuantities(ln) {
    const issuedUom = String(ln.issuedUom || 'Meter').trim() || 'Meter';
    let issuedMeter = Number(ln.issuedMeter) || 0;
    let issuedQty = Number(ln.issuedQty) || 0;
    const mpp = Number(ln.meterPerPcs) || 0;

    if (issuedUom.toUpperCase() === 'PCS' && issuedQty > 0) {
        if (mpp > 0) issuedMeter = Math.round(issuedQty * mpp * 1000) / 1000;
        else if (!issuedMeter) issuedMeter = issuedQty;
    } else if (issuedMeter > 0) {
        issuedQty = mpp > 0 ? Math.round((issuedMeter / mpp) * 1000) / 1000 : issuedMeter;
    } else if (issuedQty > 0) {
        issuedMeter = issuedQty;
    }

    if (issuedMeter <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Issued quantity must be greater than zero');
    return { issuedMeter, issuedQty: issuedQty || issuedMeter, issuedUom };
}

async function generateChallanNo(companyId, issueDate, processType = 'Dyeing') {
    const pt = resolveProcessType(processType);
    const fy = getFYFromDate(issueDate || new Date());
    const prefix = getChallanNoPrefix(pt, fy);
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const last = await TextileDyeingChallan.findOne({ companyId, challanNo: new RegExp(`^${escaped}`) })
        .sort({ challanNo: -1 })
        .lean();
    let next = 1;
    if (last?.challanNo) {
        const n = parseInt(String(last.challanNo).split('-').pop(), 10);
        if (!Number.isNaN(n)) next = n + 1;
    }
    return `${prefix}${String(next).padStart(5, '0')}`;
}

function recomputeChallanTotals(challan) {
    let issued = 0;
    let returned = 0;
    let loss = 0;
    let expPcs = 0;
    let expRet = 0;
    let expLoss = 0;
    let labour = 0;
    for (const line of challan.lines || []) {
        issued += Number(line.issuedMeter) || 0;
        returned += Number(line.returnedMeter) || 0;
        loss += Number(line.lossMeter) || 0;
        expPcs += Number(line.expectedPcs) || 0;
        expRet += Number(line.expectedReturnMeter) || 0;
        expLoss += Number(line.expectedLossMeter) || 0;
        labour += Number(line.labourAmount) || 0;
        line.pendingMeter = Math.max(0, (Number(line.issuedMeter) || 0) - (Number(line.returnedMeter) || 0));
    }
    challan.totalIssuedMeter = Math.round(issued * 1000) / 1000;
    challan.totalExpectedPcs = Math.round(expPcs * 1000) / 1000;
    challan.totalExpectedReturnMeter = Math.round(expRet * 1000) / 1000;
    challan.totalExpectedLossMeter = Math.round(expLoss * 1000) / 1000;
    challan.totalLabourAmount = Math.round(labour * 100) / 100;
    challan.totalReturnedMeter = Math.round(returned * 1000) / 1000;
    challan.totalLossMeter = Math.round(loss * 1000) / 1000;
    challan.totalPendingMeter = Math.max(0, Math.round((issued - returned) * 1000) / 1000);

    if (challan.status !== 'Cancelled') {
        if (challan.totalPendingMeter <= 0 && challan.totalReturnedMeter > 0) challan.status = 'Closed';
        else if (challan.totalReturnedMeter > 0) challan.status = 'Partial Return';
        else challan.status = 'Issued';
    }
}

async function buildChallanLine(ln, lineNo, vendorName, companyId, session, processType = 'Dyeing') {
    const pt = resolveProcessType(processType);
    const item = await Item.findById(ln.fabricItemId).session(session);
    if (!item) throw new ApiError(httpStatus.BAD_REQUEST, `Line ${lineNo}: input item not found`);

    let outItemName = ln.expectedOutputItemName || '';
    if (ln.expectedOutputItemId) {
        const outItem = await Item.findById(ln.expectedOutputItemId).session(session);
        outItemName = outItem?.itemName || outItemName;
    }

    const { issuedMeter, issuedQty, issuedUom } = resolveIssuedQuantities(ln);
    let labourRateType = ln.labourRateType || '';
    let labourRate = Number(ln.labourRate) || 0;

    if ((!labourRateType || !labourRate) && vendorName) {
        const master = await lookupTextileJobWorkRate(companyId, {
            processName: pt,
            vendorWorker: vendorName,
            fabricType: ln.fabricType || item.itemType || '',
        });
        if (master) {
            labourRateType = labourRateType || master.rateType;
            labourRate = labourRate || Number(master.appliedRate ?? master.defaultRate) || 0;
        }
    }

    const pcs = calculateLineExpectedPcs({
        issuedMeter,
        meterPerPcs: ln.meterPerPcs,
        pcsRoundMode: ln.pcsRoundMode || 'ROUND_DOWN',
        expectedLossPercent: ln.expectedLossPercent,
    });

    const labour = calculateLineLabour({
        issuedMeter,
        expectedPcs: pcs.expectedPcs,
        rateType: labourRateType,
        rate: labourRate,
        thanCount: ln.thanNo ? 1 : 1,
    });

    return {
        lineNo,
        lotNo: ln.lotNo || '',
        thanNo: ln.thanNo || '',
        fabricItemId: item._id,
        fabricItemName: item.itemName || '',
        fabricType: ln.fabricType || item.itemType || '',
        colourInstructionType: ln.colourInstructionType || 'FIXED_COLOUR',
        colourName: ln.colourName || '',
        designPattern: ln.designPattern || ln.colourName || '',
        issuedQty,
        issuedUom,
        issuedMeter,
        meterPerPcs: Number(ln.meterPerPcs) || 0,
        pcsRoundMode: ln.pcsRoundMode || 'ROUND_DOWN',
        expectedLossPercent: Number(ln.expectedLossPercent) || 0,
        expectedPcs: pcs.expectedPcs,
        expectedReturnMeter: pcs.expectedReturnMeter,
        expectedLossMeter: pcs.expectedLossMeter,
        labourProcessName: ln.labourProcessName || pt,
        labourRateType: labourRateType || '',
        labourRate,
        labourQtyBasis: labour.labourQtyBasis,
        labourAmount: labour.labourAmount,
        expectedOutputItemId: ln.expectedOutputItemId || null,
        expectedOutputItemName: outItemName,
        expectedOutputUom: ln.expectedOutputUom || 'Meter',
        pendingMeter: issuedMeter,
        remarks: ln.remarks || '',
    };
}

async function postIssueStock(challan, userId, session) {
    const pt = resolveProcessType(challan.processType);
    const tx = stockTransactionTypes(pt);
    const vendorWarehouse = PROCESS_VENDOR_WAREHOUSE[pt] || `Stock With ${pt} Vendor`;
    const grouped = {};
    for (const line of challan.lines) {
        const id = String(line.fabricItemId);
        grouped[id] = (grouped[id] || 0) + Number(line.issuedMeter);
    }
    for (const [itemId, qty] of Object.entries(grouped)) {
        const item = await Item.findById(itemId).session(session);
        if (!item) throw new ApiError(httpStatus.BAD_REQUEST, 'Input item not found');
        const oldStock = Number(item.currentStock) || 0;
        if (oldStock < qty) {
            throw new ApiError(httpStatus.BAD_REQUEST, `Insufficient stock for ${item.itemCode || item.itemName}. Available: ${oldStock}, required: ${qty}`);
        }
        const newStock = Math.round((oldStock - qty) * 1000) / 1000;
        await StockLedger.create([{
            date: challan.issueDate,
            itemId: item._id,
            itemCode: item.itemCode,
            itemName: item.itemName,
            transactionType: tx.issue,
            referenceNo: challan.challanNo,
            referenceId: challan._id,
            outQty: qty,
            inQty: 0,
            uom: item.uom || 'Meter',
            warehouse: 'Available Fabric',
            partyName: challan.dyerName,
            remarks: `${pt} challan issue to ${challan.dyerName} (${vendorWarehouse})`,
            financialYear: challan.financialYear,
            runningStock: newStock,
            createdBy: userId,
        }], { session });
        item.currentStock = newStock;
        await item.save({ session });
    }
}

async function postReturnStock(challan, returnEntry, userId, session) {
    const pt = resolveProcessType(challan.processType);
    const tx = stockTransactionTypes(pt);
    for (const rl of returnEntry.lines) {
        if (!rl.outputItemId || !rl.returnedQty) continue;
        const item = await Item.findById(rl.outputItemId).session(session);
        if (!item) throw new ApiError(httpStatus.BAD_REQUEST, 'Output item not found for return');
        await StockLedger.create([{
            date: returnEntry.returnDate,
            itemId: item._id,
            itemCode: item.itemCode,
            itemName: item.itemName,
            transactionType: tx.ret,
            referenceNo: `${challan.challanNo}/${returnEntry.returnNo}`,
            referenceId: challan._id,
            inQty: Number(rl.returnedQty),
            outQty: 0,
            uom: rl.returnUom || item.uom || 'Meter',
            warehouse: 'Available Fabric',
            partyName: challan.dyerName,
            remarks: `${pt} return from ${challan.dyerName} - ${rl.colourName || rl.designPattern || 'material'}`,
            financialYear: challan.financialYear,
            createdBy: userId,
        }], { session });
        await recalculateStockLedger(item._id, session);
    }
}

export function getMeta(processType = 'Dyeing') {
    const pt = resolveProcessType(processType);
    return {
        processType: pt,
        processTypes: TEXTILE_JOB_WORK_PROCESS_TYPES,
        vendorLabel: pt === 'Dyeing' ? 'Dyer Name' : `${pt} Vendor`,
        stockWithVendorLabel: PROCESS_VENDOR_WAREHOUSE[pt] || `Stock With ${pt} Vendor`,
        showColourFields: pt === 'Dyeing',
        showDesignField: pt !== 'Dyeing',
        designLabel: pt === 'Embroidery' ? 'Embroidery Design / Pattern' : `${pt} Design / Pattern`,
        colourInstructions: TEXTILE_DYEING_COLOUR_INSTRUCTIONS.map((v) => ({
            value: v,
            label: TEXTILE_DYEING_COLOUR_LABELS[v] || v,
        })),
        statuses: TEXTILE_DYEING_CHALLAN_STATUS,
        returnUoms: TEXTILE_DYEING_RETURN_UOMS,
        pcsRoundModes: TEXTILE_DYEING_PCS_ROUND_MODES.map((v) => ({
            value: v,
            label: TEXTILE_DYEING_PCS_ROUND_LABELS[v] || v,
        })),
        labourRateTypes: TEXTILE_DYEING_LABOUR_RATE_TYPES.map((v) => ({
            value: v,
            label: TEXTILE_DYEING_LABOUR_RATE_LABELS[v] || v,
        })),
        defaultPcsRoundMode: 'ROUND_DOWN',
        defaultLabourProcess: pt,
    };
}

export async function listChallans(companyId, query = {}) {
    await assertAccess(companyId);
    const filter = { companyId };
    const pt = query.processType ? resolveProcessType(query.processType) : null;
    if (pt) {
        filter.processType = pt;
    } else {
        filter.$or = [{ processType: 'Dyeing' }, { processType: { $exists: false } }];
    }
    if (query.status) filter.status = query.status;
    if (query.dyerName) filter.dyerName = new RegExp(query.dyerName, 'i');
    if (query.search) {
        const re = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$and = [
            ...(filter.$or ? [{ $or: filter.$or }] : []),
            { $or: [{ challanNo: re }, { dyerName: re }, { barcodeValue: re }] },
        ];
        delete filter.$or;
    }
    if (query.pendingOnly === 'true') filter.totalPendingMeter = { $gt: 0 };
    return TextileDyeingChallan.find(filter)
        .sort({ issueDate: -1, createdAt: -1 })
        .populate('lines.fabricItemId', 'itemCode itemName uom')
        .lean();
}

export async function getChallan(id, companyId, processType) {
    await assertAccess(companyId);
    const filter = { _id: id, companyId };
    if (processType) filter.processType = resolveProcessType(processType);
    const doc = await TextileDyeingChallan.findOne(filter)
        .populate('lines.fabricItemId', 'itemCode itemName uom currentStock')
        .populate('lines.expectedOutputItemId', 'itemCode itemName uom')
        .populate('returns.returnedBy', 'name')
        .lean();
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, `${resolveProcessType(processType)} challan not found`);
    return doc;
}

export async function lookupByBarcode(companyId, barcodeOrChallanNo, processType) {
    await assertAccess(companyId);
    const parsed = parseProcessBarcodeValue(barcodeOrChallanNo) || parseChallanBarcodeValue(barcodeOrChallanNo);
    const challanNo = parsed?.challanNo || String(barcodeOrChallanNo || '').trim();
    if (!challanNo) throw new ApiError(httpStatus.BAD_REQUEST, 'Barcode or challan number required');
    const filter = {
        companyId,
        $or: [{ barcodeValue: String(barcodeOrChallanNo).trim() }, { challanNo: challanNo.toUpperCase() }],
    };
    if (processType) filter.processType = resolveProcessType(processType);
    else if (parsed?.processType) filter.processType = resolveProcessType(parsed.processType);
    const doc = await TextileDyeingChallan.findOne(filter)
        .populate('lines.fabricItemId', 'itemCode itemName')
        .populate('lines.expectedOutputItemId', 'itemCode itemName uom')
        .lean();
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Challan not found for barcode');
    return doc;
}

export async function createChallan(companyId, body, userId, forcedProcessType) {
    await assertAccess(companyId);
    const processType = resolveProcessType(forcedProcessType || body.processType || 'Dyeing');
    const lines = body.lines || [];
    if (!lines.length) throw new ApiError(httpStatus.BAD_REQUEST, 'At least one line item is required');
    if (!body.dyerName?.trim()) throw new ApiError(httpStatus.BAD_REQUEST, 'Vendor name is required');

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const issueDate = body.issueDate ? new Date(body.issueDate) : new Date();
        const challanNo = body.challanNo?.trim()?.toUpperCase() || await generateChallanNo(companyId, issueDate, processType);

        const builtLines = [];
        for (let i = 0; i < lines.length; i++) {
            builtLines.push(await buildChallanLine(lines[i], i + 1, body.dyerName.trim(), companyId, session, processType));
        }

        const totalMeter = builtLines.reduce((s, l) => s + l.issuedMeter, 0);
        const challan = new TextileDyeingChallan({
            companyId,
            processType,
            challanNo,
            issueDate,
            dyerName: body.dyerName.trim(),
            labourProcessName: body.labourProcessName || processType,
            expectedReturnDate: body.expectedReturnDate ? new Date(body.expectedReturnDate) : null,
            remarks: body.remarks || '',
            lines: builtLines,
            productionOrderId: body.productionOrderId || null,
            productionOrderNo: body.productionOrderNo || '',
            stageIndex: body.stageIndex ?? null,
            financialYear: getFYFromDate(issueDate),
            createdBy: userId,
            updatedBy: userId,
        });
        recomputeChallanTotals(challan);
        challan.barcodeValue = processType === 'Dyeing'
            ? buildChallanBarcodeValue(challanNo, challan.dyerName, totalMeter, issueDate)
            : buildProcessBarcodeValue(processType, challanNo, challan.dyerName, totalMeter, issueDate);
        await challan.save({ session });
        await postIssueStock(challan, userId, session);

        for (const rawLine of lines) {
            if (rawLine.sourceOutputStockId) {
                const { consumeProcessOutputStock } = await import('./textileProcessOutput.service.js');
                await consumeProcessOutputStock(companyId, rawLine.sourceOutputStockId, {
                    meterQty: Number(rawLine.issuedMeter) || 0,
                    pcsQty: String(rawLine.issuedUom || '').toUpperCase() === 'PCS' ? Number(rawLine.issuedQty) || 0 : 0,
                    targetChallanId: challan._id,
                    targetChallanNo: challan.challanNo,
                    targetProcessType: processType,
                    vendorName: challan.dyerName,
                }, userId, session);
            }
        }

        await session.commitTransaction();
        return challan.toObject();
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
}

export async function recordReturn(companyId, challanId, body, userId, processType) {
    await assertAccess(companyId);
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const filter = { _id: challanId, companyId };
        if (processType) filter.processType = resolveProcessType(processType);
        const challan = await TextileDyeingChallan.findOne(filter).session(session);
        if (!challan) throw new ApiError(httpStatus.NOT_FOUND, 'Challan not found');
        if (challan.status === 'Cancelled') throw new ApiError(httpStatus.BAD_REQUEST, 'Challan is cancelled');

        const returnLines = body.lines || [];
        if (!returnLines.length) throw new ApiError(httpStatus.BAD_REQUEST, 'At least one return line is required');

        const returnNo = `${returnNoPrefix(challan.processType)}-${String((challan.returns?.length || 0) + 1).padStart(3, '0')}`;
        const builtReturnLines = [];

        for (const rl of returnLines) {
            const line = challan.lines.id(rl.challanLineId);
            if (!line) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid challan line for return');

            const returnedQty = Number(rl.returnedQty);
            if (!returnedQty || returnedQty <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Return qty must be greater than zero');

            const returnUom = rl.returnUom || 'Meter';
            let creditedMeter = returnedQty;
            if (returnUom.toUpperCase() !== 'METER') {
                creditedMeter = Number(rl.creditedMeter ?? rl.equivalentMeter ?? returnedQty);
            }

            const pending = Math.max(0, Number(line.issuedMeter) - Number(line.returnedMeter));
            if (creditedMeter > pending + 0.001) {
                throw new ApiError(httpStatus.BAD_REQUEST, `Return exceeds pending meter on line ${line.lineNo}`);
            }

            let outputItemId = rl.outputItemId || line.expectedOutputItemId;
            let outputItemName = rl.outputItemName || line.expectedOutputItemName || '';
            if (outputItemId) {
                const outItem = await Item.findById(outputItemId).session(session);
                outputItemName = outItem?.itemName || outputItemName;
            }

            const lossMeter = Math.max(0, Math.round((pending - creditedMeter) * 1000) / 1000);
            line.returnedMeter = Math.round((Number(line.returnedMeter) + creditedMeter) * 1000) / 1000;
            line.returnedQty = Math.round((Number(line.returnedQty) + returnedQty) * 1000) / 1000;
            line.returnedUom = returnUom;
            line.lossMeter = Math.round((Number(line.lossMeter) + lossMeter) * 1000) / 1000;

            builtReturnLines.push({
                challanLineId: line._id,
                lotNo: line.lotNo,
                thanNo: line.thanNo,
                colourName: rl.colourName || line.colourName || '',
                returnedQty,
                returnUom,
                outputItemId: outputItemId || null,
                outputItemName,
                issuedMeter: line.issuedMeter,
                lossMeter,
                remarks: rl.remarks || '',
            });
        }

        const returnEntry = {
            returnNo,
            returnDate: body.returnDate ? new Date(body.returnDate) : new Date(),
            scanBarcode: body.scanBarcode || '',
            lines: builtReturnLines,
            totalReturnedQty: builtReturnLines.reduce((s, l) => s + l.returnedQty, 0),
            totalLossMeter: builtReturnLines.reduce((s, l) => s + l.lossMeter, 0),
            returnedBy: userId,
            remarks: body.remarks || '',
        };

        challan.returns.push(returnEntry);
        recomputeChallanTotals(challan);
        challan.updatedBy = userId;
        await challan.save({ session });
        await postReturnStock(challan, returnEntry, userId, session);
        await session.commitTransaction();
        const result = await getChallan(challan._id, companyId, processType);
        try {
            const { registerProcessOutputFromReturn } = await import('./textileProcessOutput.service.js');
            await registerProcessOutputFromReturn({
                companyId,
                challan: result,
                returnNo,
                userId,
                nextAction: body.nextAction || 'KEEP_OUTPUT_STOCK',
            });
        } catch (hookErr) {
            console.error('[textileProcessOutput] register failed:', hookErr?.message || hookErr);
        }
        return result;
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
}

export async function getStockWithDyersReport(companyId, processType = 'Dyeing') {
    const rows = await listChallans(companyId, { pendingOnly: 'true', processType });
    const today = new Date();
    return rows.map((c) => {
        const daysPending = c.issueDate ? Math.floor((today - new Date(c.issueDate)) / 86400000) : 0;
        return {
            vendorName: c.dyerName,
            challanNo: c.challanNo,
            issueDate: c.issueDate,
            meterIssued: c.totalIssuedMeter,
            meterReturned: c.totalReturnedMeter,
            pendingMeter: c.totalPendingMeter,
            lossMeter: c.totalLossMeter,
            daysPending,
            status: c.status,
        };
    });
}

export async function getPendingChallansReport(companyId, processType = 'Dyeing') {
    return getStockWithDyersReport(companyId, processType);
}

export async function getReturnRegisterReport(companyId, query = {}) {
    await assertAccess(companyId);
    const filter = { companyId };
    if (query.processType) filter.processType = resolveProcessType(query.processType);
    else filter.$or = [{ processType: 'Dyeing' }, { processType: { $exists: false } }];
    if (query.fromDate || query.toDate) {
        filter.issueDate = {};
        if (query.fromDate) filter.issueDate.$gte = new Date(query.fromDate);
        if (query.toDate) filter.issueDate.$lte = new Date(query.toDate);
    }
    const docs = await TextileDyeingChallan.find(filter).sort({ issueDate: -1 }).lean();
    const rows = [];
    for (const c of docs) {
        for (const r of c.returns || []) {
            rows.push({
                challanNo: c.challanNo,
                dyerName: c.dyerName,
                returnNo: r.returnNo,
                returnDate: r.returnDate,
                totalReturnedQty: r.totalReturnedQty,
                totalLossMeter: r.totalLossMeter,
                lines: r.lines,
            });
        }
    }
    return rows;
}

export async function getDyerLedgerReport(companyId, processType = 'Dyeing') {
    await assertAccess(companyId);
    const filter = { companyId, processType: resolveProcessType(processType) };
    const docs = await TextileDyeingChallan.find(filter).sort({ dyerName: 1, issueDate: -1 }).lean();
    const map = {};
    for (const c of docs) {
        if (!map[c.dyerName]) {
            map[c.dyerName] = { dyerName: c.dyerName, issued: 0, returned: 0, pending: 0, loss: 0, challanCount: 0 };
        }
        const e = map[c.dyerName];
        e.issued += c.totalIssuedMeter || 0;
        e.returned += c.totalReturnedMeter || 0;
        e.pending += c.totalPendingMeter || 0;
        e.loss += c.totalLossMeter || 0;
        e.challanCount += 1;
    }
    return Object.values(map);
}

export async function getLossReport(companyId, processType = 'Dyeing') {
    await assertAccess(companyId);
    const filter = { companyId, totalLossMeter: { $gt: 0 }, processType: resolveProcessType(processType) };
    const docs = await TextileDyeingChallan.find(filter)
        .sort({ issueDate: -1 })
        .lean();
    return docs.map((c) => ({
        challanNo: c.challanNo,
        dyerName: c.dyerName,
        issueDate: c.issueDate,
        issued: c.totalIssuedMeter,
        returned: c.totalReturnedMeter,
        loss: c.totalLossMeter,
        lines: (c.lines || []).map((l) => ({
            lotNo: l.lotNo,
            thanNo: l.thanNo,
            colourName: l.colourName,
            issuedMeter: l.issuedMeter,
            returnedMeter: l.returnedMeter,
            lossMeter: l.lossMeter,
        })),
    }));
}

export async function generateBarcodeDataUrl(challanId, companyId) {
    const doc = await getChallan(challanId, companyId);
    const png = await bwipjs.toBuffer({
        bcid: 'code128',
        text: doc.barcodeValue || doc.challanNo,
        scale: 2,
        height: 12,
        includetext: true,
        textxalign: 'center',
    });
    return {
        barcodeValue: doc.barcodeValue,
        challanNo: doc.challanNo,
        dataUrl: `data:image/png;base64,${png.toString('base64')}`,
    };
}
