import mongoose from 'mongoose';
import { Item } from '../models/item.model.js';
import { BOM } from '../models/bom.model.js';
import { ProductionCostSnapshot } from '../models/productionCostSnapshot.model.js';
import { CostingSettings } from '../models/costingSettings.model.js';
import { logCostingAudit } from './costingAudit.service.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const COST_SOURCES = {
    ACTUAL_FG: 'ACTUAL_FG',
    BOM_STANDARD: 'BOM_STANDARD',
    MANUAL: 'MANUAL',
    VALUATION: 'VALUATION',
    ESTIMATED: 'ESTIMATED',
};

export async function getCostingSettings() {
    let doc = await CostingSettings.findOne().lean();
    if (!doc) doc = (await CostingSettings.create({})).toObject();
    return doc;
}

function isManufacturedItem(item, saleType) {
    if (saleType === 'MANUFACTURED_SALE') return true;
    if (!item) return false;
    return item.itemCategory === 'FINISHED_GOOD' || item.isManufacturable === true;
}

function lineSalesValue(line) {
    const taxable = Number(line.taxableAmount);
    if (taxable > 0) return r2(taxable);
    const qty = Number(line.qty) || 0;
    const rate = Number(line.rate) || 0;
    const disc = Number(line.discountAmount) || 0;
    return r2(Math.max(0, qty * rate - disc));
}

/** Batch-load items, latest FG snapshots, and default BOMs for invoice GP enrichment. */
export async function preloadCostContext(itemIds, asOfDate) {
    const ids = [...new Set((itemIds || []).filter(Boolean).map((id) => id.toString()))];
    if (!ids.length) {
        return { itemMap: new Map(), snapMap: new Map(), bomMap: new Map() };
    }

    const asOf = asOfDate ? new Date(asOfDate) : new Date();
    const oidIds = ids.map((id) => new mongoose.Types.ObjectId(id));

    const [items, snapshots, boms] = await Promise.all([
        Item.find({ _id: { $in: oidIds } }).lean(),
        ProductionCostSnapshot.find({
            finishedItemId: { $in: oidIds },
            productionDate: { $lte: asOf },
            fgCalculatedCostPerUnit: { $gt: 0 },
        })
            .sort({ productionDate: -1 })
            .lean(),
        BOM.find({ finishedProductId: { $in: oidIds }, isDefault: true }).lean(),
    ]);

    const itemMap = new Map(items.map((i) => [i._id.toString(), i]));

    const snapMap = new Map();
    for (const snap of snapshots) {
        const key = snap.finishedItemId.toString();
        if (!snapMap.has(key)) snapMap.set(key, snap);
    }

    const bomMap = new Map();
    for (const bom of boms) {
        const key = bom.finishedProductId.toString();
        const existing = bomMap.get(key);
        if (!existing || (bom.status === 'Approved' && existing.status !== 'Approved')) {
            bomMap.set(key, bom);
        }
    }

    return { itemMap, snapMap, bomMap };
}

/**
 * Cost priority engine — does NOT mutate stock or valuation.
 */
