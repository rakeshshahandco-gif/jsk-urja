import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { SalesOrder } from '../models/salesOrder.model.js';
import { ProductionSheet } from '../models/productionSheet.model.js';
import { InvoiceSeries } from '../models/invoiceSeries.model.js';
import Customer from '../models/customer.model.js';
import { AuditLog } from '../models/auditLog.model.js';
import mongoose from 'mongoose';
import { getFYFromDate } from '../utils/fyUtils.js';
import { getNextNumberFromSeries } from '../utils/numberingUtils.js';
import { assertSalesOrderCanBeUpdated, getSalesOrderBillingSnapshot, prepareSalesOrderForInvoiceCreation } from '../utils/salesOrderBilling.utils.js';
import { checkUserPermission } from '../utils/permissionUtils.js';

// --- helpers ---
const numWords = (n) => {
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    if (n === 0) return 'Zero';
    const toWords = (num) => {
        if (num < 20) return a[num];
        if (num < 100) return b[Math.floor(num / 10)] + (num % 10 ? ' ' + a[num % 10] : '');
        if (num < 1000) return a[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + toWords(num % 100) : '');
        if (num < 100000) return toWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + toWords(num % 1000) : '');
        if (num < 10000000) return toWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + toWords(num % 100000) : '');
        return toWords(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + toWords(num % 10000000) : '');
    };
    const rupees = Math.floor(n);
    const paise = Math.round((n - rupees) * 100);
    let result = toWords(rupees) + ' Rupees';
    if (paise > 0) result += ' and ' + toWords(paise) + ' Paise';
    return result + ' Only';
};

const SO_START_NUMBER = parseInt(process.env.SO_START_NUMBER || '1', 10);

const genSONumber = async () => {
    const year = new Date().getFullYear();
    const last = await SalesOrder.findOne({ soNumber: { $regex: `^SO-${year}-` } }).sort({ soNumber: -1 });
    if (!last) return `SO-${year}-${String(SO_START_NUMBER).padStart(5, '0')}`;
    const parts = last.soNumber.split('-');
    const next = parseInt(parts[parts.length - 1], 10) + 1;
    return `SO-${year}-${String(next).padStart(5, '0')}`;
};

const calcTotals = (items, freightAmount = 0, freightGstRate = 0, gstType = '', gstApplicable = true) => {
    let totalQty = 0, totalTaxableSum = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
    const isIGST = gstType === 'IGST';

    // Force GST to 0 if not applicable
    const effectiveGstApplicable = gstApplicable === true || gstApplicable === 'true';

    const processedItems = items.map(item => {
        const qty = Number(item.qty) || 0;
        const rate = Number(item.rate) || 0;
        const amount = qty * rate;
        const gstRate = effectiveGstApplicable ? (Number(item.gstRate) || 18) : 0;
        const taxableAmount = amount;

        let cgstRate = 0, cgstAmount = 0, sgstRate = 0, sgstAmount = 0, igstRate = 0, igstAmount = 0;
        if (effectiveGstApplicable) {
            if (isIGST) {
                igstRate = gstRate;
                igstAmount = Math.round(taxableAmount * igstRate / 100 * 100) / 100;
            } else {
                cgstRate = gstRate / 2;
                sgstRate = gstRate / 2;
                cgstAmount = Math.round(taxableAmount * cgstRate / 100 * 100) / 100;
                sgstAmount = Math.round(taxableAmount * sgstRate / 100 * 100) / 100;
            }
        }
        const itemTotalAmount = taxableAmount + cgstAmount + sgstAmount + igstAmount;

        totalQty += qty;
        totalTaxableSum += taxableAmount;
        totalCgst += cgstAmount;
        totalSgst += sgstAmount;
        totalIgst += igstAmount;

        return { ...item, qty, rate, amount, taxableAmount: amount, cgstRate, cgstAmount, sgstRate, sgstAmount, igstRate, igstAmount, totalAmount: itemTotalAmount };
    });

    const freight = Number(freightAmount) || 0;
    const defaultFreightGstRate = processedItems.length ? (Number(processedItems[0].gstRate) || 18) : 18;
    const resolvedFreightGstRate = effectiveGstApplicable && freight > 0
        ? (Number(freightGstRate) || defaultFreightGstRate)
        : 0;

    if (effectiveGstApplicable && freight > 0 && resolvedFreightGstRate > 0) {
        if (isIGST) {
            totalIgst += Math.round(freight * resolvedFreightGstRate / 100 * 100) / 100;
        } else {
            totalCgst += Math.round(freight * (resolvedFreightGstRate / 2) / 100 * 100) / 100;
            totalSgst += Math.round(freight * (resolvedFreightGstRate / 2) / 100 * 100) / 100;
        }
    }

    const totalTaxableAmount = Math.round((totalTaxableSum + freight) * 100) / 100;
    const totalGst = Math.round((totalCgst + totalSgst + totalIgst) * 100) / 100;
    const grandTotal = Math.round((totalTaxableAmount + totalGst) * 100) / 100;
    const roundedTotal = Math.round(grandTotal);
    const roundOff = Math.round((roundedTotal - grandTotal) * 100) / 100;

    return {
        processedItems,
        totalQty,
        totalAmount: totalTaxableSum,
        totalTaxableAmount,
        totalCgst,
        totalSgst,
        totalIgst,
        totalGst,
        resolvedFreightGstRate,
        grandTotal,
        roundedTotal,
        roundOff,
    };
};

