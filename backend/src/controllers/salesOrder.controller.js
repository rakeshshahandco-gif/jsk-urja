import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { SalesOrder } from '../models/salesOrder.model.js';
import { ProductionSheet } from '../models/productionSheet.model.js';
import Customer from '../models/customer.model.js';

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

const genSONumber = async () => {
    const year = new Date().getFullYear();
    const last = await SalesOrder.findOne({ soNumber: { $regex: `^SO-${year}-` } }).sort({ soNumber: -1 });
    if (!last) return `SO-${year}-00001`;
    const parts = last.soNumber.split('-');
    const next = parseInt(parts[parts.length - 1], 10) + 1;
    return `SO-${year}-${String(next).padStart(5, '0')}`;
};

const calcTotals = (items, freightAmount = 0, freightGstRate = 0, gstType = '') => {
    let totalQty = 0, totalTaxableSum = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
    const isIGST = gstType === 'IGST';

    const processedItems = items.map(item => {
        const qty = Number(item.qty) || 0;
        const rate = Number(item.rate) || 0;
        const amount = qty * rate;
        const gstRate = Number(item.gstRate) || 18;
        const taxableAmount = amount;

        let cgstRate = 0, cgstAmount = 0, sgstRate = 0, sgstAmount = 0, igstRate = 0, igstAmount = 0;
        if (isIGST) {
            igstRate = gstRate;
            igstAmount = Math.round(taxableAmount * igstRate / 100 * 100) / 100;
        } else {
            cgstRate = gstRate / 2;
            sgstRate = gstRate / 2;
            cgstAmount = Math.round(taxableAmount * cgstRate / 100 * 100) / 100;
            sgstAmount = Math.round(taxableAmount * sgstRate / 100 * 100) / 100;
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
    const freightGst = freight > 0 && freightGstRate > 0 ? Math.round(freight * freightGstRate / 100 * 100) / 100 : 0;
    const totalGst = totalCgst + totalSgst + totalIgst + freightGst;
    const grandTotal = totalTaxableSum + totalGst + freight;
    const roundedTotal = Math.round(grandTotal);
    const roundOff = Math.round((roundedTotal - grandTotal) * 100) / 100;

    return { processedItems, totalQty, totalAmount: totalTaxableSum, totalCgst, totalSgst, totalIgst, totalGst, grandTotal, roundedTotal, roundOff };
};

// ------- CREATE SALES ORDER -------
export const createSO = asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body.customerName) throw new ApiError(httpStatus.BAD_REQUEST, 'Customer name is required');
    if (!body.items || body.items.length === 0) throw new ApiError(httpStatus.BAD_REQUEST, 'At least one item is required');

    const soNumber = await genSONumber();
    const { processedItems, totalQty, totalAmount, totalCgst, totalSgst, totalIgst, totalGst, grandTotal, roundedTotal, roundOff } = calcTotals(
        body.items, body.freightAmount, body.freightGstRate, body.gstType
    );

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

    const so = await SalesOrder.create({
        ...body,
        soNumber,
        stickerType,
        customerCode: body.customerCode || '', // Expecting frontend to pass this if available
        items: processedItems,
        totalQty,
        totalAmount,
        totalCgst,
        totalSgst,
        totalIgst,
        totalGst,
        grandTotal,
        roundedTotal,
        roundOff,
        amountInWords: numWords(roundedTotal),
        createdBy: req.user.id,
    });

    res.status(httpStatus.CREATED).json({ success: true, data: so });
});

// ------- LIST SALES ORDERS -------
export const getSOs = asyncHandler(async (req, res) => {
    const { search, status, dateFrom, dateTo, limit = 50, page = 1 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (search) filter.$or = [
        { soNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
    ];
    if (dateFrom || dateTo) {
        filter.soDate = {};
        if (dateFrom) filter.soDate.$gte = new Date(dateFrom);
        if (dateTo) filter.soDate.$lte = new Date(dateTo);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [salesOrders, total] = await Promise.all([
        SalesOrder.find(filter).sort({ soDate: -1 }).skip(skip).limit(Number(limit)),
        SalesOrder.countDocuments(filter),
    ]);

    res.json({ success: true, salesOrders, total, page: Number(page), limit: Number(limit) });
});

// ------- GET SINGLE SO -------
export const getSOById = asyncHandler(async (req, res) => {
    const so = await SalesOrder.findById(req.params.id);
    if (!so) throw new ApiError(httpStatus.NOT_FOUND, 'Sales Order not found');
    res.json({ success: true, data: so });
});

// ------- UPDATE SO -------
export const updateSO = asyncHandler(async (req, res) => {
    const so = await SalesOrder.findById(req.params.id);
    if (!so) throw new ApiError(httpStatus.NOT_FOUND, 'Sales Order not found');
    if (so.status === 'Cancelled') throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot update a cancelled SO');

    const body = req.body;
    if (body.items) {
        const { processedItems, totalQty, totalAmount, totalCgst, totalSgst, totalIgst, totalGst, grandTotal, roundedTotal, roundOff } = calcTotals(
            body.items, body.freightAmount ?? so.freightAmount, body.freightGstRate ?? so.freightGstRate, body.gstType ?? so.gstType
        );
        body.items = processedItems;
        body.totalQty = totalQty;
        body.totalAmount = totalAmount;
        body.totalCgst = totalCgst; body.totalSgst = totalSgst; body.totalIgst = totalIgst;
        body.totalGst = totalGst;
        body.grandTotal = grandTotal;
        body.roundedTotal = roundedTotal;
        body.roundOff = roundOff;
        body.amountInWords = numWords(roundedTotal);
    }

    // Update stickerType if customer changed or it's missing
    if (body.customerId && (body.customerId !== String(so.customerId) || !so.stickerType)) {
        try {
            const customer = await Customer.findById(body.customerId).populate('stickers');
            if (customer && customer.stickers && customer.stickers.length > 0) {
                body.stickerType = customer.stickers[0].name;
            }
        } catch (e) {
            console.error('Error updating customer stickers for SO:', e);
        }
    }

    Object.assign(so, body);
    so.updatedBy = req.user.id;
    await so.save();
    res.json({ success: true, data: so });
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
        orderDate: so.soDate,
        stickerType,
        notes: so.remarks || '',
        modelNo: so.items.map(i => [i.itemCode, i.modelNo || i.itemName].filter(Boolean).join(' - ')).join(', ') || '',
        items: psItems,
        status: 'Pending',
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
    so.status = 'Cancelled';
    so.updatedBy = req.user.id;
    await so.save();
    res.json({ success: true, data: so });
});
