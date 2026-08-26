/**
 * Checkpoint 7 — deterministic evidence-based qualification (mandatory fallback).
 * Never invents products/contacts. Uses only capture + enrichment evidence.
 */
import { RULE_ENGINE_VERSION } from './constants.js';
import {
    classifyProductMatchStrength,
    classifyStrictLocation,
    LOCATION_MATCH_MODES,
    resolveLocationMatchMode,
} from './locationMatch.util.js';
import { matchRequestedBusinessType } from '../simpleLeadSearch/simpleBusinessType.util.js';
import { classifyEntityType } from '../simpleLeadSearch/entityClassification.util.js';

const STRONG_PRODUCT = [
    'home automation', 'smart home', 'smarthome', 'smart-home',
    'smart switch', 'touch switch', 'smart lighting', 'smart light',
    'scene controller', 'home automation system', 'iot home',
    'zigbee', 'z-wave', 'matter protocol', 'ble automation', 'wifi automation',
    'smart curtain', 'smart sensor', 'home gateway', 'automation controller',
    'smart door lock', 'smart thermostat', 'knx home', 'homekit',
    'dali', 'knx', 'tuya', 'matter', 'lighting automation',
    'smart homes', 'automation installation', 'automation project',
];

const POSSIBLE_PRODUCT = [
    'home automation',
    'smart lighting', 'automation solution', 'building automation',
    'security automation', 'smart security', 'lighting automation',
    'electrical automation', 'iot solution', 'smart building',
    'voice control', 'alexa', 'google home',
];

const REJECT_STRONG = [
    'job opening', 'vacancies', 'recruitment', 'hiring', 'career',
    'course', 'training', 'tutorial', 'certification', 'workshop',
    'news article', 'blog post', 'comparison article', 'top 10 best',
    'best of 20', 'parking automation', 'car parking', 'boom barrier only',
];

const INDUSTRIAL_ONLY = [
    'industrial automation', 'plc', 'scada', 'factory automation',
    'process automation', 'machine automation', 'robotic arm',
];

const MANUFACTURER_EVIDENCE = [
    'manufacturer', 'manufacturing', 'factory', 'oem', 'odm',
    'production unit', 'in-house design', 'r&d',
];

const INTEGRATOR_EVIDENCE = [
    'system integrator', 'integration', 'turnkey', 'installation',
    'commissioning', 'project execution',
];

const DISTRIBUTOR_EVIDENCE = [
    'distributor', 'dealer', 'importer', 'authorized partner', 'reseller', 'supplier',
];

