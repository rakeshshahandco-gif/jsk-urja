/**
 * Facebook Public Search — Business/Pages only.
 * Query expansion and locality variants. Not used by Group Member Collector.
 * Operational query/page counts are not a campaign result cap.
 */

export const FACEBOOK_PUBLIC_MAX_QUERIES = 20;
/** Safe processing window per checkpoint — not a query/campaign page ceiling. */
export const FACEBOOK_PUBLIC_PAGE_WINDOW = 5;
export const FACEBOOK_PUBLIC_MAX_PAGES = FACEBOOK_PUBLIC_PAGE_WINDOW;
export const FACEBOOK_PUBLIC_QUERY_DELAY_MS = 700;
export const FACEBOOK_PUBLIC_PAGE_DELAY_MS = 800;
export const FACEBOOK_PUBLIC_WINDOW_DELAY_MS = 900;
const SEEN_KEY_CAP = 1500;

const ROLE_PHRASES = Object.freeze([
    'company',
    'dealer',
    'manufacturer',
    'supplier',
    'integrator',
    'solutions',
]);

/** Optional aliases. Never inject Home Automation into unrelated keywords. */
const KEYWORD_ALIASES = Object.freeze({
    'home automation': ['smart home', 'smart home automation', 'building automation'],
    'smart home': ['home automation', 'smart home automation'],
    'smart home automation': ['home automation', 'smart home'],
    'building automation': ['home automation', 'smart home'],
    'led lighting': ['led lights', 'led light'],
    'led lights': ['led lighting', 'led light'],
    'led light': ['led lighting', 'led lights'],
});

const LOCALITY_CLUSTERS = Object.freeze([
    { match: ['mumbai'], extras: ['Navi Mumbai', 'Thane'] },
    { match: ['navi mumbai'], extras: ['Mumbai', 'Thane'] },
    { match: ['thane'], extras: ['Mumbai', 'Navi Mumbai'] },
    { match: ['delhi', 'new delhi'], extras: ['Noida', 'Gurugram'] },
    { match: ['noida'], extras: ['Delhi', 'Gurugram'] },
    { match: ['gurugram', 'gurgaon'], extras: ['Delhi', 'Noida'] },
]);

