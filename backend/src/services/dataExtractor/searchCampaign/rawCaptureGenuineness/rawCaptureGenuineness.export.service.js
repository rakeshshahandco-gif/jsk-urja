import ExcelJS from 'exceljs';
import {
    groupConfirmedDuplicateEnrichments,
    mergeContactsForDuplicateGroup,
} from './duplicateContactMerge.util.js';
import { buildCanonicalVerifiedCompanies } from './canonicalVerifiedCompany.util.js';

function sanitize(value) {
    const s = String(value ?? '');
    if (/^[=+\-@]/.test(s)) return `'${s}`;
    return s;
}

function cell(v) {
    if (v == null) return '';
    if (v instanceof Date) return v;
    return sanitize(v);
}

const COMPANY_COLUMNS = [
    { header: 'Unique Company', key: 'companyName', width: 32 },
    { header: 'Primary Website', key: 'website', width: 36 },
    { header: 'Primary Phone', key: 'primaryPhone', width: 16 },
    { header: 'All Phone Numbers', key: 'allPhones', width: 28 },
    { header: 'Primary WhatsApp', key: 'primaryWhatsApp', width: 16 },
    { header: 'All WhatsApp Numbers', key: 'allWhatsApp', width: 28 },
    { header: 'Primary Email', key: 'primaryEmail', width: 24 },
    { header: 'All Email Addresses', key: 'allEmails', width: 36 },
    { header: 'Primary Contact Person', key: 'primaryContact', width: 20 },
    { header: 'All Contact Persons', key: 'allContacts', width: 32 },
    { header: 'Primary Address', key: 'primaryAddress', width: 28 },
    { header: 'All Addresses', key: 'allAddresses', width: 40 },
    { header: 'All Facebook URLs', key: 'allFacebook', width: 32 },
    { header: 'All Instagram URLs', key: 'allInstagram', width: 32 },
    { header: 'All LinkedIn URLs', key: 'allLinkedIn', width: 32 },
    { header: 'Verification Status', key: 'verificationStatus', width: 40 },
    { header: 'Source Appearances', key: 'sourceAppearances', width: 14 },
    { header: 'Query Count', key: 'queryCount', width: 12 },
    { header: 'Evidence Count', key: 'evidenceCount', width: 12 },
    { header: 'Merged From Enrichments', key: 'mergedCount', width: 12 },
    { header: 'Duplicate Merge Note', key: 'mergeNote', width: 28 },
    { header: 'Relevance Score', key: 'relevanceScore', width: 14 },
    { header: 'Qualification Decision', key: 'qualificationDecision', width: 20 },
    { header: 'Genuineness Decision', key: 'genuinenessDecision', width: 24 },
    { header: 'Genuineness Score', key: 'genuinenessScore', width: 16 },
    { header: 'Genuineness Confidence', key: 'genuinenessConfidence', width: 16 },
    { header: 'Verification Reason', key: 'reason', width: 42 },
    { header: 'Manufacturer Evidence', key: 'manufacturerEvidence', width: 24 },
    { header: 'Positive Signals', key: 'positiveSignals', width: 32 },
    { header: 'Warning Signals', key: 'warningSignals', width: 32 },
    { header: 'Conflicting Evidence', key: 'conflictingEvidence', width: 32 },
    { header: 'Evidence URLs', key: 'evidence', width: 40 },
    { header: 'Owner Review Status', key: 'ownerReview', width: 16 },
    { header: 'Owner Review Note', key: 'ownerNote', width: 28 },
    { header: 'Verified Date', key: 'verifiedAt', width: 20 },
    { header: 'Qualified Date', key: 'qualifiedAt', width: 20 },
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'WhatsApp', key: 'whatsapp', width: 18 },
    { header: 'Facebook', key: 'facebook', width: 28 },
    { header: 'Instagram', key: 'instagram', width: 28 },
    { header: 'LinkedIn', key: 'linkedin', width: 28 },
];

