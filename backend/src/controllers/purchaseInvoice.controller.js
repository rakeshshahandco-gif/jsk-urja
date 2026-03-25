import mongoose from 'mongoose';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { PurchaseOrder } from '../models/purchaseOrder.model.js';
import { GRN } from '../models/grn.model.js';
import { Supplier } from '../models/supplier.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { updateStockForItems } from './grn.controller.js';
import Joi from 'joi';
import { syncPurchaseRatesToBOMs } from '../services/bomPriceSync.service.js';
import { postPurchaseInvoiceToLedger, reverseInvoiceLedgerImpact } from '../utils/ledgerDispatcher.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
const r2 = (n) => Math.round((n || 0) * 100) / 100;

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const numToWords = (num) => {
    if (num === 0) return 'Zero';
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
    if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + numToWords(num % 100) : '');
    if (num < 100000) return numToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numToWords(num % 1000) : '');
    if (num < 10000000) return numToWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + numToWords(num % 100000) : '');
    return numToWords(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + numToWords(num % 10000000) : '');
};
const amountInWords = (amount) => {
    const whole = Math.floor(amount);
    const paise = Math.round((amount - whole) * 100);
    let words = 'Rupees ' + numToWords(whole);
    if (paise > 0) words += ' and ' + numToWords(paise) + ' Paise';
    return words + ' Only';
};

const generateInvoiceNumber = async () => {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const prefix = `PI-${year}${month}-`;
    const lastInv = await PurchaseInvoice.findOne({ invoiceNumber: new RegExp(`^${prefix}`) }).sort({ invoiceNumber: -1 });
    if (!lastInv) {
        return `${prefix}0001`;
    }
    const lastNumber = parseInt(lastInv.invoiceNumber.replace(prefix, ''), 10) || 0;
    return `${prefix}${String(lastNumber + 1).padStart(4, '0')}`;
};

const rollbackSideEffects = async (inv, userId, session) => {
    const { flowType, items, isDirectPurchase } = inv;

    // 1) Rollback GRN side effects
    if (inv.grnId) {
        const grn = await GRN.findById(inv.grnId).session(session);
        if (grn) {
            for (const invItem of items) {
                const grnItem = grn.items.find(gi => gi.itemId.toString() === invItem.itemId.toString());
                if (grnItem) {
                    grnItem.invoicedQty = r2(grnItem.invoicedQty - invItem.qty);
                }
            }
            const allInvoiced = grn.items.every(gi => gi.invoicedQty >= gi.receivedQty);
            const someInvoiced = grn.items.some(gi => gi.invoicedQty > 0);
            grn.invoiceStatus = allInvoiced ? 'Fully Invoiced' : (someInvoiced ? 'Partially Invoiced' : 'Pending');
            grn.updatedBy = userId;
            await grn.save({ session });
        }
    }

    // 2) Rollback PO side effects
    if (inv.poId) {
        const po = await PurchaseOrder.findById(inv.poId).session(session);
        if (po) {
            for (const invItem of items) {
                const poItem = po.items.find(pi => pi.itemId.toString() === invItem.itemId.toString());
                if (poItem) {
                    poItem.invoicedQty = r2((poItem.invoicedQty || 0) - invItem.qty);
                    if (flowType === 'PO→Direct Invoice') {
                        poItem.receivedQty = r2(poItem.receivedQty - invItem.qty);
                        poItem.pendingQty = r2(poItem.orderedQty - poItem.receivedQty);
                    }
                }
            }
            if (flowType === 'PO→Direct Invoice') {
                const allReceived = po.items.every(pi => pi.pendingQty <= 0);
                const someReceived = po.items.some(pi => pi.receivedQty > 0);
                po.status = allReceived ? 'Fully Received' : (someReceived ? 'Partially Received' : 'Ordered');
            }
            po.updatedBy = userId;
            await po.save({ session });
        }
    }

    // 3) Rollback Stock if Direct Purchase
    if (isDirectPurchase) {
        const stockItems = items.map(i => ({
            itemId: i.itemId,
            itemCode: i.itemCode || '',
            itemName: i.itemName,
            receivedQty: -(i.qty || 0),
            rate: i.rate || 0,
            warehouse: '',
        }));
        await updateStockForItems(stockItems, inv.invoiceNumber, inv._id, 'PURCHASE_INVOICE_DELETE', userId, session);
    }

    // 4) Reverse financial impacts
    await reverseInvoiceLedgerImpact(inv.invoiceNumber, session);
}

