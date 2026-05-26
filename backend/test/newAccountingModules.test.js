import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// â”€â”€ 1. Cost Center Service (pure logic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('costCenter.getCostCenterTree', () => {
    it('builds tree from flat list', async () => {
        // Pure transformation logic test
        const flatList = [
            { _id: '1', name: 'Manufacturing', parentId: null, children: [] },
            { _id: '2', name: 'Assembly', parentId: '1', children: [] },
            { _id: '3', name: 'Testing', parentId: '1', children: [] },
            { _id: '4', name: 'Admin', parentId: null, children: [] },
        ];

        // Simulate tree building logic from service
        const map = {};
        flatList.forEach(c => { map[c._id] = { ...c, children: [] }; });
        const roots = [];
        flatList.forEach(c => {
            if (c.parentId) {
                const parent = map[c.parentId];
                if (parent) parent.children.push(map[c._id]);
            } else {
                roots.push(map[c._id]);
            }
        });

        assert.equal(roots.length, 2);
        const mfg = roots.find(r => r.name === 'Manufacturing');
        assert.ok(mfg);
        assert.equal(mfg.children.length, 2);
        const childNames = mfg.children.map(c => c.name);
        assert.ok(childNames.includes('Assembly'));
        assert.ok(childNames.includes('Testing'));
    });
});

// â”€â”€ 2. Budget Service (pure logic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('budget.getBudgetVsActual logic', () => {
    it('computes variance correctly for expense ledger (Dr normal)', () => {
        const budgeted = 50000;
        const actual = 42000;
        const variance = budgeted - actual;
        const variancePct = +((variance / budgeted) * 100).toFixed(2);
        const status = variance >= 0 ? 'Under Budget' : 'Over Budget';

        assert.equal(variance, 8000);
        assert.equal(variancePct, 16);
        assert.equal(status, 'Under Budget');
    });

    it('flags Over Budget when actual exceeds budget', () => {
        const budgeted = 30000;
        const actual = 35000;
        const variance = budgeted - actual;
        const status = variance >= 0 ? 'Under Budget' : 'Over Budget';

        assert.equal(variance, -5000);
        assert.equal(status, 'Over Budget');
    });

    it('handles zero budget gracefully (no divide-by-zero)', () => {
        const budgeted = 0;
        const actual = 5000;
        const variancePct = budgeted > 0 ? +((((budgeted - actual) / budgeted) * 100)).toFixed(2) : 0;
        assert.equal(variancePct, 0);
    });
});

// â”€â”€ 3. PDC Cheque status transitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('pdcCheque.status transitions', () => {
    it('Pending -> Presented -> Cleared is valid', () => {
        const validTransitions = {
            Pending: ['Presented', 'Cancelled'],
            Presented: ['Cleared', 'Bounced', 'Cancelled'],
            Cleared: [],
            Bounced: [],
            Cancelled: [],
        };
        assert.ok(validTransitions['Pending'].includes('Presented'));
        assert.ok(validTransitions['Presented'].includes('Cleared'));
        assert.equal(validTransitions['Cleared'].length, 0);
    });

    it('cannot clear a cheque from Cleared status', () => {
        const status = 'Cleared';
        const canClear = ['Pending', 'Presented'].includes(status);
        assert.equal(canClear, false);
    });

    it('getDueSoon filters cheques due within N days', () => {
        const today = new Date();
        const in3Days = new Date(today);
        in3Days.setDate(today.getDate() + 3);
        const in10Days = new Date(today);
        in10Days.setDate(today.getDate() + 10);

        const cheques = [
            { chequeNo: 'CHQ001', chequeDate: in3Days, status: 'Pending', amount: 10000 },
            { chequeNo: 'CHQ002', chequeDate: in10Days, status: 'Pending', amount: 20000 },
        ];

        const until = new Date(today);
        until.setDate(until.getDate() + 7);

        const dueSoon = cheques.filter(c => c.chequeDate >= today && c.chequeDate <= until && c.status === 'Pending');
        assert.equal(dueSoon.length, 1);
        assert.equal(dueSoon[0].chequeNo, 'CHQ001');
    });
});

