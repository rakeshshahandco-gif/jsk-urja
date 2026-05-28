import mongoose from 'mongoose';
import httpStatus from 'http-status';
import { PurchaseRfq } from '../models/purchaseRfq.model.js';
import { SupplierQuotation } from '../models/supplierQuotation.model.js';
import { PurchaseOrder } from '../models/purchaseOrder.model.js';
import { Supplier } from '../models/supplier.model.js';
import { Item } from '../models/item.model.js';
import { ApiError } from '../utils/ApiError.js';
import { getFYFromDate } from '../utils/fyUtils.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export async function generateRfqNumber(financialYear) {
    const year = new Date().getFullYear();
    const prefix = `RFQ-${year}-`;
    const last = await PurchaseRfq.findOne({
        rfqNumber: new RegExp(`^${prefix}`),
        isDeleted: { $ne: true },
    })
        .sort({ rfqNumber: -1 })
        .select('rfqNumber');
    if (!last?.rfqNumber) return `${prefix}00001`;
    const n = parseInt(String(last.rfqNumber).split('-').pop(), 10) || 0;
    return `${prefix}${String(n + 1).padStart(5, '0')}`;
}

export async function enrichRfqItems(items) {
    const out = [];
    for (let i = 0; i < items.length; i++) {
        const row = { ...items[i], srNo: i + 1 };
        if (row.itemId) {
            const item = await Item.findById(row.itemId).select(
                'itemCode itemName hsnCode uom currentStock lastPurchaseCost purchaseRate'
            );
            if (item) {
                row.itemCode = row.itemCode || item.itemCode;
                row.itemName = row.itemName || item.itemName;
                row.hsnCode = row.hsnCode || item.hsnCode || '';
                row.uom = row.uom || item.uom || 'NOS';
                row.currentStock = item.currentStock ?? 0;
                row.lastPurchaseRate = item.lastPurchaseCost ?? item.purchaseRate ?? 0;
            }
        }
        out.push(row);
    }
    return out;
}

function calcQuotationLine(line) {
    const qty = Number(line.quotedQty) || Number(line.requiredQty) || 0;
    const rate = Number(line.rate) || 0;
    const disc = Number(line.discountPercent) || 0;
    const tax = Number(line.taxPercent) || 0;
    const freight = Number(line.freightAllocation) || 0;
    const gross = qty * rate;
    const afterDisc = gross - (gross * disc) / 100;
    const netRate = qty > 0 ? r2(afterDisc / qty + freight / Math.max(qty, 1)) : 0;
    const taxAmt = (afterDisc * tax) / 100;
    line.netRate = netRate;
    line.totalAmount = r2(afterDisc + taxAmt + freight);
    return line;
}

export function calcQuotationItems(items) {
    return (items || []).map((it) => calcQuotationLine({ ...it }));
}

function calculatePoTotals(items, gstType, freightAmount = 0, freightGstRate = 0) {
    let subTotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;
    items.forEach((item) => {
        const grossAmount = item.orderedQty * item.rate;
        const discAmt = (grossAmount * (item.discountPercent || 0)) / 100;
        const netAmt = grossAmount - discAmt;
        const taxAmt = (netAmt * (item.taxPercent || 0)) / 100;
        item.amount = r2(netAmt);
        item.taxAmount = r2(taxAmt);
        item.totalAmount = r2(netAmt + taxAmt);
        item.pendingQty = item.orderedQty;
        item.receivedQty = 0;
        subTotal += grossAmount;
        discountTotal += discAmt;
        taxTotal += taxAmt;
    });
    const freightTax = (Number(freightAmount) * Number(freightGstRate)) / 100;
    taxTotal += freightTax;
    return {
        subTotal: r2(subTotal),
        discountTotal: r2(discountTotal),
        taxTotal: r2(taxTotal),
        grandTotal: r2(subTotal - discountTotal + taxTotal + Number(freightAmount || 0)),
    };
}

async function generatePoNumberFallback() {
    const year = new Date().getFullYear();
    const lastPO = await PurchaseOrder.findOne({ poNumber: new RegExp(`^PO-${year}-`) }).sort({ poNumber: -1 });
    if (!lastPO) return `PO-${year}-00001`;
    const lastNumber = parseInt(lastPO.poNumber.split('-')[2], 10) || 0;
    return `PO-${year}-${String(lastNumber + 1).padStart(5, '0')}`;
}

