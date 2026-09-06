import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildMaterialIssueNo,
    defaultIssueQty,
    validateLateMaterialIssueQty,
    validateLateMaterialIssueBatch,
    allocateRemainingParentConsume,
    resolveStockReferenceIds,
    getRemainingToIssueQty,
    resolveIssueLineMaterial,
    resolveSectionMaterialLine,
    listPostedMaterialIssueHistory,
    findIssueOnWorkOrder,
    nextIssueIndexFromHistory,
    postedIssueQtyByMaterial,
    canAppendLateMaterialToSupplementary,
    groupSelectedMaterialsBySupplementary,
    resolveUnassignedSupplementaryPlan,
} from '../src/services/workOrderMaterialIssue.service.js';
import { applyAddedLaterQty, getRemainingToResolveQty, getRemainingToAllocateQty, getLateMaterialStatusLabel, shouldMarkFullyResolved } from '../src/services/workOrderSection.service.js';

const pending = {
    _id: 'm1',
    itemCode: 'I00830',
    itemName: 'I00830',
    isMandatory: false,
    bomIsMandatory: true,
    requiredQty: 100,
    addedLaterQty: 0,
    supplementaryAllocatedQty: 0,
    supplementaryCompletedQty: 0,
};

describe('late material issue numbering and validation', () => {
    it('builds MI numbers from the WO without using sales series', () => {
        assert.equal(buildMaterialIssueNo('WO-2026-2027-00001-S2', 1), 'MI-WO-2026-2027-00001-S2-001');
        assert.equal(buildMaterialIssueNo('WO-2026-2027-00001-S2', 12), 'MI-WO-2026-2027-00001-S2-012');
    });

    it('defaults issue qty to min(remaining, stock)', () => {
        assert.equal(defaultIssueQty({ ...pending, requiredQty: 10 }, 15760), 10);
        assert.equal(defaultIssueQty({ ...pending, requiredQty: 40 }, 30), 30);
    });

    it('blocks insufficient stock for the whole batch message', () => {
        const err = validateLateMaterialIssueQty({ ...pending, itemCode: 'I00830' }, 10, 6);
        assert.equal(err, 'I00830 cannot be issued: requested 10, available stock is 6. No material was issued.');
        const batchErr = validateLateMaterialIssueBatch([
            { materialId: 'a', material: { ...pending, _id: 'a', itemCode: 'A', requiredQty: 10 }, qty: 10, availableStock: 100 },
            { materialId: 'b', material: { ...pending, _id: 'b', itemCode: 'I00830' }, qty: 10, availableStock: 6 },
        ]);
        assert.match(batchErr, /No material was issued/);
        assert.equal(pending.addedLaterQty, 0);
    });

    it('reads the issue-loop material from .material, not undefined .mat', () => {
        const material = { _id: '6a9a86f34e1f59f2d430933c', itemCode: 'I02106', addedLaterQty: 0 };
        assert.equal(resolveIssueLineMaterial({ material, qty: 10 }).itemCode, 'I02106');
        assert.equal(resolveIssueLineMaterial({ mat: undefined, qty: 10 }), null);
        const lines = [material];
        assert.equal(resolveSectionMaterialLine(lines, material._id).itemCode, 'I02106');
        assert.equal(resolveSectionMaterialLine(lines, 'missing', { itemCode: 'I02106' }).itemCode, 'I02106');
        assert.equal(resolveSectionMaterialLine(lines, 'missing', { itemCode: 'NOPE' }), null);
    });

    it('allows inventory issue when Remaining To Allocate is 0 due to an existing SUP', () => {
        const m = { ...pending, itemCode: 'I02106', requiredQty: 10, supplementaryAllocatedQty: 10 };
        assert.equal(getRemainingToAllocateQty(m), 0);
        assert.equal(getRemainingToResolveQty(m), 10);
        assert.equal(getRemainingToIssueQty(m, 0), 10);
        assert.equal(validateLateMaterialIssueQty(m, 10, 15760, 0), null);
        assert.match(validateLateMaterialIssueQty(m, 10, 15760, 10), /remaining to issue 0/);
        assert.equal(defaultIssueQty(m, 15760, 0), 10);
    });

    it('issued qty leaves Pending even when a Supplementary WO is still in process', () => {
        const m = { ...pending, itemCode: 'I02106', requiredQty: 10, supplementaryAllocatedQty: 10, isMandatory: false };
        applyAddedLaterQty(m, 10);
        assert.equal(getRemainingToResolveQty(m), 0);
        assert.equal(shouldMarkFullyResolved(m), false);
        if (getRemainingToResolveQty(m) === 0) m.isMandatory = true;
        assert.equal(m.isMandatory, true);
    });

    it('after a full late issue remaining allocate is 0 so a later SUP must not re-allocate', () => {
        const m = { ...pending, requiredQty: 10 };
        applyAddedLaterQty(m, 10);
        assert.equal(getRemainingToResolveQty(m), 0);
        assert.equal(getRemainingToAllocateQty(m), 0);
        assert.equal(shouldMarkFullyResolved(m), true);
        assert.equal(m.supplementaryAllocatedQty, 0);
    });

    it('partial issue 60 of 100 stays pending', () => {
        const m = { ...pending };
        applyAddedLaterQty(m, 60);
        assert.equal(getRemainingToResolveQty(m), 40);
        assert.equal(getLateMaterialStatusLabel(m, []), 'Partially Resolved — 60/100');
    });
});