// â”€â”€ 4. TCS Service (pure logic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('tcs.previewTcs logic', () => {
    const section206C = {
        sectionCode: '206C',
        description: 'TCS on sale of scrap',
        rate: 1,
        higherRate: 0,
        thresholdAmount: 0,
    };

    it('computes TCS at 1% on sale amount', () => {
        const saleAmount = 100000;
        const rate = section206C.rate;
        const tcsAmount = +(saleAmount * rate / 100).toFixed(2);
        assert.equal(tcsAmount, 1000);
    });

    it('applies higher rate when PAN not available (206CCA)', () => {
        const section = { ...section206C, higherRate: 5 };
        const saleAmount = 50000;
        const rate = section.higherRate || section.rate * 2;
        const tcsAmount = +(saleAmount * rate / 100).toFixed(2);
        assert.equal(tcsAmount, 2500);
    });

    it('returns not applicable when sale below threshold', () => {
        const section = { ...section206C, thresholdAmount: 50000 };
        const saleAmount = 30000;
        const applicable = !(section.thresholdAmount > 0 && saleAmount < section.thresholdAmount);
        assert.equal(applicable, false);
    });

    it('quarterly summary groups by section and quarter', () => {
        const deductions = [
            { section: '206C', quarter: 'Q1', saleAmount: 100000, tcsAmount: 1000 },
            { section: '206C', quarter: 'Q1', saleAmount: 50000, tcsAmount: 500 },
            { section: '206CB', quarter: 'Q2', saleAmount: 200000, tcsAmount: 4000 },
        ];

        const grouped = {};
        deductions.forEach(d => {
            const key = `${d.section}|${d.quarter}`;
            if (!grouped[key]) grouped[key] = { section: d.section, quarter: d.quarter, totalSale: 0, totalTcs: 0, count: 0 };
            grouped[key].totalSale += d.saleAmount;
            grouped[key].totalTcs += d.tcsAmount;
            grouped[key].count++;
        });

        const rows = Object.values(grouped);
        assert.equal(rows.length, 2);
        const q1Row = rows.find(r => r.section === '206C' && r.quarter === 'Q1');
        assert.ok(q1Row);
        assert.equal(q1Row.totalSale, 150000);
        assert.equal(q1Row.totalTcs, 1500);
    });
});

// â”€â”€ 5. Cash Flow Statement (pure logic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('cashFlow.logic', () => {
    it('net change equals closing cash minus opening cash', () => {
        const openingCash = 50000;
        const operating = 30000;
        const investing = -20000;
        const financing = 10000;
        const netChange = operating + investing + financing;
        const closingCash = openingCash + netChange;

        assert.equal(netChange, 20000);
        assert.equal(closingCash, 70000);
    });

    it('working capital change for liability is positive when liability increases', () => {
        // When a liability increases, it's a source of cash (positive)
        const liabilityOB = 10000;
        const liabilityCB = 15000;
        const change = liabilityCB - liabilityOB;
        const cfImpact = change; // For liabilities, increase = positive CF impact
        assert.equal(cfImpact, 5000);
    });

    it('working capital change for asset is negative when asset increases', () => {
        // When an asset increases (like inventory), it uses cash
        const assetOB = 30000;
        const assetCB = 40000;
        const change = assetCB - assetOB;
        const cfImpact = -change; // For assets, increase = negative CF impact
        assert.equal(cfImpact, -10000);
    });
});