/**
 * Build PO payloads from RFQ selections and create POs (no stock impact).
 */
export async function convertRfqToPurchaseOrders(rfqId, userId, session = null) {
    const opts = session ? { session } : {};
    const rfq = await PurchaseRfq.findById(rfqId).session(session);
    if (!rfq || rfq.isDeleted) throw new ApiError(httpStatus.NOT_FOUND, 'RFQ not found');
    if (['Cancelled', 'Closed'].includes(rfq.status)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'RFQ is closed or cancelled');
    }
    if (rfq.status === 'Converted to PO') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'RFQ already converted to PO');
    }
    if (!rfq.approvedBy) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'RFQ must be approved before conversion');
    }

    const selections = rfq.lineSelections || [];
    const wholeSupplierId = rfq.wholeSupplierId;

    if (!wholeSupplierId && selections.length === 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'No supplier selection for conversion');
    }

    const bySupplier = new Map();

    if (wholeSupplierId) {
        const quot = await SupplierQuotation.findOne({
            rfqId: rfq._id,
            supplierId: wholeSupplierId,
            status: { $in: ['Selected', 'Received', 'Revised'] },
            isDeleted: { $ne: true },
        }).session(session);
        if (!quot) throw new ApiError(httpStatus.BAD_REQUEST, 'Selected supplier quotation not found');
        if (quot.convertedPoId) {
            throw new ApiError(httpStatus.BAD_REQUEST, `Quotation already converted to PO ${quot.convertedPoNumber}`);
        }
        bySupplier.set(String(wholeSupplierId), { quotation: quot, lines: quot.items });
    } else {
        for (const sel of selections) {
            const quot = await SupplierQuotation.findById(sel.quotationId).session(session);
            if (!quot || quot.isDeleted) continue;
            if (quot.convertedPoId) {
                throw new ApiError(
                    httpStatus.BAD_REQUEST,
                    `Quotation ${quot.quotationNo || quot._id} already converted to PO ${quot.convertedPoNumber}`
                );
            }
            const key = String(sel.supplierId);
            if (!bySupplier.has(key)) bySupplier.set(key, { quotation: quot, lines: [] });
            const qLine = quot.items.find((it) => String(it.rfqItemId) === String(sel.rfqItemId));
            if (!qLine) continue;
            const lineObj = typeof qLine.toObject === 'function' ? qLine.toObject() : { ...qLine };
            bySupplier.get(key).lines.push({ ...lineObj, quotedQty: sel.selectedQty });
        }
    }

    const createdPos = [];
    const fy = rfq.financialYear || getFYFromDate(new Date());

    for (const [, { quotation, lines }] of bySupplier) {
        const supplier = await Supplier.findById(quotation.supplierId).session(session);
        if (!supplier) throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found');

        const poItems = lines.map((ln) => {
            const rfqLine = rfq.items.id?.(ln.rfqItemId) || rfq.items.find(
                (ri) => String(ri._id) === String(ln.rfqItemId)
            );
            const itemId = ln.itemId || rfqLine?.itemId;
            return {
                itemId,
                itemCode: ln.itemCode || rfqLine?.itemCode || '',
                itemName: ln.itemDescription || rfqLine?.itemName || 'Item',
                description: ln.itemDescription || rfqLine?.specification || '',
                hsnCode: ln.hsnCode || rfqLine?.hsnCode || '',
                uom: ln.uom || rfqLine?.uom || 'NOS',
                orderedQty: Number(ln.quotedQty) || Number(ln.requiredQty) || 0,
                rate: Number(ln.rate) || Number(ln.netRate) || 0,
                discountPercent: Number(ln.discountPercent) || 0,
                taxPercent: Number(ln.taxPercent) || 0,
                additionalNotes: ln.supplierRemarks || '',
            };
        }).filter((it) => it.orderedQty > 0 && it.itemId);

        if (poItems.length === 0) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'No valid line items for PO conversion');
        }

        const gstType = supplier.gstType === 'IGST' ? 'IGST' : 'CGST / SGST';
        const totals = calculatePoTotals(
            poItems,
            gstType,
            quotation.freightPackingForwarding || 0,
            0
        );

        const poNumber = await generatePoNumberFallback();
        const [po] = await PurchaseOrder.create(
            [{
                poNumber,
                poDate: new Date(),
                supplierId: supplier._id,
                supplierName: supplier.supplierName,
                supplierAddress: supplier.address || '',
                supplierGstNumber: supplier.gstNumber || '',
                supplierState: supplier.state || '',
                supplierContact: supplier.contactPerson || '',
                supplierPhone: supplier.phone || '',
                supplierEmail: supplier.email || '',
                gstType,
                paymentTerms: quotation.paymentTerms || supplier.paymentTerms || '',
                expectedDeliveryDate: null,
                status: 'Ordered',
                remarks: `From RFQ ${rfq.rfqNumber} / Quotation ${quotation.quotationNo || ''}`.trim(),
                items: poItems,
                freightAmount: quotation.freightPackingForwarding || 0,
                rfqId: rfq._id,
                rfqNumber: rfq.rfqNumber,
                supplierQuotationId: quotation._id,
                supplierQuotationNo: quotation.quotationNo || '',
                supplierQuotationDate: quotation.quotationDate || null,
                financialYear: fy,
                createdBy: userId,
                ...totals,
            }],
            opts
        );

        quotation.status = 'Converted to PO';
        quotation.convertedPoId = po._id;
        quotation.convertedPoNumber = po.poNumber;
        quotation.updatedBy = userId;
        await quotation.save(opts);

        createdPos.push(po);
    }

    const convertedQuotIds = [...bySupplier.values()].map((v) => v.quotation._id);
    await SupplierQuotation.updateMany(
        {
            rfqId: rfq._id,
            _id: { $nin: convertedQuotIds },
            status: { $nin: ['Converted to PO', 'Rejected'] },
        },
        { $set: { status: 'Not Selected', updatedBy: userId } },
        opts
    );

    rfq.status = 'Converted to PO';
    rfq.convertedPoIds = [...(rfq.convertedPoIds || []), ...convertedIds];
    rfq.updatedBy = userId;
    await rfq.save(opts);

    return createdPos;
}

