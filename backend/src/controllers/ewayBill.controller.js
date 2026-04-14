import { EwayBill } from '../models/ewayBill.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { CompanyProfile } from '../models/companyProfile.model.js';
import { Transporter } from '../models/transporter.model.js';
import Customer from '../models/customer.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getStateCode, getStandardUom } from '../utils/ewayBillUtils.js';

/**
 * Helper to auto-calculate/populate EWB Draft from Invoice and Customer Master
 */
const prepareDraftData = async (invoice, company, customer = null) => {
    // Priority: Invoice Specific Fields -> Customer Master Fields -> Regex from Address String
    const getPincode = () => {
        if (invoice.shippingPostalCode) return invoice.shippingPostalCode;
        if (invoice.pincode) return invoice.pincode;
        if (customer && customer.pincode) return customer.pincode;
        return (invoice.shippingAddress || invoice.billingAddress || '').match(/\d{6}/)?.[0] || '';
    };

    const getCity = () => {
        if (invoice.shippingCity) return invoice.shippingCity;
        if (invoice.city) return invoice.city;
        if (customer && customer.city) return customer.city;
        return (invoice.shippingAddress || invoice.billingAddress || '').split(',').slice(-2, -1)[0]?.trim() || '';
    };

    return {
        salesInvoiceId: invoice._id,
        customerId: invoice.customerId,
        status: 'Draft',
        partA: {
            supplyType: 'Outward',
            subSupplyType: 'Supply',
            docType: 'Tax Invoice',
            docNo: invoice.invoiceNumber,
            docDate: invoice.invoiceDate,
            
            fromGstin: company.gstNumber || '',
            fromTrdName: company.companyName || '',
            fromAddr1: company.address || '',
            fromPlace: company.city || '',
            fromPincode: company.pincode || '',
            fromStateCode: getStateCode(company.state) || Number(company.stateCode) || 0,
            
            toGstin: invoice.customerGstin || customer?.gstNumber || '',
            toTrdName: invoice.customerName || customer?.customerName || '',
            toAddr1: invoice.shippingAddress || invoice.billingAddress || customer?.address || '',
            toPlace: getCity(),
            toPincode: getPincode(),
            toStateCode: Number(invoice.shippingStateCode) || Number(invoice.billingStateCode) || getStateCode(invoice.shippingState || invoice.billingState || customer?.state) || 0,
            
            totalValue: invoice.totalTaxableAmount || 0,
            cgstValue: invoice.totalCgst || 0,
            sgstValue: invoice.totalSgst || 0,
            igstValue: invoice.totalIgst || 0,
            totInvValue: invoice.grandTotal || 0,
            
            itemList: invoice.items.map(item => ({
                productName: item.itemName,
                productDesc: item.description || item.itemName,
                hsnCode: item.hsnCode,
                quantity: item.qty,
                qtyUnit: getStandardUom(item.uom),
                taxableAmount: item.taxableAmount,
                cgstRate: item.cgstRate + item.sgstRate > 0 ? (item.cgstRate || 0) : 0,
                sgstRate: item.cgstRate + item.sgstRate > 0 ? (item.sgstRate || 0) : 0,
                igstRate: item.igstRate || 0,
            }))
        },
        partB: {
            transMode: 'Road',
            vehicleType: 'Regular',
            distance: 0,
            transName: invoice.dispatchThrough || '',
        }
    };
};

export const createEwayBillDraft = asyncHandler(async (req, res) => {
    const { invoiceId } = req.body;
    
    if (!invoiceId) throw new ApiError(400, 'Invoice ID is required');

    // 1. Check if already exists
    const existing = await EwayBill.findOne({ salesInvoiceId: invoiceId });
    if (existing) {
        return res.status(200).json(new ApiResponse(200, existing, 'Redirecting to existing draft'));
    }

    // 2. Fetch Source Data
    const invoice = await SalesInvoice.findById(invoiceId);
    if (!invoice) throw new ApiError(404, 'Invoice not found');
    
    const company = await CompanyProfile.findOne();
    if (!company) throw new ApiError(404, 'Company profile not found');

    const customer = await Customer.findById(invoice.customerId);
    const finalCustomer = customer || await Customer.findOne({ gstNumber: invoice.customerGstin, isDeleted: false });

    // 3. Prepare Mapping
    const draftData = await prepareDraftData(invoice, company, finalCustomer);
    draftData.createdBy = req.user._id;

    const ewayBill = await EwayBill.create(draftData);
    res.status(201).json(new ApiResponse(201, ewayBill, 'E-Way Bill Draft created'));
});

