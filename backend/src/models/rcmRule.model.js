import mongoose from 'mongoose';

/**
 * Master-driven RCM rules. Phase 2A: evaluation/preview only — never posts tax.
 * Seed rules as draft/inactive until owner-approved activation.
 */
const rcmRuleSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null }, // null = platform default
        ruleCode: { type: String, required: true, trim: true, uppercase: true },
        category: {
            type: String,
            enum: ['RENT', 'GTA', 'COURIER', 'LEGAL', 'GENERAL', 'OTHER'],
            required: true,
        },
        title: { type: String, trim: true, default: '' },
        serviceGoodsType: {
            type: String,
            enum: ['GOODS', 'SERVICES', 'BOTH', ''],
            default: 'SERVICES',
        },
        effectiveFrom: { type: Date, required: true },
        effectiveTo: { type: Date, default: null },
        supplierRegistrationCondition: {
            type: [String],
            default: [], // e.g. ['Unregistered'] — empty = any
        },
        recipientRegistrationCondition: {
            type: [String],
            default: [], // e.g. ['Registered'] — empty = any
        },
        supplierTaxOptionCondition: {
            type: [String],
            default: [], // Forward Charge / Reverse Charge / …
        },
        recipientCategoryCondition: {
            type: [String],
            default: [],
        },
        hsnSacCondition: {
            type: [String],
            default: [], // exact or prefix; empty = any
        },
        placeOfSupplyCondition: {
            type: [String],
            default: [],
        },
        propertyTypeCondition: {
            type: [String],
            default: [], // Commercial / Residential / Other (rent)
        },
        transportServiceTypeCondition: {
            type: [String],
            default: [], // GTA with consignment note / Courier / …
        },
        consignmentNoteRequired: { type: Boolean, default: false },
        supplierGstChargedCondition: {
            type: String,
            enum: ['', 'YES', 'NO', 'ANY'],
            default: 'ANY',
        },
        ratePercent: { type: Number, default: null }, // suggested GST % when RCM
        exemptionCondition: { type: String, trim: true, default: '' },
        requiredQuestions: { type: [String], default: [] },
        requiredDocuments: { type: [String], default: [] },
        decisionIfMatched: {
            type: String,
            enum: [
                'FORWARD_CHARGE',
                'REVERSE_CHARGE',
                'EXEMPT',
                'NON_GST',
                'NOT_APPLICABLE',
                'REVIEW_REQUIRED',
            ],
            default: 'REVERSE_CHARGE',
        },
        /** draft | inactive | active — only active used by default evaluate */
        status: {
            type: String,
            enum: ['draft', 'inactive', 'active'],
            default: 'draft',
        },
        statutoryReference: { type: String, trim: true, default: '' },
        version: { type: Number, default: 1 },
        notes: { type: String, trim: true, default: '' },
        /** Durable amendment trail — Mongo is authoritative for approved rules. */
        amendmentHistory: [
            {
                at: { type: Date, default: Date.now },
                action: { type: String, trim: true, default: '' },
                userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
                fromStatus: { type: String, default: '' },
                toStatus: { type: String, default: '' },
                detail: { type: String, default: '' },
            },
        ],
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        approvedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

rcmRuleSchema.index({ ruleCode: 1, version: 1 }, { unique: true });
rcmRuleSchema.index({ status: 1, category: 1, effectiveFrom: 1 });

const RcmRule = mongoose.model('RcmRule', rcmRuleSchema);
export { RcmRule };