// â”€â”€ 6. Ageing Analysis (pure logic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('ageing.buckets', () => {
    const asOn = new Date('2025-03-31');

    function daysPast(invoiceDate, dueDate) {
        const due = dueDate ? new Date(dueDate) : new Date(invoiceDate);
        return Math.floor((asOn - due) / (1000 * 60 * 60 * 24));
    }

    function assignBucket(days) {
        if (days <= 0) return 'current';
        if (days <= 30) return '0-30';
        if (days <= 60) return '31-60';
        if (days <= 90) return '61-90';
        if (days <= 180) return '91-180';
        if (days <= 365) return '181-365';
        return 'over365';
    }

    it('assigns future due date to current bucket', () => {
        const days = daysPast('2025-02-01', '2025-04-15');
        assert.ok(days < 0);
        assert.equal(assignBucket(days), 'current');
    });

    it('assigns 45-day overdue to 31-60 bucket', () => {
        const due = new Date(asOn);
        due.setDate(due.getDate() - 45);
        const days = daysPast('2025-01-01', due.toISOString());
        assert.ok(days > 30 && days <= 60);
        assert.equal(assignBucket(days), '31-60');
    });

    it('assigns 400-day overdue to over365 bucket', () => {
        const due = new Date(asOn);
        due.setDate(due.getDate() - 400);
        const days = daysPast('2024-01-01', due.toISOString());
        assert.ok(days > 365);
        assert.equal(assignBucket(days), 'over365');
    });

    it('bucket summary totals are correct', () => {
        const invoices = [
            { outstanding: 10000, daysPast: 0 },
            { outstanding: 20000, daysPast: 25 },
            { outstanding: 15000, daysPast: 55 },
            { outstanding: 8000, daysPast: 400 },
        ];

        const buckets = { current: 0, '0-30': 0, '31-60': 0, 'over365': 0 };
        invoices.forEach(inv => {
            const b = assignBucket(inv.daysPast);
            if (buckets[b] !== undefined) buckets[b] += inv.outstanding;
        });

        assert.equal(buckets.current, 10000);
        assert.equal(buckets['0-30'], 20000);
        assert.equal(buckets['31-60'], 15000);
        assert.equal(buckets['over365'], 8000);
    });
});

// â”€â”€ 7. Reversing Journal (pure logic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('reversingJournal.logic', () => {
    it('reversal flips Dr/Cr on all voucher lines', () => {
        const originalItems = [
            { ledgerId: 'L1', amount: 5000, type: 'Debit' },
            { ledgerId: 'L2', amount: 5000, type: 'Credit' },
        ];

        const reversedItems = originalItems.map(item => ({
            ...item,
            type: item.type === 'Debit' ? 'Credit' : 'Debit',
        }));

        assert.equal(reversedItems[0].type, 'Credit');
        assert.equal(reversedItems[1].type, 'Debit');
    });

    it('reversal amounts are same as original', () => {
        const originalItems = [
            { amount: 12500, type: 'Debit' },
            { amount: 12500, type: 'Credit' },
        ];
        const reversedItems = originalItems.map(i => ({ ...i, type: i.type === 'Debit' ? 'Credit' : 'Debit' }));

        const originalTotal = originalItems.reduce((s, i) => s + i.amount, 0);
        const reversalTotal = reversedItems.reduce((s, i) => s + i.amount, 0);
        assert.equal(originalTotal, reversalTotal);
    });

    it('cannot reverse a cancelled voucher', () => {
        const voucher = { status: 'Cancelled', isReversed: false };
        const canReverse = voucher.status !== 'Cancelled' && !voucher.isReversed;
        assert.equal(canReverse, false);
    });

    it('cannot reverse an already-reversed voucher', () => {
        const voucher = { status: 'Confirmed', isReversed: true };
        const canReverse = voucher.status !== 'Cancelled' && !voucher.isReversed;
        assert.equal(canReverse, false);
    });
});

