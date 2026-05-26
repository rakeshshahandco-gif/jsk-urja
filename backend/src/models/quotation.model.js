import mongoose from 'mongoose';

/**
 * Quotation — a price-quote draft that sits between a CRM Lead and a real
 * SalesOrder. Strictly additive: this does NOT modify SalesOrder, Lead, or
 * any other existing module. A Quotation may be created from a Lead (carries
 * customer + product context forward) and converted into a SalesOrder (the
 * existing /sales-orders create path is reused — we don't touch its
 * controller/model).
 *
 * Tenant scoping (`companyId`) is added by the global tenantSchemaPlugin.
 */

const quotationItemSchema = new mongoose.Schema(
    {
        // Optional links — present when sourced from inventory Item or from
        // the CRM ProductCatalog (light-weight, no-stock product list).
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
        catalogProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductCatalog', default: null },

        itemCode: { type: String, default: '' },
        itemName: { type: String, required: true, trim: true },
        description: { type: String, default: '' },
        hsnCode: { type: String, default: '' },
        uom: { type: String, default: 'NOS' },

        qty: { type: Number, required: true, min: 0, default: 1 },
        rate: { type: Number, default: 0, min: 0 },
        discountPercent: { type: Number, default: 0, min: 0, max: 100 },
        amount: { type: Number, default: 0 },              // qty * rate * (1 - disc/100)

        gstRate: { type: Number, default: 18, min: 0, max: 100 },
        gstAmount: { type: Number, default: 0 },

        totalAmount: { type: Number, default: 0 },          // amount + gstAmount

        requirementNote: { type: String, default: '' },
    },
    { _id: true },
);

const quotationSchema = new mongoose.Schema(
    {
        quotationNumber: { type: String, trim: true, index: true },
        quotationDate: { type: Date, default: Date.now },
        validUntil: { type: Date, default: null },

        // Customer snapshot — Lead/customer master id is optional.
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
        customerName: { type: String, trim: true, default: '' },
        customerMobile: { type: String, trim: true, default: '' },
        customerEmail: { type: String, trim: true, default: '' },
        billingAddress: { type: String, trim: true, default: '' },
        shippingAddress: { type: String, trim: true, default: '' },

        items: { type: [quotationItemSchema], default: [] },

        // Totals (denormalised, recomputed on save in service).
        totalQty: { type: Number, default: 0 },
        totalAmount: { type: Number, default: 0 },           // pre-tax
        totalGst: { type: Number, default: 0 },
        grandTotal: { type: Number, default: 0 },

        status: {
            type: String,
            enum: ['draft', 'sent', 'accepted', 'rejected', 'converted', 'expired'],
            default: 'draft',
        },

        // CRM linkage
        sourceLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
        convertedToSalesOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder', default: null },
        convertedAt: { type: Date, default: null },

        remarks: { type: String, trim: true, default: '' },

        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

quotationSchema.index({ companyId: 1, quotationNumber: 1 }, { unique: true, sparse: true });
quotationSchema.index({ companyId: 1, status: 1, quotationDate: -1 });
quotationSchema.index({ companyId: 1, sourceLeadId: 1 });
quotationSchema.index({ companyId: 1, customerMobile: 1 });

const Quotation = mongoose.model('Quotation', quotationSchema);
export { Quotation };
export default Quotation;
