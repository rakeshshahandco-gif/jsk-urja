import { FixedAsset } from '../models/fixedAsset.model.js';
import { AssetDepreciation } from '../models/assetDepreciation.model.js';

/**
 * Calculate depreciation amount for a single asset.
 */
export function calculateDepreciation(asset) {
    if (!asset.depreciationApplicable) return null;
    const rate = asset.depreciationRate || 0;
    if (!rate) return null;

    const method = asset.depreciationMethod || 'Straight Line Method';
    const baseValue = method === 'Straight Line Method' ? asset.capitalizedCost : asset.currentBookValue;
    const depAmount = +(baseValue * rate / 100).toFixed(2);
    const newBookValue = Math.max(asset.residualValue || 0, +(asset.currentBookValue - depAmount).toFixed(2));

    return {
        assetId: asset._id,
        assetName: asset.assetName,
        method,
        rate,
        openingBookValue: asset.currentBookValue,
        depreciationAmount: depAmount,
        closingBookValue: newBookValue,
    };
}

/**
 * Run depreciation for all active assets for a given period.
 * @param {Date} periodStart
 * @param {Date} periodEnd
 * @param {boolean} dryRun — if true, compute only and do not persist
 */
export async function runDepreciation({ periodStart, periodEnd, dryRun = false, createdBy }) {
    const assets = await FixedAsset.find({ isActive: true, depreciationApplicable: true, status: { $nin: ['Disposed', 'Sold', 'Scrapped'] } }).lean();

    const entries = [];
    for (const asset of assets) {
        const calc = calculateDepreciation(asset);
        if (!calc) continue;
        entries.push(calc);
    }

    if (!entries.length) return { entries: [], totalAmount: 0, dryRun };

    const totalAmount = entries.reduce((s, e) => s + e.depreciationAmount, 0);

    if (!dryRun) {
        const depRecord = await AssetDepreciation.create({
            runDate: new Date(),
            periodStart: new Date(periodStart),
            periodEnd: new Date(periodEnd),
            totalAmount: +totalAmount.toFixed(2),
            entries: entries.map(e => ({
                asset: e.assetId,
                amount: e.depreciationAmount,
                openingBookValue: e.openingBookValue,
                closingBookValue: e.closingBookValue,
            })),
            createdBy,
        });

        // Update each asset's currentBookValue and accumulatedDepreciation
        for (const e of entries) {
            await FixedAsset.findByIdAndUpdate(e.assetId, {
                currentBookValue: e.closingBookValue,
                $inc: { accumulatedDepreciation: e.depreciationAmount },
                lastDepreciationDate: new Date(periodEnd),
            });
        }

        return { _id: depRecord._id, entries, totalAmount: +totalAmount.toFixed(2), dryRun: false };
    }

    return { entries, totalAmount: +totalAmount.toFixed(2), dryRun: true };
}

/**
 * Depreciation schedule projection for a single asset.
 */
export function buildDepreciationSchedule(asset, years = 10) {
    const schedule = [];
    let bookValue = asset.currentBookValue;
    const rate = asset.depreciationRate || 0;
    const method = asset.depreciationMethod || 'Straight Line Method';
    const residual = asset.residualValue || 0;

    for (let i = 1; i <= years && bookValue > residual; i++) {
        const base = method === 'Straight Line Method' ? asset.capitalizedCost : bookValue;
        const dep = Math.min(+(base * rate / 100).toFixed(2), bookValue - residual);
        bookValue = Math.max(residual, +(bookValue - dep).toFixed(2));
        schedule.push({ year: i, depreciationAmount: dep, closingBookValue: bookValue });
    }
    return schedule;
}
