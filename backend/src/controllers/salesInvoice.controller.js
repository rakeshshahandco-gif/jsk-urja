import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { InvoiceSeries } from '../models/invoiceSeries.model.js';
import { SalesOrder } from '../models/salesOrder.model.js';
import { Item } from '../models/item.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { postSalesInvoiceToLedger, reverseInvoiceLedgerImpact } from '../utils/ledgerDispatcher.js';

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

const calcInvoiceTotals = (items, freightAmount = 0, freightGstRate = 0, gstType = 'CGST / SGST', gstApplicable = true) => {
    const isIGST = gstType === 'IGST';
    let totalQty = 0, subTotal = 0, totalDiscount = 0, totalTaxableAmount = 0;
    let totalCgst = 0, totalSgst = 0, totalIgst = 0;

    // Force GST to 0 if not applicable
    const effectiveGstApplicable = gstApplicable === true || gstApplicable === 'true';

    const processedItems = items.map(item => {
        const qty = Number(item.qty) || 0;
        const rate = Number(item.rate) || 0;
        const discPct = Number(item.discountPercent) || 0;
        const gstRate = effectiveGstApplicable ? (Number(item.gstRate) || 18) : 0;
        const gross = qty * rate;
        const discAmt = Math.round(gross * discPct / 100 * 100) / 100;
        const taxableAmount = gross - discAmt;

        let cgstRate = 0, cgstAmount = 0, sgstRate = 0, sgstAmount = 0, igstRate = 0, igstAmount = 0;
        if (effectiveGstApplicable) {
            if (isIGST) {
                igstRate = gstRate;
                igstAmount = Math.round(taxableAmount * igstRate / 100 * 100) / 100;
            } else {
                cgstRate = gstRate / 2; sgstRate = gstRate / 2;
                cgstAmount = Math.round(taxableAmount * cgstRate / 100 * 100) / 100;
                sgstAmount = Math.round(taxableAmount * sgstRate / 100 * 100) / 100;
            }
        }
        const totalAmount = taxableAmount + cgstAmount + sgstAmount + igstAmount;

        totalQty += qty;
        subTotal += gross;
        totalDiscount += discAmt;
        totalTaxableAmount += taxableAmount;
        totalCgst += cgstAmount; totalSgst += sgstAmount; totalIgst += igstAmount;

        return {
            itemId: item.itemId,
            itemCode: item.itemCode || '',
            itemName: item.itemName || '',
            modelNo: item.modelNo || '',
            description: item.description || '',
            additionalNotes: item.additionalNotes || '',
            hsnCode: item.hsnCode || '',
            uom: item.uom || 'NOS',
            qty,
            rate,
            discountPercent: discPct,
            discountAmount: discAmt,
            taxableAmount,
            gstRate,
            cgstRate,
            cgstAmount,
            sgstRate,
            sgstAmount,
            igstRate,
            igstAmount,
            totalAmount
        };
    });

    const freight = Number(freightAmount) || 0;
    
    // Add Freight to taxable amount before GST calculation
    const taxableWithFreight = totalTaxableAmount + freight;

    const freightGstRateCount = effectiveGstApplicable ? (Number(freightGstRate) || 0) : 0;
    const freightGstAmt = effectiveGstApplicable && freight > 0 && freightGstRateCount > 0 ? Math.round(freight * freightGstRateCount / 100 * 100) / 100 : 0;
    const totalGst = totalCgst + totalSgst + totalIgst + freightGstAmt;
    
    // Grand Total is taxable + gst
    const grandTotal = taxableWithFreight + totalGst;
    
    const roundedTotal = Math.round(grandTotal);
    const roundOff = Math.round((roundedTotal - grandTotal) * 100) / 100;

    return { processedItems, totalQty, subTotal, totalDiscount, totalTaxableAmount: taxableWithFreight, totalCgst, totalSgst, totalIgst, totalGst, grandTotal, roundedTotal, roundOff, freightGstAmount: freightGstAmt };
};

