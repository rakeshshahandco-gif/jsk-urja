import { StockLedger } from '../models/stockLedger.model.js';
import { Item } from '../models/item.model.js';

/**
 * Re-calculates the runningStock for all ledger entries of a specific item.
 * @param {string} itemId - The ID of the item to recalculate.
 * @param {object} session - Mongoose session for transaction.
 */
export const recalculateStockLedger = async (itemId, session) => {
    const item = await Item.findById(itemId).session(session);
    if (!item) return;

    const entries = await StockLedger.find({ itemId })
        .sort({ date: 1, createdAt: 1 })
        .session(session);

    let currentBalance = item.openingStock || 0;

    for (const entry of entries) {
        currentBalance += (entry.inQty || 0);
        currentBalance -= (entry.outQty || 0);
        entry.runningStock = currentBalance;
        await entry.save({ session });
    }

    // Finally sync the item Master currentStock
    item.currentStock = currentBalance;
    await item.save({ session });
};

/**
 * Hard-deletes all StockLedger entries for a specific reference and recalculates affected items.
 * @param {string} referenceId - The ID of the document (Invoice/GRN) being deleted.
 * @param {object} session - Mongoose session for transaction.
 */
export const rollbackStockLedger = async (referenceId, session) => {
    // 1. Find all affected items
    const affectedItems = await StockLedger.distinct('itemId', { referenceId }).session(session);

    // 2. Delete the ledger entries
    await StockLedger.deleteMany({ referenceId }).session(session);

    // 3. Recalculate each affected item
    for (const itemId of affectedItems) {
        await recalculateStockLedger(itemId, session);
    }
};
