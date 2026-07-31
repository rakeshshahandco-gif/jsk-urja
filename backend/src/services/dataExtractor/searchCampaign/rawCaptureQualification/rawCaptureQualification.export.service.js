import ExcelJS from 'exceljs';

function sanitize(value) {
    const s = String(value ?? '');
    if (/^[=+\-@]/.test(s)) return `'${s}`;
    return s;
}

function cell(v) {
    if (v == null) return '';
    if (v instanceof Date) return v;
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return sanitize(v);
}

const COLUMNS = [
    { header: 'Company Name', key: 'companyName', width: 32 },
    { header: 'Website', key: 'website', width: 36 },
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'WhatsApp', key: 'whatsapp', width: 18 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Contact Person', key: 'contactPerson', width: 22 },
    { header: 'Primary Address', key: 'primaryAddress', width: 40 },
    { header: 'All Addresses', key: 'allAddresses', width: 56 },
    { header: 'Address Count', key: 'addressCount', width: 12 },
    { header: 'Confirmed Cities', key: 'confirmedCities', width: 24 },
    { header: 'Confirmed States', key: 'confirmedStates', width: 24 },
    { header: 'Selected City', key: 'selectedCity', width: 14 },
    { header: 'Location Match Status', key: 'locationClassification', width: 28 },
    { header: 'Location Match', key: 'locationMatch', width: 12 },
    { header: 'Location Evidence URL', key: 'locationEvidenceUrl', width: 36 },
    { header: 'Office in Selected City', key: 'officeInSelectedCity', width: 16 },
    { header: 'Serves Selected City', key: 'servesSelectedCity', width: 16 },
    { header: 'Product Match Strength', key: 'productMatchStrength', width: 22 },
    { header: 'Previous Location Status', key: 'previousLocationClassification', width: 24 },
    { header: 'Location Rechecked At', key: 'locationRecheckedAt', width: 22 },
    { header: 'Facebook', key: 'facebook', width: 28 },
    { header: 'Instagram', key: 'instagram', width: 28 },
    { header: 'LinkedIn', key: 'linkedin', width: 28 },
    { header: 'Business Type', key: 'businessType', width: 18 },
    { header: 'Products / Services', key: 'products', width: 28 },
    { header: 'Relevance Score', key: 'relevanceScore', width: 14 },
    { header: 'Confidence', key: 'confidence', width: 12 },
    { header: 'Qualification Decision', key: 'decision', width: 20 },
    { header: 'Qualification Reason', key: 'reason', width: 40 },
    { header: 'Products Matched', key: 'productsMatched', width: 28 },
    { header: 'Contact Quality Score', key: 'contactQuality', width: 16 },
    { header: 'Evidence URLs', key: 'evidence', width: 40 },
    { header: 'Owner Review Status', key: 'ownerReview', width: 16 },
    { header: 'Owner Review Note', key: 'ownerNote', width: 28 },
    { header: 'Original Search Query', key: 'query', width: 28 },
    { header: 'Captured Date', key: 'capturedAt', width: 20 },
    { header: 'Enriched Date', key: 'enrichedAt', width: 20 },
    { header: 'Qualified Date', key: 'qualifiedAt', width: 20 },
];

const LOCATION_COLUMNS = [
    { header: 'Company Name', key: 'companyName', width: 32 },
    { header: 'Website', key: 'website', width: 36 },
    { header: 'Address Type', key: 'addressType', width: 18 },
    { header: 'Full Address', key: 'raw', width: 48 },
    { header: 'City', key: 'city', width: 16 },
    { header: 'State', key: 'state', width: 16 },
    { header: 'Country', key: 'country', width: 12 },
    { header: 'PIN Code', key: 'pinCode', width: 12 },
    { header: 'Evidence Label', key: 'evidenceLabel', width: 20 },
    { header: 'Confidence', key: 'confidence', width: 12 },
    { header: 'Source URL', key: 'sourceUrl', width: 40 },
    { header: 'Location Match Status', key: 'locationClassification', width: 28 },
    { header: 'Selected City', key: 'selectedCity', width: 14 },
];

