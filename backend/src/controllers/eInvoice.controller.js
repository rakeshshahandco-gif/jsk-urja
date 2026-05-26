import { EInvoiceDraft } from '../models/eInvoiceDraft.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { CompanyProfile } from '../models/companyProfile.model.js';
import Customer from '../models/customer.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { buildEInvoicePayload, generateIrn } from '../services/gstReport.service.js';

function mapCompanyForEInvoice(company) {
    if (!company) return null;
    const c = company.toObject ? company.toObject() : company;
    return {
        ...c,
        gstin: c.gstNumber || c.gstin || '',
        tradeName: c.tradeName || c.companyName || '',
    };
}

function mapInvoiceForEInvoice(invoice) {
    const inv = invoice.toObject ? invoice.toObject() : invoice;
    return {
        ...inv,
        customerAddress: inv.billingAddress || inv.shippingAddress || '',
        customerCity: inv.shippingCity || inv.billingState || '',
        customerPincode: inv.shippingPostalCode || '',
    };
}

function validatePayload(payload) {
    const errors = [];
    if (!payload?.SellerDtls?.Gstin) errors.push('Seller GSTIN is missing (Company Profile)');
    if (!payload?.BuyerDtls?.Gstin) errors.push('Buyer GSTIN is missing');
    if (!payload?.DocDtls?.No) errors.push('Invoice number is missing');
    if (!payload?.DocDtls?.Dt) errors.push('Invoice date is missing');
    if (!payload?.ItemList?.length) errors.push('At least one line item is required');
    for (const it of payload?.ItemList || []) {
        if (!it.HsnCd) errors.push(`HSN missing for item: ${it.PrdDesc || 'line'}`);
    }
    return errors;
}

async function buildDraftFromInvoice(invoice, company, customer = null) {
    const payload = await buildEInvoicePayload(
        mapInvoiceForEInvoice(invoice),
        mapCompanyForEInvoice(company),
    );
    if (customer?.gstNumber && payload.BuyerDtls?.Gstin === 'URP') {
        payload.BuyerDtls.Gstin = customer.gstNumber;
    }
    return {
        salesInvoiceId: invoice._id,
        customerId: invoice.customerId || null,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        customerName: invoice.customerName,
        customerGstin: invoice.customerGstin || payload.BuyerDtls?.Gstin || '',
        status: 'Draft',
        payload,
    };
}

export const createEInvoiceDraft = asyncHandler(async (req, res) => {
    const { invoiceId } = req.body;
    if (!invoiceId) throw new ApiError(400, 'Invoice ID is required');

    const existing = await EInvoiceDraft.findOne({ salesInvoiceId: invoiceId });
    if (existing) {
        return res.status(200).json(new ApiResponse(200, existing, 'Redirecting to existing draft'));
    }

    const invoice = await SalesInvoice.findById(invoiceId);
    if (!invoice) throw new ApiError(404, 'Invoice not found');
    if (invoice.isDeleted) throw new ApiError(400, 'Cannot create E-Invoice for deleted invoice');
    if (invoice.status === 'Cancelled') throw new ApiError(400, 'Cannot create E-Invoice for cancelled invoice');

    const company = await CompanyProfile.findOne();
    if (!company) throw new ApiError(404, 'Company profile not found');

    const customer = invoice.customerId
        ? await Customer.findById(invoice.customerId)
        : await Customer.findOne({ gstNumber: invoice.customerGstin, isDeleted: { $ne: true } });

    const draftData = await buildDraftFromInvoice(invoice, company, customer);
    draftData.createdBy = req.user._id;

    const draft = await EInvoiceDraft.create(draftData);
    res.status(201).json(new ApiResponse(201, draft, 'E-Invoice draft created'));
});

export const refreshFromInvoice = asyncHandler(async (req, res) => {
    const draft = await EInvoiceDraft.findById(req.params.id);
    if (!draft) throw new ApiError(404, 'E-Invoice draft not found');
    if (draft.status === 'IRN Generated' && !req.body?.force) {
        throw new ApiError(400, 'IRN already generated. Cancel or use manual update only.');
    }

    const invoice = await SalesInvoice.findById(draft.salesInvoiceId);
    if (!invoice) throw new ApiError(404, 'Linked invoice not found');

    const company = await CompanyProfile.findOne();
    if (!company) throw new ApiError(404, 'Company profile not found');

    const customer = invoice.customerId
        ? await Customer.findById(invoice.customerId)
        : null;

    const fresh = await buildDraftFromInvoice(invoice, company, customer);
    draft.payload = fresh.payload;
    draft.invoiceNumber = fresh.invoiceNumber;
    draft.invoiceDate = fresh.invoiceDate;
    draft.customerName = fresh.customerName;
    draft.customerGstin = fresh.customerGstin;
    draft.updatedBy = req.user._id;
    if (draft.status === 'Draft') draft.status = 'Draft';
    await draft.save();

    res.status(200).json(new ApiResponse(200, draft, 'Draft refreshed from invoice'));
});

export const getEInvoices = asyncHandler(async (req, res) => {
    const { status, fromDate, toDate, limit = 50, page = 1 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (fromDate || toDate) {
        filter.invoiceDate = {};
        if (fromDate) filter.invoiceDate.$gte = new Date(fromDate);
        if (toDate) filter.invoiceDate.$lte = new Date(toDate);
    }

    const eInvoices = await EInvoiceDraft.find(filter)
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit));

    const total = await EInvoiceDraft.countDocuments(filter);
    res.status(200).json(new ApiResponse(200, { eInvoices, total, page: Number(page), totalPages: Math.ceil(total / limit) }));
});

