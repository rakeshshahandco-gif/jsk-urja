import crypto from 'crypto';
import { ApiError } from '../../../../utils/ApiError.js';
import { normalizeResultUrl } from '../rawCapture/normalize.util.js';
import { normalizeIngestRecord } from '../rawCapture/validation.js';
import { buildCaptureFingerprint } from '../rawCapture/normalize.util.js';
import { IMPORT_MAX_MANUAL_RECORDS, IMPORT_PREVIEW_ROWS } from './constants.js';

const RECORD_KEYS = new Set(['resultUrl', 'title', 'snippet', 'resultPosition', 'sourceRecordId', 'resultTypeHint']);

function coerceRecords(input) {
    if (input == null) throw new ApiError(400, 'urls or records are required');
    if (typeof input === 'string') {
        return [{ resultUrl: input }];
    }
    if (Array.isArray(input)) {
        return input.map((item) => {
            if (typeof item === 'string') return { resultUrl: item };
            if (item && typeof item === 'object' && !Array.isArray(item)) {
                const out = {};
                for (const k of Object.keys(item)) {
                    if (k.startsWith('$') || k.includes('.') || k === '__proto__') {
                        throw new ApiError(400, `Unsafe key rejected: ${k}`);
                    }
                    if (!RECORD_KEYS.has(k)) throw new ApiError(400, `Unknown fields: ${k}`);
                    out[k] = item[k];
                }
                return out;
            }
            throw new ApiError(400, 'Each record must be a URL string or object');
        });
    }
    throw new ApiError(400, 'urls must be a string or array');
}

export function previewManualUrls({ urls, records } = {}) {
    const list = coerceRecords(records != null ? records : urls);
    if (!list.length) throw new ApiError(400, 'At least one URL or record is required');
    if (list.length > IMPORT_MAX_MANUAL_RECORDS) {
        throw new ApiError(400, `Manual URL records may not exceed ${IMPORT_MAX_MANUAL_RECORDS}`);
    }

    const seenFp = new Map();
    const rows = [];
    let invalid = 0;
    let dup = 0;
    for (let i = 0; i < list.length; i += 1) {
        const raw = list[i];
        const rowNumber = i + 1;
        let normalizedUrl = '';
        let displayDomain = '';
        let validity = 'valid';
        let rejectionReason = '';
        let duplicateWithinInput = false;
        try {
            if (raw.resultUrl) {
                const u = normalizeResultUrl(raw.resultUrl);
                normalizedUrl = u.normalized;
                displayDomain = u.displayDomain;
            }
            const norm = normalizeIngestRecord(raw, i);
            if (!norm.ok) {
                validity = 'invalid';
                rejectionReason = norm.message;
                invalid += 1;
            } else {
                const fp = buildCaptureFingerprint({
                    source: 'manual',
                    queryScopeKey: 'preview',
                    resultUrlNormalized: norm.value.resultUrlNormalized,
                    sourceRecordId: norm.value.sourceRecordId,
                    titleNormalized: norm.value.titleNormalized,
                    snippetNormalized: norm.value.snippetNormalized,
                });
                if (seenFp.has(fp)) {
                    duplicateWithinInput = true;
                    dup += 1;
                } else seenFp.set(fp, rowNumber);
            }
        } catch (e) {
            validity = 'invalid';
            rejectionReason = e?.message || 'invalid';
            invalid += 1;
        }
        rows.push({
            rowNumber,
            original: raw,
            resultUrl: raw.resultUrl || '',
            title: raw.title || '',
            snippet: raw.snippet || '',
            normalizedUrl,
            displayDomain,
            validity,
            rejectionReason,
            duplicateWithinInput,
            reviewRequired: false,
        });
    }

    const contentHash = crypto.createHash('sha256')
        .update(JSON.stringify(list))
        .digest('hex');

    return {
        adapterType: 'manual_url',
        totalRows: list.length,
        previewRows: rows.slice(0, IMPORT_PREVIEW_ROWS),
        invalidRowCount: invalid,
        duplicateWithinInputCount: dup,
        contentHash,
        previewFingerprint: contentHash,
        warnings: [],
        records: list,
    };
}

export function parseManualUrlsForCommit(body = {}) {
    const preview = previewManualUrls(body);
    return preview;
}
