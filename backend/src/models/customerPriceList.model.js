import mongoose from 'mongoose';

const PRICE_TYPES = ['Standard', 'Dealer', 'OEM', 'Project', 'Export', 'Customer Specific'];
const STATUSES = ['Draft', 'Approved', 'Sent', 'Expired', 'Superseded'];
const GST_TREATMENTS = ['Extra', 'Included'];

const lineSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    productName: { type: String, default: '' },
    itemCode: { type: String, default: '' },
    modelNo: { type: String, default: '' },
    description: { type: String, default: '' },
    uom: { type: String, default: 'NOS' },
    moq: { type: Number, default: 0 },
    minQty: { type: Number, default: null },
    maxQty: { type: Number, default: null },
    standardPrice: { type: Number, default: 0 },
    offeredRate: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    finalRate: { type: Number, required: true, min: 0 },
    taxTreatment: { type: String, enum: GST_TREATMENTS, default: 'Extra' },
    remarks: { type: String, default: '' },
}, { _id: true });

const sentHistorySchema = new mongoose.Schema({
    channel: { type: String, enum: ['WhatsApp', 'Email', 'Manual'], default: 'Manual' },
    recipient: { type: String, default: '' },
    contactName: { type: String, default: '' },
    documentKind: { type: String, enum: ['PDF', 'Excel', 'Both', ''], default: '' },
    version: { type: String, default: '' },
    priceListNo: { type: String, default: '' },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    sentByName: { type: String, default: '' },
    sentAt: { type: Date, default: Date.now },
    status: { type: String, default: 'Sent' },
    note: { type: String, default: '' },
}, { _id: true });

const customerPriceListSchema = new mongoose.Schema({
    financialYear: { type: String, default: '' },
    priceListNo: { type: String, required: true, trim: true },
    version: { type: String, default: 'V1' },
    versionNo: { type: Number, default: 1 },
    previousVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerPriceList', default: null },
    supersededById: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerPriceList', default: null },
    revisionDate: { type: Date, default: null },
    revisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revisionReason: { type: String, default: '' },

    partyType: { type: String, enum: ['Existing Customer', 'Prospect'], default: 'Existing Customer' },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, default: '' },
    customerCompany: { type: String, default: '' },
    customerCode: { type: String, default: '' },
    customerCity: { type: String, default: '' },
    customerGstin: { type: String, default: '' },
    customerContactName: { type: String, default: '' },
    customerPhone: { type: String, default: '' },
    customerWhatsapp: { type: String, default: '' },
    customerEmail: { type: String, default: '' },
    customerState: { type: String, default: '' },
    customerAddress: { type: String, default: '' },
    originalPartySnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    linkedAt: { type: Date, default: null },
    linkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    date: { type: Date, default: Date.now },
    effectiveFrom: { type: Date, required: true },
    validUpto: { type: Date, default: null },
    currency: { type: String, default: 'INR' },
    priceType: { type: String, enum: PRICE_TYPES, default: 'Customer Specific' },
    gstTreatment: { type: String, enum: GST_TREATMENTS, default: 'Extra' },
    freightTerms: { type: String, default: '' },
    paymentTerms: { type: String, default: '' },
    deliveryTerms: { type: String, default: '' },
    warrantyNotes: { type: String, default: '' },
    remarks: { type: String, default: '' },
    preparedBy: { type: String, default: '' },
    approvedByName: { type: String, default: '' },
    status: { type: String, enum: STATUSES, default: 'Draft' },

    lines: { type: [lineSchema], default: [] },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    sentAt: { type: Date, default: null },
    supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    supersededAt: { type: Date, default: null },

    sentHistory: { type: [sentHistorySchema], default: [] },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

customerPriceListSchema.index({ priceListNo: 1, versionNo: 1 });
customerPriceListSchema.index({ customerId: 1, status: 1, effectiveFrom: -1 });
customerPriceListSchema.index({ 'lines.itemId': 1, status: 1 });
customerPriceListSchema.index({ financialYear: 1, priceListNo: 1 });

export const PRICE_LIST_TYPES = PRICE_TYPES;
export const PRICE_LIST_STATUSES = STATUSES;
export const CustomerPriceList = mongoose.model('CustomerPriceList', customerPriceListSchema);