// ------- CREATE INVOICE -------
export const createSalesInvoice = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const body = req.body;
        if (!body.customerName) throw new ApiError(httpStatus.BAD_REQUEST, 'Customer name is required');
        if (!body.items || body.items.length === 0) throw new ApiError(httpStatus.BAD_REQUEST, 'At least one item is required');

        // Get invoice number from series
        if (!body.seriesId) throw new ApiError(httpStatus.BAD_REQUEST, 'Invoice Series is required.');
        
        const series = await InvoiceSeries.findById(body.seriesId).session(session);
        if (!series || !series.isActive) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid or inactive invoice series');

        // Self-healing sync
        const lastActualInvoice = await SalesInvoice.findOne({
            invoiceNumber: { $regex: `^${series.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` }
        }).sort({ invoiceNumber: -1 }).session(session);
        
        if (lastActualInvoice) {
            const lastActualNum = parseInt(lastActualInvoice.invoiceNumber.replace(series.prefix, ''), 10);
            if (!isNaN(lastActualNum) && lastActualNum < series.currentNumber) {
                series.currentNumber = lastActualNum;
            }
        }

        const invoiceNumber = series.nextInvoiceNumber();
        const gstApplicable = series.gstApplicable === false ? false : true;
        series.currentNumber = Math.max(series.currentNumber + 1, series.startNumber);
        await series.save({ session });

        const { items: _items, ...otherData } = body;

        const { processedItems, totalQty, subTotal, totalDiscount, totalTaxableAmount, totalCgst, totalSgst, totalIgst, totalGst, grandTotal, roundedTotal, roundOff, freightGstAmount } = calcInvoiceTotals(
            _items, body.freightAmount, body.freightGstRate, body.gstType, gstApplicable
        );

        const inv = await SalesInvoice.create([{
            ...otherData,
            invoiceNumber,
            gstApplicable,
            items: processedItems,
            totalQty, subTotal, totalDiscount, totalTaxableAmount, totalCgst, totalSgst, totalIgst, totalGst,
            grandTotal, roundedTotal, roundOff, freightGstAmount,
            amountInWords: numWords(roundedTotal),
            paymentStatus: body.paymentType === 'Cash' ? 'Paid' : 'Unpaid',
            paidAmount: body.paymentType === 'Cash' ? roundedTotal : 0,
            status: 'Confirmed',
            createdBy: req.user.id,
        }], { session });

        const invoice = inv[0];

        // Stock Deduction
        for (const pItem of processedItems) {
            if (!pItem.itemId) continue;
            const itemDoc = await Item.findById(pItem.itemId).session(session);
            if (itemDoc) {
                itemDoc.currentStock = (itemDoc.currentStock || 0) - pItem.qty;
                await itemDoc.save({ session });

                await StockLedger.create([{
                    date: new Date(),
                    itemId: itemDoc._id,
                    itemCode: itemDoc.itemCode,
                    itemName: itemDoc.itemName,
                    transactionType: 'SALES_INVOICE',
                    stockBucket: 'SALEABLE',
                    referenceNo: invoice.invoiceNumber,
                    referenceId: invoice._id,
                    outQty: pItem.qty,
                    rate: pItem.rate,
                    amount: pItem.qty * pItem.rate,
                    runningStock: itemDoc.currentStock,
                    createdBy: req.user.id
                }], { session });
            }
        }

        // Financial Ledger Posting (non-fatal — invoice saves even if ledger posting fails)
        try {
            await postSalesInvoiceToLedger(invoice, req.user.id, session);
        } catch (ledgerErr) {
            console.warn(`[Ledger] Could not post invoice ${invoice.invoiceNumber}: ${ledgerErr.message}`);
        }

        if (body.soId) {
            await SalesOrder.findByIdAndUpdate(body.soId, { status: 'Invoiced', invoiceId: invoice._id }).session(session);
        }

        await session.commitTransaction();
        res.status(httpStatus.CREATED).json({ success: true, data: invoice });

    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

// ------- LIST INVOICES -------
export const getSalesInvoices = asyncHandler(async (req, res) => {
    const { search, paymentStatus, paymentType, dateFrom, dateTo, limit = 50, page = 1 } = req.query;
    const filter = {};
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (paymentType) filter.paymentType = paymentType;
    if (search) filter.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
    ];
    if (dateFrom || dateTo) {
        filter.invoiceDate = {};
        if (dateFrom) filter.invoiceDate.$gte = new Date(dateFrom);
        if (dateTo) filter.invoiceDate.$lte = new Date(dateTo);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [invoices, total] = await Promise.all([
        SalesInvoice.find(filter).populate('createdBy', 'name mobile').sort({ invoiceDate: -1 }).skip(skip).limit(Number(limit)),
        SalesInvoice.countDocuments(filter),
    ]);
    res.json({ success: true, invoices, total });
});

