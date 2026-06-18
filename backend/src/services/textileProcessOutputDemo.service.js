import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { assertTextileCompany } from './textileProductionLot.service.js';
import { Item } from '../models/item.model.js';
import { TextileProcessOutputStock } from '../models/textileProcessOutputStock.model.js';
import { TextileProcessTrace } from '../models/textileProcessTrace.model.js';
import { TextileProcessOutputDemoState } from '../models/textileProcessOutputDemoState.model.js';
import { TextileProcessOutputDemoAudit } from '../models/textileProcessOutputDemoAudit.model.js';
import {
    PROCESS_OUTPUT_WAREHOUSE,
    TEXTILE_PROCESS_OUTPUT_DEMO,
    isDemoProcessOutputStock,
} from '../constants/textileProcessOutput.constants.js';

const DEMO = TEXTILE_PROCESS_OUTPUT_DEMO;
const r3 = (n) => Math.round(Number(n || 0) * 1000) / 1000;

async function getOrCreateDemoState(companyId) {
    let state = await TextileProcessOutputDemoState.findOne({ companyId });
    if (!state) {
        state = await TextileProcessOutputDemoState.create({
            companyId,
            demoFgQtyPcs: 0,
            demoFgMeter: 0,
            itemName: DEMO.ITEM_NAME,
            colour: DEMO.COLOUR,
            fgItemName: DEMO.FG_ITEM_NAME,
        });
    }
    return state;
}

async function findDemoStock(companyId) {
    return TextileProcessOutputStock.findOne({
        companyId,
        sourceChallanNo: DEMO.CHALLAN_NO,
    }).lean();
}