const EVIDENCE_COLUMNS = [
    { header: 'Canonical Company', key: 'canonicalCompany', width: 28 },
    { header: 'Canonical Key', key: 'canonicalKey', width: 36 },
    { header: 'Source Title', key: 'sourceTitle', width: 36 },
    { header: 'Query', key: 'query', width: 28 },
    { header: 'Google Page', key: 'googlePageIndex', width: 12 },
    { header: 'Result Position', key: 'resultPosition', width: 12 },
    { header: 'Source URL', key: 'sourceUrl', width: 44 },
    { header: 'Website URL', key: 'websiteUrl', width: 36 },
    { header: 'Captured At', key: 'capturedAt', width: 20 },
    { header: 'CP6 Enrichment Status', key: 'cp6Status', width: 18 },
    { header: 'CP7 Decision', key: 'cp7Decision', width: 18 },
    { header: 'CP7 Score', key: 'cp7Score', width: 12 },
    { header: 'CP8 Decision', key: 'cp8Decision', width: 24 },
    { header: 'CP8 Score', key: 'cp8Score', width: 12 },
    { header: 'Owner Decision', key: 'ownerDecision', width: 18 },
    { header: 'Capture Id', key: 'captureId', width: 26 },
    { header: 'Genuineness Id', key: 'genuinenessId', width: 26 },
    { header: 'Enrichment Id', key: 'enrichmentId', width: 26 },
];

/** @deprecated legacy alias kept for older tests that look up COLUMNS via sheet headers */
const COLUMNS = COMPANY_COLUMNS;

function mapCanonicalRow(company, qualification = null) {
    const q = qualification || {};
    const cs = company.contactSummary || {};
    return {
        companyName: company.companyName || '',
        website: company.primaryWebsite || company.websiteUrl || '',
        primaryPhone: company.primaryPhone || cs.primaryPhone || '',
        allPhones: (company.allPhones || cs.phonesAll || []).map((x) => x.value || x).join(', '),
        primaryWhatsApp: company.primaryWhatsApp || cs.primaryWhatsApp || '',
        allWhatsApp: (company.allWhatsApp || cs.whatsappAll || []).map((x) => x.value || x).join(', '),
        primaryEmail: company.primaryEmail || cs.primaryEmail || '',
        allEmails: (company.allEmails || cs.emailsAll || []).map((x) => x.value || x).join(', '),
        primaryContact: cs.primaryContactPerson || '',
        allContacts: [
            cs.primaryContactPerson,
            ...(cs.additionalContacts || []),
        ].filter(Boolean).join(', '),
        primaryAddress: cs.primaryAddress || '',
        allAddresses: (cs.addressesAll || []).map((x) => x.value).join(', '),
        allFacebook: (cs.facebookAll || []).map((x) => x.value).join(', '),
        allInstagram: (cs.instagramAll || []).map((x) => x.value).join(', '),
        allLinkedIn: (cs.linkedinAll || []).map((x) => x.value).join(', '),
        verificationStatus: company.verificationStatusLabel || company.verificationStatus || '',
        sourceAppearances: company.sourceAppearances ?? 1,
        queryCount: company.queryCount ?? 0,
        evidenceCount: company.evidenceCount ?? 0,
        mergedCount: company.sourceEnrichmentIds?.length || 1,
        mergeNote: (company.sourceAppearances || 1) > 1
            ? `Consolidated ${company.sourceAppearances} source appearances`
            : '',
        relevanceScore: q.relevanceScore ?? '',
        qualificationDecision: q.systemDecision || '',
        genuinenessDecision: company.systemDecision || '',
        genuinenessScore: company.genuinenessScore ?? '',
        genuinenessConfidence: company.genuinenessConfidence || '',
        reason: company.verificationReason || '',
        manufacturerEvidence: '',
        positiveSignals: (company.positiveSignals || []).join('; '),
        warningSignals: (company.warningSignals || []).join('; '),
        conflictingEvidence: (company.conflictingEvidence || []).join('; '),
        evidence: (company.evidenceUrls || []).slice(0, 10).join(' | '),
        ownerReview: company.ownerReviewStatus || '',
        ownerNote: '',
        verifiedAt: company.verifiedAt || '',
        qualifiedAt: q.qualifiedAt || '',
        phone: company.primaryPhone || '',
        whatsapp: company.primaryWhatsApp || '',
        facebook: (cs.facebookAll || [])[0]?.value || '',
        instagram: (cs.instagramAll || [])[0]?.value || '',
        linkedin: (cs.linkedinAll || [])[0]?.value || '',
    };
}