// ------- CREATE SALES ORDER -------
export const createSO = asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body.customerName) throw new ApiError(httpStatus.BAD_REQUEST, 'Customer name is required');
    if (!body.items || body.items.length === 0) throw new ApiError(httpStatus.BAD_REQUEST, 'At least one item is required');
    if (!body.seriesId) throw new ApiError(httpStatus.BAD_REQUEST, 'Invoice series is required');

    // Get SO number from series
    const fy = body.financialYear || getFYFromDate(body.soDate || new Date());

    const numbering = await getNextNumberFromSeries(SalesOrder, body.seriesId, fy, null, 'soNumber');
    if (!numbering) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid or inactive series');
    let soNumber = numbering.displayInvoiceNumber;
    const sequenceNumber = numbering.sequenceNumber;
    const series = await InvoiceSeries.findById(body.seriesId);
    const gstApplicable = series.gstApplicable === false ? false : true;
    const seriesName = series?.seriesName || body.seriesName || '';

    // Defensive: ensure soNumber is a string and not overwritten by body
    if (typeof soNumber !== 'string') {
        soNumber = String(soNumber?.displayInvoiceNumber || soNumber || '');
    }

    const {
        processedItems, totalQty, totalAmount, totalTaxableAmount, totalCgst, totalSgst, totalIgst, totalGst,
        resolvedFreightGstRate, grandTotal, roundedTotal, roundOff,
    } = calcTotals(body.items, body.freightAmount, body.freightGstRate, body.gstType, gstApplicable);

    // Pull sticker type from customer master
    let stickerType = body.stickerType || '';
    if (!stickerType && body.customerId) {
        try {
            const customer = await Customer.findById(body.customerId).populate('stickers');
            if (customer && customer.stickers && customer.stickers.length > 0) {
                stickerType = customer.stickers[0].name;
            }
        } catch (e) {
            console.error('Error fetching customer stickers for SO:', e);
        }
    }

    const soData = {
        ...body,
        soNumber: String(soNumber),
        seriesId: body.seriesId || null,
        seriesName,
        sequenceNumber,
        gstApplicable,
        stickerType,
        customerCode: body.customerCode || '',
        items: processedItems,
        totalQty,
        totalAmount,
        totalTaxableAmount,
        freightGstRate: resolvedFreightGstRate,
        totalCgst,
        totalSgst,
        totalIgst,
        totalGst,
        grandTotal,
        roundedTotal,
        roundOff,
        amountInWords: numWords(roundedTotal),
        financialYear: fy,
        createdBy: req.user.id,
    };

    // Map Referral Details if present
    if (body.referralDetails) {
        soData.salespersonId = body.referralDetails.salespersonId || null;
        soData.distributorId = body.referralDetails.distributorId || null;
        soData.referralSource = body.referralDetails.sourceType || '';
        soData.incentiveApplicable = body.referralDetails.incentiveApplicable || false;
        soData.incentiveType = body.referralDetails.incentiveType || '';
        soData.incentiveValue = body.referralDetails.incentiveValue || 0;
        
        // Calculate incentive amount (snapshot)
        if (soData.incentiveApplicable && soData.incentiveType === 'Percentage of sales') {
            const taxable = Number(totalAmount) || 0;
            soData.incentiveAmount = Number(((taxable * soData.incentiveValue) / 100).toFixed(2));
        } else if (soData.incentiveApplicable && soData.incentiveType === 'Fixed amount per document') {
            soData.incentiveAmount = Number(soData.incentiveValue) || 0;
        }
    }

    const so = await SalesOrder.create(soData);

    await AuditLog.create({
        user: req.user.id,
        action: 'CREATE',
        module: 'SalesOrder',
        resourceId: so._id,
        description: `Created Sales Order ${so.soNumber}`,
        details: { new: body },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
    });

    res.status(httpStatus.CREATED).json({ success: true, data: so });
});