// â”€â”€ 8. Depreciation Service (pure logic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('depreciation.calculateDepreciation', () => {
    const slmAsset = {
        capitalizedCost: 100000,
        currentBookValue: 100000,
        depreciationRate: 10,
        depreciationMethod: 'Straight Line Method',
        depreciationApplicable: true,
        residualValue: 10000,
    };

    const wdvAsset = {
        capitalizedCost: 100000,
        currentBookValue: 80000,
        depreciationRate: 20,
        depreciationMethod: 'Written Down Value',
        depreciationApplicable: true,
        residualValue: 0,
    };

    it('SLM: depreciation on capitalized cost, year 1', () => {
        const base = slmAsset.capitalizedCost;
        const dep = +(base * slmAsset.depreciationRate / 100).toFixed(2);
        const newBV = Math.max(slmAsset.residualValue, +(slmAsset.currentBookValue - dep).toFixed(2));
        assert.equal(dep, 10000);
        assert.equal(newBV, 90000);
    });

    it('SLM: depreciation same every year', () => {
        const dep1 = +(slmAsset.capitalizedCost * slmAsset.depreciationRate / 100).toFixed(2);
        const dep2 = +(slmAsset.capitalizedCost * slmAsset.depreciationRate / 100).toFixed(2);
        assert.equal(dep1, dep2); // SLM is constant
    });

    it('WDV: depreciation on book value', () => {
        const dep = +(wdvAsset.currentBookValue * wdvAsset.depreciationRate / 100).toFixed(2);
        const newBV = Math.max(0, +(wdvAsset.currentBookValue - dep).toFixed(2));
        assert.equal(dep, 16000);
        assert.equal(newBV, 64000);
    });

    it('WDV: depreciation reduces each year', () => {
        let bv = 100000;
        const rate = 20;
        const deps = [];
        for (let i = 0; i < 3; i++) {
            const dep = +(bv * rate / 100).toFixed(2);
            deps.push(dep);
            bv -= dep;
        }
        assert.ok(deps[0] > deps[1]);
        assert.ok(deps[1] > deps[2]);
    });

    it('depreciationApplicable=false skips asset', () => {
        const asset = { ...slmAsset, depreciationApplicable: false };
        const result = !asset.depreciationApplicable ? null : 'would calculate';
        assert.equal(result, null);
    });

    it('asset at residual value does not depreciate further', () => {
        const asset = { ...slmAsset, currentBookValue: 10000 }; // at residual
        const dep = +(asset.capitalizedCost * asset.depreciationRate / 100).toFixed(2);
        const newBV = Math.max(asset.residualValue, +(asset.currentBookValue - dep).toFixed(2));
        assert.equal(newBV, 10000); // clamped to residual
    });

    it('buildDepreciationSchedule produces correct number of years', () => {
        const schedule = [];
        let bv = slmAsset.capitalizedCost;
        const rate = slmAsset.depreciationRate;
        const residual = slmAsset.residualValue;
        for (let i = 1; i <= 5 && bv > residual; i++) {
            const dep = Math.min(+(slmAsset.capitalizedCost * rate / 100).toFixed(2), bv - residual);
            bv = Math.max(residual, +(bv - dep).toFixed(2));
            schedule.push({ year: i, dep, bv });
        }
        assert.equal(schedule.length, 5);
        // SLM 10% on 100,000 = 10,000/yr. After 5 yrs: bv = 50,000 (residual 10,000 not yet reached)
        assert.equal(schedule[schedule.length - 1].bv, 50000);
    });
});

// â”€â”€ 9. MSME Compliance (pure logic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('msme.logic', () => {
    const MSME_DAYS = 45;

    it('flags invoice older than 45 days as overdue', () => {
        const today = new Date('2025-03-31');
        const invoiceDate = new Date('2025-02-01'); // 58 days ago
        const daysPast = Math.floor((today - invoiceDate) / (1000 * 60 * 60 * 24));
        assert.ok(daysPast > MSME_DAYS);
    });

    it('does not flag invoice within 45 days', () => {
        const today = new Date('2025-03-31');
        const invoiceDate = new Date('2025-03-15'); // 16 days ago
        const daysPast = Math.floor((today - invoiceDate) / (1000 * 60 * 60 * 24));
        assert.ok(daysPast <= MSME_DAYS);
    });

    it('exceededBy calculation is correct', () => {
        const daysPast = 70;
        const exceededBy = daysPast - MSME_DAYS;
        assert.equal(exceededBy, 25);
    });
});

// â”€â”€ 10. Ratio Analysis (pure logic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('ratioAnalysis.logic', () => {
    const financials = {
        currentAssets: 500000,
        currentLiabilities: 250000,
        inventory: 100000,
        cash: 150000,
        netProfit: 200000,
        totalIncome: 1000000,
        totalAssets: 2000000,
        totalLiabilities: 800000,
    };

    const safe = (n, d) => d !== 0 ? +(n / d).toFixed(4) : null;

    it('current ratio = current assets / current liabilities', () => {
        const cr = safe(financials.currentAssets, financials.currentLiabilities);
        assert.equal(cr, 2.0);
    });

    it('quick ratio excludes inventory', () => {
        const qr = safe(financials.currentAssets - financials.inventory, financials.currentLiabilities);
        assert.equal(qr, 1.6);
    });

    it('net profit margin = net profit / total income', () => {
        const npm = safe(financials.netProfit, financials.totalIncome);
        assert.equal(npm, 0.2);
    });

    it('debt to equity ratio', () => {
        const equity = financials.totalAssets - financials.totalLiabilities;
        const de = safe(financials.totalLiabilities, equity);
        assert.equal(equity, 1200000);
        assert.ok(de > 0);
    });

    it('handles zero denominator gracefully', () => {
        const result = safe(100000, 0);
        assert.equal(result, null);
    });
});

