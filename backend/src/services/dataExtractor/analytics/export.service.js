import { AiAnalyticsAudit } from '../../../models/aiAnalyticsAudit.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { getAnalyticsSettings } from './settings.service.js';
import { assertCanExport, isAggregateOnly } from './permissions.util.js';
import { assertNoSecrets } from './filters.util.js';
import * as agg from './aggregate.service.js';

const SECTION_FN = {
    executive: agg.getExecutiveSummary,
    funnel: agg.getFunnel,
    discovery: agg.getDiscoveryAnalytics,
    'data-quality': agg.getDataQualityAnalytics,
    'lead-scoring': agg.getLeadScoringAnalytics,
    industry: agg.getIndustryAnalytics,
    product: agg.getProductAnalytics,
    contact: agg.getContactAnalytics,
    'company-intelligence': agg.getCompanyIntelligenceAnalytics,
    market: agg.getMarketAnalytics,
    'crm-enrichment': agg.getCrmEnrichmentAnalytics,
    'sales-workflow': agg.getSalesWorkflowAnalytics,
    batches: agg.getBatchMonitor,
    'user-activity': agg.getUserActivity,
};

export async function buildAnalyticsExport(companyId, userId, query = {}, user = null) {
    assertCanExport(user);
    const section = String(query.section || 'executive');
    const fn = SECTION_FN[section];
    if (!fn) throw new ApiError(400, `Unknown export section: ${section}`);
    const moduleKey = section.includes('sales') ? 'sales_workflow'
        : section.includes('crm') ? 'crm_conversion'
        : section.includes('batch') ? 'batch_monitor'
        : section.includes('contact') ? 'contact'
        : section.includes('product') ? 'product'
        : section.includes('market') ? 'market'
        : section.includes('discover') || section.includes('data') ? 'discovery'
        : section.includes('user') ? 'user_activity'
        : 'executive';
    if (isAggregateOnly(user, moduleKey) && String(query.format || 'json') !== 'json') {
        // still allow aggregate JSON summary
    }
    const data = await fn(companyId, query._filters || query, user);
    if (isAggregateOnly(user, moduleKey) && (data.rows || data.jobs || data.recentJobs)) {
        throw new ApiError(403, 'Aggregate-only users cannot export restricted row details');
    }
    const settings = await getAnalyticsSettings(companyId);
    const limit = settings.exportRowLimit || 5000;
    const payload = {
        section,
        generatedAt: new Date().toISOString(),
        dateRange: data.filters?.dateRange || query.dateRange,
        filterSummary: data.filters || {},
        metrics: data.metrics,
        dimensions: data.dimensions,
        readOnly: true,
        rowLimit: limit,
    };
    assertNoSecrets(payload);
    await AiAnalyticsAudit.create({
        companyId,
        action: 'export',
        userId,
        exportFormat: String(query.format || 'json'),
        filterSummary: payload.filterSummary,
        rowCount: 0,
        detail: { section },
    });
    if (String(query.format || 'json') === 'csv') {
        const lines = ['metric,value'];
        for (const [k, v] of Object.entries(payload.metrics || {})) {
            const val = typeof v === 'object' ? (v.value ?? v.numerator ?? '') : v;
            lines.push(`"${k}","${val}"`);
        }
        return { format: 'csv', content: lines.join('\n'), payload };
    }
    return { format: 'json', payload };
}