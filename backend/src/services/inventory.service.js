import { StockLedger } from '../models/stockLedger.model.js';
import { Item } from '../models/item.model.js';
import { recalculateStockLedger } from '../utils/stockUtils.js';
import { createProductionCostSnapshot } from './productCostEngine.service.js';

/**
 * Synchronizes Work Order completion to Industry.
 * Adds the finished product quantity to stock and records the ledger entry.
 * @param {object} wo - The Work Order document.
 * @param {object} session - Mongoose session for transaction.
 * @param {string} userId - ID of the user performing the action.
 */
export const syncWorkOrderToInventory = async (wo, session, userId) => {
    // 1. Safety check
    if (wo.status !== 'Completed' || wo.inventorySynced) return;
    // Phase 1: Section / Subassembly WOs must never post FG or consume RM
    if (wo.woKind === 'section') return;
    if (!wo.finishedProductId) return;

    // 2. Identify quantity (Use output of Final QC stage, fallback to targetQty if stage output is 0)
    const finalQcStage = wo.stages.find(s => s.seq === 9);
    const qtyToAdd = (finalQcStage && finalQcStage.outputQty > 0) ? finalQcStage.outputQty : wo.targetQty;
    
    if (qtyToAdd <= 0) return;

    // 3. Create Stock Ledger Entry
    const item = await Item.findById(wo.finishedProductId).session(session);
    if (!item) return;

    await StockLedger.create([{
        date: new Date(),
        itemId: wo.finishedProductId,
        itemCode: item.itemCode || '',
        itemName: item.itemName || item.name || wo.finishedProductName || '',
        itemGroup: item.itemCategory || '',
        itemType: item.itemType || '',
        uom: item.uom || '',
        transactionType: 'WO_OUTPUT',
        voucherType: 'Production Inward',
        referenceNo: wo.woNumber,
        referenceId: wo._id,
        inQty: qtyToAdd,
        outQty: 0,
        rate: item.valuationRate || 0,
        amount: Math.round(qtyToAdd * (item.valuationRate || 0) * 100) / 100,
        remarks: `Production Completion: ${wo.woNumber}`,
        financialYear: wo.financialYear,
        createdBy: userId,
    }], { session });

    // 4. Handle Consumption (Deduct components from stock)
    if (wo.materialStatus && wo.materialStatus.length > 0) {
        const consumptionEntries = [];
        for (const mat of wo.materialStatus) {
            if (!mat.itemId) continue;
            
            // Get actual used qty (usually target * qty per unit, but could be adjusted)
            // For now, using requiredQty as what was consumed.
            const consumedQty = mat.requiredQty || 0;
            if (consumedQty <= 0) continue;

            const compItem = await Item.findById(mat.itemId).session(session);
            if (!compItem) continue;

            consumptionEntries.push({
                date: new Date(),
                itemId: mat.itemId,
                itemCode: mat.itemCode || compItem.itemCode || '',
                itemName: mat.itemName || compItem.itemName || compItem.name || '',
                itemGroup: compItem.itemCategory || '',
                itemType: compItem.itemType || '',
                uom: mat.uom || compItem.uom || '',
                transactionType: 'WO_CONSUMPTION',
                voucherType: 'Production Consumption',
                referenceNo: wo.woNumber,
                referenceId: wo._id,
                inQty: 0,
                outQty: consumedQty,
                rate: compItem.valuationRate || 0,
                amount: Math.round(consumedQty * (compItem.valuationRate || 0) * 100) / 100,
                remarks: `Production Consumption for WO: ${wo.woNumber}`,
                financialYear: wo.financialYear,
                createdBy: userId,
            });

            // Update individual item master stock
            compItem.currentStock = (compItem.currentStock || 0) - consumedQty;
            await compItem.save({ session });
        }

        if (consumptionEntries.length > 0) {
            await StockLedger.insertMany(consumptionEntries, { session });
        }
    }

    const materialConsumption = [];
    for (const mat of wo.materialStatus || []) {
        if (!mat.itemId) continue;
        const consumedQty = mat.requiredQty || 0;
        if (consumedQty <= 0) continue;
        const ci = await Item.findById(mat.itemId).select('valuationRate').session(session).lean();
        materialConsumption.push({ consumedQty, rate: ci?.valuationRate || 0 });
    }

    await createProductionCostSnapshot({
        finishedItemId: wo.finishedProductId,
        qtyProduced: qtyToAdd,
        workOrderId: wo._id,
        workOrderNo: wo.woNumber || '',
        productionDate: new Date(),
        userId,
        session,
        materialConsumption,
    });

    // 5. Update Item Master and Ledger Consistency for finished product
    await recalculateStockLedger(wo.finishedProductId, session);

    // 6. Mark WO as synced
    wo.inventorySynced = true;
};