function mapRow(g, qualification, enrichment, mergedContacts = null, mergeNote = '') {
    const q = qualification || {};
    const en = enrichment || {};
    const merged = mergedContacts || mergeContactsForDuplicateGroup(en ? [en] : []);
    const cs = merged.contactSummary;
    return {
        companyName: g.companyName || q.companyName || en.companyName || '',
        website: cs.websitesAll?.[0]?.value || g.websiteUrl || q.websiteUrl || en.websiteUrl || '',
        primaryPhone: cs.primaryPhone || '',
        allPhones: cs.phonesAll?.map((x) => x.value).join(', ') || '',
        primaryWhatsApp: cs.primaryWhatsApp || '',
        allWhatsApp: cs.whatsappAll?.map((x) => x.value).join(', ') || '',
        primaryEmail: cs.primaryEmail || '',
        allEmails: cs.emailsAll?.map((x) => x.value).join(', ') || '',
        primaryContact: cs.primaryContactPerson || '',
        allContacts: [
            cs.primaryContactPerson,
            ...(cs.additionalContacts || []),
        ].filter(Boolean).join(', '),
        primaryAddress: cs.primaryAddress || '',
        allAddresses: cs.addressesAll?.map((x) => x.value).join(', ') || '',
        allFacebook: cs.facebookAll?.map((x) => x.value).join(', ') || '',
        allInstagram: cs.instagramAll?.map((x) => x.value).join(', ') || '',
        allLinkedIn: cs.linkedinAll?.map((x) => x.value).join(', ') || '',
        verificationStatus: g.verificationStatusLabel || g.systemDecision || '',
        sourceAppearances: g.sourceAppearances ?? 1,
        queryCount: g.queryCount ?? '',
        evidenceCount: g.evidenceCount ?? '',
        mergedCount: merged.sourceEnrichmentIds?.length || 1,
        mergeNote,
        relevanceScore: q.relevanceScore ?? '',
        qualificationDecision: q.systemDecision || '',
        genuinenessDecision: g.systemDecision || '',
        genuinenessScore: g.genuinenessScore ?? '',
        genuinenessConfidence: g.genuinenessConfidence || '',
        reason: g.verificationReason || '',
        manufacturerEvidence: g.manufacturerEvidence || '',
        positiveSignals: (g.positiveSignals || []).join('; '),
        warningSignals: (g.warningSignals || []).join('; '),
        conflictingEvidence: (g.conflictingEvidence || []).join('; '),
        evidence: (g.evidenceUrls || []).slice(0, 10).join(' | '),
        ownerReview: g.ownerReviewStatus || '',
        ownerNote: g.ownerReviewNote || '',
        verifiedAt: g.verifiedAt || '',
        qualifiedAt: q.qualifiedAt || '',
        phone: cs.primaryPhone || '',
        whatsapp: cs.primaryWhatsApp || '',
        facebook: cs.facebookAll?.[0]?.value || en.facebook?.url || '',
        instagram: cs.instagramAll?.[0]?.value || en.instagram?.url || '',
        linkedin: cs.linkedinAll?.[0]?.value || en.linkedin?.url || '',
    };
}

function addSheet(wb, name, columns, rows) {
    const sheet = wb.addWorksheet(name);
    sheet.columns = columns;
    for (const row of rows) {
        const mapped = {};
        for (const col of columns) mapped[col.key] = cell(row[col.key]);
        sheet.addRow(mapped);
    }
}

function pickBestGenuineness(items) {
    return [...items].sort((a, b) => (
        Number(b.genuinenessScore || 0) - Number(a.genuinenessScore || 0)
    ))[0];
}

/**
 * Collapse confirmed same-company genuineness rows into one export row with merged contacts.
 * Conflicts remain separate with an owner-review note.
 */