function formatAllAddresses(addresses = []) {
    return addresses
        .map((a) => {
            const label = a.type || a.evidenceLabel || 'Address';
            return `[${label}] ${a.raw || ''}`.trim();
        })
        .filter(Boolean)
        .join(' || ');
}

function mapRow(q, enrichment, capture, queryText = '') {
    const en = enrichment || {};
    const addresses = Array.isArray(en.addresses) ? en.addresses : [];
    return {
        companyName: q.companyName || en.companyName || '',
        website: q.websiteUrl || en.websiteUrl || '',
        phone: (en.phones || [])[0]?.original || '',
        whatsapp: (en.whatsappNumbers || [])[0]?.original || '',
        email: (en.emails || [])[0]?.value || '',
        contactPerson: (en.contactPersons || [])[0]?.name || '',
        primaryAddress: addresses[0]?.raw || '',
        allAddresses: formatAllAddresses(addresses),
        addressCount: q.addressCount ?? addresses.length,
        confirmedCities: (q.confirmedCities || addresses.map((a) => a.city).filter(Boolean)).join(', '),
        confirmedStates: (q.confirmedStates || addresses.map((a) => a.state).filter(Boolean)).join(', '),
        selectedCity: q.selectedCity || '',
        locationClassification: q.locationClassification || '',
        locationMatch: q.locationMatch || '',
        locationEvidenceUrl: q.locationEvidenceUrl || addresses[0]?.sourceUrl || '',
        officeInSelectedCity: Boolean(q.officeInSelectedCity),
        servesSelectedCity: Boolean(q.servesSelectedCity),
        productMatchStrength: q.productMatchStrength || '',
        previousLocationClassification: q.previousLocationClassification || q.previousLocationMatch || '',
        locationRecheckedAt: q.locationRecheckedAt || '',
        facebook: en.facebook?.url || '',
        instagram: en.instagram?.url || '',
        linkedin: en.linkedin?.url || '',
        businessType: q.ownerBusinessTypeOverride || q.businessType || en.businessType || '',
        products: (en.productsServices || []).join('; '),
        relevanceScore: q.relevanceScore ?? '',
        confidence: q.confidence || '',
        decision: q.systemDecision || '',
        reason: q.decisionReason || '',
        productsMatched: (q.productsMatched || []).join('; '),
        contactQuality: q.contactQualityScore ?? '',
        evidence: (q.sourceEvidence || []).map((e) => e.sourceUrl).filter(Boolean).slice(0, 10).join(' | '),
        ownerReview: q.ownerReviewStatus || '',
        ownerNote: q.ownerReviewNote || '',
        query: queryText,
        capturedAt: capture?.lastSeenAt || capture?.firstSeenAt || '',
        enrichedAt: en.lastEnrichedAt || en.updatedAt || '',
        qualifiedAt: q.qualifiedAt || '',
    };
}

function addSheet(wb, name, rows) {
    const sheet = wb.addWorksheet(String(name).slice(0, 31));
    sheet.columns = COLUMNS;
    for (const row of rows) {
        const mapped = {};
        for (const col of COLUMNS) mapped[col.key] = cell(row[col.key]);
        sheet.addRow(mapped);
    }
}

