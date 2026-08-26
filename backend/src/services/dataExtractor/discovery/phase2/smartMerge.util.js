import { DEFAULT_THRESHOLDS, PHASE2_ENGINE_VERSION } from './constants.js';
import {
    collectEmails,
    collectPhones,
    collectSourceProviders,
    collectSourceUrls,
    identityDomain,
} from './inputPayload.util.js';
import { mergeDiscoveryRecords, normalizeCompanyKey, normalizePhoneDigits } from '../mergeNormalize.service.js';
import { isDirectoryHost } from '../../searchCampaign/rawCaptureEnrichment/parse.util.js';

function nameTokens(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/\b(pvt|pvt\.|private|ltd|limited|llc|inc|llp|co|company)\b/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 1);
}

export function nameSimilarity(a, b) {
    const ta = new Set(nameTokens(a));
    const tb = new Set(nameTokens(b));
    if (!ta.size || !tb.size) return 0;
    let inter = 0;
    for (const t of ta) if (tb.has(t)) inter += 1;
    const dice = (2 * inter) / (ta.size + tb.size);
    const ka = normalizeCompanyKey(a);
    const kb = normalizeCompanyKey(b);
    const prefix = ka && kb && (ka.startsWith(kb) || kb.startsWith(ka)) ? 0.12 : 0;
    return Math.min(1, dice + prefix);
}

function emailDomain(email) {
    const e = String(email || '').trim().toLowerCase();
    const at = e.lastIndexOf('@');
    if (at < 1) return '';
    return e.slice(at + 1);
}

function sameCity(a, b) {
    const ca = String(a.city || '').trim().toLowerCase();
    const cb = String(b.city || '').trim().toLowerCase();
    return !!(ca && cb && ca === cb);
}

function phoneKey(record) {
    const digits = normalizePhoneDigits(record.phone || record.mobile || collectPhones(record)[0]);
    return digits.length >= 8 ? digits.slice(-10) : '';
}

function gstinOf(record) {
    return String(record.gstin || record.rawExtractedData?.gstin || '').replace(/\s+/g, '').toUpperCase();
}

function socialOverlap(a, b) {
    const keys = ['facebook', 'instagram', 'linkedin', 'twitter', 'youtube'];
    const hits = [];
    for (const k of keys) {
        const va = String(a.socialLinks?.[k] || '').trim().toLowerCase();
        const vb = String(b.socialLinks?.[k] || '').trim().toLowerCase();
        if (va && vb && va === vb) hits.push(k);
    }
    return hits;
}

function blockingKey(record) {
    const name = normalizeCompanyKey(record.companyName).slice(0, 8);
    const phone = phoneKey(record);
    const domain = identityDomain(record);
    return { name, phone, domain };
}

/**
 * Deterministic merge confidence. AI is not used to merge.
 */