function buildMergedExportRows(genuinenessRecords, qualById, enById) {
    const enrichments = genuinenessRecords
        .map((g) => (g.enrichmentId ? enById[String(g.enrichmentId)] : null))
        .filter(Boolean);
    const { groups, conflicts } = groupConfirmedDuplicateEnrichments(enrichments);
    const conflictIds = new Set();
    for (const c of conflicts) {
        conflictIds.add(c.enrichmentIdA);
        conflictIds.add(c.enrichmentIdB);
    }

    const enrichmentToGroup = new Map();
    groups.forEach((group, idx) => {
        for (const en of group) enrichmentToGroup.set(String(en._id), idx);
    });

    const usedGroups = new Set();
    const rows = [];
    const sourceGenuineness = [];

    for (const g of genuinenessRecords) {
        const enId = g.enrichmentId ? String(g.enrichmentId) : '';
        const groupIdx = enrichmentToGroup.get(enId);
        if (groupIdx == null) {
            const q = qualById[String(g.qualificationId)] || null;
            const en = enId ? enById[enId] : null;
            const note = conflictIds.has(enId) ? 'Possible Duplicate — Owner Review' : '';
            rows.push(mapRow(g, q, en, null, note));
            sourceGenuineness.push(g);
            continue;
        }
        if (usedGroups.has(groupIdx)) continue;
        usedGroups.add(groupIdx);

        const groupEns = groups[groupIdx];
        const groupEnIds = new Set(groupEns.map((e) => String(e._id)));
        const groupGens = genuinenessRecords.filter((x) => groupEnIds.has(String(x.enrichmentId || '')));
        const best = pickBestGenuineness(groupGens);
        const q = qualById[String(best.qualificationId)] || null;
        const merged = mergeContactsForDuplicateGroup(groupEns);
        const note = groupEns.length > 1
            ? `Merged ${groupEns.length} confirmed duplicate enrichments`
            : '';
        rows.push(mapRow(best, q, groupEns[0], merged, note));
        sourceGenuineness.push(best);
    }

    return { rows, sourceGenuineness, conflictCount: conflicts.length };
}