async function resolveDemoItem(companyId) {
    const item = await Item.findOne({
        companyId,
        itemName: new RegExp(`^${DEMO.ITEM_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    }).lean();
    if (item) return item;
    const fallback = await Item.findOne({ companyId }).sort({ createdAt: 1 }).lean();
    if (!fallback) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'No items found for demo. Add KATHA SILK in Item Master first.');
    }
    return fallback;
}

function syncDemoStockStatus(doc) {
    if (doc.qtyBalance <= 0.0001 && doc.meterBalance <= 0.0001) {
        doc.status = 'Transferred To FG';
    } else if (doc.qtyConsumed > 0 || doc.meterConsumed > 0) {
        doc.status = 'Partially Consumed';
    } else {
        doc.status = 'Available';
    }
}

function formatStockRow(doc) {
    if (!doc) return null;
    return {
        _id: doc._id,
        processType: doc.processType,
        sourceChallanNo: doc.sourceChallanNo,
        sourceReturnNo: doc.sourceReturnNo,
        itemName: doc.itemName,
        colour: doc.colour,
        qtyBalance: doc.qtyBalance,
        qtyUom: doc.qtyUom,
        meterBalance: doc.meterBalance,
        meterOriginal: doc.meterOriginal,
        qtyOriginal: doc.qtyOriginal,
        previousVendor: doc.previousVendor,
        status: doc.status,
        isDemo: true,
    };
}

export async function getDemoStatus(companyId) {
    await assertTextileCompany(companyId);
    const [stock, state, audit] = await Promise.all([
        findDemoStock(companyId),
        getOrCreateDemoState(companyId),
        TextileProcessOutputDemoAudit.find({ companyId, isDemo: true })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean(),
    ]);

    return {
        demoMode: true,
        label: 'DEMO MODE — localhost testing only',
        stock: formatStockRow(stock),
        finishedGoods: {
            itemName: state.fgItemName || DEMO.FG_ITEM_NAME,
            qtyPcs: state.demoFgQtyPcs,
            meter: state.demoFgMeter,
        },
        audit: audit.map((a) => ({
            _id: a._id,
            date: a.date,
            itemName: a.itemName,
            colour: a.colour,
            qtyPcs: a.qtyPcs,
            meterQty: a.meterQty,
            sourceProcess: a.sourceProcess,
            userName: a.userName,
            transferMode: a.transferMode,
            isDemo: true,
        })),
    };
}

export async function seedDemoProcessOutputStock(companyId, userId) {
    await assertTextileCompany(companyId);
    const existing = await TextileProcessOutputStock.findOne({
        companyId,
        sourceChallanNo: DEMO.CHALLAN_NO,
    });
    if (existing) {
        return { stock: formatStockRow(existing.toObject()), created: false };
    }

    const item = await resolveDemoItem(companyId);
    const meterPerPcs = r3(DEMO.METER / DEMO.QTY_PCS);
    const fakeChallanId = new mongoose.Types.ObjectId();
    const fakeReturnId = new mongoose.Types.ObjectId();
    const fakeLineId = new mongoose.Types.ObjectId();

    const stock = await TextileProcessOutputStock.create({
        companyId,
        processType: DEMO.PROCESS_TYPE,
        warehouseLabel: PROCESS_OUTPUT_WAREHOUSE.Dyeing,
        sourceChallanId: fakeChallanId,
        sourceChallanNo: DEMO.CHALLAN_NO,
        sourceReturnId: fakeReturnId,
        sourceReturnNo: DEMO.RETURN_NO,
        sourceChallanLineId: fakeLineId,
        itemId: item._id,
        itemCode: item.itemCode || '',
        itemName: DEMO.ITEM_NAME,
        qtyUom: 'PCS',
        qtyOriginal: DEMO.QTY_PCS,
        qtyConsumed: 0,
        qtyBalance: DEMO.QTY_PCS,
        meterOriginal: DEMO.METER,
        meterConsumed: 0,
        meterBalance: DEMO.METER,
        meterPerPcs,
        colour: DEMO.COLOUR,
        previousVendor: DEMO.VENDOR,
        returnDate: new Date(),
        issueDate: new Date(),
        traceId: `DEMO|${DEMO.CHALLAN_NO}|${DEMO.RETURN_NO}`,
        status: 'Available',
        nextAction: 'KEEP_OUTPUT_STOCK',
        createdBy: userId,
        updatedBy: userId,
    });

    const state = await getOrCreateDemoState(companyId);
    state.lastSeededAt = new Date();
    await state.save();

    await TextileProcessTrace.create({
        companyId,
        traceId: stock.traceId,
        sequenceNo: 1,
        processType: DEMO.PROCESS_TYPE,
        vendorName: DEMO.VENDOR,
        returnDate: new Date(),
        challanId: fakeChallanId,
        challanNo: DEMO.CHALLAN_NO,
        returnNo: DEMO.RETURN_NO,
        itemId: item._id,
        itemName: DEMO.ITEM_NAME,
        qtyReturned: DEMO.QTY_PCS,
        qtyUom: 'PCS',
        colour: DEMO.COLOUR,
        eventType: 'RETURN',
    });

    return { stock: formatStockRow(stock.toObject()), created: true };
}

export async function previewDemoTransfer(companyId, { mode, qtyPcs }) {
    await assertTextileCompany(companyId);
    const stock = await TextileProcessOutputStock.findOne({
        companyId,
        sourceChallanNo: DEMO.CHALLAN_NO,
    });
    if (!stock) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Demo stock not found. Seed demo data first.');
    }

    const state = await getOrCreateDemoState(companyId);
    const transferPcs = mode === 'full'
        ? stock.qtyBalance
        : r3(Number(qtyPcs));

    if (!transferPcs || transferPcs <= 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Transfer qty must be greater than zero');
    }
    if (transferPcs > stock.qtyBalance + 0.001) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Insufficient demo balance. Available: ${stock.qtyBalance} PCS`);
    }

    const meterRatio = stock.qtyOriginal > 0 ? stock.meterOriginal / stock.qtyOriginal : 0;
    const transferMeter = meterRatio > 0 ? r3(transferPcs * meterRatio) : r3(Math.min(transferPcs, stock.meterBalance));

    return {
        demoMode: true,
        itemName: stock.itemName,
        colour: stock.colour,
        transferPcs,
        transferMeter,
        before: {
            processOutputStock: { qtyPcs: stock.qtyBalance, meter: stock.meterBalance },
            finishedGoods: { qtyPcs: state.demoFgQtyPcs, meter: state.demoFgMeter },
        },
        after: {
            processOutputStock: {
                qtyPcs: r3(stock.qtyBalance - transferPcs),
                meter: r3(stock.meterBalance - transferMeter),
            },
            finishedGoods: {
                qtyPcs: r3(state.demoFgQtyPcs + transferPcs),
                meter: r3(state.demoFgMeter + transferMeter),
            },
        },
    };
}

export async function executeDemoTransfer(companyId, { mode, qtyPcs }, userId, userName = '') {
    await assertTextileCompany(companyId);
    const preview = await previewDemoTransfer(companyId, { mode, qtyPcs });

    const stock = await TextileProcessOutputStock.findOne({
        companyId,
        sourceChallanNo: DEMO.CHALLAN_NO,
    });
    if (!stock) throw new ApiError(httpStatus.NOT_FOUND, 'Demo stock not found');

    const transferPcs = preview.transferPcs;
    const transferMeter = preview.transferMeter;

    stock.qtyConsumed = r3(Number(stock.qtyConsumed) + transferPcs);
    stock.meterConsumed = r3(Number(stock.meterConsumed) + transferMeter);
    stock.qtyBalance = r3(Math.max(0, Number(stock.qtyBalance) - transferPcs));
    stock.meterBalance = r3(Math.max(0, Number(stock.meterBalance) - transferMeter));
    syncDemoStockStatus(stock);
    stock.updatedBy = userId;
    await stock.save();

    const state = await getOrCreateDemoState(companyId);
    state.demoFgQtyPcs = preview.after.finishedGoods.qtyPcs;
    state.demoFgMeter = preview.after.finishedGoods.meter;
    await state.save();

    const audit = await TextileProcessOutputDemoAudit.create({
        companyId,
        date: new Date(),
        itemName: stock.itemName,
        colour: stock.colour,
        qtyPcs: transferPcs,
        meterQty: transferMeter,
        sourceProcess: stock.processType,
        transferMode: mode === 'full' ? 'full' : 'partial',
        userId,
        userName: userName || 'Demo User',
        isDemo: true,
    });

    const seq = await TextileProcessTrace.countDocuments({ companyId, traceId: stock.traceId });
    await TextileProcessTrace.create({
        companyId,
        traceId: stock.traceId,
        sequenceNo: seq + 1,
        processType: stock.processType,
        vendorName: stock.previousVendor,
        returnDate: new Date(),
        challanNo: stock.sourceChallanNo,
        returnNo: stock.sourceReturnNo,
        itemId: stock.itemId,
        itemName: stock.itemName,
        qtyReturned: transferPcs,
        qtyUom: stock.qtyUom,
        colour: stock.colour,
        eventType: 'FINISHED_GOODS',
    });

    return {
        success: true,
        demoMode: true,
        message: 'Transfer Successful',
        itemName: stock.itemName,
        colour: stock.colour,
        transferred: { qtyPcs: transferPcs, meter: transferMeter },
        remaining: { qtyPcs: stock.qtyBalance, meter: stock.meterBalance },
        finishedGoods: preview.after.finishedGoods,
        audit: {
            _id: audit._id,
            date: audit.date,
            itemName: audit.itemName,
            colour: audit.colour,
            qtyPcs: audit.qtyPcs,
            meterQty: audit.meterQty,
            sourceProcess: audit.sourceProcess,
            userName: audit.userName,
        },
    };
}

export async function resetDemoFlow(companyId, userId) {
    await assertTextileCompany(companyId);
    const stock = await TextileProcessOutputStock.findOne({
        companyId,
        sourceChallanNo: DEMO.CHALLAN_NO,
    });

    if (stock) {
        stock.qtyConsumed = 0;
        stock.meterConsumed = 0;
        stock.qtyBalance = DEMO.QTY_PCS;
        stock.meterBalance = DEMO.METER;
        stock.status = 'Available';
        stock.updatedBy = userId;
        await stock.save();
    }

    const state = await getOrCreateDemoState(companyId);
    state.demoFgQtyPcs = 0;
    state.demoFgMeter = 0;
    state.lastResetAt = new Date();
    await state.save();

    return getDemoStatus(companyId);
}

export { isDemoProcessOutputStock };
