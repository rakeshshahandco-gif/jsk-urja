import httpStatus from 'http-status';
import ExcelJS from 'exceljs';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { CustomerPriceList } from '../models/customerPriceList.model.js';
import { ProductPriceDefault } from '../models/productPriceDefault.model.js';
import { Item } from '../models/item.model.js';
import Customer from '../models/customer.model.js';
import { CompanyProfile } from '../models/companyProfile.model.js';
import { SalesOrder } from '../models/salesOrder.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { getFYFromDate, getShortFY } from '../utils/fyUtils.js';
import {
    validateLineSlabs,
    validateQtyBreaks,
    suggestFromLoadedLists,
    formatSlabLabel,
    formatQtyBreakLabel,
    deriveAdjacentMaxQty,
    isFilledRate,
    isUsableStatus,
} from '../services/customerPriceLookup.service.js';

const userName = (user) => user?.name || user?.fullName || user?.email || '';

const customerDisplay = (c) => {
    const primary = c.contactPersons?.find((p) => p.isPrimary) || c.contactPersons?.[0] || {};
    const addrParts = [c.address, c.city].filter(Boolean);
    return {
        partyType: 'Existing Customer',
        customerId: c._id,
        customerName: c.customerName || c.name || '',
        customerCompany: c.company || '',
        customerCode: c.customerCode || '',
        customerCity: c.city || '',
        customerGstin: c.gstNumber || c.gstin || '',
        customerContactName: primary.name || c.customerName || '',
        customerPhone: primary.mobile || '',
        customerWhatsapp: primary.whatsApp || primary.mobile || '',
        customerEmail: c.companyEmail || primary.email || '',
        customerState: c.state || '',
        customerAddress: addrParts.join(', '),
    };
};

const snapshotFromBody = (body = {}) => ({
    partyType: 'Prospect',
    customerId: null,
    customerName: String(body.customerName || '').trim(),
    customerCompany: String(body.customerCompany || '').trim(),
    customerCode: '',
    customerCity: String(body.customerCity || '').trim(),
    customerGstin: String(body.customerGstin || '').trim(),
    customerContactName: String(body.customerContactName || body.customerName || '').trim(),
    customerPhone: String(body.customerPhone || '').trim(),
    customerWhatsapp: String(body.customerWhatsapp || '').trim(),
    customerEmail: String(body.customerEmail || '').trim(),
    customerState: String(body.customerState || '').trim(),
    customerAddress: String(body.customerAddress || '').trim(),
});

const originalSnap = (fields) => ({
    customerName: fields.customerName || '',
    customerCompany: fields.customerCompany || '',
    customerContactName: fields.customerContactName || '',
    customerPhone: fields.customerPhone || '',
    customerWhatsapp: fields.customerWhatsapp || '',
    customerEmail: fields.customerEmail || '',
    customerCity: fields.customerCity || '',
    customerState: fields.customerState || '',
    customerGstin: fields.customerGstin || '',
    customerAddress: fields.customerAddress || '',
});

