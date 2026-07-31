import { stableStringify } from './normalize.util.js';

function hasVerifiedTruth(groundTruthType) {
    return ['VERIFIED_BUSINESS_OUTCOME', 'REVIEWER_CONSENSUS', 'CONFIRMED_LABEL', 'APPROVED_MASTER'].includes(groundTruthType);
}

function outputsEqual(a, b) {
    return stableStringify(a) === stableStringify(b);
}

function isCorrect(output, groundTruth, familyCode) {
    if (!groundTruth) return 'UNKNOWN';
    if (output?.kind === 'LEAD_SCORE') {
        if (groundTruth.priority) return output.priority === groundTruth.priority ? 'CORRECT' : 'INCORRECT';
        if (groundTruth.scoreBand) return output.priority === groundTruth.scoreBand ? 'CORRECT' : 'INCORRECT';
        if (typeof groundTruth.score === 'number') {
            return Math.abs(output.score - groundTruth.score) <= 5 ? 'CORRECT' : 'INCORRECT';
        }
    }
    if (output?.kind === 'LABEL') {
        const expected = groundTruth.label || groundTruth.value || groundTruth[familyCode];
        if (!expected) return 'UNKNOWN';
        return String(output.label).toLowerCase() === String(expected).toLowerCase() ? 'CORRECT' : 'INCORRECT';
    }
    if (output?.kind === 'PRODUCTS') {
        const expected = new Set((groundTruth.productIds || groundTruth.products || []).map(String));
        if (!expected.size) return 'UNKNOWN';
        const got = new Set((output.products || []).map((p) => String(p.id)));
        const hit = [...expected].filter((x) => got.has(x));
        return hit.length === expected.size ? 'CORRECT' : 'INCORRECT';
    }
    if (output?.kind === 'THRESHOLD') {
        if (typeof groundTruth.pass === 'boolean') return output.pass === groundTruth.pass ? 'CORRECT' : 'INCORRECT';
        if (typeof groundTruth.duplicate === 'boolean') return output.pass === groundTruth.duplicate ? 'CORRECT' : 'INCORRECT';
    }
    if (output?.kind === 'KG') {
        if (typeof groundTruth.suggested === 'boolean') return output.suggested === groundTruth.suggested ? 'CORRECT' : 'INCORRECT';
    }
    if (output?.kind === 'CONTACT') {
        if (groundTruth.role) return output.role === groundTruth.role ? 'CORRECT' : 'INCORRECT';
    }
    return 'UNKNOWN';
}

export function classifyComparison(baselineOutput, candidateOutput, groundTruth, groundTruthType, familyCode) {
    const verified = hasVerifiedTruth(groundTruthType);
    const equal = outputsEqual(baselineOutput, candidateOutput);
    const baselineCorrectness = verified ? isCorrect(baselineOutput, groundTruth, familyCode) : 'UNKNOWN';
    const candidateCorrectness = verified ? isCorrect(candidateOutput, groundTruth, familyCode) : 'UNKNOWN';

    let comparisonStatus = 'CHANGED_UNVERIFIED';
    let improvementType = '';
    let regressionType = '';

    if (!baselineOutput && candidateOutput) comparisonStatus = 'CANDIDATE_ONLY';
    else if (baselineOutput && !candidateOutput) comparisonStatus = 'BASELINE_ONLY';
    else if (!verified) {
        comparisonStatus = equal ? 'INSUFFICIENT_GROUND_TRUTH' : 'CHANGED_UNVERIFIED';
    } else if (equal) {
        comparisonStatus = baselineCorrectness === 'CORRECT' ? 'UNCHANGED_CORRECT' : 'UNCHANGED_INCORRECT';
    } else if (baselineCorrectness === 'INCORRECT' && candidateCorrectness === 'CORRECT') {
        comparisonStatus = 'IMPROVED';
        improvementType = 'CORRECTED_OUTCOME';
    } else if (baselineCorrectness === 'CORRECT' && candidateCorrectness === 'INCORRECT') {
        comparisonStatus = 'REGRESSED';
        regressionType = 'INTRODUCED_ERROR';
    } else if (baselineCorrectness === 'UNKNOWN' || candidateCorrectness === 'UNKNOWN') {
        comparisonStatus = 'CHANGED_UNVERIFIED';
    } else {
        comparisonStatus = 'CHANGED_UNVERIFIED';
    }

    return {
        comparisonStatus,
        baselineCorrectness,
        candidateCorrectness,
        improvementType,
        regressionType,
        verified,
    };
}