function norm(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function includesAny(text, list) {
    const t = norm(text);
    const hits = [];
    for (const k of list) {
        if (t.includes(norm(k))) hits.push(k);
    }
    return hits;
}

function buildEvidenceBlob({ enrichment, captures = [], campaign = {} }) {
    const parts = [];
    const push = (label, value, sourceUrl) => {
        if (value == null || value === '') return;
        parts.push({ label, value: String(value), sourceUrl: sourceUrl || '' });
    };

    push('campaign.product', campaign.product || campaign.targetIndustry || campaign.name || '', '');
    push('campaign.city', campaign.city || '', '');
    push('campaign.state', campaign.state || '', '');

    for (const c of captures) {
        push('google.title', c.title, c.resultUrlOriginal || c.resultUrlNormalized);
        push('google.snippet', c.snippet, c.resultUrlOriginal || c.resultUrlNormalized);
        push('google.domain', c.displayDomain, c.resultUrlOriginal || c.resultUrlNormalized);
    }

    if (enrichment) {
        push('enrich.companyName', enrichment.companyName, enrichment.websiteUrl);
        push('enrich.businessType', enrichment.businessType, enrichment.websiteUrl);
        push('enrich.manufacturerEvidence', enrichment.manufacturerEvidence, enrichment.websiteUrl);
        push('enrich.products', (enrichment.productsServices || []).join('; '), enrichment.websiteUrl);
        push('enrich.city', enrichment.city, enrichment.websiteUrl);
        push('enrich.state', enrichment.state, enrichment.websiteUrl);
        push('enrich.isDirectory', enrichment.isDirectorySource ? 'true' : 'false', enrichment.directoryProfileUrl || enrichment.websiteUrl);
        for (const a of enrichment.addresses || []) {
            push('enrich.address', [a.type, a.raw, a.city, a.state].filter(Boolean).join(' | '), a.sourceUrl || enrichment.websiteUrl);
        }
        for (const ev of enrichment.sourceEvidence || []) {
            push(`enrich.evidence.${ev.field}`, ev.value, ev.sourceUrl);
        }
    }

    return parts;
}

export function computeContactQuality(enrichment = {}) {
    const breakdown = {
        phone: Boolean((enrichment.phones || []).length),
        whatsapp: Boolean((enrichment.whatsappNumbers || []).length),
        email: Boolean((enrichment.emails || []).length),
        contactPerson: Boolean((enrichment.contactPersons || []).length),
        address: Boolean((enrichment.addresses || []).length || enrichment.city),
        facebook: Boolean(enrichment.facebook?.url),
        instagram: Boolean(enrichment.instagram?.url),
        linkedin: Boolean(enrichment.linkedin?.url),
        website: Boolean(enrichment.websiteUrl),
    };
    const keys = Object.keys(breakdown);
    const score = Math.round((keys.filter((k) => breakdown[k]).length / keys.length) * 100);
    return { contactQualityScore: score, contactQualityBreakdown: breakdown };
}

export function classifyBusinessTypeFromEvidence(blobText, enrichment = {}, captures = []) {
    const urls = [
        enrichment.websiteUrl,
        enrichment.canonicalDomain,
        enrichment.directoryProfileUrl,
        ...(captures || []).map((c) => c.resultUrlNormalized || c.resultUrlOriginal || c.displayDomain),
    ].filter(Boolean);
    const hostHit = urls.some((u) => {
        const raw = String(u || '').toLowerCase();
        return /indiamart\.com|tradeindia\.com|justdial\.com|exportersindia\.com|dial4trade\.com|yellowpages\.co\.in/.test(raw);
    });
    if (enrichment.isDirectorySource || hostHit) return 'directory_marketplace';
    if (enrichment.businessType && enrichment.businessType !== 'unknown') {
        const map = {
            manufacturer: 'manufacturer',
            oem_odm: 'oem_odm',
            brand_owner: 'brand_owner',
            distributor: 'distributor',
            dealer: 'dealer',
            supplier: 'supplier',
            system_integrator: 'system_integrator',
            service_provider: 'service_provider',
            marketplace_directory: 'directory_marketplace',
            unknown: 'unknown',
        };
        return map[enrichment.businessType] || 'unknown';
    }
    const t = norm(blobText);
    if (includesAny(t, MANUFACTURER_EVIDENCE).length) {
        if (/\boem\b|\bodm\b/.test(t)) return 'oem_odm';
        return 'manufacturer';
    }
    if (includesAny(t, INTEGRATOR_EVIDENCE).length) return 'system_integrator';
    if (includesAny(t, ['importer']).length) return 'importer';
    if (includesAny(t, DISTRIBUTOR_EVIDENCE).length) {
        if (t.includes('dealer')) return 'dealer';
        if (t.includes('distributor')) return 'distributor';
        return 'supplier';
    }
    return 'unknown';
}

/** Official-source location only. Google snippet never confirms office. */
export function scoreLocation(campaign = {}, enrichment = {}) {
    const loc = classifyStrictLocation({ campaign, enrichment });
    return {
        locationMatch: loc.locationMatch,
        locationHits: loc.locationHits || [],
        locationClassification: loc.locationClassification,
        locationMatchMode: loc.locationMatchMode,
        confirmedCities: loc.confirmedCities || [],
        confirmedStates: loc.confirmedStates || [],
        officeInSelectedCity: Boolean(loc.officeInSelectedCity),
        servesSelectedCity: Boolean(loc.servesSelectedCity),
        locationEvidenceUrl: loc.locationEvidenceUrl || '',
        addressCount: loc.addressCount || 0,
        selectedCity: loc.selectedCity || campaign.city || '',
        selectedState: loc.selectedState || campaign.state || '',
        selectedCountry: loc.selectedCountry || campaign.country || '',
    };
}

/**
 * @param {{ enrichment, captures, campaign }} input
 */
export function qualifyWithRules(input = {}) {
    const { enrichment = {}, captures = [], campaign = {} } = input;
    const evidenceParts = buildEvidenceBlob({ enrichment, captures, campaign });
    const blobText = evidenceParts.map((p) => p.value).join(' \n ');
    const companyEvidenceText = evidenceParts
        .filter((p) => !String(p.label).startsWith('campaign.'))
        .map((p) => p.value)
        .join(' \n ');
    const officialEvidenceText = evidenceParts
        .filter((p) => String(p.label).startsWith('enrich.'))
        .map((p) => p.value)
        .join(' \n ');
    const googleOnlyText = evidenceParts
        .filter((p) => String(p.label).startsWith('google.'))
        .map((p) => p.value)
        .join(' \n ');

    const sourceEvidence = evidenceParts
        .filter((p) => p.sourceUrl || p.label.startsWith('google.') || p.label.startsWith('enrich.'))
        .slice(0, 40)
        .map((p) => ({
            field: p.label,
            value: String(p.value).slice(0, 300),
            sourceUrl: p.sourceUrl || '',
            note: 'rule_engine_input',
        }));

    const rejectHits = includesAny(companyEvidenceText, REJECT_STRONG);
    const industrialHits = includesAny(companyEvidenceText, INDUSTRIAL_ONLY);
    const campaignProductTerms = [...new Set([
        campaign.product,
        campaign.targetIndustry,
        campaign.name,
        ...(Array.isArray(campaign.targetProducts) ? campaign.targetProducts : []),
    ].flatMap((s) => {
        const n = norm(s);
        if (!n || n.length < 3) return [];
        const parts = n.split(' ').filter((w) => w.length > 2 && !['and', 'the', 'for', 'with'].includes(w));
        return [n, ...parts];
    }))];
    const strongOfficial = [...new Set([
        ...includesAny(officialEvidenceText, STRONG_PRODUCT),
        ...includesAny(officialEvidenceText, campaignProductTerms),
    ])];
    const strongGoogle = [...new Set([
        ...includesAny(googleOnlyText, STRONG_PRODUCT),
        ...includesAny(googleOnlyText, campaignProductTerms),
    ])];
    const strongHits = [...new Set([...strongOfficial, ...includesAny(companyEvidenceText, STRONG_PRODUCT), ...includesAny(companyEvidenceText, campaignProductTerms)])];
    const possibleHits = [...new Set([
        ...includesAny(companyEvidenceText, POSSIBLE_PRODUCT),
        ...includesAny(companyEvidenceText, campaignProductTerms),
    ])];
    const locationInfo = scoreLocation(campaign, enrichment);
    const {
        locationMatch,
        locationHits,
        locationClassification,
        locationMatchMode,
        confirmedCities,
        confirmedStates,
        officeInSelectedCity,
        servesSelectedCity,
        locationEvidenceUrl,
        addressCount,
        selectedCity,
        selectedState,
        selectedCountry,
    } = locationInfo;
    const businessType = classifyBusinessTypeFromEvidence(blobText, enrichment, captures);
    const contact = computeContactQuality(enrichment);
    const mode = resolveLocationMatchMode(campaign);
    const requestedTypes = Array.isArray(campaign.businessTypes) && campaign.businessTypes.length
        ? campaign.businessTypes.map((t) => String(t || '').trim()).filter(Boolean)
        : (campaign.requestedBusinessType ? [String(campaign.requestedBusinessType)] : []);
    const requestedType = requestedTypes[0] || '';
    const manufacturerRequested = requestedTypes.some((t) => /manufacturer/i.test(t));

    function finalize(result) {
        const bt = matchRequestedBusinessType({
            requested: requestedType,
            requestedList: requestedTypes,
            internalType: result.businessType,
            enrichment,
            captures,
            evidenceText: blobText,
        });
        let systemDecision = result.systemDecision;
        let relevanceScore = Number(result.relevanceScore) || 0;
        let decisionReason = result.decisionReason || '';
        if (manufacturerRequested) {
            if (bt.match === 'yes') relevanceScore = Math.min(100, Math.max(relevanceScore, 72));
            if (bt.match === 'possibly') relevanceScore = Math.min(relevanceScore, 58);
            if (bt.match === 'no') {
                relevanceScore = Math.min(relevanceScore, 28);
                if (systemDecision === 'strong_match') {
                    systemDecision = result.businessType === 'directory_marketplace'
                        ? 'human_review_required'
                        : 'possible_match';
                    decisionReason = `${decisionReason} | ${bt.reason}`;
                }
            }
        }
        const entity = classifyEntityType({
            url: enrichment.websiteUrl || enrichment.canonicalDomain || '',
            title: enrichment.canonicalCompanyName || enrichment.companyName || '',
            enrichment,
            qualification: { businessType: result.businessType },
        });
        return {
            ...result,
            systemDecision,
            relevanceScore,
            decisionReason,
            requestedBusinessType: bt.requested,
            requestedBusinessTypes: bt.requestedBusinessTypes || requestedTypes,
            detectedBusinessType: bt.detected,
            detectedBusinessTypes: bt.detectedBusinessTypes || [],
            businessTypeMatch: bt.match,
            businessTypeMatchReason: bt.reason,
            entityType: entity.entityType,
            qualificationMode: entity.entityType === 'COMPANY' ? 'company' : 'discovery_only',
            canonicalCompanyName: enrichment.canonicalCompanyName || '',
            companyEntityConfidence: enrichment.companyEntityConfidence || entity.companyEntityConfidence || '',
            companyNameEvidence: enrichment.companyNameEvidence || entity.reason || '',
            qualificationMethod: 'rule_based',
            ruleEngineVersion: RULE_ENGINE_VERSION,
            aiModel: '',
            aiSchemaVersion: '',
        };
    }

    const unmatchedOrConflictingEvidence = [];
    const productsMatched = [...new Set([
        ...strongOfficial,
        ...possibleHits,
        ...(strongOfficial.length ? [] : strongGoogle.slice(0, 2)),
    ])].slice(0, 20);
    const matchedKeywords = [...productsMatched, ...locationHits].slice(0, 30);

    let productMatchStrength = classifyProductMatchStrength({
        strongHits: strongOfficial,
        possibleHits,
        rejectHits,
        isDirectory: Boolean(enrichment.isDirectorySource),
        companyEvidenceOnlyHits: strongOfficial.length,
    });

    const locationExtras = {
        locationClassification,
        locationMatchMode: locationMatchMode || mode,
        confirmedCities,
        confirmedStates,
        officeInSelectedCity,
        servesSelectedCity,
        locationEvidenceUrl,
        addressCount,
        productMatchStrength,
        selectedCity: selectedCity || campaign.city || '',
        selectedState: selectedState || campaign.state || '',
        selectedCountry: selectedCountry || campaign.country || '',
    };

    if (rejectHits.length) {
        return finalize({
            systemDecision: 'rejected',
            relevanceScore: 5,
            confidence: 'high',
            decisionReason: `Rejected: unwanted content signals (${rejectHits.slice(0, 5).join(', ')})`,
            matchedKeywords: rejectHits,
            unmatchedOrConflictingEvidence: rejectHits,
            productsMatched: [],
            businessType,
            locationMatch,
            ...contact,
            sourceEvidence,
            ...locationExtras,
            productMatchStrength: classifyProductMatchStrength({ rejectHits }),
        });
    }

    if (enrichment.isDirectorySource || businessType === 'directory_marketplace') {
        return finalize({
            systemDecision: 'human_review_required',
            relevanceScore: 35,
            confidence: 'medium',
            decisionReason: 'Directory/marketplace listing — supplier identity needs human review',
            matchedKeywords: productsMatched,
            unmatchedOrConflictingEvidence: ['directory_source'],
            productsMatched,
            businessType: 'directory_marketplace',
            locationMatch,
            ...contact,
            sourceEvidence,
            ...locationExtras,
            productMatchStrength: classifyProductMatchStrength({ isDirectory: true, strongHits: strongOfficial, possibleHits }),
        });
    }

    if (industrialHits.length && !strongHits.length && !possibleHits.some((h) => /home|smart/i.test(h))) {
        return finalize({
            systemDecision: 'rejected',
            relevanceScore: 15,
            confidence: 'high',
            decisionReason: `Rejected: industrial automation evidence without home/smart-home signals (${industrialHits.slice(0, 4).join(', ')})`,
            matchedKeywords: industrialHits,
            unmatchedOrConflictingEvidence: industrialHits,
            productsMatched: [],
            businessType,
            locationMatch,
            ...contact,
            sourceEvidence,
            ...locationExtras,
            productMatchStrength: classifyProductMatchStrength({}),
        });
    }

    const hasWebsiteEvidence = Boolean(enrichment.websiteUrl || (enrichment.pagesVisited || []).length || (enrichment.sourceEvidence || []).length);
    const hasGoogleEvidence = captures.length > 0;
    if (!hasWebsiteEvidence && !strongOfficial.length) {
        return finalize({
            systemDecision: 'human_review_required',
            relevanceScore: 25,
            confidence: 'low',
            decisionReason: 'Insufficient website/product evidence to qualify safely',
            matchedKeywords,
            unmatchedOrConflictingEvidence: ['insufficient_evidence'],
            productsMatched,
            businessType,
            locationMatch,
            ...contact,
            sourceEvidence,
            ...locationExtras,
        });
    }

    let relevanceScore = 20;
    relevanceScore += Math.min(45, strongOfficial.length * 12);
    if (!strongOfficial.length && strongGoogle.length) relevanceScore += Math.min(10, strongGoogle.length * 4);
    relevanceScore += Math.min(20, possibleHits.filter((h) => !strongOfficial.includes(h)).length * 6);
    if (locationMatch === 'match') relevanceScore += 15;
    else if (locationMatch === 'partial') relevanceScore += 6;
    else if (
        (norm(campaign.city) || (mode === LOCATION_MATCH_MODES.STRICT_STATE && norm(campaign.state)))
        && locationMatch === 'unknown'
    ) {
        unmatchedOrConflictingEvidence.push('location_not_confirmed');
        relevanceScore -= 5;
    }
    if (businessType === 'manufacturer' || businessType === 'oem_odm') relevanceScore += 8;
    if (businessType === 'system_integrator' || businessType === 'distributor' || businessType === 'dealer') relevanceScore += 4;
    relevanceScore += Math.min(5, Math.floor(contact.contactQualityScore / 25));
    relevanceScore = Math.max(0, Math.min(100, relevanceScore));

    const strictLocationMismatch = locationMatch === 'mismatch' && (
        (mode === LOCATION_MATCH_MODES.STRICT_CITY && norm(campaign.city))
        || (mode === LOCATION_MATCH_MODES.STRICT_STATE && norm(campaign.state))
        || (mode === LOCATION_MATCH_MODES.STRICT_COUNTRY && norm(campaign.country))
    );
    if (strictLocationMismatch) {
        unmatchedOrConflictingEvidence.push('location_mismatch');
        const selectedLabel = mode === LOCATION_MATCH_MODES.STRICT_STATE
            ? (campaign.state || 'selected state')
            : mode === LOCATION_MATCH_MODES.STRICT_COUNTRY
                ? (campaign.country || 'selected country')
                : (campaign.city || 'selected city');
        return finalize({
            systemDecision: 'rejected',
            relevanceScore: Math.min(relevanceScore, 55),
            confidence: 'high',
            decisionReason: `Location Mismatch — ${locationClassification}. Confirmed: ${(confirmedCities || []).concat(confirmedStates || []).filter(Boolean).join(', ') || 'other location'}. Requested ${selectedLabel} office not confirmed.`,
            matchedKeywords,
            unmatchedOrConflictingEvidence,
            productsMatched,
            businessType,
            locationMatch: 'mismatch',
            ...contact,
            sourceEvidence,
            ...locationExtras,
            productMatchStrength: strongOfficial.length
                ? classifyProductMatchStrength({ strongHits: strongOfficial, possibleHits, companyEvidenceOnlyHits: strongOfficial.length })
                : productMatchStrength,
        });
    }

    const nameOnly = norm(enrichment.companyName || captures[0]?.title || '');
    const productHitsOutsideName = strongOfficial.concat(possibleHits).filter((k) => {
        const outsideName = norm([
            (enrichment.productsServices || []).join(' '),
            enrichment.manufacturerEvidence || '',
            (enrichment.sourceEvidence || []).map((e) => e.value).join(' '),
        ].join(' '));
        return outsideName.includes(norm(k)) || (!nameOnly.includes(norm(k)) && officialEvidenceText.includes(norm(k)));
    });

    if (!productHitsOutsideName.length && !strongOfficial.length && relevanceScore < 50) {
        return finalize({
            systemDecision: 'human_review_required',
            relevanceScore: Math.min(relevanceScore, 40),
            confidence: 'low',
            decisionReason: 'No clear product/service evidence beyond company name — human review required',
            matchedKeywords,
            unmatchedOrConflictingEvidence: ['name_only_insufficient', ...unmatchedOrConflictingEvidence],
            productsMatched,
            businessType,
            locationMatch,
            ...contact,
            sourceEvidence,
            ...locationExtras,
        });
    }

    let systemDecision = 'human_review_required';
    let confidence = 'low';
    let decisionReason = '';
    let strength = productMatchStrength;
    if (!strongOfficial.length && strongGoogle.length) {
        strength = classifyProductMatchStrength({ possibleHits: strongGoogle, strongHits: [] });
    }

    if (strongOfficial.length >= 2 || (strongOfficial.length >= 1 && relevanceScore >= 70)) {
        systemDecision = 'strong_match';
        confidence = strongOfficial.length >= 2 && locationMatch === 'match' ? 'high' : 'medium';
        decisionReason = `Strong home-automation evidence: ${strongOfficial.slice(0, 6).join(', ')}`;
        strength = classifyProductMatchStrength({
            strongHits: strongOfficial,
            possibleHits,
            companyEvidenceOnlyHits: strongOfficial.length + 1,
        });
    } else if (strongOfficial.length >= 1 || (possibleHits.length >= 2 && relevanceScore >= 50)) {
        systemDecision = 'possible_match';
        confidence = 'medium';
        decisionReason = `Possible match from partial smart/home automation signals: ${productsMatched.slice(0, 6).join(', ') || 'partial evidence'}`;
        strength = classifyProductMatchStrength({ strongHits: strongOfficial, possibleHits });
    } else if (possibleHits.length >= 1 || strongGoogle.length) {
        systemDecision = 'human_review_required';
        confidence = 'low';
        decisionReason = strongGoogle.length && !strongOfficial.length
            ? 'Weak Keyword Match — product terms appear only in Google title/snippet, not official website evidence'
            : `Weak/ambiguous automation signals (${possibleHits.slice(0, 4).join(', ')}) — review required`;
        strength = classifyProductMatchStrength({ possibleHits: possibleHits.length ? possibleHits : strongGoogle });
    } else if (hasGoogleEvidence) {
        systemDecision = 'rejected';
        confidence = 'medium';
        decisionReason = 'No home automation / smart-home product evidence found in capture or enrichment';
        unmatchedOrConflictingEvidence.push('no_product_match');
        strength = classifyProductMatchStrength({});
    } else {
        systemDecision = 'human_review_required';
        confidence = 'low';
        decisionReason = 'Unable to qualify — missing evidence';
    }

    if (mode === LOCATION_MATCH_MODES.STRICT_CITY && norm(campaign.city)) {
        if (systemDecision === 'strong_match' && locationMatch !== 'match') {
            if (locationMatch === 'partial' && servesSelectedCity) {
                systemDecision = 'possible_match';
                confidence = 'medium';
                decisionReason = `${decisionReason} | Serves ${campaign.city} — no local office confirmed`;
                unmatchedOrConflictingEvidence.push('serves_city_no_office');
            } else if (locationMatch === 'unknown') {
                systemDecision = 'human_review_required';
                confidence = 'low';
                decisionReason = `${decisionReason} | ${locationClassification} for required city ${campaign.city}`;
                unmatchedOrConflictingEvidence.push('location_not_confirmed');
            }
        }
    }

    if ((businessType === 'distributor' || businessType === 'dealer' || businessType === 'system_integrator')
        && systemDecision === 'rejected'
        && productsMatched.length
        && locationMatch !== 'mismatch') {
        systemDecision = 'possible_match';
        confidence = 'medium';
        decisionReason = `Reclassified to possible_match: ${businessType} with relevant product signals (${productsMatched.slice(0, 5).join(', ')})`;
    }

    return finalize({
        systemDecision,
        relevanceScore,
        confidence,
        decisionReason,
        matchedKeywords,
        unmatchedOrConflictingEvidence,
        productsMatched,
        businessType,
        locationMatch,
        ...contact,
        sourceEvidence,
        ...locationExtras,
        productMatchStrength: strength,
    });
}

export { RULE_ENGINE_VERSION };