export async function resolveUnitCost({
    itemId,
    itemMaster,
    saleType,
    asOfDate,
    workOrderId,
    useStoredSnapshotOnly = false,
    cache,
}) {
    const warnings = [];
    let item = itemMaster;
    if (!item && itemId) {
        item = cache?.itemMap?.get(itemId.toString()) ?? (await Item.findById(itemId).lean());
    }
    const effectiveItemId = itemId || item?._id;

    if (!item) {
        return { unitCost: 0, costSource: COST_SOURCES.ESTIMATED, warnings: ['Item not found'], costEstimated: true };
    }

    const asOf = asOfDate ? new Date(asOfDate) : new Date();
    const manufactured = isManufacturedItem(item, saleType);

    if (manufactured) {
        if (effectiveItemId) {
            const itemKey = effectiveItemId.toString();
            let snapshot = null;

            if (cache) {
                snapshot = cache.snapMap.get(itemKey) || null;
            } else if (workOrderId) {
                snapshot = await ProductionCostSnapshot.findOne({
                    finishedItemId: effectiveItemId,
                    workOrderId,
                    productionDate: { $lte: asOf },
                    fgCalculatedCostPerUnit: { $gt: 0 },
                })
                    .sort({ productionDate: -1 })
                    .lean();
            }
            if (!snapshot && !cache) {
                snapshot = await ProductionCostSnapshot.findOne({
                    finishedItemId: effectiveItemId,
                    productionDate: { $lte: asOf },
                    fgCalculatedCostPerUnit: { $gt: 0 },
                })
                    .sort({ productionDate: -1 })
                    .lean();
            }

            if (snapshot?.fgCalculatedCostPerUnit > 0) {
                return {
                    unitCost: r2(snapshot.fgCalculatedCostPerUnit),
                    costSource: COST_SOURCES.ACTUAL_FG,
                    snapshotId: snapshot._id,
                    bomId: snapshot.bomId,
                    warnings,
                    costEstimated: false,
                };
            }

            let bom = cache ? cache.bomMap.get(itemKey) || null : null;
            if (!bom && !cache) {
                bom =
                    (await BOM.findOne({ finishedProductId: effectiveItemId, isDefault: true, status: 'Approved' }).lean()) ||
                    (await BOM.findOne({ finishedProductId: effectiveItemId, isDefault: true }).lean());
            }

            if (bom?.finalProductionCostPerUnit > 0) {
                return {
                    unitCost: r2(bom.finalProductionCostPerUnit),
                    costSource: COST_SOURCES.BOM_STANDARD,
                    bomId: bom._id,
                    bomNumber: bom.bomNumber,
                    warnings: useStoredSnapshotOnly ? warnings : [],
                    costEstimated: false,
                };
            }
        }

        if (useStoredSnapshotOnly) {
            warnings.push('No production cost snapshot — estimated from BOM/manual');
        }

        if (item.standardBomCost > 0) {
            return {
                unitCost: r2(item.standardBomCost),
                costSource: COST_SOURCES.BOM_STANDARD,
                warnings,
                costEstimated: false,
            };
        }

        if (item.useManualBOMCost && item.manualBOMCostPerUnit > 0) {
            return {
                unitCost: r2(item.manualBOMCostPerUnit),
                costSource: COST_SOURCES.MANUAL,
                warnings: ['Using manual item cost (BOM unavailable)'],
                costEstimated: false,
            };
        }

        if (item.manualItemCost > 0) {
            return {
                unitCost: r2(item.manualItemCost),
                costSource: COST_SOURCES.MANUAL,
                warnings: ['Using manual item cost'],
                costEstimated: false,
            };
        }
    } else {
        if (item.valuationRate > 0) {
            return { unitCost: r2(item.valuationRate), costSource: COST_SOURCES.VALUATION, warnings, costEstimated: true };
        }
        const lp = item.lastPurchaseCost || item.purchaseRate || item.averageCost;
        if (lp > 0) {
            return { unitCost: r2(lp), costSource: COST_SOURCES.VALUATION, warnings, costEstimated: true };
        }
        if (item.useManualBOMCost && item.manualBOMCostPerUnit > 0) {
            return { unitCost: r2(item.manualBOMCostPerUnit), costSource: COST_SOURCES.MANUAL, warnings, costEstimated: false };
        }
        if (item.manualItemCost > 0) {
            return { unitCost: r2(item.manualItemCost), costSource: COST_SOURCES.MANUAL, warnings, costEstimated: false };
        }
    }

    if (item.valuationRate > 0) {
        warnings.push('Fallback to valuation rate');
        return { unitCost: r2(item.valuationRate), costSource: COST_SOURCES.VALUATION, warnings, costEstimated: true };
    }

    warnings.push('Cost missing — GP may be inaccurate');
    return { unitCost: 0, costSource: COST_SOURCES.ESTIMATED, warnings, costEstimated: true };
}

