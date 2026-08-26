import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    qtyMatchesSlab,
    validateLineSlabs,
    pickLineForQty,
    deriveAdjacentMaxQty,
    formatQtyBreakLabel,
    suggestFromLoadedLists,
    computeFinalRate,
    isDateInValidity,
} from '../src/services/customerPriceLookup.service.js';

describe('customerPriceLookup slabs', () => {
    it('matches qty 250 to 100–499 slab', () => {
        assert.equal(qtyMatchesSlab(250, 1, 99), false);
        assert.equal(qtyMatchesSlab(250, 100, 499), true);
        assert.equal(qtyMatchesSlab(250, 500, null), false);
        assert.equal(qtyMatchesSlab(500, 500, null), true);
    });

    it('rejects overlapping slabs', () => {
        const err = validateLineSlabs([
            { itemId: 'A', minQty: 1, maxQty: 99, productName: 'DALI' },
            { itemId: 'A', minQty: 50, maxQty: 200, productName: 'DALI' },
        ]);
        assert.match(err, /Overlapping/);
    });

    it('allows adjacent slabs 1–99 / 100–499 / 500+', () => {
        const err = validateLineSlabs([
            { itemId: 'A', minQty: 1, maxQty: 99 },
            { itemId: 'A', minQty: 100, maxQty: 499 },
            { itemId: 'A', minQty: 500, maxQty: null },
        ]);
        assert.equal(err, null);
    });

    it('picks slab rate 810 for qty 250', () => {
        const lines = [
            { itemId: 'drv', minQty: 1, maxQty: 99, finalRate: 850 },
            { itemId: 'drv', minQty: 100, maxQty: 499, finalRate: 810 },
            { itemId: 'drv', minQty: 500, maxQty: null, finalRate: 775 },
        ];
        const picked = pickLineForQty(lines, 'drv', 250);
        assert.equal(picked.priority, 1);
        assert.equal(picked.line.finalRate, 810);
    });

    it('derives adjacent maxQty from From Qty only', () => {
        const derived = deriveAdjacentMaxQty([
            { itemId: 'A', minQty: 1, finalRate: 500 },
            { itemId: 'A', minQty: 100, finalRate: 475 },
            { itemId: 'A', minQty: 250, finalRate: 450 },
        ]);
        assert.equal(derived[0].maxQty, 99);
        assert.equal(derived[1].maxQty, 249);
        assert.equal(derived[2].maxQty, null);
        assert.equal(formatQtyBreakLabel(derived[0]), 'Sample / 1 pc');
        assert.equal(formatQtyBreakLabel(derived[2]), '250+ pcs');
    });

    it('uses highest filled Qty threshold <= ordered qty and ignores blank rates', () => {
        const lines = [
            { itemId: 'drv', minQty: 1, finalRate: 500 },
            { itemId: 'drv', minQty: 10, finalRate: '' },
            { itemId: 'drv', minQty: 50, finalRate: '' },
            { itemId: 'drv', minQty: 100, finalRate: 475 },
            { itemId: 'drv', minQty: 250, finalRate: 450 },
            { itemId: 'drv', minQty: 500, finalRate: 425 },
            { itemId: 'drv', minQty: 1000, finalRate: 400 },
        ];
        assert.equal(pickLineForQty(lines, 'drv', 5).line.finalRate, 500);
        assert.equal(pickLineForQty(lines, 'drv', 75).line.finalRate, 500);
        assert.equal(pickLineForQty(lines, 'drv', 100).line.finalRate, 475);
        assert.equal(pickLineForQty(lines, 'drv', 300).line.finalRate, 450);
        assert.equal(pickLineForQty(lines, 'drv', 700).line.finalRate, 425);
        assert.equal(pickLineForQty(lines, 'drv', 1200).line.finalRate, 400);
        assert.equal(pickLineForQty(lines, 'drv', 50).line.finalRate, 500);
        assert.equal(pickLineForQty(lines, 'drv', 10).line.finalRate, 500);
    });
});

describe('customerPriceLookup suggestFromLoadedLists', () => {
    const base = {
        _id: 'pl1',
        priceListNo: 'PL/26-27/001',
        version: 'V2',
        versionNo: 2,
        status: 'Approved',
        priceType: 'Customer Specific',
        currency: 'INR',
        effectiveFrom: '2026-09-15',
        validUpto: '2026-12-31',
        approvedAt: '2026-09-15',
        lines: [{ itemId: 'drv', finalRate: 825, standardPrice: 850 }],
    };

    it('Priority 2: customer specific item price without slab', () => {
        const r = suggestFromLoadedLists({
            lists: [base],
            itemId: 'drv',
            qty: 10,
            docDate: '2026-10-01',
            standardPrice: 850,
        });
        assert.equal(r.suggestedRate, 825);
        assert.equal(r.priority, 2);
        assert.equal(r.source.priceListNo, 'PL/26-27/001');
        assert.equal(r.source.version, 'V2');
    });

    it('does not use Draft / Expired / Superseded', () => {
        const r = suggestFromLoadedLists({
            lists: [
                { ...base, status: 'Draft', lines: [{ itemId: 'drv', finalRate: 1 }] },
                { ...base, _id: 'e', status: 'Expired', lines: [{ itemId: 'drv', finalRate: 2 }] },
                { ...base, _id: 's', status: 'Superseded', lines: [{ itemId: 'drv', finalRate: 3 }] },
            ],
            itemId: 'drv',
            qty: 10,
            docDate: '2026-10-01',
            standardPrice: 850,
        });
        assert.equal(r.priority, 4);
        assert.equal(r.suggestedRate, 850);
    });

    it('does not use a list after Valid Upto', () => {
        const r = suggestFromLoadedLists({
            lists: [base],
            itemId: 'drv',
            qty: 10,
            docDate: '2027-01-15',
            standardPrice: 850,
        });
        assert.equal(r.priority, 4);
        assert.equal(r.suggestedRate, 850);
    });

    it('picks latest effective version over older V1', () => {
        const v1 = {
            ...base,
            _id: 'v1',
            version: 'V1',
            versionNo: 1,
            effectiveFrom: '2026-08-01',
            lines: [{ itemId: 'drv', finalRate: 850 }],
        };
        const r = suggestFromLoadedLists({
            lists: [v1, base],
            itemId: 'drv',
            qty: 10,
            docDate: '2026-10-01',
            standardPrice: 900,
        });
        assert.equal(r.suggestedRate, 825);
        assert.equal(r.source.version, 'V2');
    });

    it('falls back to item selling price when no customer list', () => {
        const r = suggestFromLoadedLists({
            lists: [],
            itemId: 'drv',
            qty: 10,
            docDate: '2026-10-01',
            standardPrice: 850,
        });
        assert.equal(r.priority, 4);
        assert.equal(r.suggestedRate, 850);
    });
});

describe('customerPriceLookup helpers', () => {
    it('computes final rate from offered and discount', () => {
        assert.equal(computeFinalRate(1000, 10), 900);
    });

    it('treats open validUpto as valid', () => {
        assert.equal(isDateInValidity('2026-01-01', null, '2026-08-24'), true);
    });
});
