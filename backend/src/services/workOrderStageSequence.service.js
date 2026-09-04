/**
 * Strict sequential production stages: a later stage cannot progress
 * until every earlier stage is Completed. Does not mutate stage records.
 */

export function getSequenceBlocker(stages = [], seq) {
    const n = Number(seq);
    if (!Number.isFinite(n) || n <= 1) return null;
    const prior = [...stages]
        .filter((s) => Number(s.seq) < n)
        .sort((a, b) => Number(a.seq) - Number(b.seq));
    return prior.find((s) => String(s.status || 'Not Started') !== 'Completed') || null;
}

export function buildCannotStartMessage(currentStage, blocker) {
    const currentName = currentStage?.stageName || 'this stage';
    const prevName = blocker?.stageName || 'the previous stage';
    return `Cannot start ${currentName}. ${prevName} must be completed first.`;
}

export function buildCompleteBeforeHint(currentStage, blocker) {
    const currentName = currentStage?.stageName || 'this stage';
    const prevName = blocker?.stageName || 'the previous stage';
    return `Complete ${prevName} before starting ${currentName}.`;
}

export function stageHasProgress(stage) {
    const status = String(stage?.status || 'Not Started');
    if (status !== 'Not Started') return true;
    return (Number(stage?.inputQty) || 0) > 0 || (Number(stage?.outputQty) || 0) > 0;
}

/** Legacy WOs where a later stage progressed before an earlier one was Completed. Read-only. */
export function getSequenceInconsistencies(stages = []) {
    return [...stages]
        .filter((s) => Number(s.seq) > 1 && stageHasProgress(s))
        .map((s) => {
            const previous = getSequenceBlocker(stages, s.seq);
            if (!previous) return null;
            return {
                seq: s.seq,
                stageName: s.stageName,
                status: s.status,
                previousSeq: previous.seq,
                previousName: previous.stageName,
                previousStatus: previous.status,
            };
        })
        .filter(Boolean);
}