export const syncWithCustomerMaster = asyncHandler(async (req, res) => {
    const ewayBill = await EwayBill.findById(req.params.id);
    if (!ewayBill) throw new ApiError(404, 'E-way bill not found');

    // Fetch Source Data
    const invoice = await SalesInvoice.findById(ewayBill.salesInvoiceId);
    if (!invoice) throw new ApiError(404, 'Linked invoice not found');
    
    const company = await CompanyProfile.findOne();
    if (!company) throw new ApiError(404, 'Company profile not found');

    // Fallback: If invoice doesn't have customerId, try finding by GSTIN
    let customer = await Customer.findById(invoice.customerId || ewayBill.customerId);
    if (!customer && (invoice.customerGstin || ewayBill.partA.toGstin)) {
        customer = await Customer.findOne({ 
            gstNumber: invoice.customerGstin || ewayBill.partA.toGstin, 
            isDeleted: false 
        });
    }

    if (!customer) throw new ApiError(404, 'Customer master record not found for this GSTIN');

    // Prepare fresh mapping from Masters
    const freshData = await prepareDraftData(invoice, company, customer);
    
    // Update only the Part A participant and address details
    ewayBill.partA.toGstin = freshData.partA.toGstin;
    ewayBill.partA.toTrdName = freshData.partA.toTrdName;
    ewayBill.partA.toAddr1 = freshData.partA.toAddr1;
    ewayBill.partA.toPlace = freshData.partA.toPlace;
    ewayBill.partA.toPincode = freshData.partA.toPincode;
    ewayBill.partA.toStateCode = freshData.partA.toStateCode;
    
    ewayBill.updatedBy = req.user._id;
    await ewayBill.save();

    res.status(200).json(new ApiResponse(200, ewayBill, 'Draft synced with Customer Master'));
});


export const getEwayBills = asyncHandler(async (req, res) => {
    const { status, customerId, transporterId, fromDate, toDate, limit = 50, page = 1 } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    if (customerId) filter.customerId = customerId;
    if (transporterId) filter.transporterId = transporterId;
    if (fromDate || toDate) {
        filter['partA.docDate'] = {};
        if (fromDate) filter['partA.docDate'].$gte = new Date(fromDate);
        if (toDate) filter['partA.docDate'].$lte = new Date(toDate);
    }

    const ewayBills = await EwayBill.find(filter)
        .populate('customerId', 'customerName company')
        .populate('transporterId', 'transporterName transporterId')
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit));

    const total = await EwayBill.countDocuments(filter);

    res.status(200).json(new ApiResponse(200, { ewayBills, total, page, totalPages: Math.ceil(total / limit) }));
});

export const getEwayBillById = asyncHandler(async (req, res) => {
    const ewayBill = await EwayBill.findById(req.params.id)
        .populate('customerId')
        .populate('transporterId')
        .populate('salesInvoiceId');
        
    if (!ewayBill) throw new ApiError(404, 'E-way bill not found');
    res.status(200).json(new ApiResponse(200, ewayBill));
});

export const updateEwayBill = asyncHandler(async (req, res) => {
    const ewayBill = await EwayBill.findById(req.params.id);
    if (!ewayBill) throw new ApiError(404, 'E-way bill not found');

    const updates = req.body;
    
    // Merge updates
    if (updates.partA) ewayBill.partA = { ...ewayBill.partA, ...updates.partA };
    if (updates.partB) ewayBill.partB = { ...ewayBill.partB, ...updates.partB };
    if (updates.status) ewayBill.status = updates.status;
    if (updates.ewayBillNo) ewayBill.ewayBillNo = updates.ewayBillNo;
    if (updates.ewayBillDate) ewayBill.ewayBillDate = updates.ewayBillDate;
    if (updates.validUntil) ewayBill.validUntil = updates.validUntil;
    if (updates.transporterId) ewayBill.transporterId = updates.transporterId;
    
    ewayBill.updatedBy = req.user._id;
    await ewayBill.save();

    res.status(200).json(new ApiResponse(200, ewayBill, 'E-way bill updated'));
});

