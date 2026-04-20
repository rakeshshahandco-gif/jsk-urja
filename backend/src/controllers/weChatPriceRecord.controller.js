import httpStatus from 'http-status';
import { WeChatPriceRecord } from '../models/weChatPriceRecord.model.js';
import { WeChatProduct } from '../models/weChatProduct.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// ── Get Price History ────────────────────────────────────────────────────────

export const getPrices = asyncHandler(async (req, res) => {
    const { contactId, productId, partNumber, currency, startDate, endDate } = req.query;

    let query = {};
    if (contactId) query.contactId = contactId;
    if (productId) query.productId = productId;
    if (partNumber) query.partNumber = { $regex: partNumber, $options: 'i' };
    if (currency) query.currency = currency;
    if (startDate || endDate) {
        query.quotationDate = {};
        if (startDate) query.quotationDate.$gte = new Date(startDate);
        if (endDate) query.quotationDate.$lte = new Date(endDate);
    }

    const prices = await WeChatPriceRecord.find(query)
        .populate('contactId', 'weChatDisplayName englishName companyName')
        .populate('productId', 'productName partNumber productCategory')
        .populate('recordedBy', 'name')
        .sort('-quotationDate');

    res.send(new ApiResponse(httpStatus.OK, prices));
});

// ── Add Price Record ─────────────────────────────────────────────────────────

export const addPriceRecord = asyncHandler(async (req, res) => {
    const { contactId, productId, price, currency, moq, leadTimeDays, source, quotationDate, partNumber, productCategory, productName, remarks } = req.body;

    if (!contactId || !productId || !price) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'contactId, productId and price are required');
    }

    const record = await WeChatPriceRecord.create({
        contactId,
        productId,
        partNumber,
        productCategory,
        productName,
        price,
        currency: currency || 'RMB',
        moq: moq || 0,
        leadTimeDays: leadTimeDays || 0,
        source: source || 'manual',
        quotationDate: quotationDate ? new Date(quotationDate) : new Date(),
        remarks,
        recordedBy: req.user._id
    });

    // Also update the product's latestPrice snapshot if this is newer
    const product = await WeChatProduct.findById(productId);
    if (product && (!product.latestPriceDate || new Date(quotationDate || Date.now()) >= product.latestPriceDate)) {
        await WeChatProduct.findByIdAndUpdate(productId, {
            latestPrice: price,
            latestPriceDate: new Date(quotationDate || Date.now()),
            currency: currency || product.currency
        });
    }

    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, record, 'Price record added'));
});

// ── Delete Price Record ──────────────────────────────────────────────────────

export const deletePriceRecord = asyncHandler(async (req, res) => {
    await WeChatPriceRecord.findByIdAndDelete(req.params.recordId);
    res.send(new ApiResponse(httpStatus.OK, null, 'Price record removed'));
});

// ── Get Price Trend for a Part Number (for charts) ───────────────────────────

export const getPriceTrend = asyncHandler(async (req, res) => {
    const { partNumber, contactId } = req.query;
    if (!partNumber && !contactId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'partNumber or contactId required');
    }

    const query = {};
    if (partNumber) query.partNumber = { $regex: partNumber, $options: 'i' };
    if (contactId) query.contactId = contactId;

    const records = await WeChatPriceRecord.find(query)
        .populate('contactId', 'weChatDisplayName companyName')
        .sort('quotationDate');

    // Group by supplier for trend lines
    const bySupplier = {};
    records.forEach(r => {
        const key = r.contactId?._id?.toString() || 'unknown';
        if (!bySupplier[key]) {
            bySupplier[key] = {
                contactId: r.contactId?._id,
                supplierName: r.contactId?.weChatDisplayName || r.contactId?.companyName || 'Unknown',
                currency: r.currency,
                trend: []
            };
        }
        bySupplier[key].trend.push({
            date: r.quotationDate,
            price: r.price,
            moq: r.moq,
            source: r.source
        });
    });

    res.send(new ApiResponse(httpStatus.OK, { partNumber, suppliers: Object.values(bySupplier) }));
});