function collapse(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

function locKey(value) {
    return collapse(value).toLowerCase();
}

export function keywordSynonyms(keyword) {
    const key = locKey(keyword);
    return KEYWORD_ALIASES[key] ? [...KEYWORD_ALIASES[key]] : [];
}

/** Extra public-search localities. Does not rewrite the owner-entered location. */
export function localityQueryVariants(location) {
    const key = locKey(location);
    if (!key) return [];
    const cluster = LOCALITY_CLUSTERS.find((c) => c.match.includes(key));
    if (!cluster) return [];
    return cluster.extras.filter((name) => locKey(name) !== key);
}

export function isFacebookPublicPagesSearch(searchType) {
    const t = String(searchType || 'pages').toLowerCase();
    return t === 'pages' || t === 'business' || t === 'business_pages';
}

export function facebookPublicPageQueries({ keyword, location } = {}) {
    const kw = collapse(keyword);
    const loc = collapse(location);
    if (!kw) return [];
    const queries = [];
    const push = (raw) => {
        const q = collapse(raw);
        if (q && !queries.includes(q)) queries.push(q);
    };
    const withLoc = (phrase, place) => (place ? `${phrase} ${place}` : phrase);

    push(`site:facebook.com ${withLoc(kw, loc)} pages`);
    push(`site:facebook.com ${withLoc(kw, loc)}`);
    for (const role of ROLE_PHRASES) {
        push(`site:facebook.com ${withLoc(`${kw} ${role}`, loc)}`);
    }
    for (const syn of keywordSynonyms(kw)) {
        push(`site:facebook.com ${withLoc(syn, loc)}`);
        push(`${withLoc(syn, loc)} Facebook`);
    }
    push(`${withLoc(kw, loc)} Facebook`);
    for (const extra of localityQueryVariants(loc)) {
        push(`site:facebook.com ${kw} ${extra}`);
        push(`${kw} ${extra} Facebook`);
    }
    return queries.slice(0, FACEBOOK_PUBLIC_MAX_QUERIES);
}

export function publicContactHints(text = '') {
    const blob = String(text || '');
    const phone = blob.match(/(?:\+91[\s-]?)?[6-9]\d{9}/)?.[0] || '';
    const email = blob.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
    const website = blob.match(/https?:\/\/(?!(?:www\.)?(?:facebook|fb|instagram|meta)\.com)\S+/i)?.[0] || '';
    return { phone, email, website };
}

export function emptyFacebookPublicPagesCheckpoint(partial = {}) {
    return {
        currentQuery: '',
        queryIndex: 0,
        queryTotal: 0,
        currentProvider: '',
        lastSuccessfulPage: 0,
        nextPage: 1,
        seenKeys: [],
        sourceResultsFound: 0,
        uniqueBusinesses: 0,
        stopReason: '',
        status: '',
        updatedAt: '',
        ...partial,
    };
}

export function mergeFacebookPublicPagesCheckpoint(prev = {}, patch = {}) {
    const base = emptyFacebookPublicPagesCheckpoint(prev);
    const seenKeys = Array.isArray(patch.seenKeys) ? patch.seenKeys : base.seenKeys;
    return emptyFacebookPublicPagesCheckpoint({
        ...base,
        ...patch,
        seenKeys: seenKeys.filter(Boolean).slice(-SEEN_KEY_CAP),
        updatedAt: new Date().toISOString(),
    });
}

export function facebookPublicPagesResumePoint(checkpoint = {}) {
    const ck = emptyFacebookPublicPagesCheckpoint(checkpoint);
    const nextPage = Math.max(1, Number(ck.nextPage) || 1);
    return {
        queryIndex: Math.max(0, Number(ck.queryIndex) || 0),
        currentQuery: String(ck.currentQuery || ''),
        startPageIndex: Math.max(0, nextPage - 1),
        seenKeys: Array.isArray(ck.seenKeys) ? ck.seenKeys : [],
        currentProvider: String(ck.currentProvider || ''),
    };
}

export function summarizeFacebookPublicRun({
    sourceResultsFound = 0,
    uniqueBusinesses = 0,
    currentQuery = '',
    queryIndex = 0,
    queryTotal = 0,
    currentProvider = '',
    currentResultPage = 0,
    lastSuccessfulPage = 0,
    nextPage = 1,
    lastPageAdvanceAt = null,
    pagesFetched = 0,
    stopReason = '',
    queries = [],
} = {}) {
    const total = Number(queryTotal || queries.length || 0);
    const index = Number(queryIndex || 0);
    return {
        collectionMode: 'Unlimited — Until Exhausted / Stopped',
        sourceResultsFound: Number(sourceResultsFound || 0),
        uniqueBusinesses: Number(uniqueBusinesses || 0),
        currentQuery: String(currentQuery || ''),
        queryIndex: index,
        queryTotal: total,
        queryProgressLabel: total ? `Query ${Math.min(index || 1, total)} of ${total}` : 'Query —',
        currentProvider: String(currentProvider || ''),
        currentResultPage: Number(currentResultPage || lastSuccessfulPage || 0),
        lastSuccessfulPage: Number(lastSuccessfulPage || currentResultPage || 0),
        nextPage: Number(nextPage || 1),
        pageWindow: FACEBOOK_PUBLIC_PAGE_WINDOW,
        pendingQueries: Math.max(0, total - index),
        lastPageAdvanceAt: lastPageAdvanceAt || null,
        pagesFetched: Number(pagesFetched || 0),
        stopReason: String(stopReason || ''),
        queries,
    };
}
