/**
 * Multi-sheet Excel for all current-campaign captured data (present stage/status).
 * Presentation sanitization only — does not alter database values.
 */
import ExcelJS from 'exceljs';
import { ApiError } from '../../../../utils/ApiError.js';
import {
    addSafeWorksheet,
    clampExcelColumnWidth,
    excelSafeCellValue,
    excelSafeUrlCell,
    validateGeneratedXlsxBuffer,
} from './excelSafeValue.util.js';

function cell(value, opts = {}) {
    return excelSafeCellValue(value, opts);
}

/** Phone / WhatsApp / email always as text (preserve +country codes). */
function textCell(value) {
    return excelSafeCellValue(value, { forceText: true });
}

function fmtDate(v) {
    if (!v) return '';
    try {
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return textCell(v);
        return d.toISOString();
    } catch {
        return textCell(v);
    }
}

const RECORD_COLUMNS = [
    { header: '#', key: 'index', width: 6 },
    { header: 'Company / Result Name', key: 'companyName', width: 34 },
    { header: 'Chinese Company Name (Original)', key: 'companyNameOriginal', width: 34 },
    { header: 'English Company Name', key: 'companyNameEnglish', width: 34 },
    { header: 'Original Evidence (Chinese)', key: 'evidenceOriginal', width: 40 },
    { header: 'English Evidence', key: 'evidenceEnglish', width: 36 },
    { header: 'Discovery Source', key: 'discoveredThrough', width: 16 },
    { header: 'Destination Domain', key: 'destinationDomain', width: 22 },
    { header: 'WeChat', key: 'wechat', width: 16 },
    { header: 'Website / Source URL', key: 'website', width: 40 },
    { header: 'Business Type', key: 'businessType', width: 16 },
    { header: 'Search Keyword', key: 'searchKeyword', width: 16 },
    { header: 'Query Used', key: 'queryUsed', width: 36 },
    { header: 'City', key: 'city', width: 14 },
    { header: 'State', key: 'state', width: 14 },
    { header: 'Country', key: 'country', width: 12 },
    { header: 'Primary Address', key: 'primaryAddress', width: 36 },
    { header: 'All Addresses', key: 'allAddresses', width: 48 },
    { header: 'Address Count', key: 'addressCount', width: 12 },
    { header: 'Confirmed Cities', key: 'confirmedCities', width: 22 },
    { header: 'Selected City', key: 'selectedCity', width: 14 },
    { header: 'Location Match Status', key: 'locationClassification', width: 28 },
    { header: 'Location Match', key: 'locationMatch', width: 12 },
    { header: 'Location Evidence URL', key: 'locationEvidenceUrl', width: 36 },
    { header: 'Office in Selected City', key: 'officeInSelectedCity', width: 16 },
    { header: 'Serves Selected City', key: 'servesSelectedCity', width: 16 },
    { header: 'Product Match Strength', key: 'productMatchStrength', width: 22 },
    { header: 'Contact Person', key: 'contactPerson', width: 18 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'WhatsApp', key: 'whatsapp', width: 16 },
    { header: 'Email', key: 'email', width: 22 },
    { header: 'Facebook', key: 'facebook', width: 22 },
    { header: 'Instagram', key: 'instagram', width: 22 },
    { header: 'LinkedIn', key: 'linkedin', width: 22 },
    { header: 'Products / Services', key: 'productsServices', width: 28 },
    { header: 'Capture Status', key: 'captureStatus', width: 14 },
    { header: 'Enrichment Status', key: 'enrichmentStatus', width: 16 },
    { header: 'Qualification Status', key: 'qualificationStatus', width: 18 },
    { header: 'Relevance Score', key: 'relevanceScore', width: 12 },
    { header: 'Genuineness Status', key: 'genuinenessStatus', width: 18 },
    { header: 'AI Status', key: 'aiStatus', width: 18 },
    { header: 'AI Confidence', key: 'confidencePercent', width: 12 },
    { header: 'Business Potential', key: 'businessPotentialScore', width: 14 },
    { header: 'CRM Status', key: 'crmStatusLabel', width: 16 },
    { header: 'Current Processing Stage', key: 'currentStage', width: 20 },
    { header: 'Exclusive Status', key: 'exclusiveStatus', width: 16 },
    { header: 'Failure / Skip Reason', key: 'failureReason', width: 36 },
    { header: 'Retry Available', key: 'retryAvailable', width: 12 },
    { header: 'Retry Count', key: 'retryCount', width: 10 },
    { header: 'Captured At', key: 'capturedAt', width: 22 },
    { header: 'Last Processed At', key: 'lastProcessedAt', width: 22 },
];