// ------- LIST SALES ORDERS -------
export const getSOs = asyncHandler(async (req, res) => {
    const { search, status, dateFrom, dateTo, limit = 50, page = 1, includeDeleted, view } = req.query;
    const filter = { isDeleted: { $ne: true } };
    
    if (view === 'archived') {
        filter.isDeleted = true;
    } else if (view === 'all' || includeDeleted === 'true') {
        delete filter.isDeleted;
    }

    if (status) filter.status = status;
    if (req.query.financialYear) filter.financialYear = req.query.financialYear;
    if (search) filter.$or = [
        { soNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customerPO: { $regex: search, $options: 'i' } },
    ];
    if (dateFrom || dateTo) {
        filter.soDate = {};
        if (dateFrom) filter.soDate.$gte = new Date(dateFrom);
        if (dateTo) filter.soDate.$lte = new Date(dateTo);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [salesOrders, total] = await Promise.all([
        SalesOrder.find(filter).populate('createdBy', 'name mobile').sort({ soDate: -1 }).skip(skip).limit(Number(limit)),
        SalesOrder.countDocuments(filter),
    ]);

    res.json({ success: true, salesOrders, total, page: Number(page), limit: Number(limit) });
});

// ------- GET SINGLE SO -------
export const getSOById = asyncHandler(async (req, res) => {
    const so = await SalesOrder.findById(req.params.id)
        .populate('createdBy', 'name mobile')
        .lean();
    if (!so) throw new ApiError(httpStatus.NOT_FOUND, 'Sales Order not found');

    if (so.seriesId) {
        const series = await InvoiceSeries.findById(so.seriesId)
            .select('seriesName prefix gstApplicable isActive isDefaultForSalesOrder financialYear')
            .lean();
        so.seriesId = series || {
            _id: so.seriesId,
            seriesName: '',
            prefix: '',
            gstApplicable: so.gstApplicable !== false,
        };
    } else if (so.soNumber || so.seriesName) {
        // Legacy rows: resolve series from snapshot name or order-number prefix
        const allSeries = await InvoiceSeries.find({})
            .select('seriesName prefix gstApplicable isActive financialYear')
            .lean();
        const num = String(so.soNumber || '');
        let matched = allSeries
            .filter(s => s.prefix && num.startsWith(s.prefix))
            .sort((a, b) => (b.prefix.length || 0) - (a.prefix.length || 0))[0];
        if (!matched && so.seriesName) {
            const snap = String(so.seriesName).trim().toLowerCase();
            matched = allSeries.find(s => String(s.seriesName || '').trim().toLowerCase() === snap);
        }
        if (matched) so.seriesId = matched;
    }

    so.billingState = await getSalesOrderBillingSnapshot(so);

    res.json({ success: true, data: so });
});

/**
 * Confirm & create Tax Invoice from Sales Order (remaining qty).
 * Does not create on GET / preview — only this POST after user confirmation.
 */
export const createTaxInvoiceFromSalesOrder = asyncHandler(async (req, res, next) => {
    if (!checkUserPermission(req.user, 'sales.sales_invoices.add')) {
        throw new ApiError(httpStatus.FORBIDDEN, 'Permission denied: sales.sales_invoices.add required');
    }

    const soId = req.params.id;
    const soDoc = await SalesOrder.findById(soId);
    if (!soDoc) throw new ApiError(httpStatus.NOT_FOUND, 'Sales Order not found');
    if (soDoc.isDeleted === true) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Sales Order is deleted and cannot be invoiced');
    }

    const soPrepared = await prepareSalesOrderForInvoiceCreation(soId);
    const billing = await getSalesOrderBillingSnapshot(soPrepared);

    if (!soPrepared.customerId && !soPrepared.customerName) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Sales Order is missing a customer');
    }
    if (!soPrepared.items?.length) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Sales Order has no valid item lines');
    }

    const { seriesId, invoiceDate, idempotencyKey } = req.body || {};
    if (!seriesId) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'No valid Tax Invoice series is configured. Set a default Tax Invoice series in Series Master, or select a series.'
        );
    }

    const series = await InvoiceSeries.findById(seriesId);
    if (!series || series.isActive === false) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Selected Tax Invoice series is missing or inactive');
    }
    if (series.isEstimate === true || series.documentType === 'Estimate') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot create a Tax Invoice using an Estimate series');
    }

    const gstApplicable = soPrepared.gstApplicable !== false && series.gstApplicable !== false;
    const isIGST = soPrepared.gstType === 'IGST';
    const lineById = new Map((billing.lines || []).map((l) => [String(l.lineId), l]));

    const items = [];
    for (const i of soPrepared.items || []) {
        const line = lineById.get(String(i._id));
        const qty = line ? Number(line.remainingQty) : Number(i.qty) || 0;
        if (qty <= 0.0001) continue;
        const rate = Number(i.rate) || 0;
        const gstRate = gstApplicable ? (Number(i.gstRate) || 18) : 0;
        const taxable = qty * rate;
        const cgstAmt = gstApplicable && !isIGST ? Math.round(taxable * gstRate / 2 / 100 * 100) / 100 : 0;
        const igstAmt = gstApplicable && isIGST ? Math.round(taxable * gstRate / 100 * 100) / 100 : 0;
        items.push({
            itemId: i.itemId || null,
            itemCode: i.itemCode || '',
            itemName: i.itemName || '',
            modelNo: i.modelNo || '',
            description: i.description || i.itemName || '',
            additionalNotes: i.additionalNotes || '',
            hsnCode: i.hsnCode || '',
            uom: i.uom || 'NOS',
            qty,
            rate,
            saleType: i.saleType || 'MANUFACTURED_SALE',
            gstRate,
            discountPercent: 0,
            discountAmount: 0,
            taxableAmount: taxable,
            cgstRate: isIGST ? 0 : gstRate / 2,
            cgstAmount: cgstAmt,
            sgstRate: isIGST ? 0 : gstRate / 2,
            sgstAmount: cgstAmt,
            igstRate: isIGST ? gstRate : 0,
            igstAmount: igstAmt,
            totalAmount: taxable + (isIGST ? igstAmt : cgstAmt * 2),
        });
    }

    if (!items.length) {
        const existing = billing.activeInvoices?.[0] || null;
        const err = new ApiError(
            httpStatus.CONFLICT,
            'A Tax Invoice has already been created from this Sales Order.'
        );
        err.data = {
            code: 'SO_ALREADY_INVOICED',
            existingInvoice: existing,
            activeInvoices: billing.activeInvoices || [],
        };
        throw err;
    }

    const invDate = invoiceDate ? new Date(invoiceDate) : new Date();
    const fy = soPrepared.financialYear || getFYFromDate(invDate);

    req.body = {
        soId: String(soPrepared._id),
        soNumber: soPrepared.soNumber,
        seriesId: String(seriesId),
        invoiceDate: invDate.toISOString().slice(0, 10),
        financialYear: fy,
        customerId: soPrepared.customerId || '',
        customerName: soPrepared.customerName || '',
        customerGstin: soPrepared.customerGstin || '',
        customerPhone: soPrepared.customerPhone || '',
        billingAddress: soPrepared.billingAddress || '',
        billingState: soPrepared.customerState || '',
        billingStateCode: soPrepared.customerStateCode || '',
        shippingAddress: soPrepared.shippingAddress || '',
        gstType: soPrepared.gstType || 'CGST / SGST',
        gstApplicable,
        buyerOrderNo: soPrepared.customerPO || '',
        buyerOrderDate: soPrepared.customerPODate
            ? new Date(soPrepared.customerPODate).toISOString().slice(0, 10)
            : '',
        paymentType: soPrepared.paymentType || 'Credit',
        remarks: soPrepared.remarks || '',
        freightAmount: soPrepared.freightAmount || 0,
        freightGstRate: soPrepared.freightGstRate || 0,
        referralDetails: soPrepared.referralDetails || undefined,
        items,
        status: 'Confirmed',
        idempotencyKey: idempotencyKey || req.headers['idempotency-key'] || null,
    };

    const { createSalesInvoice } = await import('./salesInvoice.controller.js');
    return createSalesInvoice(req, res, next);
});

