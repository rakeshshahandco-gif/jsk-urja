/**
 * Simple Lead Search — owner-facing business type + manufacturer matching.
 * Query operators/exclusions stay internal. Does not invent location or contacts.
 */

function collapse(value = '') {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function norm(value = '') {
    return collapse(value).toLowerCase();
}

export const SIMPLE_BUSINESS_TYPE_OPTIONS = Object.freeze([
    'Manufacturer',
    'Supplier',
    'Distributor',
    'Dealer',
    'Exporter',
    'Importer',
    'Wholesaler',
    'Service Provider',
    'Any Business',
]);

const DIRECTORY_HOSTS = Object.freeze([
    'indiamart.com', 'tradeindia.com', 'justdial.com', 'exportersindia.com',
    'dial4trade.com', 'yellowpages.co.in',
]);

const DIRECTORY_BRANDS = Object.freeze([
    'indiamart', 'exportersindia', 'tradeindia', 'justdial', 'yellow pages', 'dial4trade',
]);

const JOB_COURSE_NOISE = Object.freeze([
    'job opening', 'jobs', 'vacancy', 'vacancies', 'recruitment', 'hiring', 'career',
    'internship', 'course', 'courses', 'training', 'tutorial', 'certification', 'workshop',
]);

const MANUFACTURER_POSITIVE = Object.freeze([
    'manufacturer', 'manufacturers', 'manufactures', 'manufacturing',
    'factory', 'manufacturing facility', 'plant', 'production facility',
    'oem manufacturer', 'own manufacturing unit', 'production unit',
    'we manufacture', 'in-house manufacturing',
]);

const TYPE_POSITIVE = Object.freeze({
    Manufacturer: MANUFACTURER_POSITIVE,
    Exporter: Object.freeze(['exporter', 'exporters', 'exporting', 'we export', 'export house', 'export manufacturer']),
    Supplier: Object.freeze(['supplier', 'suppliers']),
    Distributor: Object.freeze(['distributor', 'distributors', 'distribution']),
    Dealer: Object.freeze(['dealer', 'dealers', 'dealership']),
    Importer: Object.freeze(['importer', 'importers', 'importing', 'we import']),
    Wholesaler: Object.freeze(['wholesaler', 'wholesalers', 'wholesale']),
    'Service Provider': Object.freeze(['service provider', 'service providers']),
});

export function formatBusinessTypesLabel(businessType = '') {
    if (Array.isArray(businessType)) {
        return businessType.map((s) => collapse(s)).filter(Boolean).join(' + ');
    }
    return collapse(businessType);
}

export function formatSimpleSearchLabel(product = '', businessType = '', location = '') {
    return [collapse(product), formatBusinessTypesLabel(businessType), collapse(location)].filter(Boolean).join(' · ');
}

export function normalizeRequestedBusinessTypes(requested, requestedList) {
    const fromList = Array.isArray(requestedList) ? requestedList : [];
    const fromRequested = Array.isArray(requested)
        ? requested
        : collapse(requested)
            ? String(requested).split(/\s*\+\s*|\s*,\s*/).map((s) => collapse(s)).filter(Boolean)
            : [];
    const raw = fromList.length ? fromList : fromRequested;
    const out = [];
    const seen = new Set();
    for (const item of raw) {
        const s = collapse(item);
        if (!s) continue;
        const k = s.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(s);
    }
    return out;
}

export function quoteIfMultiword(product = '') {
    const p = collapse(product);
    if (!p) return '';
    return /\s/.test(p) ? `"${p}"` : p;
}

export function isDirectoryDiscoveryHost(urlOrHost = '') {
    const raw = String(urlOrHost || '').toLowerCase();
    if (!raw) return false;
    let host = raw;
    try {
        host = (raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`)).hostname;
    } catch {
        host = raw.split('/')[0];
    }
    host = host.replace(/^www\./, '');
    return DIRECTORY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export function isDirectoryBrandName(name = '') {
    const n = norm(name);
    if (!n) return false;
    return DIRECTORY_BRANDS.some((b) => n === b || n.startsWith(`${b} `));
}

function includesAny(text, list) {
    const t = norm(text);
    return (list || []).filter((k) => t.includes(norm(k)));
}

export function isJobCourseTrainingNoise(text = '') {
    return includesAny(text, JOB_COURSE_NOISE).length > 0;
}

function displayFromInternal(internal = '') {
    const map = {
        manufacturer: 'Manufacturer',
        oem_odm: 'Manufacturer',
        brand_owner: 'Unclear',
        supplier: 'Supplier',
        dealer: 'Dealer',
        distributor: 'Distributor',
        exporter: 'Exporter',
        importer: 'Importer',
        wholesaler: 'Wholesaler',
        service_provider: 'Service Provider',
        marketplace_directory: 'Directory / Discovery Source',
        directory_marketplace: 'Directory / Discovery Source',
        unknown: 'Unclear',
    };
    const key = String(internal || '').toLowerCase();
    return map[key] || (key ? collapse(internal) : 'Unclear');
}

function collectEvidenceBlob({ enrichment = {}, captures = [], evidenceText = '' } = {}) {
    return [
        evidenceText,
        enrichment.manufacturerEvidence,
        enrichment.businessType,
        (enrichment.productsServices || []).join(' '),
        ...(captures || []).map((c) => `${c.title || ''} ${c.snippet || ''}`),
    ].join(' \n ');
}

/**
 * Detected owner-facing roles from evidence. Does not invent.
 * @returns {{ roles: string[], isDirectory: boolean }}
 */
export function detectBusinessTypeRoles({
    internalType = '',
    enrichment = {},
    captures = [],
    evidenceText = '',
} = {}) {
    const urls = [
        enrichment.websiteUrl,
        enrichment.canonicalDomain,
        enrichment.directoryProfileUrl,
        ...(captures || []).map((c) => c.resultUrlNormalized || c.resultUrlOriginal || c.displayDomain),
    ].filter(Boolean);
    if (enrichment.isDirectorySource || urls.some(isDirectoryDiscoveryHost) || isDirectoryBrandName(enrichment.companyName)) {
        return { roles: ['Directory / Discovery Source'], isDirectory: true };
    }
    const blob = collectEvidenceBlob({ enrichment, captures, evidenceText });
    const roles = [];
    const order = ['Manufacturer', 'Exporter', 'Supplier', 'Distributor', 'Dealer', 'Importer', 'Wholesaler', 'Service Provider'];
    for (const type of order) {
        if (includesAny(blob, TYPE_POSITIVE[type] || []).length) roles.push(type);
    }
    if (roles.length) return { roles, isDirectory: false };
    const fallback = displayFromInternal(internalType || enrichment.businessType);
    return { roles: fallback ? [fallback] : ['Unclear'], isDirectory: false };
}

/**
 * Detected owner-facing type from evidence. Does not invent.
 */
export function detectDisplayBusinessType(args = {}) {
    const { roles } = detectBusinessTypeRoles(args);
    return (roles || []).join(' + ') || 'Unclear';
}

function packMatch({
    requestedTypes,
    detectedTypes,
    match,
    reason,
    detectedOverride,
} = {}) {
    const requestedList = requestedTypes.length ? requestedTypes : ['Any Business'];
    const detectedList = detectedOverride
        ? (Array.isArray(detectedOverride) ? detectedOverride : [detectedOverride])
        : (detectedTypes.length ? detectedTypes : ['Unclear']);
    return {
        requested: requestedList.join(' + '),
        requestedBusinessTypes: requestedList,
        detected: detectedList.join(' + '),
        detectedBusinessTypes: detectedList,
        match,
        reason,
    };
}

function matchOneRequestedType(type, {
    blob,
    enrichment = {},
    detectedTypes,
} = {}) {
    const t = collapse(type);
    if (/^any business$/i.test(t)) {
        return { type: t, match: 'yes', reason: 'any-business' };
    }
    if (/manufacturer/i.test(t)) {
        const mfrHits = includesAny(blob, MANUFACTURER_POSITIVE);
        const officialMfr = includesAny(String(enrichment.manufacturerEvidence || ''), MANUFACTURER_POSITIVE).length > 0
            || /manufacturer|oem|odm/i.test(String(enrichment.businessType || ''));
        if (officialMfr || mfrHits.length >= 2) {
            const sample = (enrichment.manufacturerEvidence || mfrHits.slice(0, 4).join(', ') || 'manufacturing language');
            return { type: t, match: 'yes', reason: `Manufacturer evidence (${String(sample).slice(0, 140)})` };
        }
        if (mfrHits.length === 1) {
            return { type: t, match: 'possibly', reason: `limited manufacturing language (${mfrHits[0]})` };
        }
        return { type: t, match: 'no', reason: 'no manufacturing/factory/OEM evidence' };
    }
    const positives = TYPE_POSITIVE[t] || [t.toLowerCase()];
    const hits = includesAny(blob, positives);
    const internalHit = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[-_\\s]+'), 'i')
        .test(String(enrichment.businessType || ''));
    if (internalHit || hits.length) {
        return { type: t, match: 'yes', reason: `${t} evidence (${(hits.slice(0, 4).join(', ') || t).slice(0, 140)})` };
    }
    return { type: t, match: 'no', reason: `no ${t} evidence` };
}

/**
 * @returns {{ requested, requestedBusinessTypes, detected, detectedBusinessTypes, match: 'yes'|'possibly'|'no', reason }}
 */
export function matchRequestedBusinessType({
    requested = '',
    requestedList,
    internalType = '',
    enrichment = {},
    captures = [],
    evidenceText = '',
} = {}) {
    const requestedTypes = normalizeRequestedBusinessTypes(requested, requestedList);
    const reqTypes = requestedTypes.length ? requestedTypes : ['Any Business'];
    const { roles: detectedTypes, isDirectory } = detectBusinessTypeRoles({
        internalType, enrichment, captures, evidenceText,
    });
    const detected = detectedTypes.join(' + ');
    const blob = [
        evidenceText,
        enrichment.manufacturerEvidence,
        ...(captures || []).map((c) => `${c.title || ''} ${c.snippet || ''}`),
    ].join(' \n ');
    const jobHits = includesAny(blob, JOB_COURSE_NOISE);
    const officialMfr = includesAny(String(enrichment.manufacturerEvidence || ''), MANUFACTURER_POSITIVE).length > 0
        || /manufacturer|oem|odm/i.test(String(enrichment.businessType || ''));
    const anyRequested = reqTypes.length === 1 && /^any business$/i.test(reqTypes[0]);

    if (anyRequested) {
        return packMatch({
            requestedTypes: reqTypes,
            detectedTypes,
            match: isDirectory ? 'possibly' : 'yes',
            reason: isDirectory
                ? 'Possibly — directory/discovery source, not a single company record.'
                : `Yes — any-business search; detected ${detected}.`,
        });
    }

    if (isDirectory) {
        return packMatch({
            requestedTypes: reqTypes,
            detectedTypes,
            match: 'no',
            reason: 'No — directory/category page is a discovery source, not a qualified company.',
        });
    }

    if (jobHits.length && !officialMfr) {
        return packMatch({
            requestedTypes: reqTypes,
            detectedTypes: ['Unclear'],
            detectedOverride: ['Unclear'],
            match: 'no',
            reason: `No — job/course/training signals (${jobHits.slice(0, 3).join(', ')}) without manufacturing evidence.`,
        });
    }

    const manufacturerOnly = reqTypes.length === 1 && /manufacturer/i.test(reqTypes[0]);
    if (manufacturerOnly) {
        const mfrHits = includesAny(blob, MANUFACTURER_POSITIVE);
        if (officialMfr || mfrHits.length >= 2) {
            const sample = (enrichment.manufacturerEvidence || mfrHits.slice(0, 4).join(', ') || 'manufacturing language');
            const shown = detectedTypes.includes('Manufacturer') ? detectedTypes : ['Manufacturer', ...detectedTypes.filter((d) => d !== 'Unclear')];
            return packMatch({
                requestedTypes: reqTypes,
                detectedTypes: shown.length ? shown : ['Manufacturer'],
                match: 'yes',
                reason: `Yes — company evidence of manufacturing (${String(sample).slice(0, 180)}).`,
            });
        }
        if (mfrHits.length === 1) {
            return packMatch({
                requestedTypes: reqTypes,
                detectedTypes,
                match: 'possibly',
                reason: `Possibly — limited manufacturing language (${mfrHits[0]}) without a confirmed factory/OEM statement.`,
            });
        }
        if (['Dealer', 'Distributor', 'Supplier', 'Service Provider'].some((d) => detectedTypes.includes(d))
            && !detectedTypes.includes('Manufacturer')) {
            return packMatch({
                requestedTypes: reqTypes,
                detectedTypes,
                match: 'no',
                reason: `No — evidence indicates ${detectedTypes.join(' + ')} without separate manufacturing proof.`,
            });
        }
        return packMatch({
            requestedTypes: reqTypes,
            detectedTypes,
            match: 'no',
            reason: 'No — requested Manufacturer but no factory/manufacturing/OEM evidence was found.',
        });
    }

    const perType = reqTypes.map((t) => matchOneRequestedType(t, { blob, enrichment, detectedTypes }));
    const yesHits = perType.filter((p) => p.match === 'yes');
    const possHits = perType.filter((p) => p.match === 'possibly');
    if (yesHits.length) {
        return packMatch({
            requestedTypes: reqTypes,
            detectedTypes,
            match: 'yes',
            reason: `Yes — matches ${yesHits.map((p) => p.type).join(' / ')} (${yesHits.map((p) => p.reason).join('; ')}).`,
        });
    }
    if (possHits.length) {
        return packMatch({
            requestedTypes: reqTypes,
            detectedTypes,
            match: 'possibly',
            reason: `Possibly — ${possHits.map((p) => p.reason).join('; ')}.`,
        });
    }
    return packMatch({
        requestedTypes: reqTypes,
        detectedTypes,
        match: 'no',
        reason: `No — requested ${reqTypes.join(' + ')} but detected ${detected}.`,
    });
}

export function businessTypeMatchRank(match = '') {
    const m = String(match || '').toLowerCase();
    if (m === 'yes') return 0;
    if (m === 'possibly') return 1;
    if (m === 'no') return 2;
    return 3;
}

/**
 * Internal Google phrases when the owner selected Manufacturer.
 * Exclusions are appended by the query builder.
 */
export function buildManufacturerSearchPhrases({ product = '', location = '' } = {}) {
    const productLower = collapse(product).toLowerCase();
    if (!productLower) return [];
    const quoted = quoteIfMultiword(productLower);
    const loc = collapse(location);
    const locBit = loc ? ` ${loc}` : '';
    return [
        { core: `${productLower} manufacturer${locBit}`, priorityScore: 100 },
        { core: `${quoted} manufacturers${locBit}`, priorityScore: 98 },
        { core: `${quoted} manufacturing company${locBit}`, priorityScore: 94 },
        { core: `${quoted} factory${locBit}`, priorityScore: 90 },
        { core: `${quoted} OEM manufacturer${locBit}`, priorityScore: 88 },
    ];
}

/**
 * Extra internal phrases for a non-manufacturer simple type.
 * Manufacturer variants stay in buildManufacturerSearchPhrases.
 */
export function buildTypeSearchPhrases({ product = '', location = '', businessType = '' } = {}) {
    const productLower = collapse(product).toLowerCase();
    if (!productLower) return [];
    const quoted = quoteIfMultiword(productLower);
    const loc = collapse(location);
    const locBit = loc ? ` ${loc}` : '';
    const id = collapse(businessType);
    if (/manufacturer/i.test(id)) return buildManufacturerSearchPhrases({ product: productLower, location: loc });
    if (/^any business$/i.test(id)) {
        return [{ core: `${productLower}${locBit}`.trim(), priorityScore: 50, isAlternate: false }];
    }
    if (/exporter/i.test(id)) {
        return [
            { core: `${productLower} exporter${locBit}`, priorityScore: 86, isAlternate: false },
            { core: `${quoted} exporters${locBit}`, priorityScore: 84, isAlternate: true },
        ];
    }
    return [];
}

export function buildCombinedManufacturerExporterPhrase({ product = '', location = '' } = {}) {
    const productLower = collapse(product).toLowerCase();
    if (!productLower) return [];
    const quoted = quoteIfMultiword(productLower);
    const loc = collapse(location);
    const locBit = loc ? ` ${loc}` : '';
    return [{ core: `${quoted} manufacturer exporter${locBit}`, priorityScore: 82, isAlternate: true }];
}
