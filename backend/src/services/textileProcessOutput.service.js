import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { assertTextileCompany } from './textileProductionLot.service.js';
import { TextileProcessOutputStock } from '../models/textileProcessOutputStock.model.js';
import { TextileProcessTrace } from '../models/textileProcessTrace.model.js';
import { TextileDyeingChallan } from '../models/textileDyeingChallan.model.js';
import { Item } from '../models/item.model.js';
import { normalizeProcessType } from '../constants/textileJobWorkChallan.constants.js';
import {
    PROCESS_OUTPUT_WAREHOUSE,
    TEXTILE_RETURN_NEXT_ACTIONS,
} from '../constants/textileProcessOutput.constants.js';

const r3 = (n) => Math.round(Number(n || 0) * 1000) / 1000;

function buildTraceId(challanNo, returnNo, lineId) {
    return `TPT|${challanNo}|${returnNo}|${lineId}`;
}

function syncBalances(doc) {
    doc.qtyBalance = r3(Math.max(0, Number(doc.qtyOriginal) - Number(doc.qtyConsumed)));
    doc.meterBalance = r3(Math.max(0, Number(doc.meterOriginal) - Number(doc.meterConsumed)));
    if (doc.qtyBalance <= 0.0001 && doc.meterBalance <= 0.0001) {
        doc.status = doc.status === 'Transferred To FG' ? doc.status : 'Fully Consumed';
    } else if (doc.qtyConsumed > 0 || doc.meterConsumed > 0) {
        doc.status = doc.status === 'Transferred To FG' ? doc.status : 'Partially Consumed';
    } else {
        doc.status = doc.status === 'Transferred To FG' ? doc.status : 'Available';
    }
}

async function appendTraceNode({
    companyId,
    traceId,
    sequenceNo,
    processType,
    vendorName,
    issueDate,
    returnDate,
    challanId,
    challanNo,
    returnNo,
    itemId,
    itemName,
    qtyReturned,
    qtyUom,
    labourCost,
    lotNo,
    thanNo,
    colour,
    design,
    barcodeValue,
    parentTraceId,
    outputStockId,
    eventType,
}) {
    await TextileProcessTrace.create({
        companyId,
        traceId,
        sequenceNo,
        processType,
        vendorName: vendorName || '',
        issueDate: issueDate || null,
        returnDate: returnDate || null,
        challanId: challanId || null,
        challanNo: challanNo || '',
        returnNo: returnNo || '',
        itemId: itemId || null,
        itemName: itemName || '',
        qtyReturned: qtyReturned || 0,
        qtyUom: qtyUom || 'PCS',
        labourCost: labourCost || 0,
        lotNo: lotNo || '',
        thanNo: thanNo || '',
        colour: colour || '',
        design: design || '',
        barcodeValue: barcodeValue || '',
        parentTraceId: parentTraceId || '',
        outputStockId: outputStockId || null,
        eventType: eventType || 'RETURN',
    });
}

