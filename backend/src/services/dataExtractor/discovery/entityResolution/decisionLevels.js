export const DECISION_LEVELS = [
    'EXACT_DUPLICATE',
    'HIGH_PROBABILITY_DUPLICATE',
    'POSSIBLE_DUPLICATE',
    'UNIQUE',
    'MANUAL_REVIEW_REQUIRED',
];

/** Map advanced decision → existing ExtractedLead.duplicateStatus enum (no migration). */
export function decisionToDuplicateStatus(decision) {
    switch (decision) {
        case 'EXACT_DUPLICATE':
            return 'confirmed_duplicate';
        case 'HIGH_PROBABILITY_DUPLICATE':
        case 'POSSIBLE_DUPLICATE':
        case 'MANUAL_REVIEW_REQUIRED':
            return 'possible_duplicate';
        case 'UNIQUE':
        default:
            return 'none';
    }
}

export function decideFromScoreAndReasons(score, reasons = []) {
    const fields = new Set(reasons.map((r) => r.field));
    const hasExactId = ['domain', 'gstin', 'email', 'indiamart', 'facebook', 'instagram', 'linkedin'].some((f) => fields.has(f) && reasons.some((r) => r.field === f && r.matchType === 'exact'));
    const hasConflict = reasons.some((r) => r.matchType === 'conflict');

    if (score >= 95 && hasExactId && !hasConflict) return 'EXACT_DUPLICATE';
    if (hasConflict && score >= 60) return 'MANUAL_REVIEW_REQUIRED';
    if (score >= 85) return 'HIGH_PROBABILITY_DUPLICATE';
    if (score >= 55) return 'POSSIBLE_DUPLICATE';
    if (score >= 40) return 'MANUAL_REVIEW_REQUIRED';
    return 'UNIQUE';
}
