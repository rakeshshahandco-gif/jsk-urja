import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { TextileProductionOrder } from '../models/textileProductionOrder.model.js';
import { TextileProcessRoute } from '../models/textileProcessRoute.model.js';
import { Item } from '../models/item.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { assertTextileCompany } from './textileProductionLot.service.js';
import { getProcessRoute } from './textileProcessRoute.service.js';
import {
    createChallan,
    recordReturn,
    getChallan,
} from './textileDyeingChallan.service.js';
import { getFYFromDate } from '../utils/fyUtils.js';
import { recalculateStockLedger } from '../utils/stockUtils.js';
import {
    TEXTILE_PRODUCTION_ORDER_STATUS,
    TEXTILE_ROUTE_PROCESS_OPTIONS,
    buildProductionOrderBarcode,
    resolveChallanProcessType,
    normalizeRouteProcessName,
} from '../constants/textileProcessRoute.constants.js';

function displayProcessName(stage) {
    return normalizeRouteProcessName(stage?.processName, stage?.customProcessName);
}

function buildStageStatesFromRoute(stages = []) {
    return stages.map((s, idx) => ({
        stageIndex: idx,
        sequenceNo: s.sequenceNo || idx + 1,
        processName: s.processName,
        customProcessName: s.customProcessName || '',
        allowSkip: s.allowSkip !== false,
        status: idx === 0 ? 'in_progress' : 'pending',
        startedAt: idx === 0 ? new Date() : null,
        completedAt: null,
        activeChallanId: null,
        activeVendorName: '',
        issuedQty: 0,
        returnedQty: 0,
        remarks: '',
    }));
}

function findNextStageIndex(order, fromIndex = order.currentStageIndex) {
    for (let i = fromIndex + 1; i < (order.stageStates || []).length; i++) {
        if (order.stageStates[i].status !== 'skipped') return i;
    }
    return -1;
}

function syncCurrentStage(order) {
    const states = order.stageStates || [];
    const current = states[order.currentStageIndex];
    if (current) {
        order.currentProcessName = displayProcessName(current);
    } else {
        order.currentProcessName = '';
    }
    const nextIdx = findNextStageIndex(order, order.currentStageIndex);
    order.nextProcessName = nextIdx >= 0 ? displayProcessName(states[nextIdx]) : '';
    if (nextIdx < 0 && states.every((s) => s.status === 'completed' || s.status === 'skipped')) {
        order.status = 'Completed';
    }
}

async function generateOrderNo(companyId, orderDate) {
    const fy = getFYFromDate(orderDate || new Date());
    const prefix = `TPO-${fy}-`;
    const last = await TextileProductionOrder.findOne({ companyId, orderNo: new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })
        .sort({ orderNo: -1 })
        .lean();
    let next = 1;
    if (last?.orderNo) {
        const n = parseInt(String(last.orderNo).split('-').pop(), 10);
        if (!Number.isNaN(n)) next = n + 1;
    }
    return `${prefix}${String(next).padStart(5, '0')}`;
}

export function getProductionOrderMeta() {
    return {
        statuses: TEXTILE_PRODUCTION_ORDER_STATUS,
        processOptions: TEXTILE_ROUTE_PROCESS_OPTIONS,
    };
}

export async function listProductionOrders(companyId, query = {}) {
    await assertTextileCompany(companyId);
    const filter = { companyId };
    if (query.status) filter.status = query.status;
    if (query.search) {
        const re = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ orderNo: re }, { designNo: re }, { routeName: re }, { colour: re }];
    }
    return TextileProductionOrder.find(filter)
        .sort({ orderDate: -1, createdAt: -1 })
        .populate('itemId', 'itemCode itemName uom')
        .lean();
}

export async function getProductionOrder(id, companyId) {
    await assertTextileCompany(companyId);
    const doc = await TextileProductionOrder.findOne({ _id: id, companyId })
        .populate('itemId', 'itemCode itemName uom currentStock')
        .populate('outputItemId', 'itemCode itemName uom')
        .populate('processRouteId', 'routeName routeCode stages')
        .lean();
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Production order not found');
    return doc;
}

