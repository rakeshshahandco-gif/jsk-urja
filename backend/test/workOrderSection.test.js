/**
 * Phase 1 Section / Subassembly Work Order — complete-sets formula and gates.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    availableSetsForSection,
    computeCompleteSetsAvailable,
    getAuthoritativeCompletedQty,
    getCurrentStageName,
    buildSectionWoNumber,
    mainWoNumberSeriesRegex,
    assertFinalQtyAllowed,
    buildFinalCompletionBlockMessage,
    getInventorySyncQty,
    isSectionWorkOrder,
    isSectionTrackingEnabled,
    shouldSyncWorkOrderInventory,
    filterBomComponentsBySection,
    cloneStagesForSectionWo,
    isBomRequiredMaterial,
    isDeferredMaterial,
    getUnresolvedRequiredMaterials,
    buildUnresolvedRequiredBlockMessage,
    buildPendingProceedWarning,
    getMaterialDisplayStatus,
    attachSectionToMaterialLines,
    filterSectionWorkOrderMaterials,
    collectPendingFgMaterials,
    splitActiveAndDeferredMaterials,
} from '../src/services/workOrderSection.service.js';

describe('section WO display numbers do not consume main series', () => {
    it('derives Parent-S1 / Parent-S2', () => {
        assert.equal(buildSectionWoNumber('WO-2026-27-00010', 1), 'WO-2026-27-00010-S1');
        assert.equal(buildSectionWoNumber('WO-2026-27-00010', 2), 'WO-2026-27-00010-S2');
    });

    it('main series regex matches padded seq but not section suffix', () => {
        const re = mainWoNumberSeriesRegex('WO-2026-2027-');
        assert.equal(re.test('WO-2026-2027-00010'), true);
        assert.equal(re.test('WO-2026-2027-00010-S1'), false);
        assert.equal(re.test('WO-2026-2027-00010-S2'), false);
    });
});

describe('authoritative completed qty = Final QC output (seq 9)', () => {
    it('uses seq 9 outputQty', () => {
        const wo = {
            status: 'In Process',
            stages: [
                { seq: 2, stageName: 'SMD Pick & Place', outputQty: 500, status: 'Completed' },
                { seq: 9, stageName: 'Final QC', outputQty: 430, status: 'Running', isQcGate: true },
            ],
        };
        assert.equal(getAuthoritativeCompletedQty(wo), 430);
    });

    it('cancelled section contributes 0', () => {
        const wo = {
            status: 'Cancelled',
            stages: [{ seq: 9, stageName: 'Final QC', outputQty: 500, isQcGate: true }],
        };
        assert.equal(getAuthoritativeCompletedQty(wo), 0);
    });
});

describe('Test Case C — Complete Sets = MIN(mandatory section sets)', () => {
    const mandatory = [
        { bomSectionNo: 1, bomSectionName: 'POWER SIDE', requiredQtyPerFinishedUnit: 1 },
        { bomSectionNo: 2, bomSectionName: 'DAUGHTER BOARD', requiredQtyPerFinishedUnit: 1 },
    ];

    it('POWER SIDE 500 + DAUGHTER BOARD 430 → 430', () => {
        const result = computeCompleteSetsAvailable({
            parentTargetQty: 500,
            mandatorySections: mandatory,
            sectionWorkOrders: [
                { bomSectionNo: 1, status: 'Completed', stages: [{ seq: 9, outputQty: 500, isQcGate: true }] },
                { bomSectionNo: 2, status: 'In Process', stages: [{ seq: 9, outputQty: 430, isQcGate: true }] },
            ],
        });
        assert.equal(result.gated, true);
        assert.equal(result.completeSetsAvailable, 430);
        assert.equal(availableSetsForSection(500, 1), 500);
        assert.equal(availableSetsForSection(430, 1), 430);
    });

    it('Test Case E — both 500 → 500', () => {
        const result = computeCompleteSetsAvailable({
            parentTargetQty: 500,
            mandatorySections: mandatory,
            sectionWorkOrders: [
                { bomSectionNo: 1, status: 'Completed', stages: [{ seq: 9, outputQty: 500, isQcGate: true }] },
                { bomSectionNo: 2, status: 'Completed', stages: [{ seq: 9, outputQty: 500, isQcGate: true }] },
            ],
        });
        assert.equal(result.completeSetsAvailable, 500);
    });

    it('partial sets allowed: 500 + 300 → 300', () => {
        const result = computeCompleteSetsAvailable({
            parentTargetQty: 500,
            mandatorySections: mandatory,
            sectionWorkOrders: [
                { bomSectionNo: 1, status: 'Completed', stages: [{ seq: 9, outputQty: 500, isQcGate: true }] },
                { bomSectionNo: 2, status: 'In Process', stages: [{ seq: 9, outputQty: 300, isQcGate: true }] },
            ],
        });
        assert.equal(result.completeSetsAvailable, 300);
    });

    it('cancelled mandatory section → 0 complete sets', () => {
        const result = computeCompleteSetsAvailable({
            parentTargetQty: 500,
            mandatorySections: mandatory,
            sectionWorkOrders: [
                { bomSectionNo: 1, status: 'Completed', stages: [{ seq: 9, outputQty: 500, isQcGate: true }] },
                { bomSectionNo: 2, status: 'Cancelled', stages: [{ seq: 9, outputQty: 0, isQcGate: true }] },
            ],
        });
        assert.equal(result.completeSetsAvailable, 0);
    });

    it('missing mandatory section WO → 0', () => {
        const result = computeCompleteSetsAvailable({
            parentTargetQty: 500,
            mandatorySections: mandatory,
            sectionWorkOrders: [
                { bomSectionNo: 1, status: 'Completed', stages: [{ seq: 9, outputQty: 500, isQcGate: true }] },
            ],
        });
        assert.equal(result.completeSetsAvailable, 0);
    });
});

describe('Test Case D — parent over-completion blocked', () => {
    it('blocks 500 when 430 sets available', () => {
        assert.throws(
            () => assertFinalQtyAllowed(500, 430),
            (err) => err.message === buildFinalCompletionBlockMessage(500, 430)
        );
    });

    it('allows 430 when 430 sets available', () => {
        assert.doesNotThrow(() => assertFinalQtyAllowed(430, 430));
    });
});

describe('legacy WO — no gate', () => {
    it('empty mandatory list is not gated', () => {
        const result = computeCompleteSetsAvailable({
            parentTargetQty: 500,
            mandatorySections: [],
            sectionWorkOrders: [],
        });
        assert.equal(result.gated, false);
        assert.equal(result.completeSetsAvailable, 500);
        assert.equal(isSectionTrackingEnabled({}), false);
        assert.equal(isSectionTrackingEnabled({ sectionConfig: { enabled: false } }), false);
    });
});

describe('stock protection helpers', () => {
    it('section WO must never sync inventory', () => {
        const section = { woKind: 'section', status: 'Completed', inventorySynced: false };
        assert.equal(isSectionWorkOrder(section), true);
        assert.equal(shouldSyncWorkOrderInventory(section), false);
    });

    it('legacy completed parent still eligible to sync', () => {
        const parent = { woKind: 'main', status: 'Completed', inventorySynced: false };
        assert.equal(shouldSyncWorkOrderInventory(parent), true);
    });

    it('missing woKind (legacy doc) still eligible to sync', () => {
        assert.equal(shouldSyncWorkOrderInventory({ status: 'Completed', inventorySynced: false }), true);
    });
});

describe('section component filter + independent stage clone', () => {
    it('filters POWER SIDE vs DAUGHTER BOARD components', () => {
        const components = [
            { itemName: 'A', sectionNo: 1, sectionName: 'POWER SIDE' },
            { itemName: 'B', sectionNo: 2, sectionName: 'DAUGHTER BOARD' },
            { itemName: 'C', sectionNo: 1, sectionName: 'POWER SIDE' },
        ];
        assert.deepEqual(filterBomComponentsBySection(components, 1).map((c) => c.itemName), ['A', 'C']);
        assert.deepEqual(filterBomComponentsBySection(components, 2).map((c) => c.itemName), ['B']);
    });

    it('cloned stages reset progress so POWER SIDE cannot copy DAUGHTER BOARD', () => {
        const parentStages = [
            { seq: 2, stageName: 'SMD Pick & Place', status: 'Completed', outputQty: 500, isQcGate: false, checklist: [] },
        ];
        const cloned = cloneStagesForSectionWo(parentStages);
        assert.equal(cloned[0].status, 'Not Started');
        assert.equal(cloned[0].outputQty, 0);
        assert.deepEqual(cloned[0].productionLogs, []);
        assert.equal(parentStages[0].outputQty, 500);
    });
});

describe('current stage label', () => {
    it('shows Complete when all stages done', () => {
        const wo = {
            status: 'Completed',
            stages: [
                { seq: 1, stageName: 'PCB', status: 'Completed' },
                { seq: 9, stageName: 'Final QC', status: 'Completed' },
            ],
        };
        assert.equal(getCurrentStageName(wo), 'Complete');
    });
});

describe('inventory qty source matches existing Final QC rule', () => {
    it('uses seq 9 output when present', () => {
        assert.equal(getInventorySyncQty({
            targetQty: 500,
            stages: [{ seq: 9, outputQty: 430 }],
        }), 430);
    });

    it('falls back to targetQty when Final QC output is 0 (legacy behaviour)', () => {
        assert.equal(getInventorySyncQty({
            targetQty: 500,
            stages: [{ seq: 9, outputQty: 0 }],
        }), 500);
    });
});

describe('WO-specific mandatory deferral vs original BOM requirement', () => {
    it('treats legacy lines without bomIsMandatory as BOM-required', () => {
        assert.equal(isBomRequiredMaterial({ isMandatory: false, shortQty: 10 }), true);
        assert.equal(isDeferredMaterial({ isMandatory: false, shortQty: 10 }), true);
    });

    it('unticked shortage does not count as currently mandatory but remains unresolved', () => {
        const lines = [
            { itemName: 'A', isMandatory: true, bomIsMandatory: true, shortQty: 0 },
            { itemName: 'B', isMandatory: false, bomIsMandatory: true, shortQty: 500 },
        ];
        const unresolved = getUnresolvedRequiredMaterials(lines);
        assert.equal(unresolved.length, 1);
        assert.equal(unresolved[0].itemName, 'B');
        assert.equal(isDeferredMaterial(lines[1]), true);
        const stillBlocksRelease = lines.filter((m) => m.isMandatory && m.shortQty > 0);
        assert.equal(stillBlocksRelease.length, 0);
    });

    it('checked mandatory shortage still blocks Release', () => {
        const lines = [
            { itemName: 'A', isMandatory: true, bomIsMandatory: true, shortQty: 0 },
            { itemName: 'B', isMandatory: true, bomIsMandatory: true, shortQty: 500 },
        ];
        const stillBlocksRelease = lines.filter((m) => m.isMandatory && m.shortQty > 0);
        assert.equal(stillBlocksRelease.length, 1);
        assert.equal(getUnresolvedRequiredMaterials(lines).length, 1);
    });

    it('final completion message lists pending required components', () => {
        const msg = buildUnresolvedRequiredBlockMessage([
            { itemName: 'SMD-B' },
            { itemName: 'Conn D' },
        ]);
        assert.equal(msg, 'Cannot complete Finished Goods. 2 original BOM components are still pending. SMD-B, Conn D.');
    });

    it('proceed warning names pending count without blocking', () => {
        assert.equal(
            buildPendingProceedWarning(2),
            '2 components are pending. Production may proceed temporarily.'
        );
    });

    it('material display status covers available / short / pending / deferred', () => {
        assert.equal(getMaterialDisplayStatus({ isMandatory: true, bomIsMandatory: true, shortQty: 0 }), 'Available');
        assert.equal(getMaterialDisplayStatus({ isMandatory: true, bomIsMandatory: true, shortQty: 4 }), 'Short');
        assert.equal(getMaterialDisplayStatus({ isMandatory: false, bomIsMandatory: true, shortQty: 4 }), 'Pending Material');
        assert.equal(getMaterialDisplayStatus({ isMandatory: false, bomIsMandatory: true, shortQty: 0 }), 'Deferred for Current Stage');
    });
});

describe('section-wise BOM display uses sectionNo mapping', () => {
    const components = [
        { itemId: 'i1', itemName: 'Cap A', sectionNo: 1, sectionName: 'POWER SIDE' },
        { itemId: 'i2', itemName: 'IC B', sectionNo: 2, sectionName: 'DAUGHTER BOARD' },
        { itemId: 'i3', itemName: 'Res C', sectionNo: 2, sectionName: 'DAUGHTER BOARD' },
        { itemId: 'i4', itemName: 'Conn D', sectionNo: 2, sectionName: 'DAUGHTER BOARD' },
        { itemId: 'i5', itemName: 'Xtal E', sectionNo: 2, sectionName: 'DAUGHTER BOARD' },
        { itemId: 'i6', itemName: 'LDO F', sectionNo: 2, sectionName: 'DAUGHTER BOARD' },
        { itemId: 'i7', itemName: 'FET G', sectionNo: 1, sectionName: 'POWER SIDE' },
    ];

    it('filters DAUGHTER BOARD by sectionNo not by item name text', () => {
        const woLines = components.map((c) => ({
            itemId: c.itemId,
            itemName: c.itemName,
            isMandatory: true,
            bomIsMandatory: true,
            shortQty: 0,
        }));
        const daughter = filterSectionWorkOrderMaterials(woLines, 2, components);
        assert.deepEqual(daughter.map((m) => m.itemName), ['IC B', 'Res C', 'Conn D', 'Xtal E', 'LDO F']);
        assert.equal(daughter.every((m) => Number(m.sectionNo) === 2), true);
        assert.equal(daughter.some((m) => /POWER/i.test(m.itemName)), false);
    });

    it('parent attach keeps all sections for display filter', () => {
        const woLines = components.map((c) => ({ itemId: c.itemId, itemName: c.itemName }));
        const attached = attachSectionToMaterialLines(woLines, components);
        assert.equal(attached.filter((m) => Number(m.sectionNo) === 1).length, 2);
        assert.equal(attached.filter((m) => Number(m.sectionNo) === 2).length, 5);
    });

    it('deferred short lines stay in WO data and still block parent FG', () => {
        const parentLines = [
            { itemId: 'i2', itemName: 'IC B', isMandatory: true, bomIsMandatory: true, shortQty: 0 },
            { itemId: 'i3', itemName: 'Res C', isMandatory: false, bomIsMandatory: true, shortQty: 12 },
            { itemId: 'i4', itemName: 'Conn D', isMandatory: false, bomIsMandatory: true, shortQty: 8 },
        ];
        const visible = filterSectionWorkOrderMaterials(parentLines, 2, components);
        assert.equal(visible.length, 3);
        const split = splitActiveAndDeferredMaterials(visible);
        assert.deepEqual(split.active.map((m) => m.itemName), ['IC B']);
        assert.deepEqual(split.deferred.map((m) => m.itemName), ['Res C', 'Conn D']);
        const pending = collectPendingFgMaterials(parentLines, []);
        assert.deepEqual(pending.map((m) => m.itemName), ['Res C', 'Conn D']);
        assert.match(buildUnresolvedRequiredBlockMessage(pending), /Res C, Conn D/);
        assert.match(buildUnresolvedRequiredBlockMessage(pending), /2 original BOM components are still pending/);
    });

    it('still-deferred line blocks FG even after shortQty is 0', () => {
        const lines = [
            { itemName: 'A', isMandatory: true, bomIsMandatory: true, shortQty: 0 },
            { itemName: 'B', isMandatory: false, bomIsMandatory: true, shortQty: 0 },
        ];
        const unresolved = getUnresolvedRequiredMaterials(lines);
        assert.equal(unresolved.length, 1);
        assert.equal(unresolved[0].itemName, 'B');
    });

    it('section WO deferred shortage still blocks parent FG via child snapshot', () => {
        const parentLines = [
            { itemId: 'i2', itemName: 'IC B', isMandatory: true, bomIsMandatory: true, shortQty: 0 },
        ];
        const children = [{
            materialStatus: [
                { itemId: 'i3', itemName: 'Res C', isMandatory: false, bomIsMandatory: true, shortQty: 12 },
            ],
        }];
        const pending = collectPendingFgMaterials(parentLines, children);
        assert.equal(pending.length, 1);
        assert.equal(pending[0].itemName, 'Res C');
    });
});
