import { ProductCatalog } from '../models/productCatalog.model.js';
import { ApiError } from '../utils/ApiError.js';

function buildSort(sortBy) {
    if (!sortBy) return { createdAt: -1 };
    const parts = String(sortBy).split(',');
    const out = {};
    for (const p of parts) {
        const [k, o] = p.split(':');
        if (k) out[k] = o === 'asc' ? 1 : -1;
    }
    return out;
}

export async function createProduct(body, userId) {
    const exists = await ProductCatalog.findOne({ code: body.code });
    if (exists) throw new ApiError(400, `Product code "${body.code}" already exists`);
    const doc = await ProductCatalog.create({
        ...body,
        createdBy: userId,
        updatedBy: userId,
    });
    return doc;
}

export async function queryProducts(filter, options) {
    const q = {};
    if (filter.search) {
        const re = new RegExp(String(filter.search).trim(), 'i');
        q.$or = [{ name: re }, { code: re }, { category: re }];
    }
    if (filter.category) q.category = filter.category;
    if (typeof filter.isActive === 'boolean') q.isActive = filter.isActive;

    const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 50;
    const skip = (page - 1) * limit;

    const [results, totalResults] = await Promise.all([
        ProductCatalog.find(q).sort(buildSort(options.sortBy)).skip(skip).limit(limit),
        ProductCatalog.countDocuments(q),
    ]);
    return { results, page, limit, totalResults, totalPages: Math.ceil(totalResults / limit) };
}

export async function getProductById(id) {
    const doc = await ProductCatalog.findById(id);
    if (!doc) throw new ApiError(404, 'Product not found');
    return doc;
}

export async function updateProduct(id, patch, userId) {
    const doc = await getProductById(id);
    if (patch.code && patch.code !== doc.code) {
        const dupe = await ProductCatalog.findOne({ code: patch.code, _id: { $ne: id } });
        if (dupe) throw new ApiError(400, `Product code "${patch.code}" already exists`);
    }
    Object.assign(doc, patch);
    doc.updatedBy = userId;
    await doc.save();
    return doc;
}

export async function deleteProduct(id) {
    const doc = await getProductById(id);
    await doc.deleteOne();
    return { _id: id };
}

const ASSET_FIELD_MAP = {
    image: 'imageUrl',
    catalog: 'catalogPdfUrl',
    datasheet: 'datasheetPdfUrl',
    brochure: 'brochureUrl',
};

export async function setAssetUrl(id, assetType, publicUrl, userId) {
    const field = ASSET_FIELD_MAP[assetType];
    if (!field) throw new ApiError(400, `Unknown asset type "${assetType}"`);
    const doc = await getProductById(id);
    doc[field] = publicUrl;
    doc.updatedBy = userId;
    await doc.save();
    return doc;
}
