import mongoose from 'mongoose';

/**
 * Lead - Inquiry/Lead record created from a WhatsApp chat (or manually).
 *
 * Strictly additive: this does NOT replace or modify the existing
 * Customer / Conversation / Followup flow. A Lead may optionally link to
 * an existing Customer, but holds its own contact info so that brand-new
 * WhatsApp contacts can be captured without first creating a Customer.
 *
 * Tenant scoping is provided by the global tenantSchemaPlugin.
 */

const sharedAssetSchema = new mongoose.Schema(
    {
        catalogProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductCatalog' },
        assetType: {
            type: String,
            enum: ['catalog', 'datasheet', 'brochure', 'image', 'details', 'video'],
            required: true,
        },
        url: { type: String, trim: true, default: '' },
        channel: { type: String, enum: ['whatsapp', 'email', 'link'], default: 'whatsapp' },
        sharedAt: { type: Date, default: Date.now },
        sharedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { _id: true },
);

const leadProductSchema = new mongoose.Schema(
    {
        catalogProductId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ProductCatalog',
            required: true,
        },
        quantity: { type: Number, default: 0 },
        requirementNote: { type: String, trim: true, default: '' },
    },
    { _id: true },
);

const leadSchema = new mongoose.Schema(
    {
        customerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Customer',
            default: null,
        },
        customerName: { type: String, trim: true, default: '' },
        customerMobile: { type: String, trim: true, default: '' },
        customerEmail: { type: String, trim: true, default: '' },

        source: {
            type: String,
            enum: ['whatsapp', 'manual', 'call', 'email', 'visit', 'other'],
            default: 'whatsapp',
        },
        status: {
            type: String,
            enum: ['new', 'contacted', 'qualified', 'quotation', 'negotiation', 'won', 'lost', 'hold'],
            default: 'new',
        },
        priority: {
            type: String,
            enum: ['high', 'medium', 'low'],
            default: 'medium',
        },

        assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        nextFollowUpDate: { type: Date, default: null },

        whatsapp: {
            messageText: { type: String, trim: true, default: '' },
            receivedAt: { type: Date, default: null },
            threadRef: { type: String, trim: true, default: '' },
            attachments: [
                {
                    url: { type: String, trim: true, default: '' },
                    name: { type: String, trim: true, default: '' },
                    mime: { type: String, trim: true, default: '' },
                },
            ],
        },

        products: { type: [leadProductSchema], default: [] },
        sharedAssets: { type: [sharedAssetSchema], default: [] },

        notes: { type: String, trim: true, default: '' },

        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

leadSchema.index({ companyId: 1, status: 1, nextFollowUpDate: 1 });
leadSchema.index({ companyId: 1, customerMobile: 1 });
leadSchema.index({ companyId: 1, source: 1, createdAt: -1 });

const Lead = mongoose.model('Lead', leadSchema);
export { Lead };
export default Lead;