const calculateInvoiceTotals = (items, gstType, freightAmount = 0, freightGstRate = 0) => {
    let subTotal = 0, totalDiscount = 0, totalTaxable = 0;
    let totalCgst = 0, totalSgst = 0, totalIgst = 0;
    const isIGST = gstType === 'IGST';

    items.forEach(item => {
        const gross = r2(item.qty * item.rate);
        const discAmt = r2(gross * (item.discountPercent || 0) / 100);
        const taxable = r2(gross - discAmt);
        const gstRate = item.gstRate || 0;

        let cgstRate = 0, sgstRate = 0, igstRate = 0;
        let cgstAmt = 0, sgstAmt = 0, igstAmt = 0;
        if (isIGST) {
            igstRate = gstRate;
            igstAmt = r2(taxable * igstRate / 100);
        } else {
            cgstRate = gstRate / 2;
            sgstRate = gstRate / 2;
            cgstAmt = r2(taxable * cgstRate / 100);
            sgstAmt = r2(taxable * sgstRate / 100);
        }
        const lineTotal = r2(taxable + cgstAmt + sgstAmt + igstAmt);

        item.taxableAmount = taxable;
        item.discountAmount = discAmt;
        item.cgstRate = cgstRate; item.cgstAmount = cgstAmt;
        item.sgstRate = sgstRate; item.sgstAmount = sgstAmt;
        item.igstRate = igstRate; item.igstAmount = igstAmt;
        item.totalAmount = lineTotal;

        subTotal += gross;
        totalDiscount += discAmt;
        totalTaxable += taxable;
        totalCgst += cgstAmt;
        totalSgst += sgstAmt;
        totalIgst += igstAmt;
    });

    let freightCgstRate = 0, freightSgstRate = 0, freightIgstRate = 0;
    let freightCgstAmt = 0, freightSgstAmt = 0, freightIgstAmt = 0;
    if (freightAmount > 0 && freightGstRate > 0) {
        if (isIGST) {
            freightIgstRate = freightGstRate;
            freightIgstAmt = r2(freightAmount * freightGstRate / 100);
            totalIgst += freightIgstAmt;
        } else {
            freightCgstRate = freightGstRate / 2;
            freightSgstRate = freightGstRate / 2;
            freightCgstAmt = r2(freightAmount * freightCgstRate / 100);
            freightSgstAmt = r2(freightAmount * freightSgstRate / 100);
            totalCgst += freightCgstAmt;
            totalSgst += freightSgstAmt;
        }
    }
    const freightTotalGst = r2(freightCgstAmt + freightSgstAmt + freightIgstAmt);

    const grossTax = r2(totalCgst + totalSgst + totalIgst);
    const rawTotal = r2(totalTaxable + grossTax + freightAmount);
    const roundOff = r2(Math.round(rawTotal) - rawTotal);
    const grandTotal = r2(rawTotal + roundOff);

    return {
        subTotal: r2(subTotal), totalDiscount: r2(totalDiscount),
        totalTaxableAmount: r2(totalTaxable), totalCgst: r2(totalCgst),
        totalSgst: r2(totalSgst), totalIgst: r2(totalIgst), totalTax: grossTax,
        freightCgstRate, freightCgstAmount: freightCgstAmt,
        freightSgstRate, freightSgstAmount: freightSgstAmt,
        freightIgstRate, freightIgstAmount: freightIgstAmt,
        freightTotalGst,
        roundOff, grandTotal, amountInWords: amountInWords(grandTotal),
    };
};

const piItemJoi = Joi.object({
    itemId: Joi.string().required(),
    itemCode: Joi.string().optional().allow(''),
    itemName: Joi.string().required(),
    description: Joi.string().optional().allow(''),
    hsnCode: Joi.string().optional().allow(''),
    uom: Joi.string().optional().allow(''),
    qty: Joi.number().min(0).required(),
    rate: Joi.number().min(0).required(),
    gstRate: Joi.number().min(0).default(18),
    discountPercent: Joi.number().min(0).max(100).default(0),
    grnItemId: Joi.string().optional().allow('', null),
    poItemId: Joi.string().optional().allow('', null),
});

