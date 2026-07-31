/**
 * Canonical unique-company grouping for verified results.
 * Groups verified source appearances (capture→enrichment→genuineness joins
 * and/or genuineness docs) AFTER the full campaign set is loaded.
 * Presentation/export only — does not mutate RawCapture or genuineness docs.
 */
import { normalizeDomain } from '../rawCaptureEnrichment/parse.util.js';
import {
    buildWebsiteIdentityKey,
    isDirectoryOrMarketplaceHostname,
    isHostedPlatformHostname,
    HOSTED_PLATFORM_SUFFIXES,
} from './websiteIdentity.util.js';
import {
    mergeContactsForDuplicateGroup,
    normalizeEmailKey,
    normalizePhoneKey,
    normalizeSocialKey,
} from './duplicateContactMerge.util.js';

export {
    HOSTED_PLATFORM_SUFFIXES,
    buildWebsiteIdentityKey,
    isDirectoryOrMarketplaceHostname,
    isHostedPlatformHostname,
};

const JUNK_EMAIL_RE = /^(your|you|email|user|name|test|admin|sample|example|noreply|no-reply|donotreply|contact@yoursite|info@example|asdf|abc|xxx)@/i;
const JUNK_EMAIL_DOMAINS = new Set([
    'email.com', 'example.com', 'example.org', 'test.com', 'domain.com',
    'yoursite.com', 'xyz.com', 'sentry.io', 'sentry-next.wixpress.com',
    'wixpress.com',
]);

export function isUsableMergeEmail(value) {
    const key = normalizeEmailKey(value);
    if (!key || !key.includes('@')) return false;
    if (JUNK_EMAIL_RE.test(key)) return false;
    const domain = key.split('@')[1] || '';
    if (JUNK_EMAIL_DOMAINS.has(domain)) return false;
    if (/\.(png|jpg|jpeg|gif|webp|svg|css|js)$/i.test(key)) return false;
    if (/%20|@2x\./i.test(key)) return false;
    return true;
}

