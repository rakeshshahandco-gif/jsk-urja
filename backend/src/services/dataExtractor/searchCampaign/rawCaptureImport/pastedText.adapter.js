import crypto from 'crypto';
import { ApiError } from '../../../../utils/ApiError.js';
import {
    buildCaptureFingerprint,
    looksLikeBinaryOrBase64,
    normalizeResultUrl,
} from '../rawCapture/normalize.util.js';
import { normalizeIngestRecord } from '../rawCapture/validation.js';
import {
    IMPORT_MAX_ROWS,
    IMPORT_PASTED_MAX_BYTES,
    IMPORT_PREVIEW_ROWS,
    REVIEW_REQUIRED_REASONS,
} from './constants.js';

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

function rejectUnsafeText(text) {
    if (text == null || typeof text !== 'string') throw new ApiError(400, 'text must be a string');
    if (!text.trim()) throw new ApiError(400, 'text must not be empty');
    if (Buffer.byteLength(text, 'utf8') > IMPORT_PASTED_MAX_BYTES) {
        throw new ApiError(400, `Pasted text must be at most ${IMPORT_PASTED_MAX_BYTES} bytes`);
    }
    if (looksLikeBinaryOrBase64(text)) throw new ApiError(400, 'Binary or base64-like content is not allowed');
    const lower = text.slice(0, 2000).toLowerCase();
    if (/<!doctype\s+html|<html[\s>]|<script[\s>]/i.test(lower)) {
        throw new ApiError(400, 'HTML documents are not allowed');
    }
    if (/^\s*[\[{]/.test(text) && text.includes('{') && text.split('{').length > 20) {
        throw new ApiError(400, 'Deeply nested JSON is not allowed');
    }
}

function tryUrl(raw) {
    try {
        return normalizeResultUrl(String(raw).trim());
    } catch {
        return null;
    }
}

function parseDelimitedLine(line, delim) {
    const cleaned = line.split(delim).map((p) => p.trim());
    if (cleaned.length < 2) return null;
    let url = '';
    let title = '';
    let snippet = '';
    for (const p of cleaned) {
        const u = tryUrl(p);
        if (u?.normalized && !url) {
            url = p;
            continue;
        }
        if (!title && p && !u?.normalized) {
            title = p;
            continue;
        }
        if (p && p !== title && p !== url) snippet = snippet ? `${snippet} ${p}` : p;
    }
    if (!url && !title && !snippet) return null;
    return { resultUrl: url, title, snippet };
}

function parseBlocks(text) {
    const blocks = text.split(/\n\s*\n/);
    const rows = [];
    for (const block of blocks) {
        const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (!lines.length) continue;
        const urls = [];
        const others = [];
        for (const line of lines) {
            const found = line.match(URL_RE) || [];
            if (found.length) {
                found.forEach((u) => urls.push(u));
                const rest = line.replace(URL_RE, '').trim();
                if (rest) others.push(rest);
            } else others.push(line);
        }
        if (urls.length === 1) {
            rows.push({
                resultUrl: urls[0],
                title: others[0] || '',
                snippet: others.slice(1).join(' '),
                reviewRequired: false,
                format: 'block',
            });
        } else if (urls.length > 1) {
            rows.push({
                resultUrl: urls[0],
                title: others[0] || '',
                snippet: others.slice(1).join(' '),
                reviewRequired: true,
                reasonCode: REVIEW_REQUIRED_REASONS.MULTIPLE_URLS,
                format: 'block_uncertain',
            });
        } else if (others.length) {
            rows.push({
                resultUrl: '',
                title: others[0] || '',
                snippet: others.slice(1).join(' '),
                reviewRequired: true,
                reasonCode: REVIEW_REQUIRED_REASONS.NO_CLEAR_URL,
                format: 'block_no_url',
            });
        }
    }
    return rows;
}

export function previewPastedText({ text } = {}) {
    rejectUnsafeText(text);
    const trimmed = String(text).replace(/^\uFEFF/, '');
    const lines = trimmed.split(/\r?\n/);
    let format = 'url_per_line';
    let parsed = [];

    const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);
    const tabHits = nonEmpty.filter((l) => l.includes('\t')).length;
    const pipeHits = nonEmpty.filter((l) => l.includes('|')).length;
    const hasBlankBlocks = /\n\s*\n/.test(trimmed);

    if (tabHits >= Math.max(1, nonEmpty.length * 0.5)) {
        format = 'tab_separated';
        parsed = nonEmpty.map((l) => ({ ...parseDelimitedLine(l, '\t'), reviewRequired: false, format }));
    } else if (pipeHits >= Math.max(1, nonEmpty.length * 0.5)) {
        format = 'pipe_separated';
        parsed = nonEmpty.map((l) => ({ ...parseDelimitedLine(l, '|'), reviewRequired: false, format }));
    } else if (hasBlankBlocks && nonEmpty.length > 2) {
        format = 'blank_line_blocks';
        parsed = parseBlocks(trimmed);
    } else {
        format = 'url_per_line';
        parsed = nonEmpty.map((l) => {
            const m = l.match(URL_RE);
            if (m && m.length === 1 && l.trim() === m[0]) {
                return { resultUrl: m[0], title: '', snippet: '', reviewRequired: false, format };
            }
            if (m && m.length === 1) {
                return {
                    resultUrl: m[0], title: '', snippet: '', reviewRequired: true, reasonCode: REVIEW_REQUIRED_REASONS.URL_WITH_EXTRA, format: 'url_with_extra',
                };
            }
            return {
                resultUrl: '', title: l, snippet: '', reviewRequired: true, reasonCode: REVIEW_REQUIRED_REASONS.LINE_UNCERTAIN, format: 'line_uncertain',
            };
        });
    }

    parsed = parsed.filter(Boolean).map((r) => ({
        resultUrl: r.resultUrl || '',
        title: r.title || '',
        snippet: r.snippet || '',
        reviewRequired: Boolean(r.reviewRequired),
        reasonCode: r.reasonCode || (r.reviewRequired ? REVIEW_REQUIRED_REASONS.LINE_UNCERTAIN : ''),
        format: r.format || format,
    }));

    if (parsed.length > IMPORT_MAX_ROWS) {
        throw new ApiError(400, `Pasted text may not exceed ${IMPORT_MAX_ROWS} rows`);
    }

    const seenFp = new Map();
    const rows = [];
    let invalid = 0;
    let dup = 0;
    let review = 0;
    for (let i = 0; i < parsed.length; i += 1) {
        const raw = parsed[i];
        const rowNumber = i + 1;
        let normalizedUrl = '';
        let displayDomain = '';
        let validity = 'valid';
        let rejectionReason = '';
        let duplicateWithinInput = false;
        if (raw.reviewRequired) review += 1;
        try {
            if (raw.resultUrl) {
                const u = normalizeResultUrl(raw.resultUrl);
                normalizedUrl = u.normalized;
                displayDomain = u.displayDomain;
            }
            const norm = normalizeIngestRecord({
                resultUrl: raw.resultUrl,
                title: raw.title,
                snippet: raw.snippet,
            }, i);
            if (!norm.ok) {
                validity = 'invalid';
                rejectionReason = norm.message;
                invalid += 1;
            } else if (raw.reviewRequired) {
                validity = 'review_required';
            } else {
                const fp = buildCaptureFingerprint({
                    source: 'manual',
                    queryScopeKey: 'preview',
                    resultUrlNormalized: norm.value.resultUrlNormalized,
                    sourceRecordId: '',
                    titleNormalized: norm.value.titleNormalized,
                    snippetNormalized: norm.value.snippetNormalized,
                });
                if (seenFp.has(fp)) { duplicateWithinInput = true; dup += 1; }
                else seenFp.set(fp, rowNumber);
            }
        } catch (e) {
            validity = 'invalid';
            rejectionReason = e?.message || 'invalid';
            invalid += 1;
        }
        rows.push({
            rowNumber,
            ...raw,
            normalizedUrl,
            displayDomain,
            validity,
            rejectionReason,
            reasonCode: raw.reasonCode || (validity === 'review_required' ? REVIEW_REQUIRED_REASONS.LINE_UNCERTAIN : ''),
            warning: validity === 'review_required' ? 'Correction or allowReviewRequired required before commit' : '',
            duplicateWithinInput,
        });
    }

    const contentHash = crypto.createHash('sha256').update(trimmed).digest('hex');
    return {
        adapterType: 'pasted_text',
        detectedFormat: format,
        totalRows: parsed.length,
        previewRows: rows.slice(0, IMPORT_PREVIEW_ROWS),
        invalidRowCount: invalid,
        duplicateWithinInputCount: dup,
        reviewRequiredCount: review,
        contentHash,
        previewFingerprint: contentHash,
        warnings: review ? ['Some rows require review before commit'] : [],
        records: parsed,
    };
}
