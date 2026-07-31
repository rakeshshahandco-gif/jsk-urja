import { AiProductMaster } from '../../../models/aiProductMaster.model.js';
import { ApiError } from '../../../utils/ApiError.js';

function cleanList(list = []) {
    return [...new Set((list || []).map((x) => String(x || '').trim()).filter(Boolean))];
}

function pushAudit(doc, action, userId, note = '') {
    doc.auditLog = [...(doc.auditLog || []), {
        at: new Date(),
        action,
        userId: userId || null,
        note: String(note || '').trim(),
    }].slice(-50);
}

export async function listProductMasters(companyId, query = {}) {
    const q = { companyId };
    if (query.isActive === 'true') q.isActive = true;
    if (query.isActive === 'false') q.isActive = false;
    if (query.parentIndustry) q.parentIndustry = query.parentIndustry;
    const results = await AiProductMaster.find(q).sort({ productName: 1 }).lean();
    return { results };
}

export async function saveProductMasters(companyId, rows = [], userId = null) {
    const results = [];
    for (const row of rows || []) {
        const productName = String(row.productName || '').trim();
        if (!productName) continue;
        let doc = await AiProductMaster.findOne({ companyId, productName });
        const values = {
            productName,
            productCategory: String(row.productCategory || '').trim(),
            parentIndustry: String(row.parentIndustry || '').trim(),
            subIndustry: String(row.subIndustry || '').trim(),
            applicableCustomerTypes: cleanList(row.applicableCustomerTypes),
            keywords: cleanList(row.keywords),
            negativeKeywords: cleanList(row.negativeKeywords),
            positiveSignals: cleanList(row.positiveSignals),
            productBenefits: cleanList(row.productBenefits),
            applications: cleanList(row.applications),
            brochureUrl: String(row.brochureUrl || '').trim(),
            catalogUrl: String(row.catalogUrl || '').trim(),
            datasheetUrl: String(row.datasheetUrl || '').trim(),
            videoUrl: String(row.videoUrl || '').trim(),
            websiteUrl: String(row.websiteUrl || '').trim(),
            priority: String(row.priority || 'medium').trim(),
            salesNotes: String(row.salesNotes || '').trim(),
            salesStrategies: cleanList(row.salesStrategies),
            upsellOf: cleanList(row.upsellOf),
            crossSellWith: cleanList(row.crossSellWith),
            bundleWith: cleanList(row.bundleWith),
            isActive: row.isActive !== false,
            notes: String(row.notes || '').trim(),
            updatedBy: userId || null,
        };
        if (!doc) {
            doc = new AiProductMaster({ companyId, ...values, createdBy: userId || null });
            pushAudit(doc, 'created', userId);
        } else {
            Object.assign(doc, values, { version: Number(doc.version || 1) + 1 });
            pushAudit(doc, 'updated', userId);
        }
        await doc.save();
        results.push(doc.toObject());
    }
    return results;
}

export async function getActiveProducts(companyId) {
    return AiProductMaster.find({ companyId, isActive: { $ne: false } }).lean();
}

export async function requireOwnedProduct(companyId, productId) {
    const doc = await AiProductMaster.findOne({ _id: productId, companyId }).lean();
    if (!doc) throw new ApiError(404, 'Product master not found');
    return doc;
}
