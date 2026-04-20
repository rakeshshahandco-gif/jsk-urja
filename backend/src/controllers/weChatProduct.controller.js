import httpStatus from 'http-status';
import { WeChatProduct } from '../models/weChatProduct.model.js';
import { WeChatPriceRecord } from '../models/weChatPriceRecord.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { prdUpload } from '../middlewares/prdUpload.middleware.js';

// ── List / Search Products ───────────────────────────────────────────────────

export const getProducts = asyncHandler(async (req, res) => {
    const { contactId, partNumber, productCategory, search, isActive } = req.query;

    let query = {};

    if (contactId) query.contactId = contactId;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (productCategory) query.productCategory = { $regex: productCategory, $options: 'i' };
    if (partNumber) {
        query.$or = [
            { partNumber: { $regex: partNumber, $options: 'i' } },
            { altPartNumbers: { $regex: partNumber, $options: 'i' } }
        ];
    }
    if (search) {
        const r = { $regex: search, $options: 'i' };
        query.$or = [
            { productCategory: r },
            { productName: r },
            { partNumber: r },
            { altPartNumbers: r },
            { brand: r },
            { specification: r }
        ];
    }

    const products = await WeChatProduct.find(query)
        .populate('contactId', 'weChatDisplayName englishName chineseName companyName')
        .sort('-updatedAt');

    res.send(new ApiResponse(httpStatus.OK, products));
});

// ── Get Single Product with Price History ────────────────────────────────────

export const getProduct = asyncHandler(async (req, res) => {
    const product = await WeChatProduct.findById(req.params.productId)
        .populate('contactId', 'weChatDisplayName englishName companyName mobile email')
        .populate('groupId', 'groupName groupAlias');

    if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');

    // Fetch price history for this product
    const priceHistory = await WeChatPriceRecord.find({ productId: product._id })
        .populate('recordedBy', 'name')
        .sort('-quotationDate')
        .limit(50);

    res.send(new ApiResponse(httpStatus.OK, { product, priceHistory }));
});

// ── Create Product ───────────────────────────────────────────────────────────

export const createProduct = asyncHandler(async (req, res) => {
    const product = await WeChatProduct.create({
        ...req.body,
        createdBy: req.user._id
    });

    // If a latestPrice is provided at creation time, also save a price record
    if (req.body.latestPrice && req.body.latestPrice > 0) {
        await WeChatPriceRecord.create({
            contactId: req.body.contactId,
            productId: product._id,
            partNumber: req.body.partNumber,
            productCategory: req.body.productCategory,
            productName: req.body.productName,
            price: req.body.latestPrice,
            currency: req.body.currency || 'RMB',
            moq: req.body.moq || 0,
            leadTimeDays: req.body.leadTimeDays || 0,
            source: 'manual',
            quotationDate: new Date(),
            recordedBy: req.user._id
        });
    }

    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, product, 'Product added'));
});

// ── Update Product ───────────────────────────────────────────────────────────

export const updateProduct = asyncHandler(async (req, res) => {
    const existing = await WeChatProduct.findById(req.params.productId);
    if (!existing) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');

    // If price changed, save a new price record (never overwrite history)
    if (req.body.latestPrice && req.body.latestPrice !== existing.latestPrice) {
        await WeChatPriceRecord.create({
            contactId: existing.contactId,
            productId: existing._id,
            partNumber: existing.partNumber,
            productCategory: existing.productCategory,
            productName: existing.productName,
            price: req.body.latestPrice,
            currency: req.body.currency || existing.currency || 'RMB',
            moq: req.body.moq || existing.moq,
            leadTimeDays: req.body.leadTimeDays || existing.leadTimeDays,
            source: 'manual',
            quotationDate: new Date(),
            recordedBy: req.user._id
        });
        req.body.latestPriceDate = new Date();
    }

    const product = await WeChatProduct.findByIdAndUpdate(
        req.params.productId,
        req.body,
        { new: true }
    );

    res.send(new ApiResponse(httpStatus.OK, product, 'Product updated'));
});

// ── Delete Product ───────────────────────────────────────────────────────────

export const deleteProduct = asyncHandler(async (req, res) => {
    const product = await WeChatProduct.findByIdAndUpdate(
        req.params.productId,
        { isActive: false },
        { new: true }
    );
    if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
    res.send(new ApiResponse(httpStatus.OK, null, 'Product deactivated'));
});

// ── KEY: Cross-Supplier Comparison ──────────────────────────────────────────
// GET /wechat/products/compare?partNumber=BT2S
// Returns all suppliers who deal in a specific part number

export const compareByPartNumber = asyncHandler(async (req, res) => {
    const { partNumber, productCategory } = req.query;

    if (!partNumber && !productCategory) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'partNumber or productCategory is required for comparison');
    }

    // Build match query
    const matchQuery = {};
    if (partNumber) {
        const r = { $regex: partNumber, $options: 'i' };
        matchQuery.$or = [
            { partNumber: r },
            { altPartNumbers: r }
        ];
    }
    if (productCategory) {
        matchQuery.productCategory = { $regex: productCategory, $options: 'i' };
    }
    matchQuery.isActive = true;

    // Get all products matching the part number across all suppliers
    const products = await WeChatProduct.find(matchQuery)
        .populate('contactId', 'weChatDisplayName englishName chineseName companyName mobile email isFavorite groupIds')
        .populate('groupId', 'groupName groupAlias')
        .lean();

    // For each product, get the latest price record and last chat entry
    const enriched = await Promise.all(products.map(async (product) => {
        const [latestPriceRecord, lastChat] = await Promise.all([
            WeChatPriceRecord.findOne({ productId: product._id })
                .sort('-quotationDate')
                .lean(),
            // We'll import WeChatChat lazily to avoid circular dep issues
            (await import('../models/weChatChat.model.js')).WeChatChat
                .findOne({ productId: product._id })
                .sort('-chatDate')
                .lean()
        ]);

        return {
            ...product,
            latestPriceRecord,
            lastChat,
            // Quick access flags
            hasAttachments: (product.attachments || []).length > 0,
            hasChat: !!lastChat
        };
    }));

    // Sort by latestPrice ascending (best price first), nulls last
    enriched.sort((a, b) => {
        const priceA = a.latestPrice ?? Infinity;
        const priceB = b.latestPrice ?? Infinity;
        return priceA - priceB;
    });

    // Mark the best price (lowest non-null price)
    const validPrices = enriched.filter(p => p.latestPrice != null);
    if (validPrices.length > 0) {
        const minPrice = Math.min(...validPrices.map(p => p.latestPrice));
        enriched.forEach(p => {
            p.isBestPrice = p.latestPrice === minPrice;
        });
    }

    res.send(new ApiResponse(httpStatus.OK, {
        partNumber,
        productCategory,
        totalSuppliers: enriched.length,
        results: enriched
    }));
});

// ── Upload Attachment to Product ─────────────────────────────────────────────

export const uploadProductAttachment = asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(httpStatus.BAD_REQUEST, 'No file uploaded');

    const attachment = {
        filename: req.file.originalname,
        url: `/uploads/prd/${req.file.filename}`,
        mimetype: req.file.mimetype,
        size: req.file.size,
        type: req.body.type || 'Other',
        notes: req.body.notes,
        uploadDate: new Date(),
        uploadedBy: req.user._id
    };

    const product = await WeChatProduct.findByIdAndUpdate(
        req.params.productId,
        { $push: { attachments: attachment } },
        { new: true }
    );

    if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
    res.send(new ApiResponse(httpStatus.OK, product, 'Attachment uploaded'));
});