export async function createProductionOrder(companyId, body, userId) {
    await assertTextileCompany(companyId);
    const route = await getProcessRoute(body.processRouteId, companyId);
    if (!route.isActive) throw new ApiError(httpStatus.BAD_REQUEST, 'Process route is inactive');

    const item = await Item.findOne({ _id: body.itemId, companyId });
    if (!item) throw new ApiError(httpStatus.BAD_REQUEST, 'Item not found');

    let outputItem = item;
    if (body.outputItemId) {
        outputItem = await Item.findOne({ _id: body.outputItemId, companyId });
        if (!outputItem) throw new ApiError(httpStatus.BAD_REQUEST, 'Output item not found');
    }

    const orderDate = body.orderDate ? new Date(body.orderDate) : new Date();
    const orderNo = body.orderNo?.trim()?.toUpperCase() || await generateOrderNo(companyId, orderDate);
    const routeSnapshot = (route.stages || []).map((s) => ({
        sequenceNo: s.sequenceNo,
        processName: s.processName,
        customProcessName: s.customProcessName || '',
        allowSkip: s.allowSkip !== false,
    }));
    const stageStates = buildStageStatesFromRoute(routeSnapshot);

    const doc = await TextileProductionOrder.create({
        companyId,
        orderNo,
        designNo: body.designNo || '',
        itemId: item._id,
        itemName: item.itemName || '',
        outputItemId: outputItem._id,
        outputItemName: outputItem.itemName || '',
        qty: Number(body.qty),
        qtyUom: body.qtyUom || item.uom || 'PCS',
        colour: body.colour || '',
        size: body.size || '',
        lotNo: body.lotNo || '',
        thanNo: body.thanNo || '',
        processRouteId: route._id,
        routeName: route.routeName,
        routeSnapshot,
        currentStageIndex: 0,
        status: body.startImmediately !== false ? 'In Progress' : 'Draft',
        stageStates: body.startImmediately !== false ? stageStates : stageStates.map((s, i) => ({
            ...s,
            status: i === 0 ? 'pending' : s.status,
            startedAt: null,
        })),
        orderDate,
        financialYear: getFYFromDate(orderDate),
        remarks: body.remarks || '',
        createdBy: userId,
        updatedBy: userId,
    });

    if (doc.status === 'In Progress') {
        syncCurrentStage(doc);
        doc.barcodeValue = buildProductionOrderBarcode(
            doc.orderNo,
            doc.routeName,
            doc.currentProcessName,
            doc.lotNo,
            doc.colour,
        );
        await doc.save();
    }

    return getProductionOrder(doc._id, companyId);
}

export async function startProductionOrder(id, companyId, userId) {
    await assertTextileCompany(companyId);
    const doc = await TextileProductionOrder.findOne({ _id: id, companyId });
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Production order not found');
    if (doc.status !== 'Draft') throw new ApiError(httpStatus.BAD_REQUEST, 'Only draft orders can be started');

    doc.status = 'In Progress';
    doc.stageStates = buildStageStatesFromRoute(doc.routeSnapshot);
    doc.currentStageIndex = 0;
    syncCurrentStage(doc);
    doc.barcodeValue = buildProductionOrderBarcode(
        doc.orderNo,
        doc.routeName,
        doc.currentProcessName,
        doc.lotNo,
        doc.colour,
    );
    doc.updatedBy = userId;
    await doc.save();
    return getProductionOrder(doc._id, companyId);
}

export async function skipStage(id, companyId, body, userId) {
    await assertTextileCompany(companyId);
    const doc = await TextileProductionOrder.findOne({ _id: id, companyId });
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Production order not found');
    if (doc.status !== 'In Progress') throw new ApiError(httpStatus.BAD_REQUEST, 'Order is not in progress');

    const stageIndex = body.stageIndex ?? doc.currentStageIndex;
    const stage = doc.stageStates[stageIndex];
    if (!stage) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid stage');
    if (!stage.allowSkip) throw new ApiError(httpStatus.BAD_REQUEST, 'This stage cannot be skipped');
    if (stage.status === 'completed' || stage.status === 'skipped') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Stage already completed or skipped');
    }

    stage.status = 'skipped';
    stage.completedAt = new Date();
    doc.skipAudit.push({
        stageIndex,
        processName: displayProcessName(stage),
        reason: body.reason || '',
        skippedBy: userId,
        skippedAt: new Date(),
    });

    if (stageIndex === doc.currentStageIndex) {
        const nextIdx = findNextStageIndex(doc, stageIndex);
        if (nextIdx < 0) {
            doc.status = 'Completed';
            doc.currentProcessName = '';
            doc.nextProcessName = '';
            await postFinishedGoodsStock(doc, userId);
        } else {
            doc.currentStageIndex = nextIdx;
            doc.stageStates[nextIdx].status = 'in_progress';
            doc.stageStates[nextIdx].startedAt = new Date();
            syncCurrentStage(doc);
        }
    }

    doc.barcodeValue = buildProductionOrderBarcode(
        doc.orderNo,
        doc.routeName,
        doc.currentProcessName || 'Completed',
        doc.lotNo,
        doc.colour,
    );
    doc.updatedBy = userId;
    await doc.save();
    return getProductionOrder(doc._id, companyId);
}

