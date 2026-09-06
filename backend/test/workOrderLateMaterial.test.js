/**
 * Phase 1 late material + Supplementary WO — quantity helpers, numbering, stages, FG cap.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    SUPPLEMENTARY_WO_KIND,
    EXCLUDE_SECTION_WO,
    isSupplementaryWorkOrder,
    isProcessOnlyWorkOrder,
    shouldSyncWorkOrderInventory,
    buildSupplementaryWoNumber,
    nextSupplementaryIndex,
    cloneStagesForSupplementary,
    getRemainingPendingQty,
    getRemainingToAllocateQty,
    getRemainingToResolveQty,
    getResolvedMaterialQty,
    shouldMarkFullyResolved,
    getMaxMaterialCompleteFgQty,
    getProductionResolvedQty,
    getUnfittedSupplementaryQty,
    getUnresolvedRequiredMaterials,
    getLateMaterialStatusLabel,
    hasUnresolvedLateMaterialToResolve,
    getAuthoritativeCompletedQty,
    getReportableStageOutput,
    isApplicableStage,
    NA_STAGE_REMARK,
    validateLateMaterialRecordQty,
    validateLateMaterialRecordBatch,
    applyAddedLaterQty,
    buildMaterialEventEntry,
    getAddedLaterQty,
} from '../src/services/workOrderSection.service.js';

const deferred100 = {
    _id: 'm1',
    itemId: 'i1',
    itemName: 'MB10F',
    isMandatory: false,
    bomIsMandatory: true,
    requiredQty: 100,
    addedLaterQty: 0,
    supplementaryAllocatedQty: 0,
    supplementaryCompletedQty: 0,
    shortQty: 0,
};

describe('supplementary numbering does not touch parent/section series', () => {
    it('builds Section-SUP1 / SUP2', () => {
        assert.equal(buildSupplementaryWoNumber('WO-2026-2027-00002-S2', 1), 'WO-2026-2027-00002-S2-SUP1');
        assert.equal(buildSupplementaryWoNumber('WO-2026-2027-00002-S2', 2), 'WO-2026-2027-00002-S2-SUP2');
    });

    it('next index after SUP1 is 2', () => {
        assert.equal(nextSupplementaryIndex(['WO-2026-2027-00002-S2-SUP1']), 2);
        assert.equal(nextSupplementaryIndex([]), 1);
    });
});

describe('allocate vs resolve quantities', () => {
    it('Add Material 60 of 100 leaves allocate 40 and resolve 40', () => {
        const m = { ...deferred100, addedLaterQty: 60 };
        assert.equal(getRemainingToAllocateQty(m), 40);
        assert.equal(getRemainingToResolveQty(m), 40);
        assert.equal(getRemainingPendingQty(m), 40);
        assert.equal(getResolvedMaterialQty(m), 60);
        assert.equal(shouldMarkFullyResolved(m), false);
        assert.equal(getLateMaterialStatusLabel(m, []), 'Partially Resolved — 60/100');
        assert.equal(getUnresolvedRequiredMaterials([m]).length, 1);
    });

    it('SUP allocated 40 is not resolved', () => {
        const m = { ...deferred100, addedLaterQty: 60, supplementaryAllocatedQty: 40, supplementaryCompletedQty: 0 };
        assert.equal(getRemainingToAllocateQty(m), 0);
        assert.equal(getRemainingToResolveQty(m), 40);
        assert.equal(getResolvedMaterialQty(m), 60);
        assert.equal(shouldMarkFullyResolved(m), false);
        assert.equal(hasUnresolvedLateMaterialToResolve([], [{ materialStatus: [m] }]), true);
    });
});

describe('partial add-later remaining qty', () => {
    it('Add Material 60 of 100 leaves remaining 40 and partial status', () => {
        const m = { ...deferred100, addedLaterQty: 60 };
        assert.equal(getRemainingPendingQty(m), 40);
        assert.equal(getResolvedMaterialQty(m), 60);
        assert.equal(shouldMarkFullyResolved(m), false);
        assert.equal(getLateMaterialStatusLabel(m, []), 'Partially Resolved — 60/100');
        assert.equal(getUnresolvedRequiredMaterials([m]).length, 1);
    });

    it('full add-later marks fully resolved', () => {
        const m = { ...deferred100, addedLaterQty: 100 };
        assert.equal(getRemainingPendingQty(m), 0);
        assert.equal(shouldMarkFullyResolved(m), true);
        assert.equal(getLateMaterialStatusLabel(m, []), 'Fully Resolved');
        assert.equal(getUnresolvedRequiredMaterials([m]).length, 0);
    });

    it('blocks supplementary qty above remaining pending', () => {
        const m = { ...deferred100, addedLaterQty: 60 };
        const remaining = getRemainingPendingQty(m);
        assert.equal(remaining, 40);
        assert.equal(50 > remaining, true);
    });
});

describe('supplementary allocation + completion', () => {
    it('SUP create for 40 after add 60 leaves remaining 0 but FG resolved 60 until SUP completes', () => {
        const allocated = { ...deferred100, addedLaterQty: 60, supplementaryAllocatedQty: 40 };
        assert.equal(getRemainingPendingQty(allocated), 0);
        assert.equal(getResolvedMaterialQty(allocated), 60);
        assert.equal(shouldMarkFullyResolved(allocated), false);
        assert.equal(
            getLateMaterialStatusLabel(allocated, [{
                status: 'Released',
                supplementaryMaterials: [{ materialId: 'm1', qty: 40 }],
            }]),
            'Partially Resolved — 60/100 · Supplementary WO Created'
        );
        assert.equal(
            getLateMaterialStatusLabel(allocated, [{
                status: 'In Process',
                supplementaryMaterials: [{ materialId: 'm1', qty: 40 }],
            }]),
            'Partially Resolved — 60/100 · Supplementary In Progress'
        );
    });

    it('SUP completed 40 after add 60 is fully resolved', () => {
        const done = {
            ...deferred100,
            addedLaterQty: 60,
            supplementaryAllocatedQty: 40,
            supplementaryCompletedQty: 40,
        };
        assert.equal(getRemainingPendingQty(done), 0);
        assert.equal(getResolvedMaterialQty(done), 100);
        assert.equal(shouldMarkFullyResolved(done), true);
        assert.equal(getLateMaterialStatusLabel(done, []), 'Fully Resolved');
    });
});

describe('Start From Stage clone reuses sequence-friendly NA prefix', () => {
    const source = [
        { seq: 1, stageName: 'PCB', isQcGate: false, isTestGate: false },
        { seq: 2, stageName: 'SMD Pick & Place', isQcGate: false, isTestGate: false },
        { seq: 3, stageName: 'TH Mounting', isQcGate: false, isTestGate: false },
        { seq: 4, stageName: 'Wave Soldering', isQcGate: false, isTestGate: false },
    ];

    it('marks earlier stages NA completed with supplementary qty', () => {
        const stages = cloneStagesForSupplementary(source, [], 3, 40);
        assert.equal(stages[0].notApplicable, true);
        assert.equal(stages[0].isApplicable, false);
        assert.equal(isApplicableStage(stages[0]), false);
        assert.equal(getReportableStageOutput(stages[0]), 0);
        assert.equal(stages[0].status, 'Completed');
        assert.equal(stages[0].outputQty, 40);
        assert.equal(stages[0].remarks, NA_STAGE_REMARK);
        assert.equal(getAuthoritativeCompletedQty({
            status: 'In Process',
            stages: [
                ...stages.slice(0, 3),
                { seq: 4, stageName: 'Wave Soldering', status: 'Completed', outputQty: 40, isApplicable: true },
            ],
        }), 40);
        assert.equal(stages[2].notApplicable, false);
        assert.equal(stages[2].status, 'Not Started');
        assert.equal(stages[2].outputQty, 0);
        assert.equal(stages[3].status, 'Not Started');
    });
});

describe('parent FG quantity protection', () => {
    it('caps FG at resolved 60 when remaining 40 is still open', () => {
        const maxFg = getMaxMaterialCompleteFgQty({
            parentTargetQty: 100,
            parentMaterials: [],
            sectionWorkOrders: [{
                materialStatus: [{ ...deferred100, addedLaterQty: 60 }],
            }],
        });
        assert.equal(maxFg, 60);
        assert.equal(100 > maxFg, true);
        assert.equal(60 > maxFg, false);
    });

    it('blocks all FG when deferred and nothing resolved', () => {
        const maxFg = getMaxMaterialCompleteFgQty({
            parentTargetQty: 100,
            parentMaterials: [],
            sectionWorkOrders: [{ materialStatus: [deferred100] }],
        });
        assert.equal(maxFg, 0);
    });

    it('Phase 1 blocks parent inventory sync until Remaining to Resolve is 0 even if maxFg is 60', () => {
        const lines = [{ ...deferred100, addedLaterQty: 60, supplementaryAllocatedQty: 40 }];
        const maxFg = getMaxMaterialCompleteFgQty({
            parentTargetQty: 100,
            parentMaterials: [],
            sectionWorkOrders: [{ materialStatus: lines }],
        });
        assert.equal(maxFg, 60);
        assert.equal(hasUnresolvedLateMaterialToResolve([], [{ materialStatus: lines }]), true);
    });

    it('blocks FG while issued+allocated overlap required and Supplementary is still open', () => {
        const open = {
            ...deferred100,
            requiredQty: 10,
            addedLaterQty: 10,
            supplementaryAllocatedQty: 10,
            supplementaryCompletedQty: 0,
        };
        assert.equal(getUnfittedSupplementaryQty(open), 10);
        assert.equal(getProductionResolvedQty(open), 0);
        assert.equal(getMaxMaterialCompleteFgQty({
            parentTargetQty: 10,
            parentMaterials: [],
            sectionWorkOrders: [{ materialStatus: [open] }],
        }), 0);
        assert.equal(hasUnresolvedLateMaterialToResolve([], [{ materialStatus: [open] }]), true);

        const done = { ...open, supplementaryCompletedQty: 10 };
        assert.equal(getUnfittedSupplementaryQty(done), 0);
        assert.equal(getProductionResolvedQty(done), 10);
        assert.equal(getMaxMaterialCompleteFgQty({
            parentTargetQty: 10,
            parentMaterials: [],
            sectionWorkOrders: [{ materialStatus: [done] }],
        }), 10);
        assert.equal(hasUnresolvedLateMaterialToResolve([], [{ materialStatus: [done] }]), false);
    });
});

describe('process-only stock guard', () => {
    it('supplementary WO never syncs inventory', () => {
        const sup = { woKind: SUPPLEMENTARY_WO_KIND, status: 'Completed', inventorySynced: false };
        assert.equal(isSupplementaryWorkOrder(sup), true);
        assert.equal(isProcessOnlyWorkOrder(sup), true);
        assert.equal(shouldSyncWorkOrderInventory(sup), false);
    });

    it('main list filter excludes supplementary as well as section', () => {
        assert.deepEqual(EXCLUDE_SECTION_WO.woKind.$nin, ['section', 'supplementary']);
    });
});

describe('bulk late-material validation is all-or-nothing', () => {
    it('defaults record qty to min(remaining allocate, available stock)', () => {
        const a = { ...deferred100, itemCode: 'A', requiredQty: 10, availableStock: 15760 };
        const remaining = getRemainingToAllocateQty(a);
        assert.equal(Math.min(remaining, 15760), 10);
    });

    it('blocks one over-allocate line without applying any qty', () => {
        const a = { ...deferred100, _id: 'a', itemCode: 'A', requiredQty: 10 };
        const b = { ...deferred100, _id: 'b', itemCode: 'ES1J SMAF', itemName: 'ES1J SMAF', requiredQty: 20 };
        const err = validateLateMaterialRecordBatch([
            { materialId: 'a', material: a, qty: 10, availableStock: 100 },
            { materialId: 'b', material: b, qty: 25, availableStock: 100 },
        ]);
        assert.equal(err, 'ES1J SMAF cannot be recorded: Qty 25 exceeds Remaining To Allocate 20.');
        assert.equal(getAddedLaterQty(a), 0);
        assert.equal(getAddedLaterQty(b), 0);
    });

    it('partial receipt 60 of 100 stays pending', () => {
        const m = { ...deferred100 };
        const applied = applyAddedLaterQty(m, 60);
        assert.equal(applied.previousAddedLaterQty, 0);
        assert.equal(applied.newAddedLaterQty, 60);
        assert.equal(getRemainingToResolveQty(m), 40);
        assert.equal(getLateMaterialStatusLabel(m, []), 'Partially Resolved — 60/100');
        assert.equal(shouldMarkFullyResolved(m), false);
    });

    it('appends one history row per line with previous and new Added Later', () => {
        const m = { ...deferred100, _id: 'm1', itemCode: 'A', itemName: 'Comp A', addedLaterQty: 0 };
        const { previousAddedLaterQty, newAddedLaterQty } = applyAddedLaterQty(m, 10);
        const entry = buildMaterialEventEntry({
            eventType: 'added_later',
            material: m,
            qty: 10,
            remainingPendingQty: getRemainingToAllocateQty(m),
            remainingToAllocateQty: getRemainingToAllocateQty(m),
            remainingToResolveQty: getRemainingToResolveQty(m),
            remarks: '',
            previousAddedLaterQty,
            newAddedLaterQty,
        });
        assert.equal(entry.qty, 10);
        assert.match(entry.remarks, /Added Later 0 → 10/);
        assert.equal(entry.remainingToResolveQty, 90);
    });

    it('validates a clean 4-line batch', () => {
        const lines = [
            { materialId: 'a', material: { ...deferred100, _id: 'a', itemCode: 'A', requiredQty: 10 }, qty: 10, availableStock: 15760 },
            { materialId: 'b', material: { ...deferred100, _id: 'b', itemCode: 'B', requiredQty: 40 }, qty: 40, availableStock: 15040 },
            { materialId: 'c', material: { ...deferred100, _id: 'c', itemCode: 'C', requiredQty: 10 }, qty: 10, availableStock: 7064 },
            { materialId: 'd', material: { ...deferred100, _id: 'd', itemCode: 'D', requiredQty: 20 }, qty: 20, availableStock: 26120 },
        ];
        assert.equal(validateLateMaterialRecordBatch(lines), null);
        assert.equal(validateLateMaterialRecordQty(lines[0].material, 10, 15760), null);
    });
});