// ------- UPDATE SO -------
export const updateSO = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const so = await SalesOrder.findById(req.params.id).session(session);
        if (!so) throw new ApiError(httpStatus.NOT_FOUND, 'Sales Order not found');
        await assertSalesOrderCanBeUpdated(so, session);

        const body = req.body;
        const changes = {};

        // Series change (Draft / Confirmed, no invoice): assign next number from new series
        if (body.seriesId && String(body.seriesId) !== String(so.seriesId || '')) {
            const canChangeSeries = ['Draft', 'Confirmed'].includes(so.status) && !so.invoiceId;
            if (!canChangeSeries) {
                throw new ApiError(httpStatus.BAD_REQUEST, 'Invoice series can only be changed for Draft or Confirmed orders that are not yet invoiced');
            }
            const fy = so.financialYear || getFYFromDate(so.soDate || new Date());
            const numbering = await getNextNumberFromSeries(SalesOrder, body.seriesId, fy, session, 'soNumber');
            if (!numbering) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid or inactive series');
            const series = await InvoiceSeries.findById(body.seriesId).session(session);
            const gstApplicable = series?.gstApplicable === false ? false : true;
            changes.seriesId = { old: so.seriesId, new: body.seriesId };
            changes.soNumber = { old: so.soNumber, new: numbering.displayInvoiceNumber };
            so.seriesId = body.seriesId;
            so.seriesName = series?.seriesName || '';
            so.soNumber = numbering.displayInvoiceNumber;
            so.sequenceNumber = numbering.sequenceNumber;
            so.gstApplicable = gstApplicable;
        }

        for (const [key, newValue] of Object.entries(body)) {
            if (['items', '_id', 'soNumber', 'seriesId', 'sequenceNumber', 'gstApplicable', 'createdBy', 'createdAt', 'updatedAt', '__v'].includes(key)) continue;
            
            if (JSON.stringify(so[key]) !== JSON.stringify(newValue)) {
                changes[key] = { old: so[key], new: newValue };
                so[key] = newValue;
            }
        }

        const itemsInput = body.items || so.items;
        const needsRecalc = body.items
            || body.freightAmount !== undefined
            || body.freightGstRate !== undefined
            || body.gstType !== undefined
            || changes.seriesId;

        if (needsRecalc) {
            if (body.items) changes.items = { old: 'Previous Items', new: 'Updated Items' };
            const {
                processedItems, totalQty, totalAmount, totalTaxableAmount, totalCgst, totalSgst, totalIgst, totalGst,
                resolvedFreightGstRate, grandTotal, roundedTotal, roundOff,
            } = calcTotals(
                itemsInput,
                body.freightAmount !== undefined ? body.freightAmount : so.freightAmount,
                body.freightGstRate !== undefined ? body.freightGstRate : so.freightGstRate,
                body.gstType !== undefined ? body.gstType : so.gstType,
                so.gstApplicable,
            );
            so.items = processedItems;
            so.totalQty = totalQty;
            so.totalAmount = totalAmount;
            so.totalTaxableAmount = totalTaxableAmount;
            so.freightGstRate = resolvedFreightGstRate;
            so.totalCgst = totalCgst;
            so.totalSgst = totalSgst;
            so.totalIgst = totalIgst;
            so.totalGst = totalGst;
            so.grandTotal = grandTotal;
            so.roundedTotal = roundedTotal;
            so.roundOff = roundOff;
            so.amountInWords = numWords(roundedTotal);
        }

        if (body.customerId && (body.customerId !== String(so.customerId) || !so.stickerType)) {
            const customer = await Customer.findById(body.customerId).populate('stickers').session(session);
            if (customer && customer.stickers && customer.stickers.length > 0) {
                so.stickerType = customer.stickers[0].name;
            }
        }

        if (Object.keys(changes).length > 0) {
            so.updatedBy = req.user.id;
            await so.save({ session });
            
            await AuditLog.create([{
                user: req.user.id,
                action: 'UPDATE',
                module: 'SalesOrder',
                resourceId: so._id,
                description: `Updated Sales Order ${so.soNumber}`,
                details: changes,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            }], { session });
        }

        await session.commitTransaction();
        session.endSession();
        res.json({ success: true, data: so });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
    }
});

