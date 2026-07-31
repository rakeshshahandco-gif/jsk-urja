/**
 * Checkpoint 5B — Unverified RawCapture Excel export for Simple Lead Search.
 */
import ExcelJS from 'exceljs';
import { classifyStageA } from './stageAPreFilter.util.js';

function sanitizeExportFormula(value) {
    const s = String(value ?? '');
    if (/^[=+\-@]/.test(s)) return "'" + s;
    return s;
}

function cell(value) {
    if (value == null) return '';
    if (value instanceof Date) return value;
    return sanitizeExportFormula(value);
}

function mapRow(record, queryTextById = {}, queryMetaById = {}, campaign = {}) {
    const stageA = classifyStageA(record);
    const qid = record.queryId ? String(record.queryId) : '';
    const meta = queryMetaById[qid] || {};
    return {
        title: record.title || '',
        website: record.resultUrlOriginal || record.resultUrlNormalized || '',
        domain: record.displayDomain || '',
        snippet: record.snippet || '',
        position: record.resultPosition == null ? '' : record.resultPosition,
        source: record.source || '',
        sourceUrl: record.resultUrlOriginal || record.resultUrlNormalized || '',
        queryUsed: queryTextById[qid] || '',
        duplicateStatus: record.duplicateStatus || '',
        capturedDate: record.lastSeenAt || record.firstSeenAt || record.createdAt || '',
        reviewStatus: 'Unverified',
        stageADecision: stageA.decision,
        stageAReason: stageA.reason,
        stageALabel: stageA.label,
        inboxStatus: record.inboxStatus || '',
        seenCount: record.seenCount || 1,
        email: '', phone: '', whatsapp: '', address: '', city: '', state: '', country: '',
        businessType: meta.businessType || '',
        industry: campaign.targetIndustry || '',
        products: '',
        aiRelevanceScore: '', aiDecision: '', aiReason: '', evidence: '',
        productIndustry: campaign.targetIndustry || '',
        relatedKeywordMatched: meta.relatedKeyword || '',
        requestedBusinessType: meta.businessType || '',
        detectedBusinessTypes: meta.businessType || '',
        locationScope: campaign.locationScope || meta.locationScope || '',
        requestedCity: campaign.city || '',
        requestedState: campaign.state || '',
        requestedCountry: campaign.country || '',
        detectedCity: '',
        detectedState: '',
        detectedCountry: '',
        searchMarket: campaign.searchMarket || '',
        sourcePlatform: meta.sourcePlatform || 'google',
        originalQuery: queryTextById[qid] || '',
        queryLanguage: meta.queryLanguage || 'en',
        chineseCompanyName: '',
        englishCompanyName: '',
        multipleRoles: meta.businessType || '',
        locationMatch: '',
        businessTypeMatch: '',
    };
}

