/**
 * Checkpoint 5B Stage A — rule-based preliminary unwanted-result filter.
 * Not final AI qualification. Does not invent enrichment fields.
 */
const JOB_RE = /\b(jobs?|careers?|hiring|recruit(?:ment|er)?|vacanc(?:y|ies)|apply\s+now|job\s+opening)\b/i;
const COURSE_RE = /\b(course|courses|training|tutorial|tutorials|certification|learn\s+online|udemy|coursera|diy)\b/i;
const NEWS_RE = /\b(news|article|blog|press\s+release|wikipedia|wiki)\b/i;
const VIDEO_RE = /\b(youtube\.com|youtu\.be|vimeo\.com|watch\s+video)\b/i;
const CONSUMER_RE = /\b(how\s+to|what\s+is|best\s+\d+|top\s+\d+|amazon\.|flipkart\.|review\s+of)\b/i;
const GOOGLE_INTERNAL_RE = /\b(google\.[a-z.]+\/(search|maps|aclk|url)|webcache\.googleusercontent)\b/i;

const APPROVED_SOURCE_HOSTS = Object.freeze([
    'indiamart.com',
    'facebook.com',
    'fb.com',
    'm.facebook.com',
]);

function textBlob(record = {}) {
    return [
        record.title,
        record.snippet,
        record.displayDomain,
        record.resultUrlNormalized,
        record.resultUrlOriginal,
        record.resultUrl,
    ].map((x) => String(x || '')).join(' ');
}

function hostOf(record = {}) {
    const raw = String(record.displayDomain || record.resultUrlNormalized || record.resultUrlOriginal || '').toLowerCase();
    try {
        if (raw.includes('://')) return new URL(raw).hostname.replace(/^www\./, '');
    } catch {
        /* ignore */
    }
    return raw.replace(/^www\./, '').split('/')[0];
}

function isApprovedDirectoryHost(host) {
    const h = String(host || '').toLowerCase();
    return APPROVED_SOURCE_HOSTS.some((d) => h === d || h.endsWith('.' + d));
}

export function classifyStageA(record = {}) {
    const blob = textBlob(record);
    const host = hostOf(record);
    const url = String(record.resultUrlNormalized || record.resultUrlOriginal || record.resultUrl || '');

    if (GOOGLE_INTERNAL_RE.test(url) || GOOGLE_INTERNAL_RE.test(blob)) {
        return { decision: 'rejected', reason: 'Google internal / navigation result', resultTypeHint: 'unknown', preliminary: true, label: 'Rejected (preliminary)' };
    }
    if (JOB_RE.test(blob)) {
        return { decision: 'rejected', reason: 'Jobs / recruitment content', resultTypeHint: 'job', preliminary: true, label: 'Rejected (preliminary)' };
    }
    if (COURSE_RE.test(blob)) {
        return { decision: 'rejected', reason: 'Course / training / DIY content', resultTypeHint: 'course', preliminary: true, label: 'Rejected (preliminary)' };
    }
    if (VIDEO_RE.test(blob) && !isApprovedDirectoryHost(host)) {
        return { decision: 'rejected', reason: 'Unrelated video content', resultTypeHint: 'unknown', preliminary: true, label: 'Rejected (preliminary)' };
    }
    if (NEWS_RE.test(blob) && !isApprovedDirectoryHost(host)) {
        return { decision: 'rejected', reason: 'News / article / consumer content', resultTypeHint: 'article', preliminary: true, label: 'Rejected (preliminary)' };
    }
    if (CONSUMER_RE.test(blob) && !isApprovedDirectoryHost(host)) {
        return { decision: 'review_required', reason: 'Possible consumer / how-to page — needs review', resultTypeHint: 'article', preliminary: true, label: 'Review required (preliminary)' };
    }
    if (isApprovedDirectoryHost(host)) {
        return {
            decision: 'possible_match',
            reason: 'Approved directory/social listing — verify relevance later',
            resultTypeHint: host.includes('facebook') ? 'facebook_page' : 'marketplace_supplier',
            preliminary: true,
            label: 'Possible match (preliminary)',
        };
    }
    return {
        decision: 'relevant',
        reason: 'Passed Stage A rule pre-filter (unverified)',
        resultTypeHint: 'company',
        preliminary: true,
        label: 'Relevant (unverified)',
    };
}

export function attachStageA(record) {
    const stageA = classifyStageA(record);
    return {
        ...record,
        stageADecision: stageA.decision,
        stageAReason: stageA.reason,
        stageALabel: stageA.label,
        stageAPreliminary: true,
        reviewStatus: 'Unverified',
    };
}

export function summarizeStageA(records = []) {
    const counts = { relevant: 0, possible_match: 0, rejected: 0, review_required: 0 };
    for (const r of records) {
        const d = classifyStageA(r).decision;
        if (counts[d] != null) counts[d] += 1;
    }
    return counts;
}