// ------- GENERATE PRODUCTION SHEET -------
export const generateProductionSheet = asyncHandler(async (req, res) => {
    const so = await SalesOrder.findById(req.params.id);
    if (!so) throw new ApiError(httpStatus.NOT_FOUND, 'Sales Order not found');

    if (so.productionSheetId) {
        const existing = await ProductionSheet.findById(so.productionSheetId);
        if (existing) return res.json({ success: true, data: existing, message: 'Production sheet already exists' });
    }

    // Pull sticker type from Sales Order or Customer Master
    let stickerType = so.stickerType || '';
    if (!stickerType) {
        try {
            const customer = await Customer.findOne({ customerCode: so.customerCode }).populate('stickers');
            if (customer && customer.stickers && customer.stickers.length > 0) {
                stickerType = customer.stickers[0].name;
            }
        } catch (e) {
            console.error('Error fetching customer stickers:', e);
        }
    }

    const year = new Date().getFullYear();
    const last = await ProductionSheet.findOne({ psNumber: { $regex: `^PS-${year}-` } }).sort({ psNumber: -1 });
    let psNumber;
    if (!last) {
        psNumber = `PS-${year}-00001`;
    } else {
        const parts = last.psNumber.split('-');
        psNumber = `PS-${year}-${String(parseInt(parts[parts.length - 1]) + 1).padStart(5, '0')}`;
    }

    const fy = getFYFromDate(new Date());

    const psItems = so.items.map((item, i) => ({
        srNo: i + 1,
        itemCode: item.itemCode || '',
        modelNo: item.modelNo || item.itemName || '',
        notes: item.additionalNotes || '',
        voltCurrent: item.additionalNotes || '',
        qty: item.qty,
        hours: '',
        dummyLoad: '',
        hsnCode: item.hsnCode || '',
    }));

    const ps = await ProductionSheet.create({
        soId: so._id,
        soNumber: so.soNumber,
        psNumber,
        customerName: so.customerName,
        customerCode: so.customerCode || '',
        customerAddress: so.shippingAddress || so.billingAddress,
        deliveryDate: so.deliveryDate,
        orderCategory: so.orderCategory,
        warrantyDetails: so.warrantyDetails || '',
        orderDate: so.soDate,
        stickerType,
        notes: so.remarks || '',
        modelNo: so.items.map(i => [i.itemCode, i.modelNo || i.itemName].filter(Boolean).join(' - ')).join(', ') || '',
        items: psItems,
        status: 'Pending',
        financialYear: fy,
        createdBy: req.user.id,
    });

    so.productionSheetId = ps._id;
    await so.save();

    res.status(httpStatus.CREATED).json({ success: true, data: ps, message: 'Production sheet generated!' });
});

