import { BOM } from '../models/bom.model.js';
import { Item } from '../models/item.model.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose';
import { logCostingAudit } from './costingAudit.service.js';

/**
 * Recalculate all costs for a specific BOM
 * @param {Object} bom - Mongoose BOM document
 */
export const recalculateBOMCosts = async (bom) => {
    let totalRM = 0;

    // 1. Update component total costs based on their rates
    for (const comp of bom.components) {
        comp.totalCost = Math.round((comp.quantity * (comp.rate || 0)) * 100) / 100;
        totalRM += comp.totalCost;
    }

    // 2. Update summary fields
    bom.totalRawMaterialCost = Math.round(totalRM * 100) / 100;

    // Points-based labour cost
    const totalPoints = bom.components.reduce((acc, c) => acc + (c.points || 0), 0);
    const ratePerPoint = bom.labourCostPerPoint || 0.25;
    bom.totalPointsLabourCost = Math.round((totalPoints * ratePerPoint) * 100) / 100;

    // Final cost per unit
    // totalProductionCost = RM + Processes + Overhead + (Labour OR PointsLabour)
    const otherCosts = (bom.totalProcessCost || 0) + (bom.overheadCost || 0) + (bom.labourCost || 0);
    const totalProductionCost = bom.totalRawMaterialCost + otherCosts + bom.totalPointsLabourCost;

    const qty = bom.productionQuantity || 1;
    bom.finalProductionCostPerUnit = Math.round((totalProductionCost / qty) * 100) / 100;
    bom.standardCostUpdatedAt = new Date();

    await bom.save();

    try {
        const finished = await Item.findById(bom.finishedProductId);
        if (finished) {
            finished.standardBomCost = bom.finalProductionCostPerUnit;
            finished.standardBomCostUpdatedAt = new Date();
            await finished.save();
        }
    } catch {
        /* non-fatal */
    }

    return bom;
};

/**
 * Sync latest purchase rates to relevant Items and BOMs
 * @param {Array} items - List of items from Purchase Invoice { itemId, rate }
 * @param {String} userId - ID of the user performing the action
 */
export const syncPurchaseRatesToBOMs = async (items, userId) => {
    try {
        logger.info(`Starting BOM price sync for ${items.length} items`);
        for (const piItem of items) {
            const { itemId, rate } = piItem;
            if (!itemId) continue;

            const objectId = new mongoose.Types.ObjectId(itemId);

            // 1. Update Item's purchaseRate (always supplier/basic INR — never overwrite with landed cost)
            const item = await Item.findById(objectId);
            if (item) {
                logger.info(`Updating Item ${item.itemCode} purchaseRate to ${rate}`);
                item.purchaseRate = rate;
                item.lastPurchaseCost = rate;
                item.updatedBy = userId;
                await item.save();

                const bomComponentRate = (piItem.useInventoryValuationForBom && Number(item.valuationRate) > 0)
                    ? Number(item.valuationRate)
                    : rate;

                await logCostingAudit({
                    action: 'RM_COST_UPDATE',
                    itemId: item._id,
                    userId,
                    details: { purchaseRate: rate, source: 'purchase_invoice_sync', bomComponentRate },
                });

                // 2. Find all BOMs containing this item
                const affectedBOMs = await BOM.find({ 'components.itemId': objectId });
                logger.info(`Found ${affectedBOMs.length} BOMs for Item ${item.itemCode}`);

                for (const bom of affectedBOMs) {
                    // Update the rate in the components array
                    let modified = false;
                    for (const comp of bom.components) {
                        if (comp.itemId.toString() === objectId.toString()) {
                            comp.rate = bomComponentRate;
                            modified = true;
                        }
                    }

                    if (modified) {
                        logger.info(`Syncing rate to BOM ${bom.bomNumber}`);
                        // 3. Recalculate costs and save
                        await recalculateBOMCosts(bom);
                        await logCostingAudit({
                            action: 'BOM_COST_SNAPSHOT',
                            itemId: bom.finishedProductId,
                            userId,
                            details: { bomNumber: bom.bomNumber, finalProductionCostPerUnit: bom.finalProductionCostPerUnit },
                        });
                    }
                }
            } else {
                logger.warn(`Item with ID ${itemId} not found for price sync`);
            }
        }
    } catch (error) {
        logger.error('Error in syncPurchaseRatesToBOMs:', error);
        throw error;
    }
};
