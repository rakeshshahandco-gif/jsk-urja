import { AiProductRecommendation } from '../../../models/aiProductRecommendation.model.js';
import { AiProductMaster } from '../../../models/aiProductMaster.model.js';
import { ProductCatalog } from '../../../models/productCatalog.model.js';
import { assertNoSecrets } from './normalize.util.js';

function docRef(kind, src = {}) {
    return {
        kind,
        documentId: src._id || src.id || null,
        title: src.name || src.productName || src.title || '',
        version: src.version || src.updatedAt || null,
        effectiveDate: src.effectiveDate || src.updatedAt || null,
        approvalStatus: src.isActive === false ? 'INACTIVE' : 'ACTIVE',
        mimeType: src.mimeType || null,
        sizeBytes: src.sizeBytes || null,
        url: src.catalogPdfUrl || src.datasheetPdfUrl || src.brochureUrl || src.catalogUrl || src.datasheetUrl || src.url || null,
        // reference only — never base64/binary
    };
}

/**
 * Recommend approved products/documents as references only (no attachments/binary).
 */
export async function recommendContent(companyId, {
    extractedLeadIds = [],
    campaignType,
} = {}) {
    const recs = await AiProductRecommendation.find({
        companyId,
        isDeleted: { $ne: true },
        status: { $in: ['RECOMMENDED', 'ACCEPTED'] },
        ...(extractedLeadIds.length ? { extractedLeadId: { $in: extractedLeadIds } } : {}),
    }).sort({ opportunityScore: -1 }).limit(25).lean();

    const productIds = recs.map((r) => r.primaryProductId || r.productId).filter(Boolean);
    const masters = productIds.length
        ? await AiProductMaster.find({ companyId, _id: { $in: productIds }, isActive: { $ne: false } }).lean()
        : await AiProductMaster.find({ companyId, isActive: { $ne: false } }).limit(10).lean();

    const catalogs = await ProductCatalog.find({
        companyId,
        isActive: { $ne: false },
    }).limit(20).lean().catch(() => []);

    const productReferences = masters.map((m) => ({
        productId: m._id,
        productName: m.productName,
        productCategory: m.productCategory || '',
        brochureUrl: m.brochureUrl || null,
        catalogUrl: m.catalogUrl || null,
        datasheetUrl: m.datasheetUrl || null,
        active: m.isActive !== false,
        campaignTypeHint: campaignType || null,
    })).filter((p) => p.active);

    const documentReferences = [];
    for (const c of catalogs) {
        if (c.catalogPdfUrl) documentReferences.push(docRef('catalogue', { ...c, url: c.catalogPdfUrl }));
        if (c.datasheetPdfUrl) documentReferences.push(docRef('datasheet', { ...c, url: c.datasheetPdfUrl }));
        if (c.brochureUrl) documentReferences.push(docRef('brochure', { ...c, url: c.brochureUrl }));
    }
    for (const m of masters) {
        if (m.catalogUrl) documentReferences.push(docRef('catalogue', m));
        if (m.datasheetUrl) documentReferences.push(docRef('datasheet', m));
        if (m.brochureUrl) documentReferences.push(docRef('brochure', m));
    }

    // Drop inactive / unapproved
    const approvedDocs = documentReferences.filter((d) => d.approvalStatus === 'ACTIVE' && d.url);
    const payload = {
        productReferences,
        documentReferences: approvedDocs,
        recommendationCount: recs.length,
        engine: 'RULE',
    };
    assertNoSecrets(payload);
    return payload;
}