// ------- CANCEL SO -------
export const cancelSO = asyncHandler(async (req, res) => {
    const so = await SalesOrder.findById(req.params.id);
    if (!so) throw new ApiError(httpStatus.NOT_FOUND, 'Sales Order not found');

    const isAdmin = ['admin', 'superadmin'].includes(req.user.roleName);
    if (!isAdmin) {
        throw new ApiError(httpStatus.FORBIDDEN, 'Only Admins can cancel Sales Orders');
    }
    if (so.status !== 'Draft') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Submitted Sales Order cannot be cancelled.');
    }

    so.status = 'Cancelled';
    so.updatedBy = req.user.id;
    await so.save();

    await AuditLog.create({
        user: req.user.id,
        action: 'CANCEL',
        module: 'SalesOrder',
        resourceId: so._id,
        description: `Cancelled Sales Order ${so.soNumber}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
    });

    res.json({ success: true, data: so });
});

// ------- DELETE SO -------
export const deleteSO = asyncHandler(async (req, res) => {
    const so = await SalesOrder.findById(req.params.id);
    if (!so) throw new ApiError(httpStatus.NOT_FOUND, 'Sales Order not found');
    
    // Restriction: Cannot delete if invoiced or closed
    if (so.status === 'Invoiced' || so.status === 'Closed' || so.status === 'Completed') {
        throw new ApiError(httpStatus.BAD_REQUEST, `Cannot archive Sales Order ${so.soNumber} because it is already ${so.status}. Please cancel or archive the linked transactions first.`);
    }
    
    so.isDeleted = true;
    so.deletedAt = new Date();
    so.deletedBy = req.user.id;
    so.deleteReason = req.body.reason || 'Soft deleted';
    await so.save();

    await AuditLog.create({
        user: req.user.id,
        action: 'DELETE',
        module: 'SalesOrder',
        resourceId: so._id,
        description: `Soft Deleted Sales Order ${so.soNumber}`,
        details: { reason: so.deleteReason },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Sales Order soft-deleted successfully', data: so });
});

// ------- RESTORE SO -------
export const restoreSO = asyncHandler(async (req, res) => {
    const so = await SalesOrder.findById(req.params.id);
    if (!so) throw new ApiError(httpStatus.NOT_FOUND, 'Sales Order not found');

    const isAdmin = ['admin', 'superadmin'].includes(req.user.roleName);

    // Case 1: Restore if soft-deleted
    if (so.isDeleted) {
        so.isDeleted = false;
        so.deletedAt = null;
        so.deletedBy = null;
        so.deleteReason = '';
    } 
    // Case 2: Restore if Cancelled (Admin only)
    else if (so.status === 'Cancelled') {
        if (!isAdmin) {
            throw new ApiError(httpStatus.FORBIDDEN, 'Only Admins can restore cancelled sales orders');
        }
        so.status = 'Confirmed';
    } 
    else {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Sales Order is neither deleted nor cancelled');
    }

    so.updatedBy = req.user.id;
    await so.save();

    await AuditLog.create({
        user: req.user.id,
        action: 'REOPEN',
        module: 'SalesOrder',
        resourceId: so._id,
        description: `Restored Sales Order ${so.soNumber} from ${so.status === 'Cancelled' ? 'Cancelled' : 'Deleted'} state`,
        details: { reason: req.body.reason || 'Restored by user' },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Sales Order restored successfully', data: so });
});

