import mongoose from 'mongoose';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { Voucher } from '../models/voucher.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { rollbackStockLedger } from '../utils/stockUtils.js';
import { PurchaseOrder } from '../models/purchaseOrder.model.js';
import { GRN } from '../models/grn.model.js';
import { Supplier } from '../models/supplier.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { updateStockForItems } from './grn.controller.js';
import { AuditLog } from '../models/auditLog.model.js';
import Joi from 'joi';
import { syncPurchaseRatesToBOMs } from '../services/bomPriceSync.service.js';
import { postPurchaseInvoiceToLedger, reverseInvoiceLedgerImpact } from '../utils/ledgerDispatcher.js';
import logger from '../utils/logger.js';
import { getFYFromDate } from '../utils/fyUtils.js';
import { getNextNumberFromSeries } from '../utils/numberingUtils.js';
import { InvoiceSeries } from '../models/invoiceSeries.model.js';

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
    
    // Check both PurchaseInvoice and Voucher collections for the last used number
    const [lastInv, lastVoucher] = await Promise.all([
        PurchaseInvoice.findOne({ invoiceNumber: new RegExp(`^${prefix}`) }).sort({ invoiceNumber: -1 }),
        Voucher.findOne({ voucherNo: new RegExp(`^${prefix}`) }).sort({ voucherNo: -1 })
    ]);

    let lastNumber = 0;
    if (lastInv) {
        lastNumber = Math.max(lastNumber, parseInt(lastInv.invoiceNumber.replace(prefix, ''), 10) || 0);
    }
    if (lastVoucher) {
        lastNumber = Math.max(lastNumber, parseInt(lastVoucher.voucherNo.replace(prefix, ''), 10) || 0);
    }

    return `${prefix}${String(lastNumber + 1).padStart(4, '0')}`;
};

const rollbackSideEffects = async (inv, userId, session) => {
    const { flowType, items } = inv;

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

    // 3) Rollback Stock Ledger (Hard delete and recalculate)
    await rollbackStockLedger(inv._id, session);

    // 4) Reverse financial impacts
    await reverseInvoiceLedgerImpact(inv.invoiceNumber, session);
};

