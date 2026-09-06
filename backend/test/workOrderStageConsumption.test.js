import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    resolveMaterialProcessType,
    processTypeForStage,
    desiredCumulativeConsumeQty,
    consumeDeltaQty,
    buildStageConsumePlan,
    isDeferredForStageConsume,
    shouldApplyStageMaterialConsumption,
    assertCompletedNotBelowConsumed,
} from '../src/services/workOrderStageConsumption.service.js';

const smdCap = {
    itemId: 'i-cap',
    itemCode: 'CAP-A',
    itemName: 'Capacitor A',
    itemType: 'SMD',
    requiredQty: 200,
    isMandatory: true,
    bomIsMandatory: true,
};

describe('stage process mapping', () => {
    it('maps seq 1/2/3 to PCB/SMD/TH', () => {
        assert.equal(processTypeForStage({ seq: 1, stageName: 'PCB' }), 'PCB');
        assert.equal(processTypeForStage({ seq: 2, stageName: 'SMD Pick & Place' }), 'SMD');
        assert.equal(processTypeForStage({ seq: 3, stageName: 'TH Mounting' }), 'TH');
        assert.equal(processTypeForStage({ seq: 5, stageName: 'Touch Up' }), '');
    });
});

describe('classification reuse', () => {
    it('prefers BOM componentType and does not guess names', () => {
        assert.equal(resolveMaterialProcessType({ itemId: '1', itemType: 'OTHER', itemName: 'SMD Cap' }, [
            { itemId: '1', componentType: 'SMD' },
        ]), 'SMD');
        assert.equal(resolveMaterialProcessType({ itemId: '2', itemType: 'OTHER', itemName: 'SMD Cap' }, []), 'UNCLASSIFIED');
        assert.equal(resolveMaterialProcessType({ itemId: '3', itemType: 'PCB' }, []), 'PCB');
    });
});

describe('delta consumption from completed qty', () => {
    it('uses requiredQty / targetQty and only the delta', () => {
        assert.equal(desiredCumulativeConsumeQty(smdCap, 50, 100), 100);
        assert.equal(desiredCumulativeConsumeQty(smdCap, 80, 100), 160);
        assert.equal(consumeDeltaQty(100, 0), 100);
        assert.equal(consumeDeltaQty(160, 100), 60);
        assert.equal(consumeDeltaQty(100, 100), 0);
    });

    it('does not consume for started qty', () => {
        const plan = buildStageConsumePlan({
            materials: [smdCap],
            processType: 'SMD',
            completedQty: 50,
            targetQty: 100,
            alreadyByItem: {},
        });
        assert.equal(plan[0].consumeQty, 100);
        const again = buildStageConsumePlan({
            materials: [smdCap],
            processType: 'SMD',
            completedQty: 50,
            targetQty: 100,
            alreadyByItem: { 'i-cap': 100 },
        });
        assert.equal(again[0].consumeQty, 0);
    });

    it('skips deferred missing material', () => {
        const deferred = { ...smdCap, isMandatory: false };
        assert.equal(isDeferredForStageConsume(deferred), true);
        const plan = buildStageConsumePlan({
            materials: [deferred, { ...smdCap, itemId: 'i-res', itemCode: 'RES', itemName: 'Resistor' }],
            processType: 'SMD',
            completedQty: 50,
            targetQty: 100,
            alreadyByItem: {},
        });
        assert.equal(plan.find((p) => p.itemId === 'i-cap').consumeQty, 0);
        assert.equal(plan.find((p) => p.itemId === 'i-cap').skipped, 'deferred');
        assert.equal(plan.find((p) => p.itemId === 'i-res').consumeQty, 100);
    });

    it('does not consume OTHER / UNCLASSIFIED at SMD', () => {
        const plan = buildStageConsumePlan({
            materials: [{ ...smdCap, itemId: 'x', itemType: 'OTHER' }],
            bomComponents: [],
            processType: 'SMD',
            completedQty: 50,
            targetQty: 100,
        });
        assert.equal(plan.length, 0);
    });
});

describe('guards', () => {
    it('excludes supplementary WO', () => {
        assert.equal(shouldApplyStageMaterialConsumption(
            { woKind: 'supplementary', productionModule: 'electronics' },
            { seq: 2, stageName: 'SMD Pick & Place' }
        ), false);
    });

    it('blocks reducing completed below already consumed', () => {
        assert.throws(() => assertCompletedNotBelowConsumed({
            materials: [smdCap],
            processType: 'SMD',
            newCompletedQty: 30,
            targetQty: 100,
            alreadyByItem: { 'i-cap': 100 },
            stageName: 'SMD Pick & Place',
        }), /already-consumed/);
    });
});