export async function buildGenuinenessWorkbook({
    genuinenessRecords = [],
    qualifications = [],
    enrichments = [],
    captures = [],
    queryTextById = {},
    summary = {},
    canonicalCompanies = null,
    evidenceRows = null,
    counters = null,
}) {
    const qualById = {};
    for (const q of qualifications) qualById[String(q._id)] = q;
    const enById = {};
    for (const e of enrichments) enById[String(e._id)] = e;

    let companies = canonicalCompanies;
    let evidence = evidenceRows;
    let counts = counters;

    if (!companies) {
        const built = buildCanonicalVerifiedCompanies({
            captures,
            enrichments,
            qualifications,
            genuinenessDocs: genuinenessRecords.filter((g) => !g.isCanonicalCompany),
            queryTextById,
            options: { verifiedOnly: true, includeDirectoryListings: true, limit: null },
        });
        // If caller already passed canonical items, use decision-sheet fallback
        if (!genuinenessRecords.some((g) => g.isCanonicalCompany) && (captures.length || genuinenessRecords.length)) {
            companies = built.allCompanies;
            counts = built.counters;
            evidence = companies.flatMap((c) => (c.evidence || []).map((ev) => ({
                canonicalCompany: c.companyName,
                canonicalKey: c.canonicalKey,
                sourceTitle: ev.sourceTitle,
                query: ev.query,
                googlePageIndex: ev.googlePageIndex ?? '',
                resultPosition: ev.resultPosition ?? '',
                sourceUrl: ev.sourceUrl,
                websiteUrl: ev.websiteUrl,
                capturedAt: ev.capturedAt || '',
                cp6Status: ev.cp6?.enrichmentStatus || '',
                cp7Decision: ev.cp7?.ownerDecision || ev.cp7?.systemDecision || '',
                cp7Score: ev.cp7?.relevanceScore ?? '',
                cp8Decision: ev.cp8?.ownerDecision || ev.cp8?.systemDecision || '',
                cp8Score: ev.cp8?.genuinenessScore ?? '',
                ownerDecision: ev.cp8?.ownerDecision || '',
                captureId: ev.captureId || '',
                genuinenessId: ev.genuinenessId || '',
                enrichmentId: ev.enrichmentId || '',
            })));
        } else if (genuinenessRecords.some((g) => g.isCanonicalCompany)) {
            companies = genuinenessRecords;
            counts = counters || {
                sourceAppearances: companies.reduce((n, c) => n + (c.sourceAppearances || 1), 0),
                uniqueVerifiedCompanies: companies.length,
                duplicatesConsolidated: 0,
            };
            counts.duplicatesConsolidated = Math.max(
                0,
                (counts.sourceAppearances || 0) - (counts.uniqueVerifiedCompanies || companies.length),
            );
            evidence = companies.flatMap((c) => (c.evidence || []).map((ev) => ({
                canonicalCompany: c.companyName,
                canonicalKey: c.canonicalKey,
                sourceTitle: ev.sourceTitle,
                query: ev.query,
                googlePageIndex: ev.googlePageIndex ?? '',
                resultPosition: ev.resultPosition ?? '',
                sourceUrl: ev.sourceUrl,
                websiteUrl: ev.websiteUrl,
                capturedAt: ev.capturedAt || '',
                cp6Status: ev.cp6?.enrichmentStatus || '',
                cp7Decision: ev.cp7?.ownerDecision || ev.cp7?.systemDecision || '',
                cp7Score: ev.cp7?.relevanceScore ?? '',
                cp8Decision: ev.cp8?.ownerDecision || ev.cp8?.systemDecision || '',
                cp8Score: ev.cp8?.genuinenessScore ?? '',
                ownerDecision: ev.cp8?.ownerDecision || '',
                captureId: ev.captureId || '',
                genuinenessId: ev.genuinenessId || '',
                enrichmentId: ev.enrichmentId || '',
            })));
        } else {
            // Legacy path: genuineness-only merge (unit tests without captures)
            const byDecision = (decision) => genuinenessRecords.filter((g) => g.systemDecision === decision);
            function sheetFor(decisionList) {
                return buildMergedExportRows(decisionList, qualById, enById).rows;
            }
            const verified = sheetFor(byDecision('verified_genuine'));
            const likely = sheetFor(byDecision('likely_genuine'));
            const review = sheetFor(byDecision('human_review_required'));
            const directory = sheetFor(byDecision('directory_or_marketplace_only'));
            const unreliableOrRejected = sheetFor(
                genuinenessRecords.filter((g) => (
                    g.systemDecision === 'suspected_unreliable'
                    || g.systemDecision === 'rejected_unusable'
                )),
            );

            const wbLegacy = new ExcelJS.Workbook();
            wbLegacy.creator = 'JSK Data Extractor CP8';
            wbLegacy.created = new Date();
            addSheet(wbLegacy, 'Verified Unique Companies', COMPANY_COLUMNS, verified);
            addSheet(wbLegacy, 'Verified Genuine', COMPANY_COLUMNS, verified);
            addSheet(wbLegacy, 'Likely Genuine', COMPANY_COLUMNS, likely);
            addSheet(wbLegacy, 'Human Review Required', COMPANY_COLUMNS, review);
            addSheet(wbLegacy, 'Directory-Marketplace', COMPANY_COLUMNS, directory);
            addSheet(wbLegacy, 'Suspected Unreliable-Rejected', COMPANY_COLUMNS, unreliableOrRejected);
            addSheet(wbLegacy, 'Verified Source Evidence', EVIDENCE_COLUMNS, []);

            const sum = wbLegacy.addWorksheet('Verification Summary');
            sum.columns = [
                { header: 'Metric', key: 'metric', width: 44 },
                { header: 'Value', key: 'value', width: 48 },
            ];
            for (const [metric, value] of [
                ['Export type', 'Checkpoint 8 genuineness — canonical unique companies'],
                ['CRM Leads auto-created', 'No'],
                ['Total genuineness records (source)', genuinenessRecords.length],
                ['Verified unique company rows', verified.length],
                ['Exported at', new Date().toISOString()],
            ]) {
                sum.addRow({ metric: cell(metric), value: cell(value) });
            }
            const bufferLegacy = await wbLegacy.xlsx.writeBuffer();
            return Buffer.from(bufferLegacy);
        }
    }

    if (!evidence) evidence = [];
    if (!counts) {
        counts = {
            sourceAppearances: evidence.length || companies.reduce((n, c) => n + (c.sourceAppearances || 1), 0),
            uniqueVerifiedCompanies: companies.length,
            duplicatesConsolidated: 0,
        };
        counts.duplicatesConsolidated = Math.max(0, counts.sourceAppearances - counts.uniqueVerifiedCompanies);
    }

    const companyRows = companies.map((c) => mapCanonicalRow(c, qualById[String(c.qualificationId)] || null));

    // Keep decision-bucket sheets for backward compatibility, derived from canonical set
    const byStatus = (pred) => companyRows.filter((r, idx) => pred(companies[idx]));
    const verified = byStatus((c) => c.systemDecision === 'verified_genuine' || c.verificationStatus === 'ai_verified_genuine' || c.verificationStatus === 'owner_verified');
    const likely = byStatus((c) => c.systemDecision === 'likely_genuine' || c.verificationStatus === 'ai_likely_genuine');
    const review = byStatus((c) => c.systemDecision === 'human_review_required');
    const directory = byStatus((c) => c.isDirectoryListing || c.systemDecision === 'directory_or_marketplace_only');
    const unreliableOrRejected = byStatus((c) => (
        c.systemDecision === 'suspected_unreliable' || c.systemDecision === 'rejected_unusable'
    ));

    const wb = new ExcelJS.Workbook();
    wb.creator = 'JSK Data Extractor CP8';
    wb.created = new Date();

    addSheet(wb, 'Verified Unique Companies', COMPANY_COLUMNS, companyRows);
    addSheet(wb, 'Verified Source Evidence', EVIDENCE_COLUMNS, evidence);
    addSheet(wb, 'Verified Genuine', COMPANY_COLUMNS, verified.length ? verified : companyRows.filter((_, i) => companies[i].independentlyVerified));
    addSheet(wb, 'Likely Genuine', COMPANY_COLUMNS, likely);
    addSheet(wb, 'Human Review Required', COMPANY_COLUMNS, review);
    addSheet(wb, 'Directory-Marketplace', COMPANY_COLUMNS, directory);
    addSheet(wb, 'Suspected Unreliable-Rejected', COMPANY_COLUMNS, unreliableOrRejected);

    const sum = wb.addWorksheet('Verification Summary');
    sum.columns = [
        { header: 'Metric', key: 'metric', width: 44 },
        { header: 'Value', key: 'value', width: 48 },
    ];
    const lines = [
        ['Export type', 'Checkpoint 8 — canonical unique verified companies + source evidence'],
        ['CRM Leads auto-created', 'No'],
        ['Create CRM Lead enabled', 'No (disabled until a separate controlled checkpoint is approved)'],
        ['Grouping', 'Server-side canonical company keys (hostname-safe; directory listing path required)'],
        ['Verified Source Appearances', counts.sourceAppearances ?? counts.verifiedSourceAppearances ?? evidence.length],
        ['Unique Verified Companies', counts.uniqueVerifiedCompanies ?? companyRows.length],
        ['Duplicates Consolidated', counts.duplicatesConsolidated ?? Math.max(0, (counts.sourceAppearances || 0) - companyRows.length)],
        ['Directory listings (not independently verified)', counts.directoryListings ?? directory.length],
        ['Total genuineness records (source docs)', genuinenessRecords.filter((g) => !g.isCanonicalCompany).length || summary.total || ''],
        ['Rule-based count', summary.ruleBasedCount ?? ''],
        ['Ollama local count', summary.ollamaCount ?? ''],
        ['Job status', summary.status || ''],
        ['Product hint', summary.productHint || ''],
        ['Location hint', summary.locationHint || ''],
        ['Exported at', new Date().toISOString()],
    ];
    for (const [metric, value] of lines) sum.addRow({ metric: cell(metric), value: cell(value) });

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
}

export { COLUMNS, COMPANY_COLUMNS, EVIDENCE_COLUMNS, buildMergedExportRows };