const createPISchema = Joi.object({
    flowType: Joi.string().valid('PO→GRN→Invoice', 'PO→Direct Invoice', 'Direct GRN→Invoice', 'Direct Invoice').required(),
    supplierId: Joi.string().required(),
    invoiceDate: Joi.date().optional().allow(null, ''),
    supplierInvoiceNo: Joi.string().optional().allow(''),
    supplierGstin: Joi.string().optional().allow(''),
    supplierAddress: Joi.string().optional().allow(''),
    supplierState: Joi.string().optional().allow(''),
    supplierStateCode: Joi.string().optional().allow(''),
    buyerName: Joi.string().optional().allow(''),
    buyerGstin: Joi.string().optional().allow(''),
    buyerAddress: Joi.string().optional().allow(''),
    buyerState: Joi.string().optional().allow(''),
    buyerStateCode: Joi.string().optional().allow(''),
    gstType: Joi.string().valid('CGST / SGST', 'IGST').default('CGST / SGST'),
    placeOfSupply: Joi.string().optional().allow(''),
    reverseCharge: Joi.boolean().default(false),
    irnNumber: Joi.string().optional().allow(''),
    paymentTerms: Joi.string().optional().allow(''),
    dueDate: Joi.date().optional().allow(null, ''),
    remarks: Joi.string().optional().allow(''),
    poId: Joi.string().optional().allow('', null),
    poNumber: Joi.string().optional().allow(''),
    grnId: Joi.string().optional().allow('', null),
    poDate: Joi.any().optional().allow('', null, '—', 'null', 'undefined'),
    transporterName: Joi.string().optional().allow(''),
    vehicleNo: Joi.string().optional().allow(''),
    lrNumber: Joi.string().optional().allow(''),
    freightAmount: Joi.number().min(0).default(0),
    freightGstRate: Joi.number().valid(0, 5, 12, 18).default(0),
    items: Joi.array().items(piItemJoi).min(1).required(),
});

const parseDate = (val) => {
    if (!val || val === '' || val === '—' || val === 'null' || val === 'undefined') return null;
    try {
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
    } catch (e) {
        return null;
    }
};

export const createPurchaseInvoice = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { error, value } = createPISchema.validate(req.body, { allowUnknown: false });
        if (error) throw new ApiError(400, error.details[0].message);

        const { flowType } = value;
        const supplier = await Supplier.findById(value.supplierId).session(session);
        if (!supplier) throw new ApiError(404, 'Supplier not found');

        let po = null, grn = null, poNumber = value.poNumber || '';
        if (flowType === 'PO→GRN→Invoice' || flowType === 'PO→Direct Invoice') {
            if (!value.poId) throw new ApiError(400, 'PO reference is required');
            po = await PurchaseOrder.findById(value.poId).session(session);
            if (!po) throw new ApiError(404, 'PO not found');
            poNumber = po.poNumber;
        }

        if (flowType === 'PO→GRN→Invoice' || flowType === 'Direct GRN→Invoice') {
            if (!value.grnId) throw new ApiError(400, 'GRN reference is required');
            grn = await GRN.findById(value.grnId).session(session);
            if (!grn) throw new ApiError(404, 'GRN not found');
            grnNumber = grn.grnNumber;
        }

        const invoiceNumber = await generateInvoiceNumber();
        const totals = calculateInvoiceTotals(value.items, value.gstType, value.freightAmount || 0, value.freightGstRate || 0);

        const isDirectStock = flowType === 'PO→Direct Invoice' || flowType === 'Direct Invoice';

        const inv = await PurchaseInvoice.create([{
            ...value, invoiceNumber, invoiceDate: value.invoiceDate || new Date(),
            flowType, isDirectPurchase: isDirectStock,
            supplierName: supplier.supplierName,
            supplierGstin: value.supplierGstin || supplier.gstNumber || '',
            supplierAddress: value.supplierAddress || supplier.address || '',
            supplierState: value.supplierState || supplier.state || '',
            poId: po?._id || null, poNumber, grnId: grn?._id || null, grnNumber: grn?.grnNumber || '',
            buyerName: value.buyerName || 'JSK URJA',
            poDate: parseDate(value.poDate) || (po ? po.poDate : null),
            ...totals,
            status: 'Confirmed', paymentStatus: 'Unpaid',
            createdBy: req.user._id,
        }], { session });

        const invoice = inv[0];

        // Stock and Side Effects
        if (grn) {
            let allInvoiced = true;
            for (const invItem of value.items) {
                const grnItem = grn.items.find(gi => gi.itemId.toString() === invItem.itemId.toString());
                if (grnItem) {
                    grnItem.invoicedQty = r2(grnItem.invoicedQty + invItem.qty);
                    if (grnItem.invoicedQty < grnItem.receivedQty) allInvoiced = false;
                }
            }
            grn.invoiceStatus = allInvoiced ? 'Fully Invoiced' : 'Partially Invoiced';
            await grn.save({ session });
        }

        if (po) {
            for (const invItem of value.items) {
                const poItem = po.items.find(pi => pi.itemId.toString() === invItem.itemId.toString());
                if (poItem) {
                    poItem.invoicedQty = r2((poItem.invoicedQty || 0) + invItem.qty);
                    if (flowType === 'PO→Direct Invoice') {
                        poItem.receivedQty = r2(poItem.receivedQty + invItem.qty);
                        poItem.pendingQty = r2(poItem.orderedQty - poItem.receivedQty);
                    }
                }
            }
            await po.save({ session });
        }

        if (isDirectStock) {
            const stockItems = value.items.map(i => ({
                itemId: i.itemId, itemCode: i.itemCode || '', itemName: i.itemName,
                receivedQty: i.qty, rate: i.rate, warehouse: '',
            }));
            await updateStockForItems(stockItems, invoice.invoiceNumber, invoice._id, 'PURCHASE_INVOICE', req.user._id, session);
        }

        // Financial Ledger Posting
        await postPurchaseInvoiceToLedger(invoice, req.user._id, session);

        await session.commitTransaction();
        await syncPurchaseRatesToBOMs(value.items, req.user._id);

        res.status(201).json(new ApiResponse(201, invoice, `Invoice ${invoiceNumber} posted`));

    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