describe('parent remaining consume after late issue', () => {
    it('parent consumes only leftover 60 when 40 already issued against the same item', () => {
        const plan = allocateRemainingParentConsume(
            [{ itemId: 'i1', requiredQty: 100 }],
            { i1: 40 }
        );
        assert.equal(plan[0].alreadyQty, 40);
        assert.equal(plan[0].consumeQty, 60);
    });

    it('fully issued line consumes 0 at parent completion', () => {
        const plan = allocateRemainingParentConsume(
            [{ itemId: 'i1', requiredQty: 10 }, { itemId: 'i2', requiredQty: 40 }],
            { i1: 10, i2: 40 }
        );
        assert.equal(plan[0].consumeQty, 0);
        assert.equal(plan[1].consumeQty, 0);
    });

    it('links section issue stock to the parent WO id', () => {
        const refs = resolveStockReferenceIds({
            _id: 's2',
            woKind: 'section',
            parentWorkOrderId: 'p1',
        });
        assert.equal(String(refs.stockReferenceId), 'p1');
        assert.equal(String(refs.sectionWorkOrderId), 's2');
    });
});

describe('embedded WorkOrder materialIssueHistory (no new collection)', () => {
    it('numbers the next issue from existing history on the same WO', () => {
        const wo = {
            woNumber: 'WO-2026-2027-00001-S2',
            materialIssueHistory: [{ issueNo: 'MI-WO-2026-2027-00001-S2-001', status: 'Posted', lines: [] }],
        };
        assert.equal(nextIssueIndexFromHistory(wo), 2);
        assert.equal(buildMaterialIssueNo(wo.woNumber, nextIssueIndexFromHistory(wo)), 'MI-WO-2026-2027-00001-S2-002');
    });

    it('does not treat mixed existing-SUP and no-SUP lines as a hard block', () => {
        const sup1 = {
            _id: 'sup1',
            woNumber: 'WO-2026-2027-00001-S2-SUP1',
            status: 'Released',
            startFromSeq: 2,
            sourceSectionWorkOrderId: 's2',
            stages: [{ seq: 2, status: 'Not Started', isApplicable: true }],
            supplementaryMaterials: [{ materialId: 'a', itemCode: 'I02106' }],
        };
        const a = { _id: 'a', itemCode: 'I02106' };
        const b = { _id: 'b', itemCode: 'I00999' };
        const grouped = groupSelectedMaterialsBySupplementary([a, b], [sup1]);
        assert.equal(grouped.assigned.length, 1);
        assert.equal(grouped.unassigned.length, 1);
        const join = resolveUnassignedSupplementaryPlan(grouped.unassigned, grouped.assigned.map((g) => g.dest), {
            sectionId: 's2',
            startFromSeq: 2,
        });
        assert.equal(join.action, 'join');
        const progressed = { ...sup1, status: 'In Process' };
        assert.equal(canAppendLateMaterialToSupplementary(progressed, { sectionId: 's2', startFromSeq: 2 }), false);
        const create = resolveUnassignedSupplementaryPlan(grouped.unassigned, [progressed], { sectionId: 's2', startFromSeq: 2 });
        assert.equal(create.action, 'create');
    });

    it('reuses a posted issue by idempotency key without needing another collection', () => {
        const wo = {
            materialIssueHistory: [{
                _id: 'b1',
                issueNo: 'MI-WO-2026-2027-00001-S2-001',
                idempotencyKey: 'abc',
                status: 'Posted',
                lines: [{ materialId: 'm1', itemId: 'i1', qtyIssued: 10 }],
            }],
        };
        const reused = findIssueOnWorkOrder(wo, { idempotencyKey: 'abc' });
        assert.equal(reused.issueNo, 'MI-WO-2026-2027-00001-S2-001');
        const posted = postedIssueQtyByMaterial(listPostedMaterialIssueHistory(wo));
        assert.equal(posted.byMaterial.m1, 10);
    });
});