export function scoreMergePair(a = {}, b = {}) {
    const reasons = [];
    const checks = {
        sameDomain: false,
        samePhone: false,
        sameCity: false,
        sameEmailDomain: false,
        sameGstin: false,
        sameWebsite: false,
        sameSocial: false,
        nameSimilarity: 0,
        conflict: false,
        conflictReason: '',
    };

    const da = identityDomain(a);
    const db = identityDomain(b);
    const pa = phoneKey(a);
    const pb = phoneKey(b);
    const ga = gstinOf(a);
    const gb = gstinOf(b);
    const nameSim = nameSimilarity(a.companyName, b.companyName);
    checks.nameSimilarity = Math.round(nameSim * 100);

    if (da && db && da === db) {
        checks.sameDomain = true;
        checks.sameWebsite = true;
        reasons.push({ field: 'domain', detail: 'Same domain ✓', weight: 'very_strong' });
    }
    if (ga && gb && ga === gb) {
        checks.sameGstin = true;
        reasons.push({ field: 'gstin', detail: 'Same GSTIN ✓', weight: 'very_strong' });
    }
    if (pa && pb && pa === pb) {
        checks.samePhone = true;
        reasons.push({ field: 'phone', detail: 'Same phone ✓', weight: 'very_strong' });
    }

    const emailsA = collectEmails(a);
    const emailsB = collectEmails(b);
    const edA = emailDomain(emailsA[0]);
    const edB = emailDomain(emailsB[0]);
    if (edA && edB && edA === edB && da && da === edA) {
        checks.sameEmailDomain = true;
        reasons.push({ field: 'email', detail: 'Same email domain ✓', weight: 'very_strong' });
    } else if (edA && edB && edA === edB && nameSim >= 0.7) {
        checks.sameEmailDomain = true;
        reasons.push({ field: 'email', detail: 'Same email domain ✓', weight: 'strong' });
    }

    if (sameCity(a, b)) {
        checks.sameCity = true;
        reasons.push({ field: 'city', detail: 'Same city ✓', weight: 'strong' });
    }
    if (nameSim >= 0.85) {
        reasons.push({ field: 'name', detail: `Name similarity ${checks.nameSimilarity}%`, weight: 'strong' });
    } else if (nameSim >= 0.6) {
        reasons.push({ field: 'name', detail: `Name similarity ${checks.nameSimilarity}%`, weight: 'supporting' });
    }

    const social = socialOverlap(a, b);
    if (social.length) {
        checks.sameSocial = true;
        reasons.push({ field: 'social', detail: `Same ${social.join(', ')} profile ✓`, weight: 'strong' });
    }

    const addrA = String(a.address || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const addrB = String(b.address || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (addrA && addrB && addrA === addrB) {
        reasons.push({ field: 'address', detail: 'Same address ✓', weight: 'strong' });
    }

    // Conflicts: similar name but different identity → do not auto-merge
    if (da && db && da !== db) {
        checks.conflict = true;
        checks.conflictReason = 'Different company websites/domains';
        reasons.push({ field: 'domain', detail: `Different domains (${da} vs ${db})`, weight: 'conflict' });
    }
    if (pa && pb && pa !== pb && !sameCity(a, b) && da && db && da !== db) {
        checks.conflict = true;
        checks.conflictReason = checks.conflictReason || 'Different phone, city and domain';
        reasons.push({ field: 'phone', detail: 'Different phones', weight: 'conflict' });
    }
    if (ga && gb && ga !== gb) {
        checks.conflict = true;
        checks.conflictReason = 'Different GSTIN';
        reasons.push({ field: 'gstin', detail: 'Different GSTIN — do not merge', weight: 'conflict' });
    }

    let confidence = 0;
    if (checks.sameDomain || checks.sameGstin) confidence += 50;
    if (checks.samePhone) confidence += 40;
    if (checks.sameEmailDomain) confidence += 20;
    if (nameSim >= 0.85) confidence += 20;
    else if (nameSim >= 0.7) confidence += 12;
    else if (nameSim >= 0.55) confidence += 6;
    if (checks.sameCity && nameSim >= 0.75) confidence += 12;
    if (checks.sameSocial) confidence += 18;
    if (addrA && addrA === addrB) confidence += 10;

    if (checks.sameDomain && nameSim >= 0.4) confidence = Math.max(confidence, 96);
    if (checks.sameGstin) confidence = Math.max(confidence, 98);
    if (checks.samePhone && nameSim >= 0.7) confidence = Math.max(confidence, 96);

    confidence = Math.max(0, Math.min(100, confidence));
    if (checks.conflict) {
        confidence = Math.min(confidence, 40);
    }

    let decision = 'keep_separate';
    if (!checks.conflict && confidence >= DEFAULT_THRESHOLDS.autoMergeMin) decision = 'auto_merge';
    else if (!checks.conflict && confidence >= DEFAULT_THRESHOLDS.reviewMin) decision = 'review';
    else decision = 'keep_separate';

    return {
        mergeConfidence: confidence,
        decision,
        reasons,
        checks,
        engineVersion: PHASE2_ENGINE_VERSION,
    };
}

function candidatePairs(records) {
    const buckets = new Map();
    records.forEach((rec, idx) => {
        if (rec?.phase2Merge?.mergedIntoPreviewIndex != null) return;
        const { name, phone, domain } = blockingKey(rec);
        const keys = [];
        if (name) keys.push('n:' + name);
        if (phone) keys.push('p:' + phone);
        if (domain) keys.push('d:' + domain);
        if (!keys.length) keys.push('i:' + idx);
        for (const k of keys) {
            if (!buckets.has(k)) buckets.set(k, []);
            buckets.get(k).push(idx);
        }
    });
    const seen = new Set();
    const pairs = [];
    for (const idxs of buckets.values()) {
        if (idxs.length < 2) continue;
        for (let i = 0; i < idxs.length; i++) {
            for (let j = i + 1; j < idxs.length; j++) {
                const a = Math.min(idxs[i], idxs[j]);
                const b = Math.max(idxs[i], idxs[j]);
                const key = a + ':' + b;
                if (seen.has(key)) continue;
                seen.add(key);
                pairs.push([a, b]);
            }
        }
    }
    return pairs;
}

function mergeContacts(merged, incoming) {
    const emails = collectEmails({ ...merged, additionalEmails: [...(merged.additionalEmails || []), ...collectEmails(incoming)] });
    const phones = collectPhones({ ...merged, additionalPhones: [...(merged.additionalPhones || []), ...collectPhones(incoming)] });
    const primaryEmail = merged.email || emails[0] || '';
    const primaryPhone = merged.phone || merged.mobile || phones[0] || '';
    const altNames = [...new Set([
        ...(merged.alternativeNames || []),
        ...(incoming.alternativeNames || []),
        incoming.companyName,
        merged.companyName,
    ].filter(Boolean))];
    const runIds = [...new Set([
        ...(merged.extractionRunIds || []),
        ...(incoming.extractionRunIds || []),
        incoming.rawExtractedData?.discoveryJobId,
        merged.rawExtractedData?.discoveryJobId,
    ].filter(Boolean))];
    return {
        ...merged,
        email: primaryEmail,
        additionalEmails: emails.filter((e) => e !== String(primaryEmail).toLowerCase()),
        phone: primaryPhone,
        additionalPhones: phones.filter((p) => normalizePhoneDigits(p) !== normalizePhoneDigits(primaryPhone)),
        alternativeNames: altNames.filter((n) => n !== merged.companyName).slice(0, 8),
        extractionRunIds: runIds.slice(0, 20),
        sourcesFound: collectSourceProviders(merged).length,
        evidenceUrls: collectSourceUrls(merged),
    };
}

export function applySmartMerge(records = [], { jobId } = {}) {
    const preview = records.map((r) => ({ ...r }));
    const autoMerged = [];
    const reviewPairs = [];
    const keptSeparate = [];

    const parent = preview.map((_, i) => i);
    const find = (i) => {
        while (parent[i] !== i) i = parent[i] = parent[parent[i]];
        return i;
    };
    const union = (a, b) => {
        const pa = find(a);
        const pb = find(b);
        if (pa === pb) return;
        parent[pb] = pa;
    };

    for (const [ia, ib] of candidatePairs(preview)) {
        const scored = scoreMergePair(preview[ia], preview[ib]);
        if (scored.decision === 'auto_merge') {
            union(ia, ib);
            autoMerged.push({ ia, ib, ...scored });
        } else if (scored.decision === 'review') {
            reviewPairs.push({
                previewIndexA: ia,
                previewIndexB: ib,
                mergeConfidence: scored.mergeConfidence,
                reasons: scored.reasons,
                checks: scored.checks,
                recordA: snapshot(preview[ia]),
                recordB: snapshot(preview[ib]),
            });
        } else if (scored.mergeConfidence >= 50) {
            keptSeparate.push({ ia, ib, ...scored });
        }
    }

    const groups = new Map();
    preview.forEach((_, i) => {
        const p = find(i);
        if (!groups.has(p)) groups.set(p, []);
        groups.get(p).push(i);
    });

    for (const members of groups.values()) {
        if (members.length < 2) continue;
        const root = members[0];
        let merged = { ...preview[root] };
        const mergedFrom = [];
        for (const idx of members.slice(1)) {
            merged = mergeContacts(mergeDiscoveryRecords(merged, preview[idx]), preview[idx]);
            mergedFrom.push(idx);
            preview[idx] = {
                ...preview[idx],
                phase2Merge: {
                    mergedIntoPreviewIndex: root,
                    mergeConfidence: 98,
                    mergedAt: new Date().toISOString(),
                    jobId: jobId ? String(jobId) : '',
                },
                duplicateDisplayLabel: preview[idx].duplicateDisplayLabel === 'ALREADY_CONVERTED'
                    ? preview[idx].duplicateDisplayLabel
                    : 'MERGED_DRAFT',
            };
        }
        const providers = collectSourceProviders(merged);
        merged = {
            ...merged,
            _mergedDraft: true,
            sourcesFound: providers.length,
            evidenceUrls: collectSourceUrls(merged),
            alternativeNames: merged.alternativeNames,
            additionalEmails: merged.additionalEmails,
            additionalPhones: merged.additionalPhones,
            phase2Merge: {
                autoMerged: true,
                mergedFromPreviewIndexes: mergedFrom,
                mergeConfidence: 98,
                mergedAt: new Date().toISOString(),
                sourcesFound: providers.length,
            },
        };
        preview[root] = merged;
    }

    return { preview, autoMerged, reviewPairs, keptSeparate };
}

export function snapshot(record = {}) {
    return {
        companyName: record.companyName || '',
        website: record.website || '',
        email: record.email || '',
        phone: record.phone || record.mobile || '',
        city: record.city || '',
        state: record.stateProvince || record.state || '',
        gstin: record.gstin || '',
        sourceUrl: record.sourceUrl || '',
        domain: identityDomain(record) || record.normalizedDomain || '',
        sourceProviders: collectSourceProviders(record),
    };
}

export function isDirectoryRecord(record = {}) {
    const host = String(record.normalizedDomain || '').toLowerCase();
    return !!record.rawExtractedData?.isDirectory || (!!host && isDirectoryHost(host));
}

export function mergeTwoPreviewRecords(preview, indexA, indexB) {
    const a = preview[indexA];
    const b = preview[indexB];
    if (!a || !b) return preview;
    const out = preview.map((r) => ({ ...r }));
    let merged = mergeContacts(mergeDiscoveryRecords(out[indexA], out[indexB]), out[indexB]);
    const providers = collectSourceProviders(merged);
    merged = {
        ...merged,
        _mergedDraft: true,
        sourcesFound: providers.length,
        evidenceUrls: collectSourceUrls(merged),
        phase2Merge: {
            ...(out[indexA].phase2Merge || {}),
            autoMerged: false,
            manualMerged: true,
            mergedFromPreviewIndexes: [
                ...((out[indexA].phase2Merge || {}).mergedFromPreviewIndexes || []),
                indexB,
            ],
            mergeConfidence: 100,
            mergedAt: new Date().toISOString(),
            sourcesFound: providers.length,
        },
    };
    out[indexA] = merged;
    out[indexB] = {
        ...out[indexB],
        phase2Merge: {
            mergedIntoPreviewIndex: indexA,
            mergeConfidence: 100,
            mergedAt: new Date().toISOString(),
            manualMerged: true,
        },
        duplicateDisplayLabel: out[indexB].duplicateDisplayLabel === 'ALREADY_CONVERTED'
            ? out[indexB].duplicateDisplayLabel
            : 'MERGED_DRAFT',
    };
    return out;
}