function applyColumnWidths(sheet, columns) {
    sheet.columns = columns.map((c) => ({
        ...c,
        width: clampExcelColumnWidth(c.width, 12),
    }));
}

function styleHeader(sheet, columnCount) {
    const row = sheet.getRow(1);
    row.font = { bold: true };
    row.alignment = { vertical: 'middle', wrapText: true };
    const cols = Math.max(1, Math.min(Number(columnCount) || 1, 100));
    sheet.views = [{ state: 'frozen', ySplit: 1, activeCell: 'A2', topLeftCell: 'A2' }];
    sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: cols },
    };
}

function addRecordsSheet(workbook, name, rows) {
    const sheet = addSafeWorksheet(workbook, name);
    applyColumnWidths(sheet, RECORD_COLUMNS);
    for (const r of rows) {
        const score = r.relevanceScore;
        const scoreCell =
            score === '' || score == null || (typeof score === 'number' && !Number.isFinite(score))
                ? ''
                : typeof score === 'number'
                    ? score
                    : cell(score);

        sheet.addRow({
            index: Number.isFinite(Number(r.index)) ? Number(r.index) : cell(r.index),
            companyName: cell(r.companyName || r.title),
            companyNameOriginal: cell(r.companyNameOriginal),
            companyNameEnglish: cell(r.companyNameEnglish),
            evidenceOriginal: cell(r.evidenceOriginal),
            evidenceEnglish: cell(r.evidenceEnglish),
            discoveredThrough: cell(r.discoveredThrough || r.sourceName || r.source),
            destinationDomain: cell(r.destinationDomain),
            wechat: textCell(r.wechat || r.wechatPublic),
            website: excelSafeUrlCell(r.website || r.sourceUrl),
            businessType: cell(r.businessType),
            searchKeyword: cell(r.searchKeyword),
            queryUsed: cell(r.queryUsed),
            city: cell(r.city),
            state: cell(r.state),
            country: cell(r.country),
            primaryAddress: cell(r.primaryAddress),
            allAddresses: cell(r.allAddresses),
            addressCount: Number.isFinite(Number(r.addressCount)) ? Number(r.addressCount) : cell(r.addressCount),
            confirmedCities: cell(r.confirmedCities),
            selectedCity: cell(r.selectedCity),
            locationClassification: cell(r.locationClassification),
            locationMatch: cell(r.locationMatch),
            locationEvidenceUrl: excelSafeUrlCell(r.locationEvidenceUrl),
            officeInSelectedCity: r.officeInSelectedCity ? 'Yes' : 'No',
            servesSelectedCity: r.servesSelectedCity ? 'Yes' : 'No',
            productMatchStrength: cell(r.productMatchStrength),
            contactPerson: cell(r.contactPerson),
            phone: textCell(r.phone),
            whatsapp: textCell(r.whatsapp),
            email: textCell(r.email),
            facebook: excelSafeUrlCell(r.facebook),
            instagram: excelSafeUrlCell(r.instagram),
            linkedin: excelSafeUrlCell(r.linkedin),
            productsServices: cell(r.productsServices),
            captureStatus: cell(r.captureStatus),
            enrichmentStatus: cell(r.enrichmentStatus),
            qualificationStatus: cell(r.qualificationStatus),
            relevanceScore: scoreCell,
            genuinenessStatus: cell(r.genuinenessStatus),
            aiStatus: cell(r.aiStatus),
            confidencePercent: Number.isFinite(Number(r.confidencePercent)) ? Number(r.confidencePercent) : cell(r.confidencePercent),
            businessPotentialScore: Number.isFinite(Number(r.businessPotentialScore)) ? Number(r.businessPotentialScore) : cell(r.businessPotentialScore),
            crmStatusLabel: cell(r.crmStatusLabel),
            currentStage: cell(r.currentStage),
            exclusiveStatus: cell(r.exclusiveStatus),
            failureReason: cell(r.failureReason),
            retryAvailable: r.retryAvailable ? 'Yes' : 'No',
            retryCount: Number.isFinite(Number(r.retryCount)) ? Number(r.retryCount || 0) : 0,
            capturedAt: fmtDate(r.capturedAt),
            lastProcessedAt: fmtDate(r.lastProcessedAt),
        });
    }
    styleHeader(sheet, RECORD_COLUMNS.length);
    return sheet;
}

