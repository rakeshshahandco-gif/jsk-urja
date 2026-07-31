/**
 * Exclusive final-category assignment for strict location recheck reconciliation.
 * Exactly one bucket per captured row.
 */
import {
    LOCATION_CLASSIFICATIONS,
    PRODUCT_MATCH_STRENGTHS,
} from '../rawCaptureQualification/locationMatch.util.js';

export const STRICT_FINAL_BUCKETS = Object.freeze([
    'strict_prospect',
    'serves_city',
    'location_mismatch',
    'location_not_confirmed',
    'address_missing',
    'job_course_training',
    'unrelated_product',
    'directory_only',
    'failed_retryable',
]);

export const STRICT_FINAL_BUCKET_LABELS = Object.freeze({
    strict_prospect: 'Strict Bangalore Prospects',
    serves_city: 'Serves Bangalore — No Office',
    location_mismatch: 'Location Mismatch',
    location_not_confirmed: 'Location Not Confirmed',
    address_missing: 'Address Missing',
    job_course_training: 'Job / Course / Training',
    unrelated_product: 'Unrelated Product',
    directory_only: 'Directory Only',
    failed_retryable: 'Failed / Retryable',
});

/**
 * Assign one exclusive final bucket for a joined capture row.
 * Priority: failed → product rejects → location classes → residual not confirmed.
 */
export function classifyStrictFinalBucket(row = {}) {
    const exclusive = row.exclusiveStatus || '';
    if (exclusive === 'failed') return 'failed_retryable';

    const strength = String(row.productMatchStrength || '');
    if (
        strength === PRODUCT_MATCH_STRENGTHS.JOB_COURSE
        || /job\/course|training/i.test(strength)
    ) {
        return 'job_course_training';
    }
    if (strength === PRODUCT_MATCH_STRENGTHS.DIRECTORY || /directory only/i.test(strength)) {
        return 'directory_only';
    }
    if (strength === PRODUCT_MATCH_STRENGTHS.UNRELATED || /unrelated product/i.test(strength)) {
        return 'unrelated_product';
    }

    const locClass = String(row.locationClassification || '');
    const locMatch = String(row.locationMatch || '');

    if (
        locMatch === 'mismatch'
        || locClass === LOCATION_CLASSIFICATIONS.DIFFERENT_CITY
        || row.flags?.isLocationMismatch
    ) {
        return 'location_mismatch';
    }

    if (locClass === LOCATION_CLASSIFICATIONS.ADDRESS_MISSING) {
        return 'address_missing';
    }
    if (
        row.flags?.hasEnrichDone
        && Number(row.addressCount || 0) === 0
        && !row.primaryAddress
        && !row.city
    ) {
        return 'address_missing';
    }

    if (
        locClass === LOCATION_CLASSIFICATIONS.SERVES_NO_OFFICE
        || (row.servesSelectedCity && !row.officeInSelectedCity)
    ) {
        return 'serves_city';
    }

    if (row.officeInSelectedCity && locMatch === 'match') {
        const productOk = /strong|possible/i.test(strength)
            || ['strong_match', 'possible_match'].includes(String(row.qualificationStatus || ''));
        if (productOk) return 'strict_prospect';
    }

    return 'location_not_confirmed';
}

export function countStrictFinalBuckets(rows = []) {
    const counts = Object.fromEntries(STRICT_FINAL_BUCKETS.map((k) => [k, 0]));
    for (const r of rows) {
        const key = r.strictFinalBucket || classifyStrictFinalBucket(r);
        if (counts[key] == null) counts.location_not_confirmed += 1;
        else counts[key] += 1;
    }
    counts.total = STRICT_FINAL_BUCKETS.reduce((sum, k) => sum + (counts[k] || 0), 0);
    return counts;
}