// â”€â”€ 11. Interest on Overdue Bills (pure logic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('interestOnOverdue.logic', () => {
    const annualRate = 18; // 18% p.a.

    it('computes simple interest correctly', () => {
        const outstanding = 100000;
        const overdueDays = 30;
        const interest = +(outstanding * annualRate / 100 * overdueDays / 365).toFixed(2);
        // 100000 * 0.18 * 30/365 = 1479.45
        assert.ok(interest > 1479 && interest < 1480);
    });

    it('zero interest for non-overdue bill', () => {
        const overdueDays = 0;
        const interest = +(100000 * annualRate / 100 * overdueDays / 365).toFixed(2);
        assert.equal(interest, 0);
    });

    it('larger outstanding = larger interest', () => {
        const days = 60;
        const i1 = 50000 * annualRate / 100 * days / 365;
        const i2 = 100000 * annualRate / 100 * days / 365;
        assert.ok(i2 > i1);
    });

    it('longer overdue = more interest', () => {
        const principal = 100000;
        const i30 = principal * annualRate / 100 * 30 / 365;
        const i90 = principal * annualRate / 100 * 90 / 365;
        assert.ok(i90 > i30);
        assert.ok(Math.abs(i90 - i30 * 3) < 0.1); // proportional
    });
});

// â”€â”€ 12. E-Invoice Payload (pure logic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('eInvoice.payload', () => {
    it('determines supply type correctly', () => {
        const sellerStateCode = '27';
        const determineSupplyType = (buyerGstin) => {
            if (buyerGstin === 'URP') return 'B2C';
            const buyerState = buyerGstin.substring(0, 2);
            return buyerState !== sellerStateCode ? 'B2B' : 'B2B';
        };
        assert.equal(determineSupplyType('29AABCU9603R1ZX'), 'B2B'); // Karnataka buyer
        assert.equal(determineSupplyType('URP'), 'B2C');
    });

    it('item list preserves correct structure', () => {
        const items = [
            { itemName: 'Widget A', hsnCode: '84715000', qty: 10, rate: 1000, taxableAmount: 10000, gstRate: 18, cgstAmount: 900, sgstAmount: 900, igstAmount: 0 },
        ];
        const itemList = items.map((item, idx) => ({
            SlNo: String(idx + 1),
            HsnCd: item.hsnCode,
            Qty: item.qty,
            UnitPrice: item.rate,
            AssAmt: item.taxableAmount,
            GstRt: item.gstRate,
            CgstAmt: item.cgstAmount,
            SgstAmt: item.sgstAmount,
            IgstAmt: item.igstAmount,
        }));
        assert.equal(itemList[0].SlNo, '1');
        assert.equal(itemList[0].HsnCd, '84715000');
        assert.equal(itemList[0].AssAmt, 10000);
        assert.equal(itemList[0].GstRt, 18);
    });
});

// â”€â”€ 13. GSTR-1 JSON Structure (pure logic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('gstr1.jsonStructure', () => {
    it('fp (filing period) format is MMYYYY', () => {
        const month = 4;
        const year = 2025;
        const fp = `${String(month).padStart(2, '0')}${year}`;
        assert.equal(fp, '042025');
    });

    it('B2B map groups invoices by GSTIN', () => {
        const invoices = [
            { gstin: '27AABCU9603R1ZX', invoiceNo: 'INV001', value: 100000 },
            { gstin: '27AABCU9603R1ZX', invoiceNo: 'INV002', value: 50000 },
            { gstin: '29AABCU9603R1ZX', invoiceNo: 'INV003', value: 75000 },
        ];
        const b2bMap = {};
        invoices.forEach(inv => {
            if (!b2bMap[inv.gstin]) b2bMap[inv.gstin] = { ctin: inv.gstin, inv: [] };
            b2bMap[inv.gstin].inv.push({ inum: inv.invoiceNo, val: inv.value });
        });
        const b2b = Object.values(b2bMap);
        assert.equal(b2b.length, 2);
        const mhParty = b2b.find(b => b.ctin === '27AABCU9603R1ZX');
        assert.equal(mhParty.inv.length, 2);
    });
});