export function computeMetrics(results = [], timings = []) {
    const sampleSize = results.length;
    const verifiedRows = results.filter((r) => r.groundTruthType && !['NONE', 'USER_OPINION', 'SYNTHETIC_UNVERIFIED'].includes(r.groundTruthType));
    const verifiedGroundTruthRows = verifiedRows.length;

    const counts = {
        totalEvaluated: sampleSize,
        totalChanged: 0,
        improvementCount: 0,
        regressionCount: 0,
        unchangedCount: 0,
        insufficientGroundTruth: 0,
        evaluationErrors: 0,
    };

    let tp = 0; let fp = 0; let fn = 0; let tn = 0;
    const scoreDiffs = [];
    let thresholdCrossings = 0;
    let overScoring = 0;
    let underScoring = 0;
    let priorityMoves = 0;

    for (const r of results) {
        const s = r.comparisonStatus;
        if (s === 'IMPROVED') { counts.improvementCount += 1; counts.totalChanged += 1; }
        else if (s === 'REGRESSED') { counts.regressionCount += 1; counts.totalChanged += 1; }
        else if (s === 'UNCHANGED_CORRECT' || s === 'UNCHANGED_INCORRECT') counts.unchangedCount += 1;
        else if (s === 'INSUFFICIENT_GROUND_TRUTH') counts.insufficientGroundTruth += 1;
        else if (s === 'EVALUATION_ERROR') counts.evaluationErrors += 1;
        else if (s === 'CHANGED_UNVERIFIED' || s === 'BASELINE_ONLY' || s === 'CANDIDATE_ONLY') counts.totalChanged += 1;

        if (r.baselineCorrectness === 'CORRECT' && r.candidateCorrectness === 'CORRECT') tp += 1;
        if (r.baselineCorrectness === 'INCORRECT' && r.candidateCorrectness === 'INCORRECT') tn += 1;
        if (r.baselineCorrectness === 'CORRECT' && r.candidateCorrectness === 'INCORRECT') fp += 1;
        if (r.baselineCorrectness === 'INCORRECT' && r.candidateCorrectness === 'CORRECT') fn += 1;
        // For candidate-centric FP/FN vs ground truth:
        if (r.candidateCorrectness === 'INCORRECT' && r.groundTruth) {
            if (r.candidateOutput?.kind === 'THRESHOLD' && r.candidateOutput.pass) fp += 0; // already counted above carefully
        }

        if (r.baselineOutput?.kind === 'LEAD_SCORE' && r.candidateOutput?.kind === 'LEAD_SCORE') {
            const d = r.candidateOutput.score - r.baselineOutput.score;
            scoreDiffs.push(d);
            if (r.baselineOutput.priority !== r.candidateOutput.priority) priorityMoves += 1;
            if (r.groundTruth?.score != null) {
                const bErr = Math.abs(r.baselineOutput.score - r.groundTruth.score);
                const cErr = Math.abs(r.candidateOutput.score - r.groundTruth.score);
                if (cErr > bErr && r.candidateOutput.score > r.groundTruth.score) overScoring += 1;
                if (cErr > bErr && r.candidateOutput.score < r.groundTruth.score) underScoring += 1;
            }
            const thr = 70;
            const bCross = r.baselineOutput.score >= thr;
            const cCross = r.candidateOutput.score >= thr;
            if (bCross !== cCross) thresholdCrossings += 1;
        }
    }

    // Candidate correctness vs ground truth for precision/recall where verified
    let cTp = 0; let cFp = 0; let cFn = 0; let cTn = 0;
    for (const r of verifiedRows) {
        if (r.candidateCorrectness === 'CORRECT') cTp += 1;
        else if (r.candidateCorrectness === 'INCORRECT') {
            // treat incorrect positive-like outputs as FP when candidate asserted a positive label/pass
            if (r.candidateOutput?.pass === true || r.candidateOutput?.priority === 'HIGH') cFp += 1;
            else cFn += 1;
        }
    }
    const precisionDenom = cTp + cFp;
    const recallDenom = cTp + cFn;
    const precision = verifiedGroundTruthRows && precisionDenom ? cTp / precisionDenom : null;
    const recall = verifiedGroundTruthRows && recallDenom ? cTp / recallDenom : null;
    const f1 = precision != null && recall != null && (precision + recall) > 0
        ? (2 * precision * recall) / (precision + recall)
        : null;

    const accuracyReported = verifiedGroundTruthRows > 0;
    const agreementRate = verifiedGroundTruthRows
        ? verifiedRows.filter((r) => r.candidateCorrectness === 'CORRECT').length / verifiedGroundTruthRows
        : null;

    const sorted = [...timings].sort((a, b) => a - b);
    const avg = timings.length ? timings.reduce((a, b) => a + b, 0) / timings.length : 0;
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;

    const meanAbsDiff = scoreDiffs.length
        ? scoreDiffs.reduce((a, b) => a + Math.abs(b), 0) / scoreDiffs.length
        : null;
    const medianDiff = scoreDiffs.length
        ? [...scoreDiffs].sort((a, b) => a - b)[Math.floor(scoreDiffs.length / 2)]
        : null;

    return {
        sampleSize,
        verifiedGroundTruthRows,
        accuracyReported,
        ...counts,
        precision,
        recall,
        f1,
        falsePositiveRate: verifiedGroundTruthRows ? (cFp / verifiedGroundTruthRows) : null,
        falseNegativeRate: verifiedGroundTruthRows ? (cFn / verifiedGroundTruthRows) : null,
        agreementRate,
        reviewerFeedbackAlignment: agreementRate,
        outcomeAlignment: agreementRate,
        coverage: sampleSize ? (sampleSize - counts.evaluationErrors) / sampleSize : 0,
        missingDataRate: sampleSize ? counts.insufficientGroundTruth / sampleSize : 0,
        errorRate: sampleSize ? counts.evaluationErrors / sampleSize : 0,
        averageExecutionTimeMs: avg,
        p95ExecutionTimeMs: p95,
        memoryUsageMb: null,
        meanAbsoluteDifference: meanAbsDiff,
        medianDifference: medianDiff,
        scoreBandMovement: priorityMoves,
        priorityMovement: priorityMoves,
        thresholdCrossingCount: thresholdCrossings,
        overScoringCount: overScoring,
        underScoringCount: underScoring,
        note: accuracyReported
            ? 'Metrics use verified ground truth only where indicated'
            : 'Accuracy not reported — verified ground truth unavailable',
    };
}
