import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    getSequenceBlocker,
    buildCannotStartMessage,
    buildCompleteBeforeHint,
    getSequenceInconsistencies,
} from '../src/services/workOrderStageSequence.service.js';

const stages = (rows) => rows.map((r) => ({
    seq: r.seq,
    stageName: r.name,
    status: r.status,
    inputQty: r.inputQty || 0,
    outputQty: r.outputQty || 0,
}));

const SAMPLE = stages([
    { seq: 1, name: 'PCB', status: 'Completed', inputQty: 10, outputQty: 10 },
    { seq: 2, name: 'SMD Pick & Place', status: 'Completed', inputQty: 10, outputQty: 10 },
    { seq: 3, name: 'TH Mounting', status: 'Completed', inputQty: 10, outputQty: 10 },
    { seq: 4, name: 'Wave Soldering', status: 'Running', inputQty: 10, outputQty: 4 },
    { seq: 5, name: 'Touch Up', status: 'Not Started' },
    { seq: 6, name: 'Wire Insert', status: 'Not Started' },
    { seq: 7, name: '1st QC', status: 'Not Started' },
    { seq: 8, name: 'Dummy Load Testing', status: 'Not Started' },
    { seq: 9, name: 'Final QC', status: 'Not Started' },
]);

describe('strict sequential stage locking', () => {
    it('never blocks PCB (seq 1)', () => {
        assert.equal(getSequenceBlocker(SAMPLE, 1), null);
    });

    it('allows SMD when PCB is Completed', () => {
        assert.equal(getSequenceBlocker(SAMPLE, 2), null);
    });

    it('blocks Touch Up while Wave Soldering is not Completed', () => {
        const blocker = getSequenceBlocker(SAMPLE, 5);
        assert.equal(blocker.stageName, 'Wave Soldering');
        assert.equal(
            buildCannotStartMessage({ stageName: 'Touch Up' }, blocker),
            'Cannot start Touch Up. Wave Soldering must be completed first.'
        );
        assert.equal(
            buildCompleteBeforeHint({ stageName: 'Touch Up' }, blocker),
            'Complete Wave Soldering before starting Touch Up.'
        );
    });

    it('blocks TH Mounting until SMD is Completed', () => {
        const wo = stages([
            { seq: 1, name: 'PCB', status: 'Completed' },
            { seq: 2, name: 'SMD Pick & Place', status: 'Running' },
            { seq: 3, name: 'TH Mounting', status: 'Not Started' },
        ]);
        assert.equal(getSequenceBlocker(wo, 3).stageName, 'SMD Pick & Place');
    });

    it('blocks later stages when a hole exists (legacy Touch Up completed before Wave Soldering)', () => {
        const wo = stages([
            { seq: 1, name: 'PCB', status: 'Completed' },
            { seq: 2, name: 'SMD Pick & Place', status: 'Completed' },
            { seq: 3, name: 'TH Mounting', status: 'Completed' },
            { seq: 4, name: 'Wave Soldering', status: 'Running' },
            { seq: 5, name: 'Touch Up', status: 'Completed', outputQty: 10 },
            { seq: 6, name: 'Wire Insert', status: 'Not Started' },
        ]);
        const cloned = JSON.parse(JSON.stringify(wo));
        assert.equal(getSequenceBlocker(wo, 5).stageName, 'Wave Soldering');
        assert.equal(getSequenceBlocker(wo, 6).stageName, 'Wave Soldering');
        assert.equal(getSequenceBlocker(wo, 4), null);
        assert.deepEqual(wo, cloned);
        const issues = getSequenceInconsistencies(wo);
        assert.equal(issues.length, 1);
        assert.equal(issues[0].stageName, 'Touch Up');
        assert.equal(issues[0].previousName, 'Wave Soldering');
    });

    it('does not flag a healthy in-progress current stage as inconsistency', () => {
        assert.equal(getSequenceInconsistencies(SAMPLE).length, 0);
    });
});