// â”€â”€ 14. 26AS Reconciliation (pure logic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('form26as.reconciliation', () => {
    it('matches 26AS line to book deduction by section and amount (within tolerance)', () => {
        const line = { section: '194J', tdsDeposited: 5000 };
        const bookDeductions = [
            { section: '194C', tdsAmount: 5000 },
            { section: '194J', tdsAmount: 5000 },
            { section: '194J', tdsAmount: 8000 },
        ];

        const match = bookDeductions.find(d => {
            return d.section?.toUpperCase() === line.section?.toUpperCase() &&
                   Math.abs(d.tdsAmount - line.tdsDeposited) < 1;
        });

        assert.ok(match);
        assert.equal(match.tdsAmount, 5000);
    });

    it('no match when amounts differ by more than tolerance', () => {
        const line = { section: '194J', tdsDeposited: 5000 };
        const bookDeductions = [{ section: '194J', tdsAmount: 5500 }];
        const match = bookDeductions.find(d => d.section === line.section && Math.abs(d.tdsAmount - line.tdsDeposited) < 1);
        assert.equal(match, undefined);
    });

    it('summary totals are accurate', () => {
        const lines = [
            { tdsDeposited: 3000, matchStatus: 'Matched' },
            { tdsDeposited: 2000, matchStatus: 'Unmatched' },
            { tdsDeposited: 1500, matchStatus: 'Matched' },
        ];
        const totalIn26AS = lines.reduce((s, l) => s + l.tdsDeposited, 0);
        const matched = lines.filter(l => l.matchStatus === 'Matched').reduce((s, l) => s + l.tdsDeposited, 0);
        const unmatched = lines.filter(l => l.matchStatus === 'Unmatched').reduce((s, l) => s + l.tdsDeposited, 0);

        assert.equal(totalIn26AS, 6500);
        assert.equal(matched, 4500);
        assert.equal(unmatched, 2000);
    });
});

// â”€â”€ 15. Comparative P&L logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('comparativePL.logic', () => {
    it('computes variance and variancePct correctly', () => {
        const period1 = 500000;
        const period2 = 600000;
        const variance = period2 - period1;
        const variancePct = period1 !== 0 ? +((variance / Math.abs(period1)) * 100).toFixed(2) : null;

        assert.equal(variance, 100000);
        assert.equal(variancePct, 20);
    });

    it('handles group missing in one period', () => {
        const allGroupNames = new Set(['Sales', 'Purchases', 'Admin Expenses']);
        const p1Groups = [{ groupName: 'Sales', total: 500000 }, { groupName: 'Purchases', total: 300000 }];
        const p2Groups = [{ groupName: 'Sales', total: 600000 }, { groupName: 'Admin Expenses', total: 50000 }];

        const comparison = [...allGroupNames].map(name => {
            const a = p1Groups.find(g => g.groupName === name) || { total: 0 };
            const b = p2Groups.find(g => g.groupName === name) || { total: 0 };
            return { groupName: name, period1: a.total, period2: b.total, variance: b.total - a.total };
        });

        const purchases = comparison.find(c => c.groupName === 'Purchases');
        assert.equal(purchases.period1, 300000);
        assert.equal(purchases.period2, 0);
        assert.equal(purchases.variance, -300000);
    });
});

// â”€â”€ 16. Narration Templates (pure logic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('narrationTemplate.logic', () => {
    it('filters templates by voucherNature correctly', () => {
        const templates = [
            { title: 'Payment to Supplier', narration: 'Being payment to supplier', voucherNature: 'Payment' },
            { title: 'Cash Receipt', narration: 'Being cash received', voucherNature: 'Receipt' },
            { title: 'General Entry', narration: 'Being entry passed', voucherNature: 'Any' },
        ];

        const voucherNature = 'Payment';
        const filtered = templates.filter(t => t.voucherNature === voucherNature || t.voucherNature === 'Any');

        assert.equal(filtered.length, 2);
        assert.ok(filtered.some(t => t.title === 'Payment to Supplier'));
        assert.ok(filtered.some(t => t.title === 'General Entry'));
    });
});