// ------- GET SINGLE INVOICE -------
export const getSalesInvoiceById = asyncHandler(async (req, res) => {
    const inv = await SalesInvoice.findById(req.params.id)
        .populate('seriesId')
        .populate('createdBy', 'name mobile');
        
    if (!inv) throw new ApiError(httpStatus.NOT_FOUND, 'Sales Invoice not found');
    
    let ledger = await AccountLedger.findOne({ 
        referenceId: inv.customerId, 
        referenceModel: 'Customer' 
    });

    if (!ledger && inv.customerName) {
        ledger = await AccountLedger.findOne({
            name: { $regex: new RegExp(`^${inv.customerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        });
    }

    const data = inv.toObject();
    if (ledger) {
        data.customerLedgerId = ledger._id;
        data.customerLedgerName = ledger.name;
    }

    res.json({ success: true, data });
});

// ------- RECORD PAYMENT -------
export const recordPayment = asyncHandler(async (req, res) => {
    const inv = await SalesInvoice.findById(req.params.id);
    if (!inv) throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
    if (inv.status === 'Cancelled') throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot pay a cancelled invoice');

    const { amountPaid, paymentDate, paymentMode, reference, remarks } = req.body;
    const amt = Number(amountPaid);
    if (!amt || amt <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Amount must be positive');

    inv.payments.push({ amountPaid: amt, paymentDate: paymentDate || new Date(), paymentMode: paymentMode || 'Cash', reference: reference || '', remarks: remarks || '', recordedBy: req.user.id });
    inv.paidAmount = Math.round((inv.paidAmount + amt) * 100) / 100;

    if (inv.paidAmount >= inv.roundedTotal) inv.paymentStatus = 'Paid';
    else if (inv.paidAmount > 0) inv.paymentStatus = 'Partially Paid';

    inv.updatedBy = req.user.id;
    await inv.save();
    res.json({ success: true, data: inv });
});

// ------- RESTORE CANCELLED INVOICE -------
export const restoreSalesInvoice = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const inv = await SalesInvoice.findById(req.params.id).session(session);
        if (!inv) throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
        if (inv.status !== 'Cancelled') throw new ApiError(httpStatus.BAD_REQUEST, 'Invoice is not cancelled');

        inv.status = 'Confirmed';
        inv.paymentStatus = 'Unpaid';
        inv.updatedBy = req.user.id;
        
        if (inv.items && inv.items.length > 0) {
            for (const iItem of inv.items) {
                if (!iItem.itemId) continue;
                const itemDoc = await Item.findById(iItem.itemId).session(session);
                if (itemDoc) {
                    itemDoc.currentStock = (itemDoc.currentStock || 0) - iItem.qty;
                    await itemDoc.save({ session });

                    await StockLedger.create([{
                        date: new Date(),
                        itemId: itemDoc._id,
                        itemCode: itemDoc.itemCode,
                        itemName: itemDoc.itemName,
                        transactionType: 'SALES_INVOICE_RESTORE',
                        stockBucket: 'SALEABLE',
                        referenceNo: inv.invoiceNumber,
                        referenceId: inv._id,
                        outQty: iItem.qty,
                        remarks: 'Invoice Restored from Cancelled'
                    }], { session });
                }
            }
        }

        // Re-post financial matches
        await postSalesInvoiceToLedger(inv, req.user.id, session);

        await inv.save({ session });
        await session.commitTransaction();
        res.json({ success: true, data: inv });

    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

// ------- CANCEL INVOICE -------
export const cancelSalesInvoice = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const inv = await SalesInvoice.findById(req.params.id).session(session);
        if (!inv) throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
        if (inv.paidAmount > 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot cancel an invoice with payments. Reverse payments first.');
        
        inv.status = 'Cancelled';
        inv.paymentStatus = 'Cancelled';
        inv.updatedBy = req.user.id;
        await inv.save({ session });

        // Restore Stock
        if (inv.items && inv.items.length > 0) {
            for (const iItem of inv.items) {
                if (!iItem.itemId) continue;
                const itemDoc = await Item.findById(iItem.itemId).session(session);
                if (itemDoc) {
                    itemDoc.currentStock = (itemDoc.currentStock || 0) + iItem.qty;
                    await itemDoc.save({ session });

                    await StockLedger.create([{
                        date: new Date(),
                        itemId: itemDoc._id,
                        itemCode: itemDoc.itemCode,
                        itemName: itemDoc.itemName,
                        transactionType: 'SALES_INVOICE_CANCEL',
                        stockBucket: 'SALEABLE',
                        referenceNo: inv.invoiceNumber,
                        referenceId: inv._id,
                        inQty: iItem.qty,
                        rate: iItem.rate,
                        amount: iItem.qty * iItem.rate,
                        runningStock: itemDoc.currentStock,
                        createdBy: req.user.id
                    }], { session });
                }
            }
        }

        // Reverse Financial Impact
        await reverseInvoiceLedgerImpact(inv.invoiceNumber, session);

        await session.commitTransaction();
        res.json({ success: true, data: inv });

    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});