export async function buildAllCurrentCapturedDataWorkbook({
    rows = [],
    campaign = {},
    session = {},
    tabCounts = {},
    exclusiveBuckets = {},
    stageMetrics = {},
    queries = [],
}) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'JSK Data Extractor';
    workbook.created = new Date();

    const summary = addSafeWorksheet(workbook, 'Campaign Summary');
    applyColumnWidths(summary, [
        { header: 'Metric', key: 'metric', width: 40 },
        { header: 'Value', key: 'value', width: 56 },
    ]);
    const lines = [
        ['Export type', 'All Current Campaign Data (present stage/status)'],
        ['CRM Lead creation', 'OFF — export only'],
        ['Campaign', campaign.name || ''],
        ['Product / Industry', campaign.targetIndustry || ''],
        ['Business types', Array.isArray(campaign.businessTypes) ? campaign.businessTypes.join(', ') : ''],
        ['Related keywords', Array.isArray(campaign.relatedKeywords) ? campaign.relatedKeywords.join(', ') : ''],
        ['Location scope', campaign.locationScope || ''],
        ['Country', campaign.country || ''],
        ['State', campaign.state || ''],
        ['City', campaign.city || ''],
        ['Collection mode', session?.autoCollection?.pageCollectionMode || ''],
        ['Total queries (generated)', queries.length],
        ['Captured unique', rows.length],
        ['Waiting (exclusive)', exclusiveBuckets.waiting ?? tabCounts.waiting ?? 0],
        ['Processing (exclusive)', exclusiveBuckets.processing ?? tabCounts.processing ?? 0],
        ['Completed (exclusive)', exclusiveBuckets.completed ?? 0],
        ['Review required (exclusive)', exclusiveBuckets.reviewRequired ?? tabCounts.review_required ?? 0],
        ['Rejected / skipped (exclusive)', exclusiveBuckets.rejectedSkipped ?? tabCounts.rejected_skipped ?? 0],
        ['Failed (exclusive)', exclusiveBuckets.failed ?? tabCounts.failed ?? 0],
        ['Exclusive bucket total', exclusiveBuckets.total ?? rows.length],
        ['Stage — CP6 enrichment docs', stageMetrics.stageEnrichmentDocs ?? 0],
        ['Stage — CP7 qualification docs', stageMetrics.stageQualificationDocs ?? 0],
        ['Stage — CP8 genuineness docs', stageMetrics.stageGenuinenessDocs ?? 0],
        ['Tab — Enriched (stage)', tabCounts.enriched ?? 0],
        ['Tab — Qualified (stage)', tabCounts.qualified ?? 0],
        ['Tab — Verified (stage)', tabCounts.verified ?? 0],
        ['Session status', session.status || ''],
        ['Exported at', new Date().toISOString()],
        ['Note', 'Exclusive buckets sum to captured unique. Stage metrics may overlap and must not be added as a total.'],
    ];
    for (const [metric, value] of lines) {
        const valueCell = typeof value === 'number' ? value : cell(value);
        summary.addRow({ metric: cell(metric), value: valueCell });
    }
    styleHeader(summary, 2);

    addRecordsSheet(workbook, 'All Captured Records', rows);
    addRecordsSheet(
        workbook,
        'Waiting Processing',
        rows.filter((r) => r.exclusiveStatus === 'waiting' || r.exclusiveStatus === 'processing'),
    );
    addRecordsSheet(workbook, 'Enriched Contact Data', rows.filter((r) => r.flags?.hasEnrichDone));
    addRecordsSheet(workbook, 'Qualified Records', rows.filter((r) => r.flags?.hasQualified));
    addRecordsSheet(
        workbook,
        'Verified Records',
        rows.filter((r) => r.flags?.hasVerified || r.exclusiveStatus === 'completed'),
    );
    addRecordsSheet(
        workbook,
        'Review Required',
        rows.filter((r) => r.exclusiveStatus === 'review_required' || r.flags?.isReview),
    );
    addRecordsSheet(
        workbook,
        'Failed Skipped',
        rows.filter((r) => r.exclusiveStatus === 'failed' || r.exclusiveStatus === 'rejected_skipped'),
    );
    addRecordsSheet(
        workbook,
        'Location Mismatch',
        rows.filter((r) => r.flags?.isLocationMismatch || r.locationMatch === 'mismatch'),
    );

    const locSheet = addSafeWorksheet(workbook, 'Company Locations');
    applyColumnWidths(locSheet, [
        { header: 'Company Name', key: 'companyName', width: 32 },
        { header: 'Website', key: 'website', width: 36 },
        { header: 'All Addresses', key: 'allAddresses', width: 56 },
        { header: 'Address Count', key: 'addressCount', width: 12 },
        { header: 'Confirmed Cities', key: 'confirmedCities', width: 22 },
        { header: 'Selected City', key: 'selectedCity', width: 14 },
        { header: 'Location Match Status', key: 'locationClassification', width: 28 },
        { header: 'Office in Selected City', key: 'officeInSelectedCity', width: 16 },
        { header: 'Primary Address', key: 'primaryAddress', width: 40 },
        { header: 'Location Evidence URL', key: 'locationEvidenceUrl', width: 36 },
    ]);
    for (const r of rows.filter((row) => row.addressCount > 0 || row.primaryAddress || row.allAddresses)) {
        locSheet.addRow({
            companyName: cell(r.companyName || r.title),
            website: excelSafeUrlCell(r.website || r.sourceUrl),
            allAddresses: cell(r.allAddresses),
            addressCount: Number(r.addressCount || 0),
            confirmedCities: cell(r.confirmedCities),
            selectedCity: cell(r.selectedCity),
            locationClassification: cell(r.locationClassification),
            officeInSelectedCity: r.officeInSelectedCity ? 'Yes' : 'No',
            primaryAddress: cell(r.primaryAddress),
            locationEvidenceUrl: excelSafeUrlCell(r.locationEvidenceUrl),
        });
    }
    styleHeader(locSheet, 10);

    const qSheet = addSafeWorksheet(workbook, 'Generated Queries');
    applyColumnWidths(qSheet, [
        { header: '#', key: 'n', width: 6 },
        { header: 'Query Text', key: 'queryText', width: 56 },
        { header: 'Business Type', key: 'businessType', width: 18 },
        { header: 'Related Keyword', key: 'relatedKeyword', width: 18 },
        { header: 'Location Scope', key: 'locationScope', width: 14 },
    ]);
    queries.forEach((q, i) => {
        qSheet.addRow({
            n: i + 1,
            queryText: cell(q.queryText),
            businessType: cell(q.selectedCriteria?.businessType),
            relatedKeyword: cell(q.selectedCriteria?.relatedKeyword),
            locationScope: cell(q.selectedCriteria?.locationScope),
        });
    });
    styleHeader(qSheet, 5);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    try {
        await validateGeneratedXlsxBuffer(buffer, { expectedSheetCount: 11 });
    } catch (err) {
        throw new ApiError(500, err?.message || 'Excel export failed validation. Please retry export.');
    }
    return buffer;
}