export async function registerProcessOutputFromReturn({
    companyId,
    challan,
    returnNo,
    userId,
    nextAction = 'KEEP_OUTPUT_STOCK',
}) {
    await assertTextileCompany(companyId);
    const action = TEXTILE_RETURN_NEXT_ACTIONS.includes(nextAction) ? nextAction : 'KEEP_OUTPUT_STOCK';
    const processType = normalizeProcessType(challan.processType);
    const ret = (challan.returns || []).find((r) => r.returnNo === returnNo)
        || (challan.returns || [])[challan.returns.length - 1];
    if (!ret) return [];

    const created = [];
    const parentTraceId = challan.barcodeValue || challan.challanNo;

    for (const rl of ret.lines || []) {
        const line = (challan.lines || []).find((l) => String(l._id) === String(rl.challanLineId));
        if (!line) continue;

        const qtyOriginal = r3(rl.returnedQty);
        const returnUom = rl.returnUom || line.returnedUom || 'PCS';
        const mpp = Number(line.meterPerPcs) || 0;
        const meterOriginal = String(returnUom).toUpperCase() === 'METER'
            ? qtyOriginal
            : (mpp > 0 ? r3(qtyOriginal * mpp) : qtyOriginal);

        const traceId = buildTraceId(challan.challanNo, ret.returnNo, rl.challanLineId);
        const seq = await TextileProcessTrace.countDocuments({ companyId, traceId });

        await appendTraceNode({
            companyId,
            traceId,
            sequenceNo: seq + 1,
            processType,
            vendorName: challan.dyerName,
            issueDate: challan.issueDate,
            returnDate: ret.returnDate,
            challanId: challan._id,
            challanNo: challan.challanNo,
            returnNo: ret.returnNo,
            itemId: rl.outputItemId || line.expectedOutputItemId,
            itemName: rl.outputItemName || line.expectedOutputItemName,
            qtyReturned: qtyOriginal,
            qtyUom: returnUom,
            labourCost: line.labourAmount || 0,
            lotNo: rl.lotNo || line.lotNo,
            thanNo: rl.thanNo || line.thanNo,
            colour: rl.colourName || line.colourName || line.designPattern,
            design: line.designPattern || '',
            barcodeValue: challan.barcodeValue,
            parentTraceId,
            eventType: action === 'FINISHED_GOODS' ? 'FINISHED_GOODS' : 'RETURN',
        });

        if (action === 'FINISHED_GOODS') {
            continue;
        }

        const itemId = rl.outputItemId || line.expectedOutputItemId;
        if (!itemId) continue;

        const item = await Item.findById(itemId).lean();
        const stock = await TextileProcessOutputStock.create({
            companyId,
            processType,
            warehouseLabel: PROCESS_OUTPUT_WAREHOUSE[processType] || `Process Output - ${processType}`,
            sourceChallanId: challan._id,
            sourceChallanNo: challan.challanNo,
            sourceReturnId: ret._id,
            sourceReturnNo: ret.returnNo,
            sourceChallanLineId: line._id,
            sourceReturnLineId: rl._id || null,
            itemId,
            itemCode: item?.itemCode || '',
            itemName: rl.outputItemName || line.expectedOutputItemName || item?.itemName || '',
            qtyUom: returnUom,
            qtyOriginal,
            qtyConsumed: 0,
            qtyBalance: qtyOriginal,
            meterOriginal,
            meterConsumed: 0,
            meterBalance: meterOriginal,
            meterPerPcs: Number(line.meterPerPcs) || 0,
            lotNo: rl.lotNo || line.lotNo || '',
            thanNo: rl.thanNo || line.thanNo || '',
            colour: rl.colourName || line.colourName || '',
            design: line.designPattern || '',
            previousVendor: challan.dyerName || '',
            issueDate: challan.issueDate,
            returnDate: ret.returnDate,
            labourCost: line.labourAmount || 0,
            barcodeValue: challan.barcodeValue || '',
            traceId,
            productionOrderId: challan.productionOrderId || null,
            productionOrderNo: challan.productionOrderNo || '',
            stageIndex: challan.stageIndex ?? null,
            status: 'Available',
            nextAction: action,
            financialYear: challan.financialYear || '',
            createdBy: userId,
            updatedBy: userId,
        });
        created.push(stock);
    }

    return created;
}

export async function listAvailableProcessOutput(companyId, query = {}) {
    await assertTextileCompany(companyId);
    const forProcess = query.forProcess ? normalizeProcessType(query.forProcess) : null;
    const filter = {
        companyId,
        status: { $in: ['Available', 'Partially Consumed'] },
        $or: [{ qtyBalance: { $gt: 0 } }, { meterBalance: { $gt: 0 } }],
    };
    if (forProcess) {
        filter.processType = { $ne: forProcess };
    }
    if (query.processType) {
        filter.processType = normalizeProcessType(query.processType);
    }
    if (query.search) {
        const re = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$and = [
            { $or: [{ sourceChallanNo: re }, { colour: re }, { itemName: re }, { previousVendor: re }] },
        ];
    }

    const rows = await TextileProcessOutputStock.find(filter)
        .sort({ returnDate: -1, createdAt: -1 })
        .populate('itemId', 'itemCode itemName uom currentStock')
        .lean();

    return rows.map((r) => ({
        ...r,
        displayLabel: `${r.processType} Return ${r.sourceReturnNo} - ${r.colour || r.itemName} - ${r.qtyBalance} ${r.qtyUom} / ${r.meterBalance} m`,
    }));
}