export function buildCanonicalCompanyKey({
    websiteUrl = '',
    canonicalDomain = '',
    phones = [],
    whatsappNumbers = [],
    emails = [],
    socialUrls = [],
    addressRaw = '',
    companyName = '',
    isDirectory = false,
    ownerDuplicateKey = '',
} = {}) {
    if (ownerDuplicateKey) return `owner:${String(ownerDuplicateKey).trim().toLowerCase()}`;

    const websiteKey = buildWebsiteIdentityKey(websiteUrl || canonicalDomain, { isDirectory });
    if (websiteKey) return websiteKey;

    for (const p of phones) {
        const key = normalizePhoneKey(typeof p === 'string' ? p : (p?.normalized || p?.original || p?.value));
        if (key) return `phone:${key}`;
    }
    for (const p of whatsappNumbers) {
        const key = normalizePhoneKey(typeof p === 'string' ? p : (p?.normalized || p?.original || p?.value));
        if (key) return `wa:${key}`;
    }
    for (const e of emails) {
        const key = normalizeEmailKey(typeof e === 'string' ? e : (e?.value || e?.address));
        if (key && key.includes('@')) return `email:${key}`;
    }
    for (const s of socialUrls) {
        const key = normalizeSocialKey(typeof s === 'string' ? s : (s?.url || ''));
        if (key) return `social:${key}`;
    }

    const addr = String(addressRaw || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const name = String(companyName || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (addr.length >= 12 && name.length >= 3) return `addrname:${addr}|${name}`;

    if (canonicalDomain) {
        return buildWebsiteIdentityKey(canonicalDomain, { isDirectory }) || `fallback:${canonicalDomain}`;
    }
    if (name) return `nameonly:${name}`;
    return '';
}

function enrichmentSocialUrls(en) {
    return [en?.facebook?.url, en?.instagram?.url, en?.linkedin?.url].filter(Boolean);
}

function firstAddressRaw(en) {
    const a = Array.isArray(en?.addresses) && en.addresses[0] ? en.addresses[0] : null;
    return String(a?.raw || '').trim();
}

export function isIndependentlyVerifiedDecision(gen) {
    if (!gen) return false;
    if (gen.verificationStatus === 'failed') return false;
    const owner = String(gen.ownerDecision || '');
    const ownerStatus = String(gen.ownerReviewStatus || '');
    if (ownerStatus === 'approved' || owner === 'verified_genuine' || owner === 'likely_genuine') {
        return true;
    }
    const decision = String(gen.systemDecision || gen.genuinenessDecision || '');
    if (decision === 'directory_or_marketplace_only') return false;
    return decision === 'verified_genuine' || decision === 'likely_genuine';
}

/**
 * Shared verified-only eligibility for:
 * Verified Data tab, Latest Verified Results, Verified KPI, Final Verified Excel.
 * Includes directory listing groups (accepted live dataset) but excludes human_review / failed / rejected.
 * Owner approval or eligible AI recheck status makes a record eligible without a new company row.
 */
export function isEligibleForFinalVerified(genuineness, enrichment = null) {
    if (!genuineness) return false;
    if (genuineness.verificationStatus === 'failed') return false;

    const ownerStatus = String(genuineness.ownerReviewStatus || '');
    const ownerDecision = String(genuineness.ownerDecision || '');
    if (ownerStatus === 'approved' || ownerDecision === 'verified_genuine' || ownerDecision === 'likely_genuine') {
        return true;
    }

    const decision = String(genuineness.systemDecision || genuineness.genuinenessDecision || '');
    if (decision === 'verified_genuine' || decision === 'likely_genuine') return true;

    // Directory listing remains in the verified dataset as directory evidence (not an independent buyer).
    if (decision === 'directory_or_marketplace_only') return true;
    if (enrichment?.isDirectorySource && decision) return true;

    return false;
}

export function displayVerificationStatus(gen, { isDirectory = false } = {}) {
    const owner = String(gen?.ownerDecision || '');
    const ownerStatus = String(gen?.ownerReviewStatus || '');
    if (ownerStatus === 'approved' || owner === 'verified_genuine') {
        return {
            code: 'owner_verified',
            label: 'Owner Verified',
            independentlyVerified: true,
        };
    }
    if (owner === 'likely_genuine') {
        return {
            code: 'owner_likely',
            label: 'Owner Likely Genuine',
            independentlyVerified: true,
        };
    }
    const decision = String(gen?.systemDecision || gen?.genuinenessDecision || '');
    if (isDirectory || decision === 'directory_or_marketplace_only') {
        return {
            code: 'directory_listing_not_independently_verified',
            label: 'Directory Listing — Business Not Independently Verified',
            independentlyVerified: false,
        };
    }
    if (decision === 'verified_genuine') {
        return { code: 'ai_verified_genuine', label: 'AI Verified Genuine', independentlyVerified: true };
    }
    if (decision === 'likely_genuine') {
        return { code: 'ai_likely_genuine', label: 'AI Likely Genuine', independentlyVerified: true };
    }
    if (decision === 'human_review_required') {
        return { code: 'human_review_required', label: 'Review Required', independentlyVerified: false };
    }
    if (decision === 'suspected_unreliable') {
        return { code: 'suspected_unreliable', label: 'Suspected Unreliable', independentlyVerified: false };
    }
    if (decision === 'rejected_unusable') {
        return { code: 'rejected_unusable', label: 'Rejected', independentlyVerified: false };
    }
    return {
        code: decision || 'unknown',
        label: decision ? String(decision).replace(/_/g, ' ') : 'Unknown',
        independentlyVerified: false,
    };
}

function pickBestGenuineness(items = []) {
    return [...items].sort((a, b) => {
        const aOwner = a.ownerReviewStatus === 'approved' ? 1000 : 0;
        const bOwner = b.ownerReviewStatus === 'approved' ? 1000 : 0;
        return (bOwner + Number(b.genuinenessScore || 0)) - (aOwner + Number(a.genuinenessScore || 0));
    })[0] || null;
}

function shortCompanyName(name, domain) {
    const raw = String(name || '').trim();
    if (!raw) return domain || 'Unknown company';
    // Prefer brand after last pipe for long SEO titles ("… | Plush Technologies")
    if (raw.includes('|')) {
        const parts = raw.split('|').map((p) => p.trim()).filter(Boolean);
        const last = parts[parts.length - 1];
        if (last && last.length >= 3 && last.length <= 80 && !/manufacturer|dealer|supplier|in india/i.test(last)) {
            return last;
        }
        const first = parts[0];
        if (first.length >= 3 && first.length <= 80) return first;
    }
    if (raw.length > 80) return `${raw.slice(0, 77)}...`;
    return raw;
}

/**
 * Build source appearance records from campaign join maps.
 * Each capture linked to a genuineness doc is one source appearance.
 * Genuineness docs with no linked captures still produce one appearance.
 */
export function buildVerifiedSourceAppearances({
    captures = [],
    enrichments = [],
    qualifications = [],
    genuinenessDocs = [],
    queryTextById = {},
} = {}) {
    const enrichByCapture = new Map();
    for (const e of enrichments) {
        for (const cid of (e.rawCaptureIds || [])) {
            const key = String(cid);
            if (!enrichByCapture.has(key)) enrichByCapture.set(key, e);
        }
    }
    const enrichById = new Map(enrichments.map((e) => [String(e._id), e]));
    const qualByEnrichment = new Map(qualifications.map((q) => [String(q.enrichmentId), q]));
    const genByQual = new Map(genuinenessDocs.map((g) => [String(g.qualificationId), g]));
    const usedGenIds = new Set();
    const appearances = [];

    for (const cap of captures) {
        const enrich = enrichByCapture.get(String(cap._id)) || null;
        if (!enrich) continue;
        const qual = qualByEnrichment.get(String(enrich._id)) || null;
        const gen = qual ? (genByQual.get(String(qual._id)) || null) : null;
        if (!gen) continue;
        usedGenIds.add(String(gen._id));
        const isDirectory = Boolean(enrich.isDirectorySource)
            || isDirectoryOrMarketplaceHostname(enrich.canonicalDomain || '');
        appearances.push({
            appearanceId: `cap:${cap._id}`,
            captureId: String(cap._id),
            genuinenessId: String(gen._id),
            enrichmentId: String(enrich._id),
            qualificationId: qual ? String(qual._id) : '',
            companyName: enrich.companyName || enrich.legalOrDisplayedName || cap.title || '',
            websiteUrl: enrich.websiteUrl || cap.resultUrlOriginal || cap.resultUrlNormalized || '',
            canonicalDomain: enrich.canonicalDomain || cap.displayDomain || '',
            sourceTitle: cap.title || '',
            sourceUrl: cap.resultUrlOriginal || cap.resultUrlNormalized || '',
            query: queryTextById[String(cap.queryId || '')] || '',
            googlePageIndex: cap.googlePageIndex ?? cap.pageIndex ?? null,
            resultPosition: cap.resultPosition ?? null,
            capturedAt: cap.firstSeenAt || cap.createdAt || null,
            isDirectory,
            enrichment: enrich,
            qualification: qual,
            genuineness: gen,
            cp6: {
                enrichmentStatus: enrich.enrichmentStatus || '',
                pagesVisited: enrich.pagesVisited || [],
                sourceEvidence: enrich.sourceEvidence || [],
            },
            cp7: {
                systemDecision: qual?.systemDecision || '',
                ownerDecision: qual?.ownerDecision || '',
                relevanceScore: qual?.relevanceScore ?? null,
                decisionReason: qual?.decisionReason || '',
            },
            cp8: {
                systemDecision: gen.systemDecision || '',
                ownerDecision: gen.ownerDecision || '',
                ownerReviewStatus: gen.ownerReviewStatus || '',
                genuinenessScore: gen.genuinenessScore ?? null,
                verificationReason: gen.verificationReason || '',
                verifiedAt: gen.verifiedAt || null,
            },
        });
    }

    for (const gen of genuinenessDocs) {
        if (usedGenIds.has(String(gen._id))) continue;
        const enrich = gen.enrichmentId ? enrichById.get(String(gen.enrichmentId)) : null;
        const qual = qualifications.find((q) => String(q._id) === String(gen.qualificationId)) || null;
        const isDirectory = Boolean(enrich?.isDirectorySource)
            || isDirectoryOrMarketplaceHostname(gen.canonicalDomain || enrich?.canonicalDomain || '');
        appearances.push({
            appearanceId: `gen:${gen._id}`,
            captureId: '',
            genuinenessId: String(gen._id),
            enrichmentId: enrich ? String(enrich._id) : String(gen.enrichmentId || ''),
            qualificationId: String(gen.qualificationId || ''),
            companyName: gen.companyName || enrich?.companyName || '',
            websiteUrl: gen.websiteUrl || enrich?.websiteUrl || '',
            canonicalDomain: gen.canonicalDomain || enrich?.canonicalDomain || '',
            sourceTitle: gen.companyName || '',
            sourceUrl: gen.websiteUrl || '',
            query: '',
            googlePageIndex: null,
            resultPosition: null,
            capturedAt: gen.verifiedAt || gen.createdAt || null,
            isDirectory,
            enrichment: enrich,
            qualification: qual,
            genuineness: gen,
            cp6: {
                enrichmentStatus: enrich?.enrichmentStatus || '',
                pagesVisited: enrich?.pagesVisited || [],
                sourceEvidence: enrich?.sourceEvidence || [],
            },
            cp7: {
                systemDecision: qual?.systemDecision || '',
                ownerDecision: qual?.ownerDecision || '',
                relevanceScore: qual?.relevanceScore ?? null,
                decisionReason: qual?.decisionReason || '',
            },
            cp8: {
                systemDecision: gen.systemDecision || '',
                ownerDecision: gen.ownerDecision || '',
                ownerReviewStatus: gen.ownerReviewStatus || '',
                genuinenessScore: gen.genuinenessScore ?? null,
                verificationReason: gen.verificationReason || '',
                verifiedAt: gen.verifiedAt || null,
            },
        });
    }

    return appearances;
}

function identityKeyForAppearance(app) {
    const en = app.enrichment || {};
    return buildCanonicalCompanyKey({
        websiteUrl: app.websiteUrl || en.websiteUrl || '',
        canonicalDomain: app.canonicalDomain || en.canonicalDomain || '',
        phones: en.phones || [],
        whatsappNumbers: en.whatsappNumbers || [],
        emails: en.emails || [],
        socialUrls: enrichmentSocialUrls(en),
        addressRaw: firstAddressRaw(en),
        companyName: app.companyName || en.companyName || '',
        isDirectory: app.isDirectory,
        ownerDuplicateKey: app.genuineness?.ownerDuplicateKey || '',
    }) || `singleton:${app.appearanceId}`;
}

/**
 * Union-find merge across strong keys (website / phone / email / social / addr+name).
 * Directory listings never merge on bare domain — listing path is required in the key.
 */
export function groupAppearancesIntoCanonicalCompanies(appearances = []) {
    const list = appearances || [];
    const parent = new Map(list.map((a) => [a.appearanceId, a.appearanceId]));
    function find(x) {
        const p = parent.get(x);
        if (p !== x) {
            const r = find(p);
            parent.set(x, r);
            return r;
        }
        return x;
    }
    function union(a, b) {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(rb, ra);
    }

    const keyOwners = new Map(); // strongKey -> appearanceId
    function claim(key, appearanceId, { allowMerge = true } = {}) {
        if (!key) return;
        if (!keyOwners.has(key)) {
            keyOwners.set(key, appearanceId);
            return;
        }
        if (allowMerge) union(keyOwners.get(key), appearanceId);
    }

    for (const app of list) {
        const en = app.enrichment || {};
        const primary = identityKeyForAppearance(app);
        claim(primary, app.appearanceId, { allowMerge: true });

        // Secondary contact keys merge only for non-directory official/hosted businesses
        if (!app.isDirectory) {
            for (const p of (en.phones || [])) {
                const k = normalizePhoneKey(p.normalized || p.original || p.value);
                if (k) claim(`phone:${k}`, app.appearanceId);
            }
            for (const p of (en.whatsappNumbers || [])) {
                const k = normalizePhoneKey(p.normalized || p.original || p.value);
                if (k) claim(`wa:${k}`, app.appearanceId);
            }
            for (const e of (en.emails || [])) {
                const raw = typeof e === 'string' ? e : (e?.value || e?.address);
                if (!isUsableMergeEmail(raw)) continue;
                const k = normalizeEmailKey(raw);
                if (k) claim(`email:${k}`, app.appearanceId);
            }
            for (const s of enrichmentSocialUrls(en)) {
                const k = normalizeSocialKey(s);
                if (k) claim(`social:${k}`, app.appearanceId);
            }
        }
    }

    const groups = new Map();
    for (const app of list) {
        const root = find(app.appearanceId);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(app);
    }
    return [...groups.values()];
}

function mapCanonicalCompany(group, index) {
    const gens = group.map((a) => a.genuineness).filter(Boolean);
    const bestGen = pickBestGenuineness(gens);
    const enrichments = [];
    const seenEn = new Set();
    for (const a of group) {
        if (a.enrichment && !seenEn.has(String(a.enrichment._id))) {
            seenEn.add(String(a.enrichment._id));
            enrichments.push(a.enrichment);
        }
    }
    const merged = mergeContactsForDuplicateGroup(enrichments);
    const cs = merged.contactSummary || {};
    const isDirectory = group.some((a) => a.isDirectory)
        || String(bestGen?.systemDecision || '') === 'directory_or_marketplace_only';
    const status = displayVerificationStatus(bestGen, { isDirectory });
    const primaryEn = enrichments[0] || {};
    const domain = primaryEn.canonicalDomain
        || group[0]?.canonicalDomain
        || normalizeDomain(group[0]?.websiteUrl || '')
        || '';
    const website = cs.websitesAll?.[0]?.value
        || bestGen?.websiteUrl
        || primaryEn.websiteUrl
        || group[0]?.websiteUrl
        || '';
    const canonicalKey = identityKeyForAppearance(group[0]);
    const queries = new Set(group.map((a) => a.query).filter(Boolean));
    const evidenceUrls = new Set();
    for (const g of gens) {
        for (const u of (g.evidenceUrls || [])) evidenceUrls.add(u);
    }
    for (const a of group) {
        if (a.sourceUrl) evidenceUrls.add(a.sourceUrl);
    }

    const companyName = shortCompanyName(
        bestGen?.companyName || primaryEn.companyName || group[0]?.companyName,
        domain,
    );

    return {
        _id: bestGen?._id || group[0]?.genuinenessId || `canonical-${index}`,
        canonicalCompanyId: canonicalKey,
        canonicalKey,
        isCanonicalCompany: true,
        companyName,
        uniqueCompany: companyName,
        primaryWebsite: website,
        websiteUrl: website,
        canonicalDomain: domain,
        primaryPhone: cs.primaryPhone || '',
        allPhones: cs.phonesAll || [],
        primaryEmail: cs.primaryEmail || '',
        allEmails: cs.emailsAll || [],
        primaryWhatsApp: cs.primaryWhatsApp || '',
        allWhatsApp: cs.whatsappAll || [],
        contactSummary: cs,
        phones: merged.phones?.all || [],
        emails: merged.emails?.all || [],
        whatsappNumbers: merged.whatsapp?.all || [],
        contactPersons: merged.contacts?.all || [],
        verificationStatus: status.code,
        verificationStatusLabel: status.label,
        independentlyVerified: status.independentlyVerified,
        isDirectoryListing: isDirectory,
        systemDecision: bestGen?.systemDecision || '',
        ownerDecision: bestGen?.ownerDecision || '',
        ownerReviewStatus: bestGen?.ownerReviewStatus || '',
        genuinenessScore: bestGen?.genuinenessScore ?? null,
        genuinenessConfidence: bestGen?.genuinenessConfidence || '',
        verificationReason: bestGen?.verificationReason || '',
        verificationMethod: bestGen?.verificationMethod || '',
        verifiedAt: bestGen?.verifiedAt || null,
        enrichmentId: bestGen?.enrichmentId || group[0]?.enrichmentId || null,
        qualificationId: bestGen?.qualificationId || group[0]?.qualificationId || null,
        genuinenessId: bestGen?._id ? String(bestGen._id) : group[0]?.genuinenessId || '',
        sourceAppearances: group.length,
        queryCount: queries.size,
        evidenceCount: evidenceUrls.size,
        evidenceUrls: [...evidenceUrls].slice(0, 50),
        evidence: group.map((a) => ({
            appearanceId: a.appearanceId,
            captureId: a.captureId,
            genuinenessId: a.genuinenessId,
            enrichmentId: a.enrichmentId,
            qualificationId: a.qualificationId,
            sourceTitle: a.sourceTitle,
            companyName: a.companyName,
            query: a.query,
            googlePageIndex: a.googlePageIndex,
            resultPosition: a.resultPosition,
            sourceUrl: a.sourceUrl,
            websiteUrl: a.websiteUrl,
            capturedAt: a.capturedAt,
            cp6: a.cp6,
            cp7: a.cp7,
            cp8: a.cp8,
        })),
        sourceGenuinenessIds: [...new Set(group.map((a) => a.genuinenessId).filter(Boolean))],
        sourceEnrichmentIds: [...seenEn],
        sourceCaptureIds: group.map((a) => a.captureId).filter(Boolean),
        positiveSignals: bestGen?.positiveSignals || [],
        warningSignals: bestGen?.warningSignals || [],
        conflictingEvidence: bestGen?.conflictingEvidence || [],
        city: primaryEn.city || '',
        state: primaryEn.state || '',
        businessType: primaryEn.businessType || '',
        updatedAt: bestGen?.updatedAt || null,
        createdAt: bestGen?.createdAt || null,
    };
}

/**
 * Full pipeline: appearances → canonical groups → optional verified-only filter → sort → paginate.
 * Pagination ALWAYS happens after grouping.
 */
export function buildCanonicalVerifiedCompanies({
    captures = [],
    enrichments = [],
    qualifications = [],
    genuinenessDocs = [],
    queryTextById = {},
    options = {},
} = {}) {
    const {
        verifiedOnly = true,
        includeDirectoryListings = true,
        search = '',
        sort = 'sourceAppearances',
        sortDir = 'desc',
        page = 1,
        limit = null,
    } = options;

    const allAppearances = buildVerifiedSourceAppearances({
        captures,
        enrichments,
        qualifications,
        genuinenessDocs,
        queryTextById,
    });

    let appearances = allAppearances;
    if (verifiedOnly) {
        appearances = allAppearances.filter((a) => {
            if (!includeDirectoryListings && (a.isDirectory
                || a.genuineness?.systemDecision === 'directory_or_marketplace_only')) {
                return false;
            }
            return isEligibleForFinalVerified(a.genuineness, a.enrichment);
        });
    }

    const groups = groupAppearancesIntoCanonicalCompanies(appearances);
    let companies = groups.map((g, idx) => mapCanonicalCompany(g, idx + 1));

    const q = String(search || '').trim().toLowerCase();
    if (q) {
        companies = companies.filter((c) => {
            const hay = [
                c.companyName, c.primaryWebsite, c.canonicalDomain,
                c.primaryPhone, c.primaryEmail, c.verificationStatusLabel,
                ...(c.allPhones || []).map((p) => p.value),
                ...(c.allEmails || []).map((e) => e.value),
            ].join(' ').toLowerCase();
            return hay.includes(q);
        });
    }

    const dir = String(sortDir || 'desc').toLowerCase() === 'asc' ? 1 : -1;
    const sortKey = String(sort || 'sourceAppearances');
    companies = [...companies].sort((a, b) => {
        const av = a[sortKey] ?? a.genuinenessScore ?? 0;
        const bv = b[sortKey] ?? b.genuinenessScore ?? 0;
        if (av === bv) return String(a.companyName || '').localeCompare(String(b.companyName || ''));
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
    });

    const sourceAppearances = appearances.length;
    const uniqueVerifiedCompanies = companies.length;
    const duplicatesConsolidated = Math.max(0, sourceAppearances - uniqueVerifiedCompanies);

    const counters = {
        sourceAppearances,
        uniqueVerifiedCompanies,
        duplicatesConsolidated,
        verifiedSourceAppearances: sourceAppearances,
        uniqueSourceIdentities: uniqueVerifiedCompanies,
        duplicateAppearancesConsolidated: duplicatesConsolidated,
        directoryListings: companies.filter((c) => c.isDirectoryListing).length,
        independentlyVerifiedCompanies: companies.filter((c) => c.independentlyVerified).length,
    };

    let pageItems = companies;
    let pagination = {
        page: 1,
        limit: companies.length,
        total: companies.length,
        totalPages: 1,
        allMode: true,
    };

    if (limit != null && Number(limit) > 0) {
        const lim = Math.min(500, Math.max(1, Number(limit)));
        const pg = Math.max(1, Number(page) || 1);
        const skip = (pg - 1) * lim;
        pageItems = companies.slice(skip, skip + lim);
        pagination = {
            page: pg,
            limit: lim,
            total: companies.length,
            totalPages: Math.max(1, Math.ceil(companies.length / lim)),
            allMode: false,
        };
    }

    return {
        items: pageItems,
        allCompanies: companies,
        counters,
        pagination,
        sourceAppearancesList: appearances,
    };
}

/** Idempotent rebuild helper — pure function over current docs (no writes). */
export function rebuildCanonicalVerifiedCompanies(payload) {
    return buildCanonicalVerifiedCompanies(payload);
}
