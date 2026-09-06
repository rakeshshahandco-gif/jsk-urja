import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    getSequenceBlocker,
    buildCannotStartMessage,
    buildCompleteBeforeHint,
    getSequenceInconsistencies,
    getAvailableFromPrevious,
    getReadyForNext,
    getWipQty,
    getQtyStarted,
    getQtyCompleted,
    getApplicablePreviousStage,
    buildBackwardEditMessage,
} from '../src/services/workOrderStageSequence.service.js';

const stages = (rows) => rows.map((r) => ({
    seq: r.seq,
    stageName: r.name,
    status: r.status,
    inputQty: r.inputQty || 0,
    outputQty: r.outputQty || 0,
    ...(r.notApplicable != null ? { notApplicable: r.notApplicable } : {}),
    ...(r.isApplicable != null ? { isApplicable: r.isApplicable } : {}),
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

const PIPELINE_500 = stages([
    { seq: 1, name: 'PCB', status: 'Completed', inputQty: 500, outputQty: 500 },
    { seq: 2, name: 'SMD Pick & Place', status: 'Running', inputQty: 500, outputQty: 100 },
    { seq: 3, name: 'TH Mounting', status: 'Running', inputQty: 100, outputQty: 50 },
    { seq: 4, name: 'Wave Soldering', status: 'Running', inputQty: 20, outputQty: 10 },
    { seq: 5, name: 'Touch Up', status: 'Not Started' },
]);

describe('quantity-aware sequential stage locking', () => {
    it('never blocks PCB (seq 1)', () => {
        assert.equal(getSequenceBlocker(SAMPLE, 1), null);
    });

    it('allows SMD when PCB has transferable completed qty', () => {
        assert.equal(getSequenceBlocker(SAMPLE, 2), null);
    });

    it('allows Touch Up to start only the Wave completed qty while Wave is still In Progress', () => {
        assert.equal(getSequenceBlocker(SAMPLE, 5), null);
        assert.equal(getAvailableFromPrevious(SAMPLE, 5), 4);
        const overStart = getSequenceBlocker(SAMPLE, 5, { proposedStarted: 5 });
        assert.equal(overStart.stageName, 'Wave Soldering');
        assert.equal(overStart.reason, 'qty');
        assert.equal(
            buildCannotStartMessage({ stageName: 'Touch Up' }, overStart),
            'Cannot start 5 pcs in Touch Up. Only 4 pcs have been completed in Wave Soldering.'
        );
    });

    it('waits for TH when SMD is In Progress with zero completed qty', () => {
        const wo = stages([
            { seq: 1, name: 'PCB', status: 'Completed', inputQty: 10, outputQty: 10 },
            { seq: 2, name: 'SMD Pick & Place', status: 'Running' },
            { seq: 3, name: 'TH Mounting', status: 'Not Started' },
        ]);
        const blocker = getSequenceBlocker(wo, 3);
        assert.equal(blocker.stageName, 'SMD Pick & Place');
        assert.equal(blocker.reason, 'waiting');
        assert.equal(
            buildCannotStartMessage({ stageName: 'TH Mounting' }, blocker),
            'Waiting for output from SMD Pick & Place.'
        );
        assert.equal(
            buildCompleteBeforeHint({ stageName: 'TH Mounting' }, blocker),
            'Waiting for output from SMD Pick & Place.'
        );
    });

    it('does not flag a healthy in-progress current stage as inconsistency', () => {
        assert.equal(getSequenceInconsistencies(SAMPLE).length, 0);
        assert.equal(getSequenceInconsistencies(PIPELINE_500).length, 0);
    });

    it('flags a later stage whose completed qty exceeds previous completed qty', () => {
        const wo = stages([
            { seq: 1, name: 'PCB', status: 'Completed', inputQty: 10, outputQty: 10 },
            { seq: 2, name: 'SMD Pick & Place', status: 'Completed', inputQty: 10, outputQty: 10 },
            { seq: 3, name: 'TH Mounting', status: 'Completed', inputQty: 10, outputQty: 10 },
            { seq: 4, name: 'Wave Soldering', status: 'Running', inputQty: 10, outputQty: 4 },
            { seq: 5, name: 'Touch Up', status: 'Completed', outputQty: 10 },
            { seq: 6, name: 'Wire Insert', status: 'Not Started' },
        ]);
        const cloned = JSON.parse(JSON.stringify(wo));
        assert.equal(getSequenceBlocker(wo, 5, { proposedStarted: 10 }).stageName, 'Wave Soldering');
        assert.equal(getSequenceBlocker(wo, 4), null);
        assert.deepEqual(wo, cloned);
        const issues = getSequenceInconsistencies(wo);
        assert.equal(issues.length, 1);
        assert.equal(issues[0].stageName, 'Touch Up');
        assert.equal(issues[0].previousName, 'Wave Soldering');
    });
});

describe('quantity pipeline formulas — target 500', () => {
    it('SMD 500/100 keeps TH available at 100 while SMD is In Progress', () => {
        const smdOnly = stages([
            { seq: 1, name: 'PCB', status: 'Completed', inputQty: 500, outputQty: 500 },
            { seq: 2, name: 'SMD Pick & Place', status: 'Running', inputQty: 500, outputQty: 100 },
            { seq: 3, name: 'TH Mounting', status: 'Not Started' },
        ]);
        assert.equal(getSequenceBlocker(smdOnly, 3), null);
        assert.equal(getAvailableFromPrevious(smdOnly, 3), 100);
        assert.equal(getWipQty(smdOnly[1]), 400);
        assert.equal(getReadyForNext(smdOnly, 2), 100);
        assert.notEqual(smdOnly[1].status, 'Completed');
    });

    it('TH 100/50 yields WIP 50; Wave may use 50 total, 30 additional after 20 started', () => {
        const beforeWave = stages([
            { seq: 1, name: 'PCB', status: 'Completed', inputQty: 500, outputQty: 500 },
            { seq: 2, name: 'SMD Pick & Place', status: 'Running', inputQty: 500, outputQty: 100 },
            { seq: 3, name: 'TH Mounting', status: 'Running', inputQty: 100, outputQty: 50 },
            { seq: 4, name: 'Wave Soldering', status: 'Not Started' },
        ]);
        assert.equal(getWipQty(beforeWave[2]), 50);
        assert.equal(getReadyForNext(beforeWave, 3), 50);
        assert.equal(getAvailableFromPrevious(beforeWave, 4), 50);
        assert.equal(getWipQty(PIPELINE_500[2]), 50);
        assert.equal(getReadyForNext(PIPELINE_500, 3), 30);
        assert.equal(getAvailableFromPrevious(PIPELINE_500, 4), 30);
        assert.equal(getSequenceBlocker(PIPELINE_500, 4), null);
    });

    it('blocks Wave start total 60 when TH completed is only 50', () => {
        const blocker = getSequenceBlocker(PIPELINE_500, 4, { proposedStarted: 60 });
        assert.equal(blocker.reason, 'qty');
        assert.equal(blocker.prevCompleted, 50);
        assert.equal(
            buildCannotStartMessage({ stageName: 'Wave Soldering' }, blocker),
            'Cannot start 60 pcs in Wave Soldering. Only 50 pcs have been completed in TH Mounting.'
        );
    });

    it('later SMD completed 250 with TH started 100 yields additional TH 150', () => {
        const later = stages([
            { seq: 1, name: 'PCB', status: 'Completed', inputQty: 500, outputQty: 500 },
            { seq: 2, name: 'SMD Pick & Place', status: 'Running', inputQty: 500, outputQty: 250 },
            { seq: 3, name: 'TH Mounting', status: 'Running', inputQty: 100, outputQty: 50 },
        ]);
        assert.equal(getAvailableFromPrevious(later, 3), 150);
        assert.equal(getReadyForNext(later, 2), 150);
    });

    it('blocks reducing SMD completed below TH started', () => {
        const smd = PIPELINE_500[1];
        const th = PIPELINE_500[2];
        assert.equal(getQtyStarted(th), 100);
        assert.ok(50 < getQtyStarted(th));
        assert.equal(
            buildBackwardEditMessage(smd, th, 50),
            'Cannot reduce SMD Pick & Place completed quantity to 50 because 100 pcs have already started TH Mounting.'
        );
    });

    it('cannot start Wave until TH has some completed output', () => {
        const wo = stages([
            { seq: 1, name: 'PCB', status: 'Completed', inputQty: 500, outputQty: 500 },
            { seq: 2, name: 'SMD Pick & Place', status: 'Running', inputQty: 500, outputQty: 100 },
            { seq: 3, name: 'TH Mounting', status: 'Running', inputQty: 100, outputQty: 0 },
            { seq: 4, name: 'Wave Soldering', status: 'Not Started' },
        ]);
        const blocker = getSequenceBlocker(wo, 4);
        assert.equal(blocker.reason, 'waiting');
        assert.equal(blocker.stageName, 'TH Mounting');
        assert.equal(getAvailableFromPrevious(wo, 4), 0);
    });

    it('run-log cumulative semantics: stage totals are sums, additional uses cumulative completed', () => {
        const afterRun2 = stages([
            { seq: 1, name: 'PCB', status: 'Completed', inputQty: 500, outputQty: 500 },
            { seq: 2, name: 'SMD Pick & Place', status: 'Running', inputQty: 500, outputQty: 250 },
            { seq: 3, name: 'TH Mounting', status: 'Running', inputQty: 100, outputQty: 50 },
        ]);
        assert.equal(getQtyCompleted(afterRun2[1]), 250);
        assert.equal(getQtyStarted(afterRun2[2]), 100);
        assert.equal(getAvailableFromPrevious(afterRun2, 3), 150);
    });
});

describe('supplementary N/A prefix does not create fake transferable output', () => {
    it('skips N/A PCB/SMD and caps TH from WO target, not from N/A outputQty', () => {
        const sup = stages([
            { seq: 1, name: 'PCB', status: 'Completed', inputQty: 40, outputQty: 40, notApplicable: true, isApplicable: false },
            { seq: 2, name: 'SMD Pick & Place', status: 'Completed', inputQty: 40, outputQty: 40, notApplicable: true, isApplicable: false },
            { seq: 3, name: 'TH Mounting', status: 'Not Started' },
            { seq: 4, name: 'Wave Soldering', status: 'Not Started' },
        ]);
        assert.equal(getQtyCompleted(sup[0]), 0);
        assert.equal(getQtyCompleted(sup[1]), 0);
        assert.equal(getApplicablePreviousStage(sup, 3), null);
        assert.equal(getSequenceBlocker(sup, 3), null);
        assert.equal(getAvailableFromPrevious(sup, 3), null);
        assert.equal(getSequenceBlocker(sup, 4).reason, 'waiting');
        assert.equal(getSequenceBlocker(sup, 4).stageName, 'TH Mounting');
    });
});