export async function buildQualificationWorkbook({
    qualifications = [],
    enrichments = [],
    captures = [],
    summary = {},
    queryText = '',
}) {
    const enById = {};
    for (const e of enrichments) enById[String(e._id)] = e;
    const capById = {};
    for (const c of captures) capById[String(c._id)] = c;

    const rows = qualifications.map((q) => {
        const en = enById[String(q.enrichmentId)] || null;
        const firstCapId = en?.rawCaptureIds?.[0];
        const cap = firstCapId ? capById[String(firstCapId)] : null;
        return mapRow(q, en, cap, queryText);
    });

    const strong = rows.filter((_, i) => qualifications[i].systemDecision === 'strong_match');
    const possible = rows.filter((_, i) => qualifications[i].systemDecision === 'possible_match');
    const review = rows.filter((_, i) => qualifications[i].systemDecision === 'human_review_required');
    const rejected = rows.filter((_, i) => qualifications[i].systemDecision === 'rejected');
    const locationMismatch = rows.filter((_, i) =>
        qualifications[i].locationMatch === 'mismatch'
        || (qualifications[i].unmatchedOrConflictingEvidence || []).includes('location_mismatch'));

    const wb = new ExcelJS.Workbook();
    wb.creator = 'JSK Data Extractor CP7';
    wb.created = new Date();

    addSheet(wb, 'Strong Matches', strong);
    addSheet(wb, 'Possible Matches', possible);
    addSheet(wb, 'Human Review Required', review);
    addSheet(wb, 'Rejected', rejected);
    addSheet(wb, 'Location Mismatch', locationMismatch);

    const locSheet = wb.addWorksheet('Company Locations');
    locSheet.columns = LOCATION_COLUMNS;
    for (const q of qualifications) {
        const en = enById[String(q.enrichmentId)] || {};
        const addresses = Array.isArray(en.addresses) ? en.addresses : [];
        if (!addresses.length) {
            locSheet.addRow({
                companyName: cell(q.companyName || en.companyName || ''),
                website: cell(q.websiteUrl || en.websiteUrl || ''),
                addressType: '',
                raw: '',
                city: cell(en.city || ''),
                state: cell(en.state || ''),
                country: cell(en.country || ''),
                pinCode: '',
                evidenceLabel: '',
                confidence: '',
                sourceUrl: cell(en.websiteUrl || ''),
                locationClassification: cell(q.locationClassification || ''),
                selectedCity: cell(q.selectedCity || ''),
            });
            continue;
        }
        for (const a of addresses) {
            locSheet.addRow({
                companyName: cell(q.companyName || en.companyName || ''),
                website: cell(q.websiteUrl || en.websiteUrl || ''),
                addressType: cell(a.type || ''),
                raw: cell(a.raw || ''),
                city: cell(a.city || ''),
                state: cell(a.state || ''),
                country: cell(a.country || ''),
                pinCode: cell(a.pinCode || ''),
                evidenceLabel: cell(a.evidenceLabel || ''),
                confidence: cell(a.confidence || ''),
                sourceUrl: cell(a.sourceUrl || ''),
                locationClassification: cell(q.locationClassification || ''),
                selectedCity: cell(q.selectedCity || ''),
            });
        }
    }

    const sum = wb.addWorksheet('Qualification Summary');
    sum.columns = [
        { header: 'Metric', key: 'metric', width: 40 },
        { header: 'Value', key: 'value', width: 48 },
    ];
    const lines = [
        ['Export type', 'Checkpoint 7 qualification + strict location'],
        ['CRM Leads auto-created', 'No'],
        ['Create CRM Lead enabled', 'No (future-ready disabled)'],
        ['Total qualification records', qualifications.length],
        ['Strong matches', summary.strongMatchCount ?? strong.length],
        ['Possible matches', summary.possibleMatchCount ?? possible.length],
        ['Human review required', summary.reviewRequiredCount ?? review.length],
        ['Rejected', summary.rejectedCount ?? rejected.length],
        ['Location mismatch', locationMismatch.length],
        ['Rule-based count', summary.ruleBasedCount ?? qualifications.filter((q) => String(q.qualificationMethod || '').startsWith('rule')).length],
        ['Ollama local count', summary.ollamaCount ?? qualifications.filter((q) => q.qualificationMethod === 'ollama_local').length],
        ['Job status', summary.status || ''],
        ['Product hint', summary.productHint || ''],
        ['Location hint', summary.locationHint || ''],
        ['Exported at', new Date().toISOString()],
    ];
    for (const [metric, value] of lines) sum.addRow({ metric: cell(metric), value: cell(value) });

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
}