async function postFinishedGoodsStock(order, userId) {
    const itemId = order.outputItemId || order.itemId;
    const item = await Item.findById(itemId);
    if (!item) return;

    await StockLedger.create({
        date: new Date(),
        itemId: item._id,
        itemCode: item.itemCode,
        itemName: item.itemName,
        transactionType: 'TEXTILE_JOB_WORK_RETURN',
        referenceNo: order.orderNo,
        referenceId: order._id,
        inQty: Number(order.qty),
        outQty: 0,
        uom: order.qtyUom || item.uom || 'PCS',
        warehouse: 'Available Fabric',
        partyName: order.routeName,
        remarks: `Textile production order completed — finished goods ${order.orderNo}`,
        financialYear: order.financialYear,
        createdBy: userId,
    });
    await recalculateStockLedger(item._id);
}

export async function completeStage(id, companyId, body, userId) {
    await assertTextileCompany(companyId);
    const doc = await TextileProductionOrder.findOne({ _id: id, companyId });
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Production order not found');
    if (doc.status !== 'In Progress') throw new ApiError(httpStatus.BAD_REQUEST, 'Order is not in progress');

    const stageIndex = body.stageIndex ?? doc.currentStageIndex;
    if (stageIndex !== doc.currentStageIndex) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Only the current stage can be completed');
    }
    const stage = doc.stageStates[stageIndex];
    if (!stage || stage.status === 'skipped') throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid stage');

    stage.status = 'completed';
    stage.completedAt = new Date();

    const labourCost = Number(body.labourCost) || 0;
    const vendorCost = Number(body.vendorCost) || 0;
    const actualCost = Number(body.actualCost) || labourCost + vendorCost;
    doc.stageCosts.push({
        stageIndex,
        processName: displayProcessName(stage),
        rateType: body.rateType || '',
        rate: Number(body.rate) || 0,
        labourCost,
        vendorCost,
        actualCost,
        vendorName: body.vendorName || stage.activeVendorName || '',
        recordedAt: new Date(),
    });
    doc.totalLabourCost = (doc.stageCosts || []).reduce((s, c) => s + (c.labourCost || 0), 0);
    doc.totalActualCost = (doc.stageCosts || []).reduce((s, c) => s + (c.actualCost || 0), 0);

    const nextIdx = findNextStageIndex(doc, stageIndex);
    if (nextIdx < 0) {
        doc.status = 'Completed';
        doc.currentProcessName = '';
        doc.nextProcessName = '';
        await postFinishedGoodsStock(doc, userId);
    } else {
        doc.currentStageIndex = nextIdx;
        doc.stageStates[nextIdx].status = 'in_progress';
        doc.stageStates[nextIdx].startedAt = new Date();
        syncCurrentStage(doc);
    }

    doc.barcodeValue = buildProductionOrderBarcode(
        doc.orderNo,
        doc.routeName,
        doc.currentProcessName || 'Completed',
        doc.lotNo,
        doc.colour,
    );
    doc.updatedBy = userId;
    await doc.save();
    return getProductionOrder(doc._id, companyId);
}

export async function issueStageToVendor(id, companyId, body, userId) {
    const order = await getProductionOrder(id, companyId);
    if (order.status !== 'In Progress') throw new ApiError(httpStatus.BAD_REQUEST, 'Order is not in progress');

    const stage = order.stageStates[order.currentStageIndex];
    if (!stage) throw new ApiError(httpStatus.BAD_REQUEST, 'No active stage');

    const processType = resolveChallanProcessType(stage.processName, stage.customProcessName);
    if (!processType) {
        throw new ApiError(httpStatus.BAD_REQUEST, `${displayProcessName(stage)} does not support vendor issue — use Complete Stage instead`);
    }
    const vendorName = String(body.vendorName || body.dyerName || '').trim();
    if (!vendorName) throw new ApiError(httpStatus.BAD_REQUEST, 'Vendor name is required');

    const defaultItemId = body.inputItemId || order.itemId?._id || order.itemId;
    const defaultOutputId = body.outputItemId || order.outputItemId?._id || order.outputItemId;

    let lines = [];
    if (Array.isArray(body.lines) && body.lines.length) {
        lines = body.lines.map((ln) => ({
            ...ln,
            fabricItemId: ln.fabricItemId || defaultItemId,
            designPattern: ln.designPattern || order.designNo || '',
            colourName: ln.colourName || order.colour || '',
            lotNo: ln.lotNo || order.lotNo || '',
            thanNo: ln.thanNo || order.thanNo || '',
            expectedOutputItemId: ln.expectedOutputItemId || defaultOutputId,
            expectedOutputUom: ln.expectedOutputUom || order.qtyUom || 'PCS',
            remarks: ln.remarks || `PO ${order.orderNo} stage ${displayProcessName(stage)}`,
        }));
    } else {
        const issuedMeter = body.issuedMeter ? Number(body.issuedMeter) : undefined;
        const issuedQty = body.issuedQty ? Number(body.issuedQty) : Number(order.qty);
        lines = [{
            fabricItemId: defaultItemId,
            designPattern: order.designNo || '',
            colourName: order.colour || '',
            lotNo: order.lotNo || body.lotNo || '',
            thanNo: order.thanNo || body.thanNo || '',
            issuedMeter,
            issuedQty,
            issuedUom: body.issuedUom || order.qtyUom || 'PCS',
            labourRateType: body.labourRateType || '',
            labourRate: body.labourRate ? Number(body.labourRate) : 0,
            expectedOutputItemId: defaultOutputId,
            expectedOutputUom: body.expectedOutputUom || order.qtyUom || 'PCS',
            remarks: body.remarks || `PO ${order.orderNo} stage ${displayProcessName(stage)}`,
        }];
    }

    const challan = await createChallan(companyId, {
        dyerName: vendorName,
        processType,
        issueDate: body.issueDate,
        expectedReturnDate: body.expectedReturnDate,
        labourProcessName: body.labourProcessName || processType,
        remarks: body.remarks || '',
        productionOrderId: order._id,
        productionOrderNo: order.orderNo,
        stageIndex: order.currentStageIndex,
        lines,
    }, userId, processType);

    const totalIssued = (challan.lines || []).reduce((s, l) => s + (Number(l.issuedMeter) || Number(l.issuedQty) || 0), 0);

    const doc = await TextileProductionOrder.findOne({ _id: id, companyId });
    const st = doc.stageStates[order.currentStageIndex];
    st.activeChallanId = challan._id;
    st.activeVendorName = vendorName;
    st.issuedQty = totalIssued || order.qty;
    doc.updatedBy = userId;
    await doc.save();

    return { order: await getProductionOrder(id, companyId), challan };
}