export function buildComparisonMatrix(rfq, quotations) {
    const suppliers = rfq.suppliers || [];
    const items = rfq.items || [];
    const matrix = items.map((rfqItem) => {
        const row = {
            rfqItemId: rfqItem._id,
            itemCode: rfqItem.itemCode,
            itemName: rfqItem.itemName,
            requiredQty: rfqItem.requiredQty,
            uom: rfqItem.uom,
            lastPurchaseRate: rfqItem.lastPurchaseRate,
            suppliers: {},
        };
        let lowestRate = Infinity;
        let lowestLanded = Infinity;
        let fastestDelivery = Infinity;

        for (const sup of suppliers) {
            const quot = quotations.find((q) => String(q.supplierId) === String(sup.supplierId));
            if (!quot) {
                row.suppliers[String(sup.supplierId)] = null;
                continue;
            }
            const qLine =
                quot.items.find((it) => String(it.rfqItemId) === String(rfqItem._id)) ||
                quot.items.find((it) => it.itemCode === rfqItem.itemCode);
            if (!qLine) {
                row.suppliers[String(sup.supplierId)] = null;
                continue;
            }
            const basicRate = Number(qLine.rate) || 0;
            const landed = Number(qLine.netRate) || basicRate;
            const deliveryDays = Number(qLine.deliveryDays) || 0;
            row.suppliers[String(sup.supplierId)] = {
                quotationId: quot._id,
                rate: basicRate,
                netRate: landed,
                totalAmount: qLine.totalAmount,
                deliveryDays,
                paymentTerms: quot.paymentTerms,
                gstMode: quot.gstExtraInclusive,
                freight: quot.freightPackingForwarding,
            };
            if (basicRate > 0 && basicRate < lowestRate) lowestRate = basicRate;
            if (landed > 0 && landed < lowestLanded) lowestLanded = landed;
            if (deliveryDays > 0 && deliveryDays < fastestDelivery) fastestDelivery = deliveryDays;
        }
        row.lowestBasicRate = lowestRate === Infinity ? null : lowestRate;
        row.lowestLandedCost = lowestLanded === Infinity ? null : lowestLanded;
        row.fastestDeliveryDays = fastestDelivery === Infinity ? null : fastestDelivery;
        return row;
    });

    return { rfq, quotations, matrix, suppliers };
}