const calculateInvoiceTotals = (items, gstType, freightAmount = 0, freightGstRate = 0) => {
    let subTotal = 0, totalDiscount = 0, totalTaxable = 0;
    let totalCgst = 0, totalSgst = 0, totalIgst = 0;
    const isIGST = gstType === 'IGST';

    const updatedItems = items.map(item => {
        const itemQty = Number(item.qty || 0);
        const itemRate = Number(item.rate || 0);
        const itemDiscPercent = Number(item.discountPercent || 0);
        const itemGstRate = Number(item.gstRate || 0);

        // 1. Calculate Discount Amount if not provided or based on percent
        const discountAmount = item.discountAmount !== undefined ? Number(item.discountAmount) : r2(itemQty * itemRate * itemDiscPercent / 100);
        
        // 2. Line Taxable
        const taxableAmount = r2(itemQty * itemRate - discountAmount);
        
        // 3. Line GST
        let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;
        let cgstRate = 0, sgstRate = 0, igstRate = 0;

        if (isIGST) {
            igstRate = itemGstRate;
            igstAmount = r2(taxableAmount * igstRate / 100);
        } else {
            cgstRate = itemGstRate / 2;
            sgstRate = itemGstRate / 2;
            cgstAmount = r2(taxableAmount * cgstRate / 100);
            sgstAmount = r2(taxableAmount * sgstRate / 100);
        }

        const totalAmount = r2(taxableAmount + cgstAmount + sgstAmount + igstAmount);

        // Accumulate Header Totals
        subTotal += r2(itemQty * itemRate);
        totalDiscount += discountAmount;
        totalTaxable += taxableAmount;
        totalCgst += cgstAmount;
        totalSgst += sgstAmount;
        totalIgst += igstAmount;

        return {
            ...item,
            qty: itemQty,
            rate: itemRate,
            discountAmount,
            taxableAmount,
            cgstRate, cgstAmount,
            sgstRate, sgstAmount,
            igstRate, igstAmount,
            totalAmount
        };
    });

    // Freight GST
    const freightIgstAmt = isIGST ? r2(freightAmount * freightGstRate / 100) : 0;
    const freightCgstAmt = isIGST ? 0 : r2(freightAmount * (freightGstRate / 2) / 100);
    const freightSgstAmt = isIGST ? 0 : r2(freightAmount * (freightGstRate / 2) / 100);

    totalIgst += freightIgstAmt;
    totalCgst += freightCgstAmt;
    totalSgst += freightSgstAmt;

    const totalTax = r2(totalIgst + totalCgst + totalSgst);
    const rawGrandTotal = r2(totalTaxable + totalTax + freightAmount);
    const grandTotal = Math.round(rawGrandTotal);
    const roundOff = r2(grandTotal - rawGrandTotal);

    // Safety Safeguard: If there are items with value, grandTotal should NOT be 0
    if (items.length > 0 && grandTotal === 0) {
        const hasRate = items.some(i => Number(i.rate) > 0 && Number(i.qty) > 0);
        if (hasRate) {
            throw new ApiError(400, 'Calculation failed: Invoice has items with rates but result is ₹0 total. Please verify item GST rates and quantities.');
        }
    }

    return {
        updatedItems,
        subTotal: r2(subTotal),
        totalDiscount: r2(totalDiscount),
        totalTaxableAmount: r2(totalTaxable),
        totalIgst: r2(totalIgst),
        totalCgst: r2(totalCgst),
        totalSgst: r2(totalSgst),
        totalTax: r2(totalTax),
        freightGstRate, 
        freightIgstAmount: freightIgstAmt,
        freightCgstAmount: freightCgstAmt,
        freightSgstAmount: freightSgstAmt,
        freightTotalGst: r2(freightIgstAmt + freightCgstAmt + freightSgstAmt),
        roundOff, 
        grandTotal, 
        amountInWords: amountInWords(grandTotal),
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
    seriesId: Joi.string().optional().allow('', null),
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
        }

        const fy = value.financialYear || getFYFromDate(value.invoiceDate || new Date());

        let invoiceNumber = value.invoiceNumber, sequenceNumber;
        if (!invoiceNumber && value.seriesId) {
            const numbering = await getNextNumberFromSeries(PurchaseInvoice, value.seriesId, fy, session);
            if (numbering) {
                invoiceNumber = numbering.displayInvoiceNumber;
                sequenceNumber = numbering.sequenceNumber;
            }
        }
        
        if (!invoiceNumber) {
            invoiceNumber = await generateInvoiceNumber();
        }

        const totals = calculateInvoiceTotals(value.items, value.gstType, value.freightAmount || 0, value.freightGstRate || 0);
        const { updatedItems, ...headerTotals } = totals;

        const isDirectStock = flowType === 'PO→Direct Invoice' || flowType === 'Direct Invoice';

        const inv = await PurchaseInvoice.create([{
            ...value, 
            items: updatedItems,
            invoiceNumber, sequenceNumber, seriesId: value.seriesId, invoiceDate: value.invoiceDate || new Date(),
            flowType, isDirectPurchase: isDirectStock,
            supplierName: supplier.supplierName,
            supplierGstin: value.supplierGstin || supplier.gstNumber || '',
            supplierAddress: value.supplierAddress || supplier.address || '',
            supplierState: value.supplierState || supplier.state || '',
            poId: po?._id || null, poNumber, grnId: grn?._id || null, grnNumber: grn?.grnNumber || '',
            buyerName: value.buyerName || 'JSK URJA',
            poDate: parseDate(value.poDate) || (po ? po.poDate : null),
            ...headerTotals,
            financialYear: fy,
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
            // Update updateStockForItems to handle FY tagging (internally or by passing fy)
            // For now, let's assume it gets it from the referenceId or we pass it
            await updateStockForItems(stockItems, invoice.invoiceNumber, invoice._id, 'PURCHASE_INVOICE', req.user._id, session, fy);
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
    const { supplierId, paymentStatus, status, flowType, search, page = 1, limit = 20, includeDeleted, view } = req.query;
    const query = { isDeleted: { $ne: true } };
    
    if (view === 'archived') {
        query.isDeleted = true;
    } else if (view === 'all' || includeDeleted === 'true') {
        delete query.isDeleted;
    }

    if (supplierId) query.supplierId = supplierId;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (status) query.status = status;
    if (flowType) query.flowType = flowType;
    if (req.query.financialYear) {
        query.$or = query.$or || [];
        query.$or.push(
            { financialYear: req.query.financialYear },
            { financialYear: { $exists: false } },
            { financialYear: null },
            { financialYear: '' }
        );
    }
    if (search) query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { supplierName: { $regex: search, $options: 'i' } },
    ];
    const skip = (Number(page) - 1) * Number(limit);

    logger.info(`[PurchaseInvoice] Fetching list: search="${search || ''}", status="${status || ''}", includeDeleted=${includeDeleted}`);

    const [total, invoices] = await Promise.all([
        PurchaseInvoice.countDocuments(query),
        PurchaseInvoice.find(query)
            .sort({ invoiceDate: -1 })
            .skip(skip)
            .limit(Number(limit))
            .populate('supplierId', 'supplierName supplierCode')
            .populate('createdBy', 'name')
    ]);

    res.json(new ApiResponse(200, { invoices, total, page: Number(page), pages: Math.ceil(total / Number(limit)) }, 'Invoices fetched'));
});

export const updatePurchaseInvoice = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const inv = await PurchaseInvoice.findById(req.params.id).session(session);
        if (!inv) throw new ApiError(404, 'Invoice not found');
        if (inv.isDeleted) throw new ApiError(400, 'Cannot edit a deleted invoice');

        const auditTrail = {};
        const updateData = req.body;

        // Implementation of standard PATCH logic
        Object.keys(updateData).forEach(key => {
            if (updateData[key] !== undefined && JSON.stringify(inv[key]) !== JSON.stringify(updateData[key])) {
                auditTrail[key] = { old: inv[key], new: updateData[key] };
                inv[key] = updateData[key];
            }
        });

        if (Object.keys(auditTrail).length > 0) {
            // Recalculate if items or freight changed
            if (auditTrail.items || auditTrail.freightAmount || auditTrail.freightGstRate || auditTrail.gstType) {
                const totals = calculateInvoiceTotals(inv.items, inv.gstType, inv.freightAmount, inv.freightGstRate);
                const { updatedItems, ...headerTotals } = totals;
                inv.items = updatedItems;
                Object.assign(inv, headerTotals);
            }
            
            // Final Safeguard for update
            if (inv.items?.length > 0 && inv.grandTotal === 0) {
                const hasValue = inv.items.some(i => i.rate > 0 && i.qty > 0);
                if (hasValue) throw new ApiError(400, "Integrity check failed: Update resulted in ₹0 grand total despite having valued items.");
            }

            inv.updatedBy = req.user._id;
            await inv.save({ session });

            await AuditLog.create([{
                user: req.user._id,
                action: 'UPDATE',
                module: 'PurchaseInvoice',
                resourceId: inv._id,
                description: `Updated Purchase Invoice ${inv.invoiceNumber}`,
                details: auditTrail,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            }], { session });
        }

        await session.commitTransaction();
        res.json(new ApiResponse(200, inv, 'Purchase Invoice updated'));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
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
        
        const oldNumber = inv.invoiceNumber;
        inv.status = 'Cancelled';
        inv.paymentStatus = 'Cancelled';
        inv.updatedBy = req.user._id;
        
        await rollbackSideEffects(inv, req.user._id, session);
        await inv.save({ session });

        await AuditLog.create([{
            user: req.user._id,
            action: 'CANCEL',
            module: 'PurchaseInvoice',
            resourceId: inv._id,
            description: `Cancelled Purchase Invoice ${oldNumber}. Number remains reserved.`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        }], { session });
        
        await session.commitTransaction();
        res.json(new ApiResponse(200, inv, 'Purchase Invoice cancelled successfully. Number remains reserved.'));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

export const deletePurchaseInvoice = asyncHandler(async (req, res) => {
    const { reason } = req.body;
    if (!reason) throw new ApiError(400, 'Deletion reason is required');

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const inv = await PurchaseInvoice.findById(req.params.id).session(session);
        if (!inv) throw new ApiError(404, 'Invoice not found');
        
        // 1. Payment Check
        if (inv.paymentStatus === 'Paid' || inv.paymentStatus === 'Partially Paid' || (inv.payments && inv.payments.length > 0)) {
            throw new ApiError(400, 'Cannot delete an invoice with payments. Delete payments first.');
        }

        // 2. Strict Sequence Check (Only latest in series can be deleted)
        if (inv.seriesId) {
            const series = await InvoiceSeries.findById(inv.seriesId).session(session);
            if (series) {
                // Verify if it's the latest in series
                const currentNumberStr = series.prefix + String(series.currentNumber).padStart(series.padLength, '0');
                
                if (inv.invoiceNumber !== currentNumberStr) {
                    throw new ApiError(400, `Cannot delete invoice ${inv.invoiceNumber} as it is not the latest in series ${series.seriesName}. A later invoice (${currentNumberStr}) already exists. Please cancel it instead.`);
                }
                
                // Decrement series to allow reuse. 
                // If it was the very first in series (currentNumber == startNumber), it goes back to startNumber - 1.
                series.currentNumber = Math.max(series.currentNumber - 1, (series.startNumber || 1) - 1);
                await series.save({ session });
            }
        } else {
            // Fallback for non-series invoices: check if any newer invoice exists for this supplier or in general
            const newerInv = await PurchaseInvoice.findOne({
                _id: { $ne: inv._id },
                isDeleted: { $ne: true },
                invoiceDate: { $gt: inv.invoiceDate }
            }).session(session);
            
            if (newerInv) {
                throw new ApiError(400, "This invoice cannot be deleted because a later invoice already exists. You may cancel it instead.");
            }
        }

        const oldNumber = inv.invoiceNumber;
        
        // Soft delete logic
        inv.isDeleted = true;
        inv.deletedAt = new Date();
        inv.deletedBy = req.user._id;
        inv.deleteReason = reason;
        inv.status = 'Cancelled';
        // Free the number: Append suffix to original number
        inv.invoiceNumber = `${oldNumber}-DEL-${Date.now()}`;

        await rollbackSideEffects(inv, req.user._id, session);
        await inv.save({ session });

        await AuditLog.create([{
            user: req.user._id,
            action: 'DELETE',
            module: 'PurchaseInvoice',
            resourceId: inv._id,
            description: `Deleted latest Purchase Invoice ${oldNumber}. Number is now available for reuse.`,
            details: { reason, originalNumber: oldNumber },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        }], { session });
        
        await session.commitTransaction();
        res.json(new ApiResponse(200, null, `Purchase Invoice ${oldNumber} deleted successfully and number freed.`));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

export const restorePurchaseInvoice = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const inv = await PurchaseInvoice.findById(req.params.id).session(session);
        if (!inv) throw new ApiError(404, 'Invoice not found');
        if (!inv.isDeleted) throw new ApiError(400, 'Invoice is not deleted');

        inv.isDeleted = false;
        inv.deletedAt = null;
        inv.deletedBy = null;
        // inv.status = 'Draft'; // Revert to draft or previous status? Keeping as cancelled is safer unless manually moved back.
        // Actually, we don't automatically recalculate side effects on restore usually, user must manually fix.

        await inv.save({ session });

        await AuditLog.create([{
            user: req.user._id,
            action: 'RESTORE',
            module: 'PurchaseInvoice',
            resourceId: inv._id,
            description: `Restored Purchase Invoice ${inv.invoiceNumber}`,
            details: { previousReason: inv.deleteReason },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        }], { session });

        await session.commitTransaction();
        res.json(new ApiResponse(200, inv, 'Purchase Invoice restored'));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

export const updatePaymentStatus = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { paymentStatus, paidAmount } = req.body;
        const inv = await PurchaseInvoice.findById(req.params.id).session(session);
        if (!inv) throw new ApiError(404, 'Invoice not found');

        const auditTrail = { 
            paymentStatus: { old: inv.paymentStatus, new: paymentStatus },
            paidAmount: { old: inv.paidAmount, new: paidAmount }
        };

        inv.paymentStatus = paymentStatus;
        if (paidAmount !== undefined) inv.paidAmount = paidAmount;
        
        await inv.save({ session });

        await AuditLog.create([{
            user: req.user._id,
            action: 'UPDATE',
            module: 'PurchaseInvoice',
            resourceId: inv._id,
            description: `Updated Payment Status for Invoice ${inv.invoiceNumber}`,
            details: auditTrail,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        }], { session });

        await session.commitTransaction();
        res.json(new ApiResponse(200, inv, 'Payment updated'));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});