export async function receiveStageFromVendor(id, companyId, body, userId) {
    const order = await getProductionOrder(id, companyId);
    if (order.status !== 'In Progress') throw new ApiError(httpStatus.BAD_REQUEST, 'Order is not in progress');

    const stage = order.stageStates[order.currentStageIndex];
    if (!stage?.activeChallanId) throw new ApiError(httpStatus.BAD_REQUEST, 'No active challan on this stage');

    const processType = resolveChallanProcessType(stage.processName, stage.customProcessName);
    const challan = await getChallan(stage.activeChallanId, companyId);

    let returnLines = body.lines;
    if (!Array.isArray(returnLines) || !returnLines.length) {
        const lineId = body.challanLineId || challan.lines?.[0]?._id;
        if (!lineId) throw new ApiError(httpStatus.BAD_REQUEST, 'Challan line not found');
        returnLines = [{
            challanLineId: lineId,
            returnedQty: Number(body.returnedQty),
            returnUom: body.returnUom || order.qtyUom || 'PCS',
            outputItemId: body.outputItemId || order.outputItemId?._id || order.outputItemId,
            creditedMeter: body.creditedMeter,
        }];
    }

    const updated = await recordReturn(companyId, stage.activeChallanId, {
        lines: returnLines.map((rl) => ({
            challanLineId: rl.challanLineId,
            returnedQty: Number(rl.returnedQty),
            returnUom: rl.returnUom || 'Meter',
            outputItemId: rl.outputItemId || order.outputItemId?._id || order.outputItemId,
            creditedMeter: rl.creditedMeter,
        })),
        remarks: body.remarks || '',
    }, userId, processType);

    const doc = await TextileProductionOrder.findOne({ _id: id, companyId });
    const st = doc.stageStates[order.currentStageIndex];
    const totalReturned = returnLines.reduce((s, rl) => s + (Number(rl.returnedQty) || 0), 0);
    st.returnedQty = (Number(st.returnedQty) || 0) + totalReturned;
    doc.updatedBy = userId;
    await doc.save();

    return { order: await getProductionOrder(id, companyId), challan: updated };
}

export async function getProductionDashboard(companyId, query = {}) {
    await assertTextileCompany(companyId);
    const filter = { companyId, status: { $in: ['In Progress', 'Draft'] } };
    if (query.status) filter.status = query.status;

    const rows = await TextileProductionOrder.find(filter)
        .sort({ orderDate: -1 })
        .lean();

    const today = new Date();
    return rows.map((o) => {
        const stage = o.stageStates?.[o.currentStageIndex];
        const daysPending = o.orderDate ? Math.floor((today - new Date(o.orderDate)) / 86400000) : 0;
        return {
            orderNo: o.orderNo,
            designNo: o.designNo,
            qty: o.qty,
            qtyUom: o.qtyUom,
            colour: o.colour,
            routeName: o.routeName,
            currentStage: o.currentProcessName,
            nextStage: o.nextProcessName,
            status: o.status,
            vendor: stage?.activeVendorName || '',
            pendingDays: daysPending,
            orderId: o._id,
        };
    });
}