const nextPriceListNo = async (date) => {
    const fy = getFYFromDate(date || new Date());
    const short = getShortFY(fy);
    const prefix = `PL/${short}/`;
    const last = await CustomerPriceList.findOne({
        priceListNo: { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` },
        isDeleted: { $ne: true },
        versionNo: 1,
    }).sort({ priceListNo: -1 }).lean();
    let seq = 1;
    if (last?.priceListNo) {
        const n = parseInt(String(last.priceListNo).split('/').pop(), 10);
        if (Number.isFinite(n)) seq = n + 1;
    }
    return { priceListNo: `${prefix}${String(seq).padStart(3, '0')}`, financialYear: fy };
};

/** Keep a saved snapshot when present (including empty). Fill from Item Master only if the field was not sent. */
const snapOrLive = (rawVal, liveVal) => {
    if (rawVal !== undefined && rawVal !== null) return String(rawVal).trim();
    return String(liveVal || '').trim();
};

const itemMasterDescription = (item) =>
    String(item?.productDescription || item?.description || '').trim();

const normCurrency = (v) => String(v || 'INR').trim().toUpperCase() || 'INR';

const normalizeDefaultBreaks = (raw) => {
    const out = [];
    const seen = new Set();
    for (const b of raw || []) {
        const qty = Number(b.minQty);
        const rateVal = b.rate != null && b.rate !== '' ? b.rate : b.finalRate;
        if (rateVal === '' || rateVal == null) continue;
        const rate = Number(rateVal);
        if (!(qty > 0) || !Number.isFinite(rate) || rate < 0) continue;
        if (seen.has(qty)) {
            throw new ApiError(httpStatus.BAD_REQUEST, `Duplicate Qty ${qty}`);
        }
        seen.add(qty);
        out.push({ minQty: qty, rate });
    }
    out.sort((a, b) => a.minQty - b.minQty);
    return out;
};

const hydrateLines = async (rawLines) => {
    const lines = [];
    const itemCache = new Map();
    for (const raw of rawLines || []) {
        if (!raw.itemId) continue;
        if (!isFilledRate({ finalRate: raw.finalRate }) && !isFilledRate({ finalRate: raw.offeredRate })) {
            continue;
        }
        let item = itemCache.get(String(raw.itemId));
        if (!item) {
            item = await Item.findById(raw.itemId).lean();
            if (!item) throw new ApiError(httpStatus.BAD_REQUEST, 'Item not found');
            itemCache.set(String(raw.itemId), item);
        }
        const rateSource = isFilledRate({ finalRate: raw.finalRate }) ? raw.finalRate : raw.offeredRate;
        const finalRate = Number(rateSource);
        if (!Number.isFinite(finalRate) || finalRate < 0) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Rate must be 0 or more');
        }
        const minQty = raw.minQty === '' || raw.minQty == null ? null : Number(raw.minQty);
        if (minQty != null && !(minQty > 0)) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Qty must be greater than 0');
        }
        lines.push({
            itemId: item._id,
            productName: snapOrLive(raw.productName, item.itemName),
            itemCode: snapOrLive(raw.itemCode, item.itemCode),
            modelNo: snapOrLive(raw.modelNo, item.modelNo),
            description: snapOrLive(raw.description, itemMasterDescription(item)),
            uom: raw.uom || item.uom || 'NOS',
            moq: Number(raw.moq) || 0,
            minQty: Number.isFinite(minQty) && minQty > 0 ? minQty : null,
            maxQty: null,
            standardPrice: Number(raw.standardPrice) || Number(item.sellingPrice) || 0,
            offeredRate: finalRate,
            discountPercent: Number(raw.discountPercent) || 0,
            finalRate,
            taxTreatment: raw.taxTreatment === 'Included' ? 'Included' : 'Extra',
            remarks: raw.remarks || '',
        });
    }
    if (!lines.length) throw new ApiError(httpStatus.BAD_REQUEST, 'Enter at least one Qty and Rate');
    lines.sort((a, b) => {
        const ia = String(a.itemId);
        const ib = String(b.itemId);
        if (ia !== ib) return ia.localeCompare(ib);
        return (Number(a.minQty) || 0) - (Number(b.minQty) || 0);
    });
    const qtyErr = validateQtyBreaks(lines.filter((l) => Number(l.minQty) > 0));
    if (qtyErr) throw new ApiError(httpStatus.BAD_REQUEST, qtyErr);
    const derived = deriveAdjacentMaxQty(lines);
    const slabErr = validateLineSlabs(derived);
    if (slabErr) throw new ApiError(httpStatus.BAD_REQUEST, slabErr);
    return derived;
};

const assertDraft = (doc) => {
    if (doc.status !== 'Draft') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Only Draft price lists can be edited. Create a new version instead.');
    }
};

const loadCompanyProfile = async () => {
    const profile = await CompanyProfile.findOne({}).lean();
    return profile || {};
};

export const listPriceLists = asyncHandler(async (req, res) => {
    const {
        status, customerId, itemId, search, page = 1, limit = 50, view,
    } = req.query;
    const filter = { isDeleted: { $ne: true } };
    if (customerId) filter.customerId = customerId;
    if (itemId) filter['lines.itemId'] = itemId;
    if (status) filter.status = status;
    if (view === 'active') filter.status = { $in: ['Approved', 'Sent'] };
    if (view === 'expired') filter.status = 'Expired';
    if (view === 'history') {
        /* all non-deleted */
    }
    if (search) {
        filter.$or = [
            { priceListNo: { $regex: search, $options: 'i' } },
            { customerName: { $regex: search, $options: 'i' } },
            { customerCompany: { $regex: search, $options: 'i' } },
            { customerCode: { $regex: search, $options: 'i' } },
            { customerPhone: { $regex: search, $options: 'i' } },
            { customerGstin: { $regex: search, $options: 'i' } },
        ];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [rows, total] = await Promise.all([
        CustomerPriceList.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
        CustomerPriceList.countDocuments(filter),
    ]);
    res.json(new ApiResponse(200, {
        rows, total, page: Number(page), pages: Math.ceil(total / Number(limit)) || 1,
    }, 'Price lists fetched'));
});

export const getPriceList = asyncHandler(async (req, res) => {
    const doc = await CustomerPriceList.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).lean();
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Price list not found');
    res.json(new ApiResponse(200, doc, 'Price list fetched'));
});

export const createPriceList = asyncHandler(async (req, res) => {
    const body = req.body || {};
    const isProspect = body.partyType === 'Prospect';
    let party;
    if (isProspect) {
        party = snapshotFromBody(body);
        if (!party.customerName && !party.customerCompany) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Person name or company name is required for a prospect');
        }
    } else {
        if (!body.customerId) throw new ApiError(httpStatus.BAD_REQUEST, 'Customer is required');
        const customer = await Customer.findById(body.customerId).lean();
        if (!customer) throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
        party = customerDisplay(customer);
    }
    const date = body.date ? new Date(body.date) : new Date();
    const { priceListNo, financialYear } = await nextPriceListNo(date);
    const lines = await hydrateLines(body.lines);
    const doc = await CustomerPriceList.create({
        financialYear,
        priceListNo,
        version: 'V1',
        versionNo: 1,
        ...party,
        originalPartySnapshot: originalSnap(party),
        date,
        effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : date,
        validUpto: body.validUpto ? new Date(body.validUpto) : null,
        currency: body.currency || 'INR',
        priceType: body.priceType || 'Customer Specific',
        gstTreatment: body.gstTreatment === 'Included' ? 'Included' : 'Extra',
        freightTerms: body.freightTerms || '',
        paymentTerms: body.paymentTerms || '',
        deliveryTerms: body.deliveryTerms || '',
        warrantyNotes: body.warrantyNotes || '',
        remarks: body.remarks || '',
        preparedBy: body.preparedBy || userName(req.user),
        status: 'Draft',
        lines,
        createdBy: req.user?._id,
        updatedBy: req.user?._id,
    });
    res.status(201).json(new ApiResponse(201, doc, `Price list ${doc.priceListNo} saved as Draft`));
});

export const updatePriceList = asyncHandler(async (req, res) => {
    const doc = await CustomerPriceList.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Price list not found');
    assertDraft(doc);
    const body = req.body || {};
    if (body.partyType === 'Prospect') {
        const party = snapshotFromBody(body);
        if (!party.customerName && !party.customerCompany) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Person name or company name is required for a prospect');
        }
        Object.assign(doc, party);
        if (!doc.originalPartySnapshot) doc.originalPartySnapshot = originalSnap(party);
    } else if (body.customerId && String(body.customerId) !== String(doc.customerId || '')) {
        const customer = await Customer.findById(body.customerId).lean();
        if (!customer) throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
        Object.assign(doc, customerDisplay(customer));
    }
    if (body.lines) doc.lines = await hydrateLines(body.lines);
    const assignable = [
        'date', 'effectiveFrom', 'validUpto', 'currency', 'priceType', 'gstTreatment',
        'freightTerms', 'paymentTerms', 'deliveryTerms', 'warrantyNotes', 'remarks', 'preparedBy',
    ];
    for (const k of assignable) {
        if (body[k] === undefined) continue;
        if (k === 'date' || k === 'effectiveFrom' || k === 'validUpto') {
            doc[k] = body[k] ? new Date(body[k]) : null;
        } else {
            doc[k] = body[k];
        }
    }
    doc.updatedBy = req.user?._id;
    await doc.save();
    res.json(new ApiResponse(200, doc, 'Price list updated'));
});

export const approvePriceList = asyncHandler(async (req, res) => {
    const doc = await CustomerPriceList.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Price list not found');
    if (doc.status !== 'Draft') throw new ApiError(httpStatus.BAD_REQUEST, 'Only Draft can be approved');
    if (!doc.lines?.length) throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot approve an empty price list');
    doc.status = 'Approved';
    doc.approvedBy = req.user?._id;
    doc.approvedByName = userName(req.user);
    doc.approvedAt = new Date();
    doc.updatedBy = req.user?._id;
    await doc.save();
    res.json(new ApiResponse(200, doc, 'Price list approved'));
});

export const expirePriceList = asyncHandler(async (req, res) => {
    const doc = await CustomerPriceList.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Price list not found');
    if (!['Approved', 'Sent'].includes(doc.status)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Only Approved or Sent lists can be expired');
    }
    doc.status = 'Expired';
    doc.updatedBy = req.user?._id;
    await doc.save();
    res.json(new ApiResponse(200, doc, 'Price list expired'));
});

export const revisePriceList = asyncHandler(async (req, res) => {
    const prev = await CustomerPriceList.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!prev) throw new ApiError(httpStatus.NOT_FOUND, 'Price list not found');
    if (!['Approved', 'Sent', 'Expired'].includes(prev.status)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Revise from an Approved, Sent or Expired list');
    }
    const reason = (req.body || {}).revisionReason || '';
    const nextNo = (prev.versionNo || 1) + 1;
    const clone = prev.toObject();
    delete clone._id;
    delete clone.createdAt;
    delete clone.updatedAt;
    delete clone.approvedBy;
    delete clone.approvedAt;
    delete clone.sentBy;
    delete clone.sentAt;
    delete clone.sentHistory;
    const created = await CustomerPriceList.create({
        ...clone,
        version: `V${nextNo}`,
        versionNo: nextNo,
        previousVersionId: prev._id,
        supersededById: null,
        revisionDate: new Date(),
        revisedBy: req.user?._id,
        revisionReason: reason,
        status: 'Draft',
        preparedBy: userName(req.user),
        approvedByName: '',
        createdBy: req.user?._id,
        updatedBy: req.user?._id,
        lines: (req.body || {}).lines ? await hydrateLines(req.body.lines) : prev.lines,
    });
    prev.status = 'Superseded';
    prev.supersededById = created._id;
    prev.supersededBy = req.user?._id;
    prev.supersededAt = new Date();
    prev.updatedBy = req.user?._id;
    await prev.save();
    res.status(201).json(new ApiResponse(201, created, `${prev.priceListNo} ${created.version} created. Previous version kept in history.`));
});

export const markPriceListSent = asyncHandler(async (req, res) => {
    const doc = await CustomerPriceList.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Price list not found');
    if (!['Approved', 'Sent'].includes(doc.status)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Approve the price list before sending');
    }
    const body = req.body || {};
    const entry = {
        channel: ['WhatsApp', 'Email', 'Manual'].includes(body.channel) ? body.channel : 'Manual',
        recipient: body.recipient || body.phone || body.email || '',
        contactName: body.contactName || body.recipientName || '',
        documentKind: body.documentKind || 'PDF',
        version: doc.version,
        priceListNo: doc.priceListNo,
        sentBy: req.user?._id,
        sentByName: userName(req.user),
        sentAt: new Date(),
        status: 'Sent',
        note: body.note || '',
    };
    doc.sentHistory.push(entry);
    doc.status = 'Sent';
    doc.sentBy = req.user?._id;
    doc.sentAt = entry.sentAt;
    doc.updatedBy = req.user?._id;
    await doc.save();
    res.json(new ApiResponse(200, doc, 'Send recorded'));
});

export const findPossibleCustomers = asyncHandler(async (req, res) => {
    const mobile = String(req.query.mobile || '').replace(/\D/g, '');
    const gstin = String(req.query.gstin || '').replace(/\s/g, '').toUpperCase();
    const email = String(req.query.email || '').trim().toLowerCase();
    const company = String(req.query.company || '').trim();
    const or = [];
    if (mobile.length >= 10) {
        or.push({ 'contactPersons.mobile': mobile });
        or.push({ 'contactPersons.whatsApp': mobile });
        or.push({ 'contactPersons.mobile2': mobile });
    }
    if (gstin.length >= 10) or.push({ gstNumber: gstin });
    if (email && email.includes('@')) {
        or.push({ companyEmail: email });
        or.push({ 'contactPersons.email': email });
    }
    if (company.length > 2) {
        or.push({ company: { $regex: `^\\s*${company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, $options: 'i' } });
    }
    if (!or.length) {
        return res.json(new ApiResponse(200, { matches: [] }, 'No keys to check'));
    }
    const matches = await Customer.find({ isDeleted: { $ne: true }, $or: or })
        .select('customerName company customerCode gstNumber city companyEmail contactPersons')
        .limit(10)
        .lean();
    res.json(new ApiResponse(200, {
        matches: matches.map((c) => {
            const primary = c.contactPersons?.find((p) => p.isPrimary) || c.contactPersons?.[0] || {};
            return {
                _id: c._id,
                customerName: c.customerName || '',
                company: c.company || '',
                customerCode: c.customerCode || '',
                gstin: c.gstNumber || '',
                city: c.city || '',
                phone: primary.mobile || '',
                email: c.companyEmail || primary.email || '',
            };
        }),
    }, 'Possible customers'));
});