export async function consumeProcessOutputStock(companyId, stockId, payload, userId, session = null) {
    await assertTextileCompany(companyId);
    const q = TextileProcessOutputStock.findOne({ _id: stockId, companyId });
    const doc = session ? await q.session(session) : await q;
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Process output stock not found');

    const meterQty = r3(payload.meterQty || 0);
    const pcsQty = r3(payload.pcsQty || 0);
    let useMeter = meterQty;
    let usePcs = pcsQty;

    if (useMeter <= 0 && usePcs > 0 && doc.meterPerPcs > 0) {
        useMeter = r3(usePcs * doc.meterPerPcs);
    }
    if (usePcs <= 0 && useMeter > 0 && doc.meterPerPcs > 0) {
        usePcs = r3(useMeter / doc.meterPerPcs);
    }
    if (useMeter <= 0 && usePcs <= 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Consume qty required');
    }
    if (useMeter > doc.meterBalance + 0.001) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Insufficient process output meter. Available: ${doc.meterBalance} m`);
    }

    doc.meterConsumed = r3(Number(doc.meterConsumed) + useMeter);
    if (usePcs > 0) doc.qtyConsumed = r3(Number(doc.qtyConsumed) + usePcs);
    else if (doc.meterPerPcs > 0) doc.qtyConsumed = r3(Number(doc.qtyConsumed) + useMeter / doc.meterPerPcs);

    syncBalances(doc);
    doc.updatedBy = userId;
    await doc.save(session ? { session } : undefined);

    const seq = await TextileProcessTrace.countDocuments({ companyId, traceId: doc.traceId });
    await appendTraceNode({
        companyId,
        traceId: doc.traceId,
        sequenceNo: seq + 1,
        processType: payload.targetProcessType || doc.processType,
        vendorName: payload.vendorName || '',
        issueDate: new Date(),
        challanId: payload.targetChallanId || null,
        challanNo: payload.targetChallanNo || '',
        itemId: doc.itemId,
        itemName: doc.itemName,
        qtyReturned: usePcs,
        qtyUom: doc.qtyUom,
        lotNo: doc.lotNo,
        thanNo: doc.thanNo,
        colour: doc.colour,
        design: doc.design,
        barcodeValue: doc.barcodeValue,
        parentTraceId: doc.traceId,
        outputStockId: doc._id,
        eventType: 'ISSUE_TO_NEXT_PROCESS',
    });

    return doc.toObject ? doc.toObject() : doc;
}

export async function getProcessOutputSummary(companyId) {
    await assertTextileCompany(companyId);
    const rows = await TextileProcessOutputStock.aggregate([
        { $match: { companyId: new mongoose.Types.ObjectId(companyId), status: { $in: ['Available', 'Partially Consumed'] } } },
        {
            $group: {
                _id: '$processType',
                lines: { $sum: 1 },
                qtyBalance: { $sum: '$qtyBalance' },
                meterBalance: { $sum: '$meterBalance' },
            },
        },
        { $sort: { _id: 1 } },
    ]);
    return rows.map((r) => ({
        processType: r._id,
        lines: r.lines,
        qtyBalance: r3(r.qtyBalance),
        meterBalance: r3(r.meterBalance),
    }));
}

export async function getProcessTraceByBarcode(companyId, barcodeOrTraceId) {
    await assertTextileCompany(companyId);
    const key = String(barcodeOrTraceId || '').trim();
    if (!key) throw new ApiError(httpStatus.BAD_REQUEST, 'Barcode or trace id required');

    const traces = await TextileProcessTrace.find({
        companyId,
        $or: [{ barcodeValue: key }, { traceId: key }, { challanNo: key }],
    }).sort({ traceId: 1, sequenceNo: 1 }).lean();

    const { lookupByBarcode, getChallan } = await import('./textileDyeingChallan.service.js');
    const challanMap = new Map();

    traces.forEach((t) => {
        if (t.challanId) challanMap.set(String(t.challanId), t.processType);
    });

    if (!challanMap.size) {
        try {
            const found = await lookupByBarcode(companyId, key, null);
            if (found?._id) challanMap.set(String(found._id), found.processType || 'Dyeing');
        } catch {
            /* lookup miss — try challan no below */
        }
    }

    if (!challanMap.size) {
        const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        const docs = await TextileDyeingChallan.find({ companyId, challanNo: re }).limit(10).lean();
        docs.forEach((d) => challanMap.set(String(d._id), d.processType || 'Dyeing'));
    }

    const challans = [];
    for (const [id, pt] of challanMap) {
        try {
            challans.push(await getChallan(id, companyId, pt));
        } catch {
            /* skip missing challan */
        }
    }

    const challanNos = challans.map((c) => c.challanNo).filter(Boolean);
    const stockFilter = {
        companyId,
        $or: [{ barcodeValue: key }, { traceId: key }],
    };
    if (challanNos.length) {
        stockFilter.$or.push({ sourceChallanNo: { $in: challanNos } });
    }
    const outputStock = await TextileProcessOutputStock.find(stockFilter)
        .sort({ returnDate: -1, createdAt: -1 })
        .lean();

    return { traces, challans, outputStock, searchKey: key };
}

function buildStockSearchFilter(search) {
    const re = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    return {
        $or: [
            { sourceChallanNo: re },
            { sourceReturnNo: re },
            { colour: re },
            { itemName: re },
            { previousVendor: re },
            { lotNo: re },
            { thanNo: re },
        ],
    };
}

export async function listProcessOutputStock(companyId, query = {}) {
    await assertTextileCompany(companyId);
    const filter = { companyId };
    if (query.processType) filter.processType = normalizeProcessType(query.processType);
    if (query.status) filter.status = query.status;
    if (query.pendingOnly === 'true') {
        filter.status = { $in: ['Available', 'Partially Consumed'] };
        filter.$or = [{ qtyBalance: { $gt: 0 } }, { meterBalance: { $gt: 0 } }];
    }
    if (query.search) {
        filter.$and = [buildStockSearchFilter(query.search)];
    }

    return TextileProcessOutputStock.find(filter)
        .sort({ returnDate: -1, createdAt: -1 })
        .populate('itemId', 'itemCode itemName uom currentStock')
        .lean();
}

export async function listProcessHistory(companyId, query = {}) {
    await assertTextileCompany(companyId);
    const filter = { companyId };
    if (query.processType) filter.processType = normalizeProcessType(query.processType);
    if (query.eventType) filter.eventType = query.eventType;
    if (query.search) {
        const re = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [
            { barcodeValue: re },
            { challanNo: re },
            { traceId: re },
            { returnNo: re },
            { itemName: re },
            { colour: re },
            { vendorName: re },
        ];
    }
    const limit = Math.min(Math.max(Number(query.limit) || 200, 1), 500);
    return TextileProcessTrace.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
}

export async function getFinishedGoodsTransfers(companyId, query = {}) {
    return listProcessHistory(companyId, { ...query, eventType: 'FINISHED_GOODS' });
}

export async function getPendingNextProcessReport(companyId, query = {}) {
    const rows = await listAvailableProcessOutput(companyId, query);
    return rows.map((r) => ({
        _id: r._id,
        processType: r.processType,
        sourceChallanNo: r.sourceChallanNo,
        sourceReturnNo: r.sourceReturnNo,
        itemName: r.itemName,
        colour: r.colour,
        lotNo: r.lotNo,
        thanNo: r.thanNo,
        qtyBalance: r.qtyBalance,
        qtyUom: r.qtyUom,
        meterBalance: r.meterBalance,
        previousVendor: r.previousVendor,
        returnDate: r.returnDate,
        nextAction: r.nextAction,
        status: r.status,
    }));
}
