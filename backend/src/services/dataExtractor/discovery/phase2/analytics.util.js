import {
    collectEmails,
    collectPhones,
    collectSourceProviders,
    identityDomain,
} from './inputPayload.util.js';

function catOf(rec) {
    return rec?.qualification?.category || rec?.qualification?.manualOverride?.category || '';
}

function sourceKey(rec) {
    const p = String(collectSourceProviders(rec)[0] || rec.sourcePlatform || rec.rawExtractedData?.sourceProvider || 'web_search').toLowerCase();
    if (p.includes('indiamart')) return 'indiamart';
    if (p.includes('tradeindia')) return 'tradeindia';
    if (p.includes('justdial')) return 'justdial';
    if (p.includes('exportersindia')) return 'exportersindia';
    if (p.includes('facebook')) return 'facebook';
    if (p.includes('instagram')) return 'instagram';
    if (p.includes('linkedin')) return 'linkedin';
    if (p === 'x' || p.includes('twitter')) return 'x';
    return 'web_search';
}

export function isCanonicalCompany(rec) {
    return rec?.phase2Merge?.mergedIntoPreviewIndex == null;
}

export function buildPhase2Analytics(job = {}, records = []) {
    const list = Array.isArray(records) ? records : [];
    const companies = list.filter(isCanonicalCompany);
    const qualified = companies.filter((r) => ['Qualified', 'Manual Override'].includes(r.qualification?.status));
    const byCat = {
        'Highly Relevant': 0,
        Relevant: 0,
        'Possibly Relevant': 0,
        'Not Relevant': 0,
        'Insufficient Information': 0,
    };
    for (const r of companies) {
        const c = catOf(r);
        if (Object.prototype.hasOwnProperty.call(byCat, c)) byCat[c] += 1;
    }

    const sourceEffectiveness = {};
    for (const rec of list) {
        const key = sourceKey(rec);
        if (!sourceEffectiveness[key]) {
            sourceEffectiveness[key] = {
                source: key,
                candidates: 0,
                uniqueCompanies: 0,
                qualifiedCompanies: 0,
                highlyRelevant: 0,
                emailsFound: 0,
                phonesFound: 0,
            };
        }
        const row = sourceEffectiveness[key];
        row.candidates += 1;
        if (isCanonicalCompany(rec)) {
            row.uniqueCompanies += 1;
            if (['Qualified', 'Manual Override'].includes(rec.qualification?.status)) row.qualifiedCompanies += 1;
            if (catOf(rec) === 'Highly Relevant') row.highlyRelevant += 1;
            if (collectEmails(rec).length) row.emailsFound += 1;
            if (collectPhones(rec).length) row.phonesFound += 1;
        }
    }

    const pendingDup = companies.filter((r) => r.phase2Merge?.duplicateStatus === 'review'
        || r.entityResolution?.requiresManualReview).length;

    return {
        keyword: job.keyword || '',
        location: [job.city, job.state, job.country].filter(Boolean).join(', '),
        rawCandidates: job.totalRawResults || list.length,
        uniqueCompanies: companies.length,
        aiProcessed: qualified.length,
        highlyRelevant: byCat['Highly Relevant'],
        relevant: byCat.Relevant,
        possible: byCat['Possibly Relevant'],
        notRelevant: byCat['Not Relevant'],
        insufficientInformation: byCat['Insufficient Information'],
        companiesWithEmail: companies.filter((r) => collectEmails(r).length).length,
        companiesWithPhone: companies.filter((r) => collectPhones(r).length).length,
        companiesWithWebsite: companies.filter((r) => identityDomain(r) || r.website).length,
        potentialDuplicates: pendingDup,
        convertedToCrmLeads: list.filter((r) => r.status === 'converted' || r.convertedRecordId).length,
        qualificationPending: companies.filter((r) => !r.qualification?.status || r.qualification.status === 'Pending').length,
        qualificationFailed: companies.filter((r) => r.qualification?.status === 'Failed').length,
        sourceEffectiveness: Object.values(sourceEffectiveness),
    };
}

export function matchesQualifiedFilters(rec, query = {}) {
    if (!isCanonicalCompany(rec)) return false;
    const q = rec.qualification || {};
    const category = q.manualOverride?.category || q.category || '';
    const score = Number(q.score);
    const types = q.companyTypes || [];
    const emails = collectEmails(rec);
    const phones = collectPhones(rec);

    const cats = String(query.categories || query.category || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    if (cats.length && !cats.includes(category)) return false;

    if (query.minScore != null && query.minScore !== '' && !(Number.isFinite(score) && score >= Number(query.minScore))) return false;
    if (query.maxScore != null && query.maxScore !== '' && !(Number.isFinite(score) && score <= Number(query.maxScore))) return false;

    if (query.companyType) {
        const want = String(query.companyType).toLowerCase();
        if (!types.some((t) => String(t).toLowerCase() === want)) return false;
    }
    if (query.city && String(rec.city || '').toLowerCase() !== String(query.city).toLowerCase()) return false;
    if (query.state) {
        const st = String(rec.stateProvince || rec.state || '').toLowerCase();
        if (st !== String(query.state).toLowerCase()) return false;
    }
    if (query.hasEmail === 'true' && !emails.length) return false;
    if (query.hasEmail === 'false' && emails.length) return false;
    if (query.hasPhone === 'true' && !phones.length) return false;
    if (query.hasPhone === 'false' && phones.length) return false;
    if (query.hasWebsite === 'true' && !(identityDomain(rec) || rec.website)) return false;
    if (query.hasWebsite === 'false' && (identityDomain(rec) || rec.website)) return false;
    if (query.source) {
        const providers = collectSourceProviders(rec).join(' ').toLowerCase();
        if (!providers.includes(String(query.source).toLowerCase())) return false;
    }
    if (query.duplicateStatus) {
        const ds = String(rec.phase2Merge?.duplicateStatus || rec.duplicateDisplayLabel || rec.duplicateStatus || '').toLowerCase();
        if (!ds.includes(String(query.duplicateStatus).toLowerCase())) return false;
    }
    if (query.qualificationStatus) {
        if (String(q.status || 'Pending') !== String(query.qualificationStatus)) return false;
    }
    return true;
}