/**
 * Attach GP fields to sales invoice lines (excludes GST from GP base).
 */
export async function enrichSalesItemsWithGp(items, invoiceDate, options = {}) {
    const settings = options.settings || (await getCostingSettings());
    const threshold = Number(settings.negativeGpThresholdPercent ?? 0);
    const enriched = [];
    let totalSales = 0;
    let totalCost = 0;
    const invoiceWarnings = [];

    const itemIds = (items || []).map((line) => line.itemId).filter(Boolean);
    const cache = options.cache || (await preloadCostContext(itemIds, invoiceDate));

    for (const line of items || []) {
        const salesValue = lineSalesValue(line);
        const costInfo = await resolveUnitCost({
            itemId: line.itemId,
            saleType: line.saleType,
            asOfDate: invoiceDate,
            cache,
        });

        const unitCost = Math.max(0, r2(costInfo.unitCost));
        const qty = Number(line.qty) || 0;
        const totalCostValue = r2(qty * unitCost);
        const gpAmount = r2(salesValue - totalCostValue);
        const gpPercent = salesValue > 0 ? r2((gpAmount / salesValue) * 100) : 0;

        const gpWarnings = [...(costInfo.warnings || [])];
        if (costInfo.costSource !== COST_SOURCES.ACTUAL_FG && costInfo.costSource !== COST_SOURCES.BOM_STANDARD) {
            gpWarnings.push(`Cost fallback: ${costInfo.costSource}`);
        }
        if (gpPercent < threshold) {
            gpWarnings.push(`GP ${gpPercent}% below threshold ${threshold}%`);
        }

        enriched.push({
            ...line,
            unitCost,
            totalCostValue,
            gpAmount,
            gpPercent,
            costSource: costInfo.costSource,
            costEstimated: Boolean(costInfo.costEstimated),
            productionCostSnapshotId: costInfo.snapshotId || null,
            gpWarning: gpWarnings.join('; '),
        });

        totalSales += salesValue;
        totalCost += totalCostValue;
        if (gpWarnings.length) invoiceWarnings.push({ itemCode: line.itemCode, warnings: gpWarnings });
    }

    const totalGpAmount = r2(totalSales - totalCost);
    const totalGpPercent = totalSales > 0 ? r2((totalGpAmount / totalSales) * 100) : 0;

    return {
        items: enriched,
        invoiceTotals: {
            totalCostValue: r2(totalCost),
            totalGpAmount,
            totalGpPercent,
            gpWarnings: invoiceWarnings,
            hasLowGp: totalGpPercent < threshold,
        },
    };
}

/**
 * Create immutable production cost snapshot — does NOT change stock valuation.
 */