const COLUMNS = [
    { header: 'Company Name / Result Title', key: 'title', width: 36 },
    { header: 'Website', key: 'website', width: 40 },
    { header: 'Domain', key: 'domain', width: 24 },
    { header: 'Email', key: 'email', width: 18 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'WhatsApp', key: 'whatsapp', width: 16 },
    { header: 'Address', key: 'address', width: 24 },
    { header: 'City', key: 'city', width: 14 },
    { header: 'State', key: 'state', width: 14 },
    { header: 'Country', key: 'country', width: 14 },
    { header: 'Business Type', key: 'businessType', width: 16 },
    { header: 'Industry', key: 'industry', width: 16 },
    { header: 'Products / Services', key: 'products', width: 20 },
    { header: 'Product / Industry', key: 'productIndustry', width: 20 },
    { header: 'Related Keyword Matched', key: 'relatedKeywordMatched', width: 20 },
    { header: 'Requested Business Type', key: 'requestedBusinessType', width: 18 },
    { header: 'Detected Business Types', key: 'detectedBusinessTypes', width: 18 },
    { header: 'Location Scope', key: 'locationScope', width: 14 },
    { header: 'Requested City', key: 'requestedCity', width: 14 },
    { header: 'Requested State / Province', key: 'requestedState', width: 16 },
    { header: 'Requested Country', key: 'requestedCountry', width: 14 },
    { header: 'Detected City', key: 'detectedCity', width: 14 },
    { header: 'Detected State / Province', key: 'detectedState', width: 16 },
    { header: 'Detected Country', key: 'detectedCountry', width: 14 },
    { header: 'Search Market', key: 'searchMarket', width: 16 },
    { header: 'Source Platform', key: 'sourcePlatform', width: 14 },
    { header: 'Original Query', key: 'originalQuery', width: 36 },
    { header: 'Query Language', key: 'queryLanguage', width: 12 },
    { header: 'Chinese Company Name', key: 'chineseCompanyName', width: 20 },
    { header: 'English Company Name', key: 'englishCompanyName', width: 20 },
    { header: 'Multiple Roles', key: 'multipleRoles', width: 18 },
    { header: 'Location Match', key: 'locationMatch', width: 14 },
    { header: 'Business-Type Match', key: 'businessTypeMatch', width: 16 },
    { header: 'AI Relevance Score', key: 'aiRelevanceScore', width: 14 },
    { header: 'AI Decision', key: 'aiDecision', width: 14 },
    { header: 'AI Reason', key: 'aiReason', width: 24 },
    { header: 'Evidence', key: 'evidence', width: 20 },
    { header: 'Source', key: 'source', width: 12 },
    { header: 'Source URL', key: 'sourceUrl', width: 40 },
    { header: 'Query Used', key: 'queryUsed', width: 36 },
    { header: 'Duplicate Status', key: 'duplicateStatus', width: 14 },
    { header: 'Captured Date', key: 'capturedDate', width: 22 },
    { header: 'Review Status', key: 'reviewStatus', width: 14 },
    { header: 'Stage A Decision (preliminary)', key: 'stageADecision', width: 18 },
    { header: 'Stage A Reason (preliminary)', key: 'stageAReason', width: 32 },
    { header: 'Snippet', key: 'snippet', width: 40 },
    { header: 'Search Position', key: 'position', width: 12 },
    { header: 'Seen Count', key: 'seenCount', width: 10 },
];

function addSheet(workbook, name, rows) {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = COLUMNS;
    for (const row of rows) {
        const mapped = {};
        for (const col of COLUMNS) mapped[col.key] = cell(row[col.key]);
        sheet.addRow(mapped);
    }
}

export async function buildUnverifiedRawCaptureWorkbook({
    records = [],
    summary = {},
    queryTextById = {},
    queryMetaById = {},
    campaign = {},
}) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'JSK Data Extractor';
    workbook.created = new Date();

    const mapped = records.map((r) => mapRow(r, queryTextById, queryMetaById, campaign));
    const relevant = mapped.filter((r) => r.stageADecision === 'relevant');
    const possible = mapped.filter((r) => r.stageADecision === 'possible_match' || r.stageADecision === 'review_required');
    const rejected = mapped.filter((r) => r.stageADecision === 'rejected');

    addSheet(workbook, 'Relevant Companies', relevant);
    addSheet(workbook, 'Possible Matches', possible);
    addSheet(workbook, 'Rejected Unwanted', rejected);

    const summarySheet = workbook.addWorksheet('Capture Summary');
    summarySheet.columns = [
        { header: 'Metric', key: 'metric', width: 40 },
        { header: 'Value', key: 'value', width: 48 },
    ];
    const lines = [
        ['Export type', 'Unverified Raw Capture (pre-enrichment)'],
        ['AI qualification complete', 'No — Stage A preliminary rules only'],
        ['Campaign', summary.campaignName || campaign.name || ''],
        ['Product / Industry', campaign.targetIndustry || ''],
        ['Location Scope', campaign.locationScope || ''],
        ['Search Market', campaign.searchMarket || ''],
        ['Business Types', Array.isArray(campaign.businessTypes) ? campaign.businessTypes.join(', ') : ''],
        ['Query', summary.queryText || ''],
        ['Session status', summary.sessionStatus || ''],
        ['Visible results found', summary.visibleResultCount ?? ''],
        ['Accepted results', summary.acceptedCount ?? ''],
        ['New unique records (inserted)', summary.insertedCount ?? ''],
        ['Existing records updated', summary.updatedExistingCount ?? ''],
        ['Ingest rejected count', summary.rejectedCount ?? ''],
        ['Stage A relevant', relevant.length],
        ['Stage A possible / review', possible.length],
        ['Stage A rejected / unwanted', rejected.length],
        ['Total unique rows exported', mapped.length],
        ['Capture events', summary.captureEventCount ?? ''],
        ['Exported at', new Date().toISOString()],
        ['Note', 'Email/phone/address/products blank until Checkpoint 6/7'],
    ];
    for (const [metric, value] of lines) {
        summarySheet.addRow({ metric: cell(metric), value: cell(value) });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
}