export const exportEwayBillJson = asyncHandler(async (req, res) => {
    const ewayBill = await EwayBill.findById(req.params.id);
    if (!ewayBill) throw new ApiError(404, 'E-way bill not found');

    const company = await CompanyProfile.findOne();
    if (!company) throw new ApiError(404, 'Company profile not found in settings');

    const schema = {
        version: "1.0.0421",
        billLists: [{
            supplyType: ewayBill.partA.supplyType === 'Outward' ? 'O' : 'I',
            subSupplyType: "1", // Supply
            docType: "INV",
            docNo: ewayBill.partA.docNo,
            docDate: ewayBill.partA.docDate.toISOString().split('T')[0].split('-').reverse().join('/'), // dd/MM/yyyy
            
            // Always pull "From" details from Current Company Profile at time of export
            fromGstin: company.gstNumber,
            fromTrdName: company.companyName,
            fromAddr1: company.address,
            fromPlace: company.city,
            fromPincode: Number(company.pincode),
            fromStateCode: getStateCode(company.state) || Number(company.stateCode) || 0,
            
            toGstin: ewayBill.partA.toGstin || 'URP',
            toTrdName: ewayBill.partA.toTrdName,
            toAddr1: ewayBill.partA.toAddr1,
            toPlace: ewayBill.partA.toPlace,
            toPincode: Number(ewayBill.partA.toPincode),
            toStateCode: ewayBill.partA.toStateCode,
            transactionType: 1, // Regular
            totalValue: ewayBill.partA.totalValue,
            cgstValue: ewayBill.partA.cgstValue,
            sgstValue: ewayBill.partA.sgstValue,
            igstValue: ewayBill.partA.igstValue,
            cessValue: ewayBill.partA.cessValue || 0,
            totInvValue: ewayBill.partA.totInvValue,
            transId: ewayBill.partB.transId || "",
            transName: ewayBill.partB.transName || "",
            transMode: ewayBill.partB.transMode === 'Road' ? '1' : 
                       ewayBill.partB.transMode === 'Rail' ? '2' :
                       ewayBill.partB.transMode === 'Air' ? '3' : '4',
            distance: ewayBill.partB.distance || 0,
            transDocNo: ewayBill.partB.transDocNo || "",
            transDocDate: ewayBill.partB.transDocDate ? ewayBill.partB.transDocDate.toISOString().split('T')[0].split('-').reverse().join('/') : "",
            vehicleNo: ewayBill.partB.vehicleNo || "",
            vehicleType: ewayBill.partB.vehicleType === 'Regular' ? 'R' : 'O',
            itemList: ewayBill.partA.itemList.map(it => ({
                productName: it.productName,
                productDesc: it.productDesc,
                hsnCode: Number(it.hsnCode),
                quantity: it.quantity,
                qtyUnit: it.qtyUnit,
                taxableAmount: it.taxableAmount,
                cgstRate: it.cgstRate,
                sgstRate: it.sgstRate,
                igstRate: it.igstRate,
                cessRate: it.cessRate
            }))
        }]
    };

    ewayBill.jsonExportedAt = new Date();
    if (ewayBill.status === 'Draft' || ewayBill.status === 'Part A Ready') {
        ewayBill.status = 'Ready for JSON Export';
    }
    await ewayBill.save();

    res.status(200).json(new ApiResponse(200, schema, 'JSON Export generated'));
});

export const deleteEwayBill = asyncHandler(async (req, res) => {
    const ewayBill = await EwayBill.findByIdAndDelete(req.params.id);
    if (!ewayBill) throw new ApiError(404, 'E-way bill not found');
    res.status(200).json(new ApiResponse(200, null, 'E-way bill deleted'));
});