export async function createProductionCostSnapshot({
    finishedItemId,
    qtyProduced,
    workOrderId,
    workOrderNo,
    productionOutputId,
    productionDate,
    userId,
    session,
    materialConsumption,
}) {
    const qty = Number(qtyProduced) || 0;
    if (!(qty > 0) || !finishedItemId) return null;

    const itemQuery = Item.findById(finishedItemId);
    const item = session ? await itemQuery.session(session) : await itemQuery;
    if (!item) return null;

    const bomQuery = BOM.findOne({ finishedProductId: finishedItemId, isDefault: true });
    const bom = session ? await bomQuery.session(session) : await bomQuery;

    let rmCostUsed = 0;
    if (Array.isArray(materialConsumption) && materialConsumption.length) {
        for (const m of materialConsumption) {
            rmCostUsed += (Number(m.consumedQty) || 0) * (Number(m.rate) || 0);
        }
    } else if (bom) {
        const perUnitRm = (Number(bom.totalRawMaterialCost) || 0) / (Number(bom.productionQuantity) || 1);
        rmCostUsed = perUnitRm * qty;
    }

    const bomStandardPerUnit = r2(bom?.finalProductionCostPerUnit || item.standardBomCost || 0);
    const otherPerUnit = bom
        ? r2(
              ((Number(bom.totalProcessCost) || 0) +
                  (Number(bom.overheadCost) || 0) +
                  (Number(bom.labourCost) || 0) +
                  (Number(bom.totalPointsLabourCost) || 0)) /
                  (Number(bom.productionQuantity) || 1),
          )
        : 0;

    let fgPerUnit = qty > 0 ? r2(rmCostUsed / qty + otherPerUnit) : bomStandardPerUnit;
    if (!(fgPerUnit > 0)) fgPerUnit = bomStandardPerUnit;
    fgPerUnit = Math.max(0, fgPerUnit);

    const payload = {
        finishedItemId,
        finishedItemCode: item.itemCode || '',
        finishedItemName: item.itemName || '',
        workOrderId: workOrderId || null,
        workOrderNo: workOrderNo || '',
        productionOutputId: productionOutputId || null,
        qtyProduced: qty,
        productionDate: productionDate || new Date(),
        rmCostUsed: r2(rmCostUsed),
        bomId: bom?._id || null,
        bomNumber: bom?.bomNumber || '',
        bomStandardCostPerUnit: bomStandardPerUnit,
        fgCalculatedCostPerUnit: fgPerUnit,
        totalFgCost: r2(fgPerUnit * qty),
        createdBy: userId || null,
    };

    const created = session
        ? await ProductionCostSnapshot.create([payload], { session })
        : await ProductionCostSnapshot.create(payload);
    const snap = Array.isArray(created) ? created[0] : created;

    item.stdProductionCost = fgPerUnit;
    if (session) await item.save({ session });
    else await item.save();

    await logCostingAudit({
        action: 'PRODUCTION_COST_SNAPSHOT',
        itemId: finishedItemId,
        productionSnapshotId: snap._id,
        userId,
        details: { fgPerUnit, rmCostUsed: r2(rmCostUsed), bomStandardPerUnit },
    });

    return snap;
}

/** Read GP from stored invoice line or resolve for legacy rows */
export function gpFromStoredLine(line) {
    if (line?.unitCost != null && line.unitCost > 0) {
        const salesValue = lineSalesValue(line);
        const cost = line.totalCostValue != null ? Number(line.totalCostValue) : r2(Number(line.qty) * Number(line.unitCost));
        const gp = line.gpAmount != null ? Number(line.gpAmount) : r2(salesValue - cost);
        const gpPct = line.gpPercent != null ? Number(line.gpPercent) : salesValue > 0 ? r2((gp / salesValue) * 100) : 0;
        return {
            salesValue,
            unitCost: Number(line.unitCost),
            totalCost: cost,
            gpAmount: gp,
            gpPercent: gpPct,
            costSource: line.costSource || 'STORED',
            costEstimated: Boolean(line.costEstimated),
        };
    }
    return null;
}

export async function resolveLineGp(line, invoiceDate) {
    const stored = gpFromStoredLine(line);
    if (stored) return stored;

    const salesValue = lineSalesValue(line);
    const costInfo = await resolveUnitCost({
        itemId: line.itemId,
        saleType: line.saleType,
        asOfDate: invoiceDate,
    });
    const unitCost = Math.max(0, r2(costInfo.unitCost));
    const totalCost = r2((Number(line.qty) || 0) * unitCost);
    const gpAmount = r2(salesValue - totalCost);
    return {
        salesValue,
        unitCost,
        totalCost,
        gpAmount,
        gpPercent: salesValue > 0 ? r2((gpAmount / salesValue) * 100) : 0,
        costSource: costInfo.costSource,
        costEstimated: true,
    };
}

export function isExportInvoice(inv) {
    const reg = String(inv.customerRegistrationType || '').toLowerCase();
    const gst = String(inv.gstType || '');
    const country = String(inv.exportCountry || inv.shippingCountry || '').trim();
    if (reg.includes('export') || inv.invoiceType === 'Deemed Export') return true;
    if (gst === 'IGST' && country && country.toLowerCase() !== 'india') return true;
    return false;
}
