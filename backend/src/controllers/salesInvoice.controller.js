import mongoose from 'mongoose';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { rollbackStockLedger, recalculateStockLedger } from '../utils/stockUtils.js';
import { Item } from '../models/item.model.js';
import Customer from '../models/customer.model.js';
import Distributor from '../models/distributor.model.js';
import { SalesOrder } from '../models/salesOrder.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { postSalesInvoiceToLedger, reverseInvoiceLedgerImpact } from '../utils/ledgerDispatcher.js';
import httpStatus from 'http-status';
import { getFYFromDate } from '../utils/fyUtils.js';
import { getNextNumberFromSeries, formatInvoiceNumber, getLatestSequenceNumber, recomputeSeriesState, extractSequenceNumber } from '../utils/numberingUtils.js';
import { InvoiceSeries } from '../models/invoiceSeries.model.js';
import { AuditLog } from '../models/auditLog.model.js';
import { Voucher } from '../models/voucher.model.js';
import { LedgerEntry } from '../models/ledgerEntry.model.js';
import { autoLinkEntityLedger } from '../utils/ledgerLinking.utils.js';
import { enrichSalesItemsWithGp } from '../services/productCostEngine.service.js';
import { logCostingAudit } from '../services/costingAudit.service.js';
import { ensureInvoicePublicToken } from '../services/invoiceBarcode.service.js';
import {
    getCompanyFeatureSettings,
    shouldDeductStockOnSales,
    shouldPostSalesLedger,
} from '../services/companyFeatureSettings.service.js';

