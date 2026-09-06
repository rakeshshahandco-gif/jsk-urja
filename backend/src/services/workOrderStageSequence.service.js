/**
 * Quantity-aware sequential production stages.
 * Sequence is preserved (PCB → SMD → TH → …).
 * Forward movement uses transferable completed qty, not full-stage Completed status.
 * Does not mutate stage records.
 */

export function isApplicableStage(stage) {
    if (!stage) return false;
    if (stage.notApplicable === true) return false;
    if (stage.isApplicable === false) return false;
    return true;
}

export function getQtyStarted(stage) {
    return Math.max(0, Number(stage?.inputQty) || 0);
}

export function getQtyCompleted(stage) {
    if (!isApplicableStage(stage)) return 0;
    return Math.max(0, Number(stage?.outputQty) || 0);
}

export function getWipQty(stage) {
    return Math.max(0, getQtyStarted(stage) - getQtyCompleted(stage));
}

export function getApplicablePreviousStage(stages = [], seq) {
    const n = Number(seq);
    return [...stages]
        .filter((s) => Number(s.seq) < n && isApplicableStage(s))
        .sort((a, b) => Number(b.seq) - Number(a.seq))[0] || null;
}

export function getApplicableNextStage(stages = [], seq) {
    const n = Number(seq);
    return [...stages]
        .filter((s) => Number(s.seq) > n && isApplicableStage(s))
        .sort((a, b) => Number(a.seq) - Number(b.seq))[0] || null;
}

/** Available For Current Stage = Previous Completed - Current Started (min 0). */
export function getAvailableFromPrevious(stages = [], seq, currentStarted = null) {
    const n = Number(seq);
    if (!Number.isFinite(n) || n <= 1) return null;
    const prev = getApplicablePreviousStage(stages, n);
    if (!prev) return null;
    const current = stages.find((s) => Number(s.seq) === n);
    const started = currentStarted != null ? Math.max(0, Number(currentStarted) || 0) : getQtyStarted(current);
    return Math.max(0, getQtyCompleted(prev) - started);
}

/** Ready for Next Stage = Current Completed - Next Started (min 0). */
export function getReadyForNext(stages = [], seq) {
    const current = stages.find((s) => Number(s.seq) === Number(seq));
    if (!current) return 0;
    const next = getApplicableNextStage(stages, seq);
    const nextStarted = next ? getQtyStarted(next) : 0;
    return Math.max(0, getQtyCompleted(current) - nextStarted);
}

export function getStageRequiredQty(wo, stage) {
    return Math.max(0, Number(wo?.targetQty) || 0);
}

/**
 * Block starting a later stage only when there is no transferable qty
 * from the previous applicable stage. Partial previous completion is allowed.
 */
export function getSequenceBlocker(stages = [], seq, options = {}) {
    const n = Number(seq);
    if (!Number.isFinite(n) || n <= 1) return null;
    const current = stages.find((s) => Number(s.seq) === n);
    if (current && !isApplicableStage(current)) return null;

    const prev = getApplicablePreviousStage(stages, n);
    if (!prev) return null;

    const proposedStarted = options.proposedStarted != null
        ? Math.max(0, Number(options.proposedStarted) || 0)
        : getQtyStarted(current);
    const prevCompleted = getQtyCompleted(prev);

    if (proposedStarted > prevCompleted) {
        return {
            ...prev,
            reason: 'qty',
            prevCompleted,
            proposedStarted,
        };
    }

    if (proposedStarted <= 0 && prevCompleted <= 0) {
        return {
            ...prev,
            reason: 'waiting',
            prevCompleted,
            proposedStarted,
        };
    }
    return null;
}

export function buildCannotStartMessage(currentStage, blocker) {
    const currentName = currentStage?.stageName || 'this stage';
    const prevName = blocker?.stageName || 'the previous stage';
    if (blocker?.reason === 'qty') {
        return `Cannot start ${blocker.proposedStarted} pcs in ${currentName}. Only ${blocker.prevCompleted} pcs have been completed in ${prevName}.`;
    }
    return `Waiting for output from ${prevName}.`;
}

export function buildCompleteBeforeHint(currentStage, blocker) {
    const prevName = blocker?.stageName || 'the previous stage';
    return `Waiting for output from ${prevName}.`;
}

export function buildBackwardEditMessage(currentStage, nextStage, attemptedCompleted) {
    const currentName = currentStage?.stageName || 'this stage';
    const nextName = nextStage?.stageName || 'the next stage';
    const nextStarted = getQtyStarted(nextStage);
    return `Cannot reduce ${currentName} completed quantity to ${attemptedCompleted} because ${nextStarted} pcs have already started ${nextName}.`;
}

export function stageHasProgress(stage) {
    const status = String(stage?.status || 'Not Started');
    if (status !== 'Not Started') return true;
    return getQtyStarted(stage) > 0 || (Number(stage?.outputQty) || 0) > 0;
}

/** Qty violations only — previous stage being In Progress is not an inconsistency. */
export function getSequenceInconsistencies(stages = []) {
    return [...stages]
        .filter((s) => Number(s.seq) > 1 && isApplicableStage(s) && stageHasProgress(s))
        .map((s) => {
            const previous = getApplicablePreviousStage(stages, s.seq);
            if (!previous) return null;
            if (getQtyStarted(s) <= getQtyCompleted(previous) && getQtyCompleted(s) <= getQtyCompleted(previous)) {
                return null;
            }
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
