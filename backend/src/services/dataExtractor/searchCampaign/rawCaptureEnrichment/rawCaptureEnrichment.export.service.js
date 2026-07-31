import ExcelJS from 'exceljs';

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

function firstPhone(doc) {
    return (doc.phones || [])[0]?.original || '';
}
function firstWa(doc) {
    return (doc.whatsappNumbers || [])[0]?.original || '';
}
function firstEmail(doc) {
    return (doc.emails || [])[0]?.value || '';
}
function firstPerson(doc) {
    return (doc.contactPersons || [])[0] || {};
}
function evidenceUrls(doc) {
    return (doc.sourceEvidence || []).map((e) => e.sourceUrl).filter(Boolean).slice(0, 10).join(' | ');
}

const COLUMNS = [
    { header: 'Company Name', key: 'companyName', width: 32 },
    { header: 'Contact Person', key: 'contactPerson', width: 22 },
    { header: 'Designation', key: 'designation', width: 18 },
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'WhatsApp', key: 'whatsapp', width: 18 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Address', key: 'address', width: 36 },
    { header: 'City', key: 'city', width: 14 },
    { header: 'State', key: 'state', width: 14 },
    { header: 'Country', key: 'country', width: 14 },
    { header: 'Website', key: 'website', width: 36 },
    { header: 'Facebook', key: 'facebook', width: 28 },
    { header: 'Instagram', key: 'instagram', width: 28 },
    { header: 'LinkedIn', key: 'linkedin', width: 28 },
    { header: 'YouTube', key: 'youtube', width: 28 },
    { header: 'Business Type', key: 'businessType', width: 18 },
    { header: 'Products / Services', key: 'products', width: 28 },
    { header: 'Enrichment Status', key: 'status', width: 16 },
    { header: 'Confidence', key: 'confidence', width: 12 },
    { header: 'Evidence URLs', key: 'evidence', width: 40 },
    { header: 'Original Google URL', key: 'googleUrl', width: 40 },
    { header: 'Captured Date', key: 'capturedAt', width: 20 },
];

function mapRow(doc, captureById = {}) {
    const person = firstPerson(doc);
    const firstCaptureId = (doc.rawCaptureIds || [])[0];
    const cap = firstCaptureId ? captureById[String(firstCaptureId)] : null;
    return {
        companyName: doc.companyName || '',
        contactPerson: person.name || '',
        designation: person.designation || '',
        phone: firstPhone(doc),
        whatsapp: firstWa(doc),
        email: firstEmail(doc),
        address: (doc.addresses || [])[0]?.raw || '',
        city: doc.city || '',
        state: doc.state || '',
        country: doc.country || '',
        website: doc.websiteUrl || '',
        facebook: doc.facebook?.url || '',
        instagram: doc.instagram?.url || '',
        linkedin: doc.linkedin?.url || '',
        youtube: doc.youtube?.url || '',
        businessType: doc.businessType || '',
        products: (doc.productsServices || []).join('; '),
        status: doc.enrichmentStatus || '',
        confidence: doc.confidence ?? '',
        evidence: evidenceUrls(doc),
        googleUrl: cap?.resultUrlOriginal || cap?.resultUrlNormalized || '',
        capturedAt: cap?.lastSeenAt || cap?.firstSeenAt || doc.lastEnrichedAt || '',
    };
}

function addSheet(wb, name, rows) {
    const sheet = wb.addWorksheet(name);
    sheet.columns = COLUMNS;
    for (const row of rows) {
        const mapped = {};
        for (const col of COLUMNS) mapped[col.key] = cell(row[col.key]);
        sheet.addRow(mapped);
    }
}

export async function buildEnrichedWorkbook({ enrichments = [], captures = [], summary = {} }) {
    const captureById = {};
    for (const c of captures) captureById[String(c._id)] = c;

    const rows = enrichments.map((e) => mapRow(e, captureById));
    const enriched = rows.filter((r) => ['completed', 'partial'].includes(String(r.status)));
    const partial = rows.filter((r) => r.status === 'partial' || (r.status === 'completed' && (!r.phone || !r.email)));
    const socialReview = enrichments
        .filter((e) => e.facebook?.matchConfidence === 'possible_match'
            || e.facebook?.matchConfidence === 'review_required'
            || e.instagram?.matchConfidence === 'possible_match'
            || e.instagram?.matchConfidence === 'review_required'
            || e.enrichmentStatus === 'review_required')
        .map((e) => mapRow(e, captureById));
    const rejected = rows.filter((r) => r.status === 'failed' || r.status === 'blocked');

    const wb = new ExcelJS.Workbook();
    wb.creator = 'JSK Data Extractor CP6';
    wb.created = new Date();

    addSheet(wb, 'Enriched Companies', enriched.length ? enriched : rows.filter((r) => r.status !== 'failed'));
    addSheet(wb, 'Partial Missing Contact', partial);
    addSheet(wb, 'Social Profiles Review', socialReview);
    addSheet(wb, 'Rejected Unwanted', rejected);

    const sum = wb.addWorksheet('Enrichment Summary');
    sum.columns = [
        { header: 'Metric', key: 'metric', width: 40 },
        { header: 'Value', key: 'value', width: 48 },
    ];
    const lines = [
        ['Export type', 'Checkpoint 6A website enrichment (not AI qualification)'],
        ['AI qualification complete', 'No'],
        ['CRM Leads auto-created', 'No'],
        ['Total enrichment records', enrichments.length],
        ['Completed', summary.completedCount ?? enrichments.filter((e) => e.enrichmentStatus === 'completed').length],
        ['Partial', summary.partialCount ?? enrichments.filter((e) => e.enrichmentStatus === 'partial').length],
        ['With phone', summary.withPhone ?? enrichments.filter((e) => (e.phones || []).length).length],
        ['With email', summary.withEmail ?? enrichments.filter((e) => (e.emails || []).length).length],
        ['With WhatsApp', summary.withWhatsApp ?? enrichments.filter((e) => (e.whatsappNumbers || []).length).length],
        ['With Facebook', summary.withFacebook ?? enrichments.filter((e) => e.facebook?.url).length],
        ['With Instagram', summary.withInstagram ?? enrichments.filter((e) => e.instagram?.url).length],
        ['Review required', summary.reviewRequiredCount ?? enrichments.filter((e) => e.enrichmentStatus === 'review_required').length],
        ['Failed', summary.failedCount ?? enrichments.filter((e) => e.enrichmentStatus === 'failed').length],
        ['Exported at', new Date().toISOString()],
    ];
    for (const [metric, value] of lines) sum.addRow({ metric: cell(metric), value: cell(value) });

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
}