export const createSalesInvoice = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const body = req.body;
        
        // Financial Year Tagging
        const fy = body.financialYear || getFYFromDate(body.invoiceDate || new Date());
        
        let invoiceNumber = body.invoiceNumber;
        let sequenceNumber = body.sequenceNumber || 0;
        let displayInvoiceNumber = body.displayInvoiceNumber || '';

        if (!invoiceNumber && body.seriesId) {
            const seriesDoc = await InvoiceSeries.findById(body.seriesId).session(session);
            if (!seriesDoc) throw new ApiError(httpStatus.NOT_FOUND, 'Invoice series not found');

            // --- STRICT RULE: Estimate series cannot have GST ---
            if (seriesDoc.isEstimate === true || seriesDoc.documentType === 'Estimate') {
                if (body.gstApplicable === true) {
                    throw new ApiError(httpStatus.BAD_REQUEST, 'Estimate document is a non-GST document and cannot be included in GSTR-1 or GSTR-3B.');
                }
                // Force it just in case frontend sent it as true but no tax was calculated
                invData.gstApplicable = false;
            }

            const numbering = await getNextNumberFromSeries(SalesInvoice, body.seriesId, fy, session);
            if (numbering) {
                sequenceNumber = numbering.sequenceNumber;
                displayInvoiceNumber = numbering.displayInvoiceNumber;
                invoiceNumber = displayInvoiceNumber; // Sync for module compatibility
            }
        }
        
        if (!invoiceNumber) {
            invoiceNumber = `SI-${Date.now()}`;
            displayInvoiceNumber = invoiceNumber;
        }
        
        const invData = {
            ...body,
            invoiceNumber,
            displayInvoiceNumber,
            sequenceNumber,
            financialYear: fy,
            createdBy: req.user.id,
            status: body.status || 'Confirmed',
            paymentStatus: 'Unpaid',
            numberLocked: body.status === 'Confirmed' // Auto-lock if confirmed
        };

        // Map Referral Details if present
        if (body.referralDetails) {
            invData.salespersonId = body.referralDetails.salespersonId || null;
            invData.distributorId = body.referralDetails.distributorId || null;
            invData.referralSource = body.referralDetails.sourceType || '';
            invData.incentiveApplicable = body.referralDetails.incentiveApplicable || false;
            invData.incentiveType = body.referralDetails.incentiveType || '';
            invData.incentiveValue = body.referralDetails.incentiveValue || 0;
            
            // Calculate incentive amount
            if (invData.incentiveApplicable && invData.incentiveType === 'Percentage of sales') {
                const taxable = Number(body.totalTaxableAmount) || 0;
                invData.incentiveAmount = Number(((taxable * invData.incentiveValue) / 100).toFixed(2));
            } else if (invData.incentiveApplicable && invData.incentiveType === 'Fixed amount per document') {
                invData.incentiveAmount = Number(invData.incentiveValue) || 0;
            }
        }

        // --- PHASE 2: GSTR-1 COMPLIANCE INJECTION ---
        // 1. Snapshot Item UQC/HSN for Table 12
        if (invData.items && invData.items.length > 0) {
            let totalCessAmount = 0;
            for (let i = 0; i < invData.items.length; i++) {
                const itm = invData.items[i];
                if (itm.itemId) {
                    const masterItem = await Item.findById(itm.itemId).session(session);
                    if (masterItem) {
                        itm.uqc = itm.uqc || masterItem.uqc || masterItem.uom || 'NOS-NUMBERS';
                        itm.hsnCode = itm.hsnCode || masterItem.hsnCode || '';
                        itm.cessRate = masterItem.cessRate || 0;
                        if(itm.cessRate > 0 && itm.taxableAmount > 0) {
                            itm.cessAmount = Number(((itm.taxableAmount * itm.cessRate) / 100).toFixed(2));
                            totalCessAmount += itm.cessAmount;
                            itm.totalAmount = Number((itm.totalAmount + itm.cessAmount).toFixed(2));
                        }
                    }
                }
            }
            if (totalCessAmount > 0) {
                invData.totalCessAmount = Number(totalCessAmount.toFixed(2));
                invData.grandTotal = Number((invData.grandTotal + totalCessAmount).toFixed(2));
                invData.roundedTotal = Math.round(invData.grandTotal);
            }
        }

        // 2. Map B2CL vs B2CS vs B2B — snapshot registration type from customer master
        const missingRegType = !invData.customerRegistrationType 
            || invData.customerRegistrationType === 'undefined'
            || invData.customerRegistrationType === 'null'
            || invData.customerRegistrationType.trim() === '';
            
        const missingPos = !invData.placeOfSupply || invData.placeOfSupply.trim() === '';

        if ((missingRegType || missingPos) && invData.customerId) {
            const customerMaster = await Customer.findById(invData.customerId).session(session);
            if (customerMaster) {
                if (missingRegType) {
                    invData.customerRegistrationType = customerMaster.gstRegistrationType || 'Consumer';
                    invData.exportCountry = customerMaster.exportCountry || '';
                }
                
                if (missingPos) {
                    if (customerMaster.defaultPlaceOfSupply && customerMaster.defaultPlaceOfSupply.trim()) {
                        invData.placeOfSupply = customerMaster.defaultPlaceOfSupply.trim();
                    } else if (customerMaster.gstNumber && customerMaster.gstNumber.trim().length >= 2) {
                        const code = customerMaster.gstNumber.substring(0, 2);
                        const stateMap = {
                            '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
                            '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
                            '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
                            '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
                            '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
                            '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
                            '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory'
                        };
                        const stateName = stateMap[code] || customerMaster.state || '';
                        invData.placeOfSupply = stateName ? `${code}-${stateName}` : code;
                    } else if (customerMaster.billingStateCode && customerMaster.state) {
                        invData.placeOfSupply = `${customerMaster.billingStateCode}-${customerMaster.state}`;
                    }
                }
            }
        }
        // Sanitize: ensure soId and other ObjectIds are valid or null
        if (invData.soId === "" || invData.soId === "null" || invData.soId === "undefined") {
            delete invData.soId;
        }

        // --- PHASE 1.5: FORCE DATA CONSISTENCY ---
        // 1. Ensure invoiceDate is a Date object
        if (invData.invoiceDate) {
            invData.invoiceDate = new Date(invData.invoiceDate);
        } else {
            invData.invoiceDate = new Date();
        }

        // 2. Recalculate Totals (Prevent 0 taxable amount bugs)
        if (invData.items && invData.items.length > 0) {
            let calcTotalTaxable = 0;
            let calcTotalQty = 0;
            let calcTotalGst = 0;

            invData.items = invData.items.map(itm => {
                const qty = Number(itm.qty) || 0;
                const rate = Number(itm.rate) || 0;
                const discAmount = Number(itm.discountAmount) || 0;
                
                const taxable = (qty * rate) - discAmount;
                const cgst = itm.cgstRate ? (taxable * itm.cgstRate) / 100 : 0;
                const sgst = itm.sgstRate ? (taxable * itm.sgstRate) / 100 : 0;
                const igst = itm.igstRate ? (taxable * itm.igstRate) / 100 : 0;
                
                calcTotalTaxable += taxable;
                calcTotalQty += qty;
                calcTotalGst += (cgst + sgst + igst);

                return {
                    ...itm,
                    qty,
                    rate,
                    taxableAmount: taxable,
                    cgstAmount: Number(cgst.toFixed(2)),
                    sgstAmount: Number(sgst.toFixed(2)),
                    igstAmount: Number(igst.toFixed(2)),
                    totalAmount: Number((taxable + cgst + sgst + igst).toFixed(2))
                };
            });

            invData.totalTaxableAmount = Number(calcTotalTaxable.toFixed(2));
            invData.totalQty = calcTotalQty;
            invData.totalGst = Number(calcTotalGst.toFixed(2));
            
            // Grand Total Calculation
            const freight = Number(invData.freightAmount) || 0;
            const freightGst = Number(invData.freightGstAmount) || 0;
            invData.grandTotal = Number((invData.totalTaxableAmount + invData.totalGst + freight + freightGst).toFixed(2));
            invData.roundedTotal = Math.round(invData.grandTotal);
        }

        if (invData.items && invData.items.length > 0 && invData.status !== 'Draft') {
            try {
                const gpResult = await enrichSalesItemsWithGp(invData.items, invData.invoiceDate || new Date());
                invData.items = gpResult.items;
                invData.totalCostValue = gpResult.invoiceTotals.totalCostValue;
                invData.totalGpAmount = gpResult.invoiceTotals.totalGpAmount;
                invData.totalGpPercent = gpResult.invoiceTotals.totalGpPercent;
                invData.gpSnapshotAt = new Date();
                invData.gpWarnings = (gpResult.invoiceTotals.gpWarnings || []).map((w) => `${w.itemCode}: ${w.warnings.join('; ')}`);
            } catch (gpErr) {
                console.warn('[GP] Sales invoice GP snapshot skipped:', gpErr.message);
            }
        }

        const isB2C = invData.customerRegistrationType === 'Unregistered' || invData.customerRegistrationType === 'Consumer';
        if (isB2C) {
            // August 2024 Portal Amendment: B2CL threshold is ₹1,00,000 for Interstate
            if (invData.gstType === 'IGST' && invData.grandTotal > 100000) {
                invData.customerRegistrationType = 'Consumer-B2CL';
            } else {
                invData.customerRegistrationType = 'Consumer-B2CS';
            }
        }
        // ---------------------------------------------

        const [invoice] = await SalesInvoice.create([invData], { session });

        const featureSettings = req.companyId
            ? await getCompanyFeatureSettings(req.companyId)
            : null;

        if (featureSettings?.sales?.enableBarcodeQr !== false) {
            try {
                await ensureInvoicePublicToken(invoice, req.companyId, session);
            } catch (tokenErr) {
                console.warn('[InvoiceBarcode] public token skipped:', tokenErr.message);
            }
        }

        // Stock and Ledger Logic
        const deductStock = !featureSettings || shouldDeductStockOnSales(featureSettings);
        if (deductStock && invoice.items && invoice.items.length > 0) {
            const stockItemIds = invoice.items.map((i) => i.itemId).filter(Boolean);
            const stockItemDocs = stockItemIds.length
                ? await Item.find({ _id: { $in: stockItemIds } }).session(session)
                : [];
            const stockItemById = new Map(stockItemDocs.map((d) => [d._id.toString(), d]));

            for (const iItem of invoice.items) {
                if (!iItem.itemId) continue;
                const itemDoc = stockItemById.get(iItem.itemId.toString());
                if (itemDoc) {
                    itemDoc.currentStock = (itemDoc.currentStock || 0) - iItem.qty;
                    await itemDoc.save({ session });

                    await StockLedger.create([{
                        date: invoice.invoiceDate || new Date(),
                        itemId: itemDoc._id,
                        itemCode: itemDoc.itemCode,
                        itemName: itemDoc.itemName,
                        itemGroup: itemDoc.itemCategory || '',
                        itemType: itemDoc.itemType || '',
                        uom: itemDoc.uom || iItem.uom || '',
                        transactionType: 'SALES_INVOICE',
                        voucherType: 'Sales Outward',
                        partyId: invoice.customerId,
                        partyModel: 'Customer',
                        partyName: invoice.customerName,
                        partyCode: invoice.customerCode || '',
                        referenceNo: invoice.invoiceNumber,
                        referenceId: invoice._id,
                        outQty: iItem.qty,
                        rate: iItem.rate,
                        amount: Math.round(iItem.qty * iItem.rate * 100) / 100,
                        runningStock: itemDoc.currentStock,
                        financialYear: fy,
                        createdBy: req.user.id
                    }], { session });
                }
            }
        }

        // Financial Ledger Posting
        const postLedger = !featureSettings || shouldPostSalesLedger(featureSettings);
        if (postLedger) {
            try {
                const customer = await Customer.findById(invoice.customerId).session(session);
                if (customer) {
                    await autoLinkEntityLedger(customer, 'Customer', session);
                }
                await postSalesInvoiceToLedger(invoice, req.user.id, session);
            } catch (ledgerErr) {
                console.warn(`[Ledger] Could not post invoice ${invoice.invoiceNumber}: ${ledgerErr.message}`);
            }
        }

        if (body.soId) {
            await SalesOrder.findByIdAndUpdate(body.soId, { status: 'Invoiced', invoiceId: invoice._id }).session(session);
        }

        if (invoice.totalGpAmount != null) {
            await logCostingAudit({
                action: 'SALES_GP_SNAPSHOT',
                salesInvoiceId: invoice._id,
                userId: req.user.id,
                details: {
                    totalGpAmount: invoice.totalGpAmount,
                    totalGpPercent: invoice.totalGpPercent,
                    totalCostValue: invoice.totalCostValue,
                },
            });
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

export const getSalesInvoices = asyncHandler(async (req, res) => {
    const { search, customerId, paymentStatus, paymentType, dateFrom, dateTo, limit = 50, page = 1, includeDeleted, view, series } = req.query;
    console.log(`[SalesInvoices] Fetching with filter:`, { search, customerId, paymentStatus, series, view });
    
    const filter = { isDeleted: { $ne: true } };

    if (view === 'archived') {
        filter.isDeleted = true;
    } else if (view === 'all' || includeDeleted === 'true') {
        delete filter.isDeleted;
    }

    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (paymentType) filter.paymentType = paymentType;
    if (customerId) filter.customerId = customerId;

    // Series Filter (Robust with Prefix Match)
    if (series && series !== 'All Series' && series !== '') {
        try {
            const seriesIdObj = new mongoose.Types.ObjectId(series);
            const seriesDoc = await InvoiceSeries.findById(seriesIdObj);
            
            const orConditions = [{ seriesId: seriesIdObj }];
            if (seriesDoc?.prefix) {
                // If the prefix has a slash (like JU/SALES "26-27/"), match it exactly.
                // If it doesn't (like ESTIMATE "26-27"), match it but ensure it's NOT followed by a slash to avoid collision.
                const escapedPrefix = seriesDoc.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                if (seriesDoc.prefix.endsWith('/')) {
                    orConditions.push({ invoiceNumber: { $regex: `^${escapedPrefix}`, $options: 'i' } });
                } else {
                    // Match prefix but ensure next char is NOT a slash
                    orConditions.push({ invoiceNumber: { $regex: `^${escapedPrefix}[^/]`, $options: 'i' } });
                }
            }
            filter.$and = filter.$and || [];
            filter.$and.push({ $or: orConditions });
        } catch (e) {
            console.warn(`[SalesInvoices] Series Filter Error:`, e.message);
        }
    }

    if (req.query.financialYear) {
        filter.financialYear = req.query.financialYear;
    }

    if (search) {
        filter.$and = filter.$and || [];
        filter.$and.push({
            $or: [
                { invoiceNumber: { $regex: search, $options: 'i' } },
                { customerName: { $regex: search, $options: 'i' } },
            ]
        });
    }

    if (dateFrom || dateTo) {
        filter.invoiceDate = {};
        if (dateFrom) filter.invoiceDate.$gte = new Date(dateFrom);
        if (dateTo) filter.invoiceDate.$lte = new Date(dateTo);
    }

    console.log(`[SalesInvoices] Final MongoDB Filter:`, JSON.stringify(filter));

    const skip = (Number(page) - 1) * Number(limit);
    const [invoices, total] = await Promise.all([
        SalesInvoice.find(filter)
            .populate('seriesId', 'seriesName')
            .populate('createdBy', 'name mobile')
            .sort({ invoiceDate: -1 })
            .skip(skip)
            .limit(Number(limit)),
        SalesInvoice.countDocuments(filter),
    ]);
   res.json({ success: true, invoices, total });
});

export const getSalesInvoiceById = asyncHandler(async (req, res) => {
    const inv = await SalesInvoice.findById(req.params.id)
        .populate('seriesId')
        .populate('createdBy', 'name mobile');
        
    if (!inv) throw new ApiError(httpStatus.NOT_FOUND, 'Sales Invoice not found');
    
    let ledger = await AccountLedger.findOne({ 
        referenceId: inv.customerId, 
        referenceModel: 'Customer' 
    });

    const data = inv.toObject();
    if (ledger) {
        data.customerLedgerId = ledger._id;
        data.customerLedgerName = ledger.name;
    }

    res.json({ success: true, data });
});

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
        
        // Re-create stock ledger entries
        if (inv.items && inv.items.length > 0) {
            for (const iItem of inv.items) {
                if (!iItem.itemId) continue;
                const itemDoc = await Item.findById(iItem.itemId).session(session);
                if (itemDoc) {
                    itemDoc.currentStock = (itemDoc.currentStock || 0) - iItem.qty;
                    await itemDoc.save({ session });

                    await StockLedger.create([{
                        date: inv.invoiceDate || new Date(),
                        itemId: itemDoc._id,
                        itemCode: itemDoc.itemCode,
                        itemName: itemDoc.itemName,
                        itemGroup: itemDoc.itemCategory || '',
                        itemType: itemDoc.itemType || '',
                        uom: itemDoc.uom || iItem.uom || '',
                        transactionType: 'SALES_INVOICE',
                        voucherType: 'Sales Outward',
                        partyId: inv.customerId,
                        partyModel: 'Customer',
                        partyName: inv.customerName,
                        partyCode: inv.customerCode || '',
                        referenceNo: inv.invoiceNumber,
                        referenceId: inv._id,
                        outQty: iItem.qty,
                        rate: iItem.rate,
                        amount: Math.round(iItem.qty * iItem.rate * 100) / 100,
                        runningStock: itemDoc.currentStock,
                        financialYear: fy,
                        createdBy: req.user.id
                    }], { session });

                    await recalculateStockLedger(itemDoc._id, session);
                }
            }
        }

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

export const cancelSalesInvoice = asyncHandler(async (req, res) => {
    const { reason } = req.body;
    if (!reason) throw new ApiError(httpStatus.BAD_REQUEST, 'Cancellation reason is required');

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const inv = await SalesInvoice.findById(req.params.id).session(session);
        if (!inv) throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
        if (inv.status === 'Cancelled') throw new ApiError(httpStatus.BAD_REQUEST, 'Invoice is already cancelled');
        
        // Safety: If payments exist, they must be unlinked/deleted first to avoid mismatch
        if (inv.paidAmount > 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot cancel with payments recorded. Please delete payments first.');
        
        const oldStatus = inv.status;
        const invoiceNo = inv.invoiceNumber;

        // 1. Update Invoice Status
        inv.status = 'Cancelled';
        inv.paymentStatus = 'Cancelled';
        inv.cancelReason = reason;
        inv.cancelledAt = new Date();
        inv.cancelledBy = req.user.id;
        inv.updatedBy = req.user.id;
        await inv.save({ session });

        // 2. Reverse Stock Effects
        await rollbackStockLedger(inv._id, session);

        // 3. Reverse Financial Ledger Impact (Vouchers/Ledger entries)
        await reverseInvoiceLedgerImpact(invoiceNo, session);

        // 4. Audit Trail with Full Snapshot
        await AuditLog.create([{
            user: req.user.id,
            action: 'CANCEL',
            module: 'SalesInvoice',
            resourceId: inv._id,
            description: `CANCELLED Sales Invoice ${invoiceNo}. Reason: ${reason}. NUMBER PERMANENTLY BLOCKED.`,
            details: { 
                reason, 
                invoiceNo, 
                snapshot: inv.toObject(),
                previousStatus: oldStatus 
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        }], { session });

        // Link SO back if it was linked (Optional: User might want to re-invoice or SO stays cancelled)
        // Leaving SO as 'Invoiced' but maybe user wants it back to 'Confirmed'? 
        // Rule usually says Cancelled invoice means the transaction is DEAD.
        
        await session.commitTransaction();
        res.json({ success: true, data: inv, message: `Invoice ${invoiceNo} cancelled. This number will not be reused.` });
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

export const deleteSalesInvoice = asyncHandler(async (req, res) => {
    const { reason } = req.body;
    if (!reason) throw new ApiError(httpStatus.BAD_REQUEST, 'Deletion reason is required for administrative tracking');

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const inv = await SalesInvoice.findById(req.params.id).session(session);
        if (!inv) throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
        
        const invoiceNo = inv.invoiceNumber;

        // 1. Payment Check
        if (inv.paidAmount > 0 || (inv.payments && inv.payments.length > 0)) {
            throw new ApiError(httpStatus.BAD_REQUEST, `Invoice ${invoiceNo} cannot be deleted because payments are linked.`);
        }

        // 2. STRICT SEQUENCE CHECK (Rule 3)
        // Reuse is ONLY allowed if this is the highest number in the series.
        if (inv.seriesId) {
            const series = await InvoiceSeries.findById(inv.seriesId).session(session);
            if (series) {
                // Calculate what the current "last generated string" is
                const currentLastStr = series.prefix + String(series.currentNumber).padStart(series.padLength, '0');
                
                if (invoiceNo !== currentLastStr) {
                    throw new ApiError(httpStatus.BAD_REQUEST, 
                        `STRICT RULE: Only the LATEST invoice (${currentLastStr}) can be DELETED to reuse its number. ` +
                        `Invoice ${invoiceNo} is in the middle of the sequence. Please CANCEL it instead to block the number.`
                    );
                }
                
                // If it is the latest, we decrement the counter
                series.currentNumber = Math.max((series.startNumber || 1) - 1, series.currentNumber - 1);
                await series.save({ session });
            }
        }

        // 3. Mark as Deleted & Free Number (Rename original doc for audit)
        inv.isDeleted = true;
        inv.deletedAt = new Date();
        inv.deletedBy = req.user.id;
        inv.deleteReason = reason;
        inv.status = 'Cancelled';
        
        // Rename original invoice number in the record to allow reuse of the string in new creations
        const renamedNumber = `${invoiceNo}-DEL-${Date.now()}`;
        inv.invoiceNumber = renamedNumber;

        // 4. Reverse All Impacts
        await rollbackStockLedger(inv._id, session);
        await reverseInvoiceLedgerImpact(invoiceNo, session);

        await inv.save({ session });
        
        // 5. Audit Log with reason and original sequence info
        await AuditLog.create([{
            user: req.user.id,
            action: 'DELETE',
            module: 'SalesInvoice',
            resourceId: inv._id,
            description: `DELETED latest Sales Invoice ${invoiceNo}. Reason: ${reason}. NUMBER FREED FOR REUSE.`,
            details: { 
                reason, 
                originalNumber: invoiceNo,
                renamedTo: renamedNumber,
                seriesId: inv.seriesId
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        }], { session });

        // 6. Restore SO back to 'Confirmed' so it can be re-invoiced
        if (inv.soId) {
            await SalesOrder.findByIdAndUpdate(inv.soId, { 
                status: 'Confirmed', 
                invoiceId: null 
            }).session(session);
        }

        await session.commitTransaction();
        res.json({ success: true, message: `Invoice ${invoiceNo} deleted successfully. The number is now available for the next entry.` });

    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

/**
 * Preview Draft Invoices for Cleanup
 */
export const cleanupPreviewDraftInvoices = asyncHandler(async (req, res) => {
    const { financialYear, seriesId, search } = req.query;
    if (!financialYear && !seriesId && !search) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Financial Year, Series ID, or Search term are required');
    }

    // Build query
    let query = {};
    if (search) {
        query.invoiceNumber = { $regex: search, $options: 'i' };
    } else {
        query.financialYear = financialYear;
        query.seriesId = seriesId;
    }

    // Find all invoices in this scope (including soft-deleted ones)
    const invoices = await SalesInvoice.find(query).sort({ invoiceNumber: 1 });

    console.log(`🔍 [CleanupScan] Query=${JSON.stringify(query)} Found=${invoices.length}`);
    const eligible = [];
    const blocked = [];

    for (const inv of invoices) {
        const reasons = [];

        // Rule 1: Must be Draft
        if (inv.status !== 'Draft') {
            reasons.push(`Status is ${inv.status} (Not Draft)`);
        }

        // Rule 2: No payments
        if (inv.paidAmount > 0 || (inv.payments && inv.payments.length > 0)) {
            reasons.push('Payments are linked to this invoice');
        }

        // Rule 3: No Stock impact
        const stockEntries = await StockLedger.countDocuments({ referenceId: inv._id });
        if (stockEntries > 0) {
            reasons.push('Stock ledger entries exist for this invoice');
        }

        // Rule 4: No Accounting impact
        const voucher = await Voucher.countDocuments({ voucherNo: inv.invoiceNumber });
        if (voucher > 0) {
            reasons.push('Accounting voucher exists for this invoice');
        }

        if (reasons.length === 0) {
            eligible.push({
                _id: inv._id,
                invoiceNumber: inv.invoiceNumber,
                customerName: inv.customerName,
                grandTotal: inv.grandTotal,
                invoiceDate: inv.invoiceDate
            });
        } else {
            blocked.push({
                _id: inv._id,
                invoiceNumber: inv.invoiceNumber,
                customerName: inv.customerName,
                reasons
            });
        }
    }

    res.json({
        success: true,
        data: {
            seriesName: seriesDoc?.seriesName || 'Unknown',
            prefix: seriesDoc?.prefix || '',
            eligible,
            blocked
        }
    });
});

/**
 * Execute Hard Delete on Eligible Draft Invoices
 */
export const executeCleanupDraftInvoices = asyncHandler(async (req, res) => {
    const { financialYear, seriesId, invoiceIds } = req.body;

    if (!financialYear || !seriesId || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid request data');
    }

    // Role check (Admin only)
    if (req.user.roleName !== 'superadmin' && req.user.roleName !== 'admin') {
        throw new ApiError(httpStatus.FORBIDDEN, 'Only administrators can perform cleanup');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Double check eligibility before delete
        const invoices = await SalesInvoice.find({
            _id: { $in: invoiceIds },
            financialYear,
            seriesId,
            status: 'Draft',
            isDeleted: { $ne: true }
        }).session(session);

        const verifiedIds = [];
        const deletedNumbers = [];

        for (const inv of invoices) {
            // Check stock/accounting again inside transaction
            const stockEntries = await StockLedger.countDocuments({ referenceId: inv._id }).session(session);
            const voucher = await Voucher.countDocuments({ voucherNo: inv.invoiceNumber }).session(session);
            
            if (stockEntries === 0 && voucher === 0 && inv.paidAmount === 0) {
                verifiedIds.push(inv._id);
                deletedNumbers.push(inv.invoiceNumber);
            }
        }

        if (verifiedIds.length === 0) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'No eligible invoices found for deletion after verification');
        }

        // Perform Hard Delete
        await SalesInvoice.deleteMany({ _id: { $in: verifiedIds } }).session(session);

        // Reset numbering
        const newCurrentNumber = await recomputeSeriesState(seriesId, session);

        // Audit Log
        await AuditLog.create([{
            user: req.user.id,
            action: 'CLEANUP_DELETE',
            module: 'SalesInvoice',
            description: `Admin Cleanup: Permanently deleted ${verifiedIds.length} draft invoices for FY ${financialYear}. Numbering reset to ${newCurrentNumber}.`,
            details: {
                deletedInvoices: deletedNumbers,
                seriesId,
                financialYear,
                newCurrentNumber
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        }], { session });

        await session.commitTransaction();
        res.json({
            success: true,
            message: `Successfully deleted ${verifiedIds.length} draft invoices. Series numbering has been reset.`,
            data: { newCurrentNumber }
        });

    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

/**
 * FORCE Cleanup an individual invoice (even if Confirmed)
 * This rolls back stock, reverses ledger and hardnd-deletes the record.
 */
export const forceCleanupInvoice = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) throw new ApiError(httpStatus.BAD_REQUEST, 'Reason is required for force cleanup');

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const inv = await SalesInvoice.findById(id).session(session);
        if (!inv) throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');

        const seriesId = inv.seriesId;
        const oldNumber = inv.invoiceNumber;

        // 1. Rollback Stock
        await rollbackStockLedger(inv._id, session);

        // 2. Reverse Ledger
        await reverseInvoiceLedgerImpact(oldNumber, session);

        // 3. Delete Vouchers / Ledger entries (Cleanup orphans)
        await Voucher.deleteMany({ voucherNo: oldNumber }).session(session);
        await LedgerEntry.deleteMany({ voucherNo: oldNumber }).session(session);

        // 4. Hard Delete
        await inv.deleteOne({ session });

        // 5. Audit Log
        await AuditLog.create([{
            user: req.user.id,
            action: 'FORCE_CLEANUP',
            module: 'SalesInvoice',
            resourceId: id,
            description: `Admin FORCE CLEANUP: Hard-deleted invoice ${oldNumber} with stock/ledger rollback.`,
            details: { reason, originalData: inv },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        }], { session });

        // 6. Recompute Series
        if (seriesId) {
            await recomputeSeriesState(seriesId, session);
        }

        await session.commitTransaction();
        res.send(new ApiResponse(httpStatus.OK, null, `Invoice ${oldNumber} hard-deleted.`));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

/**
 * ADMIN ONLY: Renumber a single unlocked invoice
 * Optionally reflows all subsequent invoices in the same series/FY
 */
export const renumberInvoice = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { newDisplayNumber, reason, reflowRemaining = false } = req.body;

    if (!newDisplayNumber || !reason) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'New number and reason are required');
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const inv = await SalesInvoice.findById(id).session(session);
        if (!inv) throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
        if (inv.numberLocked) throw new ApiError(httpStatus.BAD_REQUEST, 'Invoice is locked and cannot be renumbered');

        const series = await InvoiceSeries.findById(inv.seriesId).session(session);
        if (!series) throw new ApiError(httpStatus.NOT_FOUND, 'Series not found');

        const oldNumber = inv.invoiceNumber;
        const newSeq = extractSequenceNumber(series.prefix, newDisplayNumber);
        
        // 1. Update Target Invoice
        inv.renumberHistory.push({
            oldNumber: inv.displayInvoiceNumber || inv.invoiceNumber,
            newNumber: newDisplayNumber,
            reason: reason + (reflowRemaining ? ' (with Auto-Reflow)' : ''),
            changedBy: req.user.id
        });
        inv.sequenceNumber = newSeq;
        inv.displayInvoiceNumber = newDisplayNumber;
        inv.invoiceNumber = newDisplayNumber;
        await inv.save({ session });

        // Update References
        await StockLedger.updateMany({ referenceId: inv._id }, { referenceNo: newDisplayNumber }).session(session);
        await Voucher.updateMany({ voucherNo: oldNumber }, { voucherNo: newDisplayNumber }).session(session);
        await LedgerEntry.updateMany({ voucherNo: oldNumber }, { voucherNo: newDisplayNumber }).session(session);

        // 2. Optional Reflow
        let reflowCount = 0;
        if (reflowRemaining) {
            const subsequentInvoices = await SalesInvoice.find({
                seriesId: inv.seriesId,
                financialYear: inv.financialYear,
                _id: { $ne: inv._id },
                invoiceDate: { $gte: inv.invoiceDate },
                isDeleted: { $ne: true }
            }).sort({ invoiceDate: 1, createdAt: 1 }).session(session);

            let nextSeq = newSeq + 1;
            for (const other of subsequentInvoices) {
                // Skip if it's already in the correct sequence (optional optimization)
                const targetNum = formatInvoiceNumber(series.prefix, nextSeq, series.padLength || 2);
                if (other.invoiceNumber !== targetNum) {
                    const oOldNum = other.invoiceNumber;
                    other.renumberHistory.push({
                        oldNumber: other.displayInvoiceNumber || other.invoiceNumber,
                        newNumber: targetNum,
                        reason: `Auto-Reflow from ${newDisplayNumber}`,
                        changedBy: req.user.id
                    });
                    other.sequenceNumber = nextSeq;
                    other.displayInvoiceNumber = targetNum;
                    other.invoiceNumber = targetNum;
                    await other.save({ session });

                    await StockLedger.updateMany({ referenceId: other._id }, { referenceNo: targetNum }).session(session);
                    await Voucher.updateMany({ voucherNo: oOldNum }, { voucherNo: targetNum }).session(session);
                    await LedgerEntry.updateMany({ voucherNo: oOldNum }, { voucherNo: targetNum }).session(session);
                    reflowCount++;
                }
                nextSeq++;
            }
        }

        // Sync Series State
        await recomputeSeriesState(inv.seriesId, session);

        // Audit Log
        await AuditLog.create([{
            user: req.user.id,
            action: 'RENUMBER',
            module: 'SalesInvoice',
            resourceId: inv._id,
            description: `Renumbered invoice from ${oldNumber} to ${newDisplayNumber}${reflowRemaining ? `. Reflowed ${reflowCount} others.` : ''}`,
            details: { oldNumber, newDisplayNumber, reason, reflowCount },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        }], { session });

        await session.commitTransaction();
        res.json({ success: true, message: `Renumbered successfully.${reflowCount > 0 ? ` Reflowed ${reflowCount} subsequent invoices.` : ''}` });
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

/**
 * ADMIN ONLY: Bulk Resequence a series/FY
 */
export const resequenceSeries = asyncHandler(async (req, res) => {
    const { seriesId, financialYear, forceAll = false, overrideStartNumber } = req.body;
    if (!seriesId || !financialYear) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Series and FY are required');
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const series = await InvoiceSeries.findById(seriesId).session(session);
        if (!series) throw new ApiError(httpStatus.NOT_FOUND, 'Series not found');

        // Find all non-deleted invoices in this series/FY
        const query = { seriesId, financialYear, isDeleted: { $ne: true } };
        if (!forceAll) {
            query.numberLocked = { $ne: true };
            query.paymentStatus = 'Unpaid';
        }

        const invoices = await SalesInvoice.find(query)
            .sort({ invoiceDate: 1, createdAt: 1 })
            .session(session);

        let currentSeq = (overrideStartNumber !== undefined && overrideStartNumber !== null) 
            ? Number(overrideStartNumber) 
            : series.startNumber;
        const results = [];

        for (const inv of invoices) {
            const oldNumber = inv.invoiceNumber;
            const newDisplayNumber = formatInvoiceNumber(series.prefix, currentSeq, series.padLength || 2);

            if (oldNumber !== newDisplayNumber) {
                inv.renumberHistory.push({
                    oldNumber: inv.displayInvoiceNumber || inv.invoiceNumber,
                    newNumber: newDisplayNumber,
                    reason: 'Bulk Resequence',
                    changedBy: req.user.id
                });
                inv.sequenceNumber = currentSeq;
                inv.displayInvoiceNumber = newDisplayNumber;
                inv.invoiceNumber = newDisplayNumber;
                await inv.save({ session });

                // Update References
                await StockLedger.updateMany({ referenceId: inv._id }, { referenceNo: newDisplayNumber }).session(session);
                await Voucher.updateMany({ voucherNo: oldNumber }, { voucherNo: newDisplayNumber }).session(session);
                await LedgerEntry.updateMany({ voucherNo: oldNumber }, { voucherNo: newDisplayNumber }).session(session);
                
                results.push({ id: inv._id, oldNumber, newNumber: newDisplayNumber });
            }
            currentSeq++;
        }

        // Update series currentNumber
        series.currentNumber = Math.max(series.currentNumber, currentSeq - 1);
        await series.save({ session });

        await AuditLog.create([{
            user: req.user.id,
            action: 'RESEQUENCE',
            module: 'SalesInvoice',
            description: `Bulk resequenced ${results.length} invoices in series ${series.seriesName}`,
            details: { seriesId, financialYear, results },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        }], { session });

        await session.commitTransaction();
        res.json({ success: true, count: results.length, details: results });
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});
/**
 * ADMIN ONLY: Change an invoice's series
 */
export const changeInvoiceSeries = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { targetSeriesId, newSequenceNumber, reason } = req.body;

    if (!targetSeriesId) throw new ApiError(httpStatus.BAD_REQUEST, 'Target series is required');

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const inv = await SalesInvoice.findById(id).session(session);
        if (!inv) throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');

        const targetSeries = await InvoiceSeries.findById(targetSeriesId).session(session);
        if (!targetSeries) throw new ApiError(httpStatus.NOT_FOUND, 'Target series not found');

        // --- STRICT RULE: Estimate series cannot have GST ---
        if (targetSeries.isEstimate === true || targetSeries.documentType === 'Estimate') {
            if (inv.gstApplicable === true) {
                throw new ApiError(httpStatus.BAD_REQUEST, 'STRICT RULE: Cannot move a GST-applicable invoice to an Estimate series. Please disable GST on the invoice first or cancel it.');
            }
            inv.gstApplicable = false;
        }

        const oldNumber = inv.displayInvoiceNumber || inv.invoiceNumber;
        
        // Determine sequence number
        let seq = newSequenceNumber;
        if (!seq) {
            const numbering = await getNextNumberFromSeries(SalesInvoice, targetSeriesId, inv.financialYear, session);
            seq = numbering.sequenceNumber;
        }

        const newDisplayNumber = formatInvoiceNumber(targetSeries.prefix, seq, targetSeries.padLength || 2);

        inv.renumberHistory.push({
            oldNumber,
            newNumber: newDisplayNumber,
            reason: reason || `Series Change to ${targetSeries.seriesName}`,
            changedBy: req.user.id
        });

        inv.seriesId = targetSeriesId;
        inv.sequenceNumber = seq;
        inv.displayInvoiceNumber = newDisplayNumber;
        inv.invoiceNumber = newDisplayNumber;

        await inv.save({ session });

        // Update References
        await StockLedger.updateMany({ referenceId: inv._id }, { referenceNo: newDisplayNumber }).session(session);
        await Voucher.updateMany({ voucherNo: oldNumber }, { voucherNo: newDisplayNumber }).session(session);
        await LedgerEntry.updateMany({ voucherNo: oldNumber }, { voucherNo: newDisplayNumber }).session(session);

        await AuditLog.create([{
            user: req.user.id,
            action: 'CHANGE_SERIES',
            module: 'SalesInvoice',
            resourceId: inv._id,
            description: `Changed series from ${inv.seriesId} to ${targetSeriesId}. Number: ${oldNumber} -> ${newDisplayNumber}`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        }], { session });

        await session.commitTransaction();
        res.json({ success: true, message: 'Series changed successfully', newNumber: newDisplayNumber });
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

/**
 * ADMIN ONLY: Bulk renumber multiple invoices manually
 */
export const bulkRenumberInvoices = asyncHandler(async (req, res) => {
    const { updates, seriesId, financialYear } = req.body; // updates: [{id, newDisplayNumber, lock}]

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'No updates provided');
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const series = await InvoiceSeries.findById(seriesId).session(session);
        if (!series) throw new ApiError(httpStatus.NOT_FOUND, 'Series not found');

        // 1. Validate duplicates in the request itself
        const newNumbers = updates.map(u => u.newDisplayNumber);
        if (new Set(newNumbers).size !== newNumbers.length) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Duplicate invoice numbers found in the update list');
        }

        // 2. Validate duplicates against DB (excluding the ones we are editing)
        const updateIds = updates.map(u => u.id);
        const existingWithNewNumbers = await SalesInvoice.findOne({
            seriesId,
            financialYear,
            displayInvoiceNumber: { $in: newNumbers },
            _id: { $nin: updateIds },
            isDeleted: { $ne: true }
        }).session(session);

        if (existingWithNewNumbers) {
            throw new ApiError(httpStatus.BAD_REQUEST, `Invoice number ${existingWithNewNumbers.displayInvoiceNumber} already exists in this series/FY`);
        }

        const stats = { updated: 0, locked: 0 };
        
        // 3. Pass 1: Temporary Rename (to free up unique strings)
        for (const update of updates) {
            const inv = await SalesInvoice.findById(update.id).session(session);
            if (!inv) continue;
            if (inv.numberLocked) {
                throw new ApiError(httpStatus.BAD_REQUEST, `Invoice ${inv.displayInvoiceNumber} is locked and cannot be renumbered`);
            }

            const oldNumber = inv.invoiceNumber;
            const tempNum = `_TEMP_REN_${inv._id}`;

            inv.invoiceNumber = tempNum;
            inv.displayInvoiceNumber = tempNum;
            await inv.save({ session });

            // Also temporarily rename associated Voucher if exists
            await Voucher.updateMany({ voucherNo: oldNumber }, { voucherNo: tempNum }).session(session);
        }

        // 4. Pass 2: Final Reassignment & Reference Updates
        for (const update of updates) {
            const inv = await SalesInvoice.findById(update.id).session(session);
            if (!inv) continue;

            const oldTempNumber = inv.invoiceNumber; // This is the _TEMP_REN_ value
            const newNum = update.newDisplayNumber;
            const newSeq = extractSequenceNumber(series.prefix, newNum);

            // Fetch the old display number (before Pass 1) if possible, or just use history
            // Actually renumberHistory should reflect truth
            const historyOldNumber = inv.renumberHistory.length > 0 ? inv.renumberHistory[inv.renumberHistory.length - 1].newNumber : inv.invoiceNumber;

            inv.renumberHistory.push({
                oldNumber: inv.displayInvoiceNumber.startsWith('_TEMP_REN_') ? 'BATCH_REORG' : inv.displayInvoiceNumber,
                newNumber: newNum,
                reason: 'Bulk Manual Renumbering',
                changedBy: req.user.id
            });

            inv.sequenceNumber = newSeq;
            inv.displayInvoiceNumber = newNum;
            inv.invoiceNumber = newNum;
            if (update.lock) inv.numberLocked = true;

            await inv.save({ session });

            // Update References
            await StockLedger.updateMany({ referenceId: inv._id }, { referenceNo: newNum }).session(session);
            await Voucher.updateMany({ voucherNo: oldTempNumber }, { voucherNo: newNum }).session(session);
            await LedgerEntry.updateMany({ voucherNo: oldTempNumber }, { voucherNo: newNum }).session(session);
            
            stats.updated++;
            if (update.lock) stats.locked++;
        }

        // Sync Series
        await recomputeSeriesState(SalesInvoice, seriesId, session);

        await session.commitTransaction();
        res.json({ success: true, message: `Successfully updated ${stats.updated} invoices.` });
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

/**
 * ADMIN ONLY: Bulk lock/unlock invoices
 */
export const bulkLockInvoices = asyncHandler(async (req, res) => {
    const { ids, lock = true } = req.body;

    if (!ids || !Array.isArray(ids)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid IDs provided');
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        await SalesInvoice.updateMany(
            { _id: { $in: ids } },
            { $set: { numberLocked: lock } }
        ).session(session);

        await session.commitTransaction();
        res.json({ success: true, message: `Successfully ${lock ? 'locked' : 'unlocked'} ${ids.length} invoices.` });
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

/**
 * ADMIN ONLY: GST Correction Mode
 * Safely update missing or incorrect GST compliance fields without touching commercial data.
 */
export const updateGstDetails = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { 
        placeOfSupply, billingStateCode, gstType, reverseCharge, 
        customerRegistrationType, ecommerceGstin, 
        exportType, portCode, shippingBillNo, shippingBillDate, 
        items, reason 
    } = req.body;

    if (!reason || reason.trim() === '') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'A reason for correction is required for the Audit Log.');
    }

    if (!placeOfSupply || placeOfSupply.trim() === '') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Place of Supply cannot be blank.');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const inv = await SalesInvoice.findById(id).session(session);
        if (!inv) throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');

        // Estimate Check
        if (inv.seriesId) {
            const seriesDoc = await InvoiceSeries.findById(inv.seriesId).session(session);
            if (seriesDoc && (seriesDoc.isEstimate || seriesDoc.documentType === 'Estimate' || !seriesDoc.gstApplicable)) {
                throw new ApiError(httpStatus.BAD_REQUEST, 'GST details cannot be updated on an Estimate document.');
            }
        }

        // Snapshot old state for audit log
        const oldState = {
            placeOfSupply: inv.placeOfSupply,
            billingStateCode: inv.billingStateCode,
            gstType: inv.gstType,
            reverseCharge: inv.reverseCharge,
            customerRegistrationType: inv.customerRegistrationType,
            ecommerceGstin: inv.ecommerceGstin,
            exportType: inv.exportType,
            portCode: inv.portCode,
            shippingBillNo: inv.shippingBillNo,
            shippingBillDate: inv.shippingBillDate,
            items: inv.items ? inv.items.map(it => ({ id: it._id, hsnCode: it.hsnCode, uqc: it.uqc })) : []
        };

        // Update fields safely
        if (placeOfSupply !== undefined) inv.placeOfSupply = placeOfSupply;
        if (billingStateCode !== undefined) inv.billingStateCode = billingStateCode;
        if (gstType !== undefined) inv.gstType = gstType;
        if (reverseCharge !== undefined) inv.reverseCharge = reverseCharge;
        if (customerRegistrationType !== undefined) inv.customerRegistrationType = customerRegistrationType;
        if (ecommerceGstin !== undefined) inv.ecommerceGstin = ecommerceGstin;
        
        if (exportType !== undefined) inv.exportType = exportType;
        if (portCode !== undefined) inv.portCode = portCode;
        if (shippingBillNo !== undefined) inv.shippingBillNo = shippingBillNo;
        if (shippingBillDate !== undefined) inv.shippingBillDate = shippingBillDate;

        // Update Item-level GST compliance fields safely
        if (items && Array.isArray(items) && inv.items && inv.items.length > 0) {
            for (const updatedItem of items) {
                const existingItem = inv.items.id(updatedItem._id);
                if (existingItem) {
                    if (updatedItem.hsnCode !== undefined) existingItem.hsnCode = updatedItem.hsnCode;
                    if (updatedItem.uqc !== undefined) existingItem.uqc = updatedItem.uqc;
                }
            }
        }

        inv.updatedBy = req.user.id;
        await inv.save({ session });

        // Audit Logging
        await AuditLog.create([{
            user: req.user.id,
            action: 'UPDATE',
            module: 'SalesInvoice',
            resourceId: inv._id,
            description: `Admin updated GST compliance fields for Invoice ${inv.invoiceNumber}.`,
            details: { reason, oldState, newState: req.body },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        }], { session });

        await session.commitTransaction();
        res.json({ success: true, message: 'GST Return Details safely updated.', data: inv });

    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

/**
 * GET /api/v1/sales-invoices/incentive-report
 * Query params: dateFrom, dateTo, salespersonId, distributorId, status
 */
export const getIncentiveReport = asyncHandler(async (req, res) => {
    const { dateFrom, dateTo, salespersonId, distributorId, status } = req.query;

    const query = {
        isDeleted: false,
        status: { $ne: 'Cancelled' },
        incentiveApplicable: true
    };

    if (dateFrom || dateTo) {
        query.invoiceDate = {};
        if (dateFrom) query.invoiceDate.$gte = new Date(dateFrom);
        if (dateTo) query.invoiceDate.$lte = new Date(dateTo);
    }

    if (salespersonId) query.salespersonId = salespersonId;
    if (distributorId) query.distributorId = distributorId;
    if (status) query.incentiveStatus = status;

    const invoices = await SalesInvoice.find(query)
        .populate('salespersonId', 'name mobile')
        .populate('distributorId', 'name contactPerson phone')
        .sort({ invoiceDate: -1 });

    // Summary statistics
    const summary = {
        totalTaxable: 0,
        totalIncentive: 0,
        pendingCount: 0,
        paidAmount: 0
    };

    const reportData = invoices.map(inv => {
        summary.totalTaxable += inv.totalTaxableAmount || 0;
        summary.totalIncentive += inv.incentiveAmount || 0;
        summary.paidAmount += inv.incentivePaidAmount || 0;
        if (inv.incentiveStatus === 'Pending') summary.pendingCount++;

        return {
            _id: inv._id,
            invoiceNumber: inv.invoiceNumber,
            invoiceDate: inv.invoiceDate,
            customerName: inv.customerName,
            taxableAmount: inv.totalTaxableAmount,
            referralSource: inv.referralSource,
            beneficiary: inv.referralSource === 'Internal Salesperson' 
                ? inv.salespersonId?.name 
                : (inv.distributorId?.name || 'N/A'),
            incentiveType: inv.incentiveType,
            incentiveValue: inv.incentiveValue,
            incentiveAmount: inv.incentiveAmount,
            status: inv.incentiveStatus,
            paidAmount: inv.incentivePaidAmount,
            paidDate: inv.incentivePaidDate,
            remarks: inv.incentiveRemarks
        };
    });

    res.json(new ApiResponse(httpStatus.OK, {
        summary,
        results: reportData
    }, 'Incentive report fetched successfully'));
});

/**
 * POST /api/v1/sales-invoices/:id/incentive-status
 */
export const updateIncentiveStatus = asyncHandler(async (req, res) => {
    const { status, paidAmount, remarks } = req.body;
    const inv = await SalesInvoice.findById(req.params.id);
    if (!inv) throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');

    if (status) inv.incentiveStatus = status;
    if (paidAmount !== undefined) {
        inv.incentivePaidAmount = Number(paidAmount);
        if (inv.incentivePaidAmount > 0 && !inv.incentivePaidDate) {
            inv.incentivePaidDate = new Date();
        }
    }
    if (remarks) inv.incentiveRemarks = remarks;

    inv.updatedBy = req.user.id;
    await inv.save();

    res.json({ success: true, data: inv, message: 'Incentive status updated' });
});
