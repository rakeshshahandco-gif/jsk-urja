import { StockLedger } from '../models/stockLedger.model.js';
import { Item } from '../models/item.model.js';
import { recalculateStockLedger } from '../utils/stockUtils.js';

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
        itemName: item.name || wo.finishedProductName || '',
        transactionType: 'WO_OUTPUT',
        referenceNo: wo.woNumber,
        referenceId: wo._id,
        inQty: qtyToAdd,
        outQty: 0,
        remarks: `Production Completion: ${wo.woNumber}`,
        financialYear: wo.financialYear,
        createdBy: userId,
    }], { session });

    // 4. Update Item Master and Ledger Consistency
    await recalculateStockLedger(wo.finishedProductId, session);

    // 5. Mark WO as synced
    wo.inventorySynced = true;
    // Note: No need to call wo.save() here as it's usually called by the caller within same session
};