export const getPurchaseInvoices = asyncHandler(async (req, res) => {
    const { supplierId, paymentStatus, status, flowType, search, page = 1, limit = 20 } = req.query;
    const query = {};
    if (supplierId) query.supplierId = supplierId;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (status) query.status = status;
    if (flowType) query.flowType = flowType;
    if (search) query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { supplierName: { $regex: search, $options: 'i' } },
    ];
    const skip = (Number(page) - 1) * Number(limit);
    const total = await PurchaseInvoice.countDocuments(query);
    const invoices = await PurchaseInvoice.find(query).sort({ invoiceDate: -1 }).skip(skip).limit(Number(limit)).populate('supplierId', 'supplierName supplierCode').populate('createdBy', 'name');
    res.json(new ApiResponse(200, { invoices, total, page: Number(page), pages: Math.ceil(total / Number(limit)) }, 'Invoices fetched'));
});

export const getPurchaseInvoiceById = asyncHandler(async (req, res) => {
    const inv = await PurchaseInvoice.findById(req.params.id).populate('supplierId', 'supplierName supplierCode gstNumber address state phone').populate('poId', 'poNumber').populate('grnId', 'grnNumber').populate('createdBy', 'name');
    if (!inv) throw new ApiError(404, 'Purchase Invoice not found');
    res.json(new ApiResponse(200, inv, 'Invoice fetched'));
});

export const cancelPurchaseInvoice = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const inv = await PurchaseInvoice.findById(req.params.id).session(session);
        if (!inv) throw new ApiError(404, 'Invoice not found');
        if (inv.paymentStatus === 'Paid') throw new ApiError(400, 'Cannot cancel a fully paid invoice');
        
        inv.status = 'Cancelled';
        inv.paymentStatus = 'Cancelled';
        inv.updatedBy = req.user._id;
        
        await rollbackSideEffects(inv, req.user._id, session);
        await inv.save({ session });
        
        await session.commitTransaction();
        res.json(new ApiResponse(200, inv, 'Invoice cancelled'));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

export const deletePurchaseInvoice = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const inv = await PurchaseInvoice.findById(req.params.id).session(session);
        if (!inv) throw new ApiError(404, 'Invoice not found');
        if (inv.paymentStatus === 'Paid' || inv.paymentStatus === 'Partially Paid') throw new ApiError(400, 'Cannot delete an invoice with payments.');
        
        await rollbackSideEffects(inv, req.user._id, session);
        await PurchaseInvoice.findByIdAndDelete(req.params.id).session(session);
        
        await session.commitTransaction();
        res.json(new ApiResponse(200, null, 'Purchase Invoice deleted'));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

export const updatePaymentStatus = asyncHandler(async (req, res) => {
    const { paymentStatus, paidAmount } = req.body;
    const inv = await PurchaseInvoice.findById(req.params.id);
    if (!inv) throw new ApiError(404, 'Invoice not found');
    inv.paymentStatus = paymentStatus;
    if (paidAmount !== undefined) inv.paidAmount = paidAmount;
    await inv.save();
    res.json(new ApiResponse(200, inv, 'Payment updated'));
});
