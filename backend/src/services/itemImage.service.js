import path from 'path';
import fs from 'fs';
import ItemImage from '../models/itemImage.model.js';
import { Item } from '../models/item.model.js';
import { Company } from '../models/company.model.js';
import { ApiError } from '../utils/ApiError.js';
import {
    ITEM_IMAGE_TYPES,
    SINGLE_ITEM_IMAGE_TYPES,
} from '../constants/itemImage.constants.js';
import { TEXTILE_INDUSTRY_CODES } from '../constants/textileProductionLot.constants.js';
import { ITEM_IMAGE_UPLOAD_DIR } from '../middlewares/itemImageUpload.middleware.js';

function publicFileUrl(filename) {
    return `/${ITEM_IMAGE_UPLOAD_DIR}${filename}`.replace(/\\/g, '/');
}

function isImageMime(mime = '') {
    return /^image\//i.test(mime);
}

export async function assertTextileItemImageCompany(companyId) {
    if (!companyId) throw new ApiError(400, 'Company context is required for textile item images');
    const company = await Company.findById(companyId).populate('industryTemplateRef', 'templateCode templateName isActive');
    if (!company) throw new ApiError(404, 'Company not found');

    const tpl = company.industryTemplateRef;
    const code = String(tpl?.templateCode || '').toUpperCase();
    const name = `${tpl?.templateName || ''} ${company.companyName || ''}`.toLowerCase();

    if (code === 'ELECTRONICS_JSK') {
        throw new ApiError(403, 'Item images are available only for Textile / Handloom companies');
    }

    const isTextile =
        TEXTILE_INDUSTRY_CODES.includes(code)
        || (!code && (name.includes('textile') || name.includes('handloom')))
        || (name.includes('handloom') && code === 'TEXTILE');

    if (!isTextile) {
        throw new ApiError(403, 'Item images are available only for Textile / Handloom companies');
    }
    return company;
}

export async function listItemImages(itemId, { imageType, includeDeleted = false, companyId } = {}) {
    await assertTextileItemImageCompany(companyId);
    const item = await Item.findById(itemId);
    if (!item) throw new ApiError(404, 'Item not found');

    const filter = { itemId };
    if (companyId) filter.companyId = companyId;
    if (!includeDeleted) filter.isDeleted = false;
    if (imageType) filter.imageType = imageType;

    return ItemImage.find(filter).sort({ createdAt: -1 }).populate('uploadedBy', 'name email');
}

export async function getItemImageById(id, companyId) {
    await assertTextileItemImageCompany(companyId);
    const doc = await ItemImage.findById(id);
    if (!doc || doc.isDeleted) throw new ApiError(404, 'Image not found');
    if (companyId && String(doc.companyId) !== String(companyId)) {
        throw new ApiError(403, 'Image does not belong to this company');
    }
    return doc;
}

async function softDeleteExistingSingle(itemId, companyId, imageType, userId) {
    if (!SINGLE_ITEM_IMAGE_TYPES.includes(imageType)) return;
    await ItemImage.updateMany(
        { itemId, companyId, imageType, isDeleted: false },
        { isDeleted: true, updatedBy: userId },
    );
}

export async function uploadItemImage({
    itemId,
    companyId,
    imageType,
    source,
    file,
    userId,
}) {
    if (!ITEM_IMAGE_TYPES.includes(imageType)) throw new ApiError(400, 'Invalid image type');
    await assertTextileItemImageCompany(companyId);

    const item = await Item.findById(itemId);
    if (!item) throw new ApiError(404, 'Item not found');

    if (SINGLE_ITEM_IMAGE_TYPES.includes(imageType)) {
        await softDeleteExistingSingle(itemId, companyId, imageType, userId);
    }

    const imageUrl = publicFileUrl(file.filename);
    const mime = file.mimetype || '';
    const thumbnailUrl = isImageMime(mime) ? imageUrl : '';

    return ItemImage.create({
        companyId: companyId || null,
        itemId,
        imageType,
        fileName: file.filename,
        originalName: file.originalname || file.filename,
        fileType: mime,
        imageUrl,
        thumbnailUrl,
        fileSize: file.size || 0,
        source: source || 'upload',
        uploadedBy: userId,
        updatedBy: userId,
        isDeleted: false,
    });
}

export async function replaceItemImage(id, { file, userId, source, companyId }) {
    const existing = await getItemImageById(id, companyId);
    const oldPath = path.join(process.cwd(), existing.imageUrl.replace(/^\//, ''));
    if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (_) { /* ignore */ }
    }

    const imageUrl = publicFileUrl(file.filename);
    const mime = file.mimetype || '';
    existing.fileName = file.filename;
    existing.originalName = file.originalname || file.filename;
    existing.fileType = mime;
    existing.imageUrl = imageUrl;
    existing.thumbnailUrl = isImageMime(mime) ? imageUrl : '';
    existing.fileSize = file.size || 0;
    existing.source = source || 'replace';
    existing.updatedBy = userId;
    await existing.save();
    return existing;
}

export async function softDeleteItemImage(id, userId, companyId) {
    const doc = await getItemImageById(id, companyId);
    doc.isDeleted = true;
    doc.updatedBy = userId;
    await doc.save();
    return doc;
}

export async function getTextileItemImageEligibility(companyId) {
    try {
        await assertTextileItemImageCompany(companyId);
        return { eligible: true };
    } catch (err) {
        return { eligible: false, reason: err.message || 'Not a textile company' };
    }
}
