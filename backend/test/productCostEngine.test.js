import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COST_SOURCES, resolveUnitCost, enrichSalesItemsWithGp } from '../src/services/productCostEngine.service.js';

describe('productCostEngine.resolveUnitCost', () => {
    it('trading item uses valuation rate', async () => {
        const r = await resolveUnitCost({
            itemMaster: { itemCategory: 'TRADING', valuationRate: 150, purchaseRate: 140 },
            saleType: 'TRADING_SALE',
        });
        assert.equal(r.unitCost, 150);
        assert.equal(r.costSource, COST_SOURCES.VALUATION);
    });

    it('manufactured item uses manual cost when BOM missing', async () => {
        const r = await resolveUnitCost({
            itemMaster: {
                itemCategory: 'FINISHED_GOOD',
                isManufacturable: true,
                useManualBOMCost: true,
                manualBOMCostPerUnit: 420,
            },
            saleType: 'MANUFACTURED_SALE',
        });
        assert.equal(r.unitCost, 420);
        assert.equal(r.costSource, COST_SOURCES.MANUAL);
    });

    it('returns estimated with warning when no cost', async () => {
        const r = await resolveUnitCost({
            itemMaster: { itemCategory: 'TRADING', valuationRate: 0, purchaseRate: 0 },
            saleType: 'TRADING_SALE',
        });
        assert.equal(r.unitCost, 0);
        assert.equal(r.costSource, COST_SOURCES.ESTIMATED);
        assert.ok(r.warnings.length > 0);
    });
});

describe('productCostEngine.enrichSalesItemsWithGp', () => {
    it('GP excludes GST — uses taxable amount only', async () => {
        const { items, invoiceTotals } = await enrichSalesItemsWithGp(
            [
                {
                    itemId: null,
                    itemCode: 'X',
                    qty: 10,
                    rate: 100,
                    taxableAmount: 1000,
                    totalAmount: 1180,
                    saleType: 'TRADING_SALE',
                },
            ],
            new Date(),
            { settings: { negativeGpThresholdPercent: 0 } },
        );
        assert.equal(items[0].gpAmount, 1000);
        assert.equal(invoiceTotals.totalGpAmount, 1000);
    });
});

describe('productCostEngine priority labels', () => {
    it('exports cost source constants', () => {
        assert.ok(COST_SOURCES.ACTUAL_FG);
        assert.ok(COST_SOURCES.BOM_STANDARD);
        assert.ok(COST_SOURCES.MANUAL);
    });
});