export const linkCustomer = asyncHandler(async (req, res) => {
    const doc = await CustomerPriceList.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Price list not found');
    const customerId = req.body?.customerId;
    if (!customerId) throw new ApiError(httpStatus.BAD_REQUEST, 'customerId is required');
    const customer = await Customer.findById(customerId).lean();
    if (!customer) throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
    if (!doc.originalPartySnapshot) {
        doc.originalPartySnapshot = originalSnap(doc);
    }
    doc.customerId = customer._id;
    doc.partyType = 'Existing Customer';
    doc.customerCode = customer.customerCode || doc.customerCode || '';
    doc.linkedAt = new Date();
    doc.linkedBy = req.user?._id;
    doc.updatedBy = req.user?._id;
    await doc.save();
    res.json(new ApiResponse(200, doc, 'Price list linked to customer. Original recipient snapshot kept.'));
});

export const getPrintPayload = asyncHandler(async (req, res) => {
    const doc = await CustomerPriceList.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).lean();
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Price list not found');
    const company = await loadCompanyProfile();
    res.json(new ApiResponse(200, { priceList: doc, company }, 'Print payload'));
});

export const downloadExcel = asyncHandler(async (req, res) => {
    const doc = await CustomerPriceList.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).lean();
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Price list not found');
    const company = await loadCompanyProfile();
    const wb = new ExcelJS.Workbook();
    wb.creator = company.companyName || 'JSK URJA';
    const ws = wb.addWorksheet('Price List');
    ws.columns = [
        { width: 8 }, { width: 28 }, { width: 18 }, { width: 42 }, { width: 16 }, { width: 14 },
    ];
    let r = 1;
    ws.mergeCells(r, 1, r, 6);
    ws.getCell(r, 1).value = company.companyName || 'JSK INNOVATIVE TECHNOLOGY PVT. LTD.';
    ws.getCell(r, 1).font = { bold: true, size: 16 };
    r += 1;
    ws.mergeCells(r, 1, r, 6);
    ws.getCell(r, 1).value = company.tradeName ? `${company.tradeName}  |  JSK URJA` : 'JSK URJA';
    r += 1;
    const addr = [company.address, company.city, company.state, company.pincode].filter(Boolean).join(', ');
    ws.mergeCells(r, 1, r, 6);
    ws.getCell(r, 1).value = addr;
    r += 1;
    ws.mergeCells(r, 1, r, 6);
    ws.getCell(r, 1).value = [
        company.gstNumber ? `GSTIN: ${company.gstNumber}` : '',
        company.email || '',
        company.phone || '',
        company.websiteUrl || '',
    ].filter(Boolean).join('  |  ');
    r += 2;
    ws.getCell(r, 1).value = 'CUSTOMER PRICE LIST';
    ws.getCell(r, 1).font = { bold: true, size: 14 };
    r += 1;
    const meta = [
        ['Price List No.', `${doc.priceListNo}  ${doc.version}`],
        ['Date', doc.date ? new Date(doc.date).toLocaleDateString('en-IN') : ''],
        ['Valid Upto', doc.validUpto ? new Date(doc.validUpto).toLocaleDateString('en-IN') : 'Open'],
        ['Customer', doc.customerName || ''],
        ['Company', doc.customerCompany || ''],
        ['Contact', doc.customerContactName || ''],
        ['Mobile', doc.customerPhone || doc.customerWhatsapp || ''],
        ['City', doc.customerCity || ''],
        ['GSTIN', doc.customerGstin || ''],
        ['Currency', doc.currency || 'INR'],
        ['GST Treatment', doc.gstTreatment || 'Extra'],
    ];
    for (const [k, v] of meta) {
        ws.getCell(r, 1).value = k;
        ws.getCell(r, 1).font = { bold: true };
        ws.mergeCells(r, 2, r, 6);
        ws.getCell(r, 2).value = v;
        r += 1;
    }
    r += 1;
    const headers = ['Sr.', 'Product', 'Model No.', 'Description', 'Quantity', 'Unit Rate'];
    headers.forEach((h, i) => {
        const cell = ws.getCell(r, i + 1);
        cell.value = h;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    });
    r += 1;
    const filledLines = (doc.lines || []).filter(isFilledRate);
    filledLines.forEach((line, idx) => {
        const row = [
            idx + 1,
            line.productName || '—',
            line.modelNo || '—',
            line.description || '—',
            formatQtyBreakLabel(line),
            Number(line.finalRate),
        ];
        row.forEach((val, i) => { ws.getCell(r, i + 1).value = val; });
        ws.getCell(r, 6).numFmt = '₹#,##0.00';
        r += 1;
    });
    r += 2;
    const terms = [
        ['GST', doc.gstTreatment === 'Included' ? 'GST included in unit price' : 'GST extra as applicable'],
        ['Freight', doc.freightTerms || '—'],
        ['Payment', doc.paymentTerms || '—'],
        ['Delivery', doc.deliveryTerms || '—'],
        ['Warranty', doc.warrantyNotes || '—'],
        ['Validity', doc.validUpto ? `Prices valid up to ${new Date(doc.validUpto).toLocaleDateString('en-IN')}` : 'Until revised'],
        ['Remarks', doc.remarks || '—'],
    ];
    ws.getCell(r, 1).value = 'Terms';
    ws.getCell(r, 1).font = { bold: true };
    r += 1;
    for (const [k, v] of terms) {
        ws.getCell(r, 1).value = k;
        ws.mergeCells(r, 2, r, 6);
        ws.getCell(r, 2).value = v;
        r += 1;
    }
    r += 2;
    ws.getCell(r, 5).value = 'Authorized Signatory';
    r += 1;
    ws.mergeCells(r, 5, r, 6);
    ws.getCell(r, 5).value = company.companyName || '';

    const buf = await wb.xlsx.writeBuffer();
    const fname = `${doc.priceListNo.replace(/\//g, '-')}-${doc.version}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(Buffer.from(buf));
});

const lastLineRate = (doc, itemId) => {
    const line = (doc.items || []).find((i) => String(i.itemId) === String(itemId));
    return line ? Number(line.rate) : null;
};

export const suggestPrice = asyncHandler(async (req, res) => {
    const { customerId, itemId, qty, date, currency } = req.query;
    if (!customerId || !itemId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'customerId and itemId are required');
    }
    const item = await Item.findById(itemId).lean();
    const standardPrice = Number(item?.sellingPrice) || 0;
    const lists = await CustomerPriceList.find({
        customerId,
        isDeleted: { $ne: true },
        status: { $in: ['Approved', 'Sent'] },
        'lines.itemId': itemId,
        partyType: { $ne: 'Prospect' },
    }).lean();

    const suggestion = suggestFromLoadedLists({
        lists,
        itemId,
        qty: Number(qty) || 0,
        docDate: date || new Date(),
        currency: currency || 'INR',
        standardPrice,
    });

    const lastQuotedDoc = await CustomerPriceList.findOne({
        customerId,
        isDeleted: { $ne: true },
        status: { $in: ['Approved', 'Sent', 'Superseded', 'Expired'] },
        'lines.itemId': itemId,
    }).sort({ date: -1, versionNo: -1 }).lean();
    const quotedLine = lastQuotedDoc
        ? (lastQuotedDoc.lines || []).find((l) => String(l.itemId) === String(itemId))
        : null;

    const lastSO = await SalesOrder.findOne({
        customerId,
        isDeleted: { $ne: true },
        status: { $nin: ['Cancelled'] },
        'items.itemId': itemId,
    }).sort({ soDate: -1 }).lean();

    const lastInv = await SalesInvoice.findOne({
        customerId,
        isDeleted: { $ne: true },
        status: { $ne: 'Cancelled' },
        'items.itemId': itemId,
    }).sort({ invoiceDate: -1 }).lean();

    res.json(new ApiResponse(200, {
        ...suggestion,
        lastQuotedPrice: quotedLine ? Number(quotedLine.finalRate) : null,
        lastQuotedSource: lastQuotedDoc
            ? `${lastQuotedDoc.priceListNo} ${lastQuotedDoc.version}`
            : null,
        lastSalesOrderPrice: lastSO ? lastLineRate(lastSO, itemId) : null,
        lastSalesOrderNo: lastSO?.soNumber || null,
        lastInvoicePrice: lastInv ? lastLineRate(lastInv, itemId) : null,
        lastInvoiceNo: lastInv?.displayInvoiceNumber || lastInv?.invoiceNumber || null,
        standardPrice,
        modelNo: item?.modelNo || '',
    }, 'Suggestion'));
});

export const priceHistory = asyncHandler(async (req, res) => {
    const { customerId, itemId, search } = req.query;
    if (!customerId && !itemId && !search) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'customerId, itemId or search is required');
    }
    const filter = { isDeleted: { $ne: true } };
    if (customerId) filter.customerId = customerId;
    if (itemId) filter['lines.itemId'] = itemId;
    if (search) {
        filter.$or = [
            { customerName: { $regex: search, $options: 'i' } },
            { customerCompany: { $regex: search, $options: 'i' } },
            { customerContactName: { $regex: search, $options: 'i' } },
            { customerPhone: { $regex: search, $options: 'i' } },
        ];
    }
    const lists = await CustomerPriceList.find(filter).sort({ date: -1, versionNo: -1 }).lean();

    const rows = [];
    for (const doc of lists) {
        for (const line of doc.lines || []) {
            if (itemId && String(line.itemId) !== String(itemId)) continue;
            rows.push({
                date: doc.date,
                priceListId: doc._id,
                priceListNo: doc.priceListNo,
                version: doc.version,
                customerId: doc.customerId,
                customerName: doc.customerName,
                customerCompany: doc.customerCompany,
                product: line.productName,
                itemId: line.itemId,
                itemCode: line.itemCode,
                slab: formatSlabLabel(line),
                rate: line.finalRate,
                status: doc.status,
            });
        }
    }

    let lastSalesOrderPrice = null;
    let lastInvoicePrice = null;
    let lastQuotedPrice = null;
    if (customerId && itemId) {
        const lastQuotedDoc = lists.find((d) => (d.lines || []).some((l) => String(l.itemId) === String(itemId)));
        const qLine = lastQuotedDoc?.lines?.find((l) => String(l.itemId) === String(itemId));
        lastQuotedPrice = qLine ? Number(qLine.finalRate) : null;
        const lastSO = await SalesOrder.findOne({
            customerId, isDeleted: { $ne: true }, status: { $nin: ['Cancelled'] }, 'items.itemId': itemId,
        }).sort({ soDate: -1 }).lean();
        lastSalesOrderPrice = lastSO ? lastLineRate(lastSO, itemId) : null;
        const lastInv = await SalesInvoice.findOne({
            customerId, isDeleted: { $ne: true }, status: { $ne: 'Cancelled' }, 'items.itemId': itemId,
        }).sort({ invoiceDate: -1 }).lean();
        lastInvoicePrice = lastInv ? lastLineRate(lastInv, itemId) : null;
    }

    res.json(new ApiResponse(200, {
        rows,
        lastQuotedPrice,
        lastSalesOrderPrice,
        lastInvoicePrice,
    }, 'Price history'));
});

export const getProductDefault = asyncHandler(async (req, res) => {
    const itemId = req.query.itemId;
    const currency = normCurrency(req.query.currency);
    if (!itemId) throw new ApiError(httpStatus.BAD_REQUEST, 'itemId is required');
    if (!req.companyId) throw new ApiError(httpStatus.BAD_REQUEST, 'Company context is required');
    const doc = await ProductPriceDefault.findOne({
        companyId: req.companyId,
        itemId,
        currency,
    }).lean();
    if (!doc) {
        res.json(new ApiResponse(200, {
            found: false,
            itemId,
            currency,
            breaks: [],
        }, 'No default product price'));
        return;
    }
    res.json(new ApiResponse(200, {
        found: true,
        itemId: doc.itemId,
        currency: doc.currency,
        breaks: doc.breaks || [],
        updatedAt: doc.updatedAt,
        updatedByName: doc.updatedByName || '',
    }, 'Default product price'));
});

export const saveProductDefault = asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (!body.itemId) throw new ApiError(httpStatus.BAD_REQUEST, 'itemId is required');
    if (!req.companyId) throw new ApiError(httpStatus.BAD_REQUEST, 'Company context is required');
    const item = await Item.findById(body.itemId).lean();
    if (!item) throw new ApiError(httpStatus.NOT_FOUND, 'Item not found');
    const currency = normCurrency(body.currency);
    const breaks = normalizeDefaultBreaks(body.breaks);
    if (!breaks.length) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Enter at least one Qty and Rate to save as default');
    }
    const prev = await ProductPriceDefault.findOne({
        companyId: req.companyId,
        itemId: body.itemId,
        currency,
    });
    const previousBreaks = prev?.breaks ? prev.breaks.map((b) => ({ minQty: b.minQty, rate: b.rate })) : [];
    const auditEntry = {
        changedAt: new Date(),
        changedBy: req.user?._id || null,
        changedByName: userName(req.user),
        previousBreaks,
        newBreaks: breaks,
        sourcePriceListId: body.sourcePriceListId || null,
        sourcePriceListNo: body.sourcePriceListNo || '',
    };
    const audit = [...(prev?.audit || []), auditEntry].slice(-50);
    const doc = await ProductPriceDefault.findOneAndUpdate(
        { companyId: req.companyId, itemId: body.itemId, currency },
        {
            $set: {
                companyId: req.companyId,
                itemId: body.itemId,
                currency,
                breaks,
                sourcePriceListId: body.sourcePriceListId || null,
                sourcePriceListNo: body.sourcePriceListNo || '',
                updatedBy: req.user?._id || null,
                updatedByName: userName(req.user),
                audit,
            },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
    res.json(new ApiResponse(200, {
        found: true,
        itemId: doc.itemId,
        currency: doc.currency,
        breaks: doc.breaks || [],
        updatedAt: doc.updatedAt,
        updatedByName: doc.updatedByName || '',
    }, 'Default product price saved'));
});

export const getLastPriceForItem = asyncHandler(async (req, res) => {
    const itemId = req.query.itemId;
    if (!itemId) throw new ApiError(httpStatus.BAD_REQUEST, 'itemId is required');
    const filter = {
        isDeleted: { $ne: true },
        'lines.itemId': itemId,
    };
    if (req.query.excludeId) filter._id = { $ne: req.query.excludeId };
    const doc = await CustomerPriceList.findOne(filter)
        .sort({ date: -1, versionNo: -1, createdAt: -1 })
        .lean();
    if (!doc) {
        res.json(new ApiResponse(200, { found: false }, 'No previous price list for this product'));
        return;
    }
    const breaks = (doc.lines || [])
        .filter((l) => String(l.itemId) === String(itemId) && isFilledRate(l))
        .map((l) => ({ minQty: l.minQty, finalRate: l.finalRate, uom: l.uom }))
        .sort((a, b) => (Number(a.minQty) || 0) - (Number(b.minQty) || 0));
    res.json(new ApiResponse(200, {
        found: true,
        priceListId: doc._id,
        priceListNo: doc.priceListNo,
        version: doc.version,
        date: doc.date,
        customerName: doc.customerName || '',
        customerCompany: doc.customerCompany || '',
        currency: doc.currency || 'INR',
        breaks,
    }, 'Last price list for item'));
});