export const getEInvoiceById = asyncHandler(async (req, res) => {
    const draft = await EInvoiceDraft.findById(req.params.id).populate('salesInvoiceId');
    if (!draft) throw new ApiError(404, 'E-Invoice draft not found');
    res.status(200).json(new ApiResponse(200, draft));
});

export const updateEInvoiceDraft = asyncHandler(async (req, res) => {
    const draft = await EInvoiceDraft.findById(req.params.id);
    if (!draft) throw new ApiError(404, 'E-Invoice draft not found');

    if (req.body.payload) draft.payload = req.body.payload;
    if (req.body.remarks !== undefined) draft.remarks = req.body.remarks;
    if (req.body.status) draft.status = req.body.status;
    if (req.body.irn !== undefined) draft.irn = req.body.irn;
    if (req.body.irnAckNo !== undefined) draft.irnAckNo = req.body.irnAckNo;
    if (req.body.irnAckDate) draft.irnAckDate = req.body.irnAckDate;
    if (req.body.signedQrCode !== undefined) draft.signedQrCode = req.body.signedQrCode;

    draft.updatedBy = req.user._id;
    await draft.save();
    res.status(200).json(new ApiResponse(200, draft, 'E-Invoice draft updated'));
});

export const exportEInvoiceJson = asyncHandler(async (req, res) => {
    const draft = await EInvoiceDraft.findById(req.params.id);
    if (!draft) throw new ApiError(404, 'E-Invoice draft not found');

    const errors = validatePayload(draft.payload);
    if (errors.length) throw new ApiError(400, `Validation failed: ${errors.join('; ')}`);

    draft.jsonExportedAt = new Date();
    if (draft.status === 'Draft') draft.status = 'Ready for JSON Export';
    draft.updatedBy = req.user._id;
    await draft.save();

    res.status(200).json(new ApiResponse(200, draft.payload, 'JSON export ready'));
});

export const generateEInvoiceIrn = asyncHandler(async (req, res) => {
    const draft = await EInvoiceDraft.findById(req.params.id);
    if (!draft) throw new ApiError(404, 'E-Invoice draft not found');

    const invoice = await SalesInvoice.findById(draft.salesInvoiceId);
    if (!invoice) throw new ApiError(404, 'Linked invoice not found');

    const company = await CompanyProfile.findOne();
    const companyMapped = mapCompanyForEInvoice(company);
    const result = await generateIrn(mapInvoiceForEInvoice(invoice), companyMapped);

    if (result.irn) {
        draft.irn = result.irn;
        draft.irnAckNo = result.ackNo || '';
        draft.irnAckDate = new Date();
        draft.signedQrCode = result.signedQrCode || '';
        draft.status = 'IRN Generated';
        draft.irnGeneratedAt = new Date();

        await SalesInvoice.findByIdAndUpdate(invoice._id, {
            irn: result.irn,
            irnAckNo: result.ackNo,
            signedQrCode: result.signedQrCode,
            eInvoiceStatus: 'Generated',
        });
    }

    draft.updatedBy = req.user._id;
    await draft.save();

    res.status(200).json(new ApiResponse(200, { draft, result }, result.irn ? 'IRN generated' : 'Payload ready for manual IRP upload'));
});

export const recordEInvoiceIrnManual = asyncHandler(async (req, res) => {
    const draft = await EInvoiceDraft.findById(req.params.id);
    if (!draft) throw new ApiError(404, 'E-Invoice draft not found');

    const { irn, irnAckNo, irnAckDate, signedQrCode } = req.body;
    if (!irn?.trim()) throw new ApiError(400, 'IRN is required');

    draft.irn = irn.trim();
    draft.irnAckNo = irnAckNo || '';
    draft.irnAckDate = irnAckDate ? new Date(irnAckDate) : new Date();
    draft.signedQrCode = signedQrCode || '';
    draft.status = 'IRN Generated';
    draft.irnGeneratedAt = new Date();
    draft.updatedBy = req.user._id;
    await draft.save();

    await SalesInvoice.findByIdAndUpdate(draft.salesInvoiceId, {
        irn: draft.irn,
        irnAckNo: draft.irnAckNo,
        signedQrCode: draft.signedQrCode,
        eInvoiceStatus: 'Generated',
    });

    res.status(200).json(new ApiResponse(200, draft, 'IRN recorded on invoice'));
});

export const deleteEInvoiceDraft = asyncHandler(async (req, res) => {
    const draft = await EInvoiceDraft.findById(req.params.id);
    if (!draft) throw new ApiError(404, 'E-Invoice draft not found');
    if (draft.status === 'IRN Generated') {
        throw new ApiError(400, 'Cannot delete after IRN is generated. Cancel on portal first.');
    }
    await draft.deleteOne();
    res.status(200).json(new ApiResponse(200, null, 'E-Invoice draft deleted'));
});

export const getEInvoiceValidation = asyncHandler(async (req, res) => {
    const draft = await EInvoiceDraft.findById(req.params.id);
    if (!draft) throw new ApiError(404, 'E-Invoice draft not found');
    const errors = validatePayload(draft.payload);
    res.status(200).json(new ApiResponse(200, { errors, valid: errors.length === 0 }));
});
