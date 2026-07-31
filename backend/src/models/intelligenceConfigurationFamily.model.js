import mongoose from 'mongoose';

export const FAMILY_CODES = [
    'LEAD_SCORE_DIMENSIONS', 'LEAD_SCORE_WEIGHTS', 'LEAD_SCORE_THRESHOLDS', 'LEAD_PRIORITY_BANDS',
    'INDUSTRY_CLASSIFICATION_RULES', 'INDUSTRY_SYNONYMS', 'CUSTOMER_TYPE_MAPPINGS', 'LEAD_RELEVANCE_RULES',
    'PRODUCT_RECOMMENDATION_MAPPINGS', 'PRODUCT_FIT_THRESHOLDS', 'SIMILAR_COMPANY_THRESHOLDS',
    'DUPLICATE_DETECTION_THRESHOLDS', 'ENTITY_RESOLUTION_THRESHOLDS', 'CONTACT_ROLE_MAPPINGS',
    'CONTACT_CONFIDENCE_THRESHOLDS', 'SOURCE_PRIORITY_RULES', 'KG_RELATIONSHIP_RULES',
    'KG_CONFIDENCE_THRESHOLDS', 'ASSISTANT_TEMPLATES', 'ASSISTANT_CLARIFICATION_TEMPLATES',
    'MARKETING_DRAFT_TEMPLATES', 'DATA_QUALITY_VALIDATION_RULES', 'MANUAL_REVIEW_THRESHOLDS',
    'BATCH_QUALITY_THRESHOLDS',
];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    code: { type: String, enum: FAMILY_CODES, required: true, index: true },
    name: { type: String, trim: true, required: true },
    module: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    schemaVersion: { type: String, trim: true, default: '1.0.0' },
    companyScoped: { type: Boolean, default: true },
    industryScoped: { type: Boolean, default: false },
    sourcePermissionRequirements: { type: [String], default: [] },
    validationRules: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    activeBaselineReference: { type: String, trim: true, default: 'EXISTING_RUNTIME_BASELINE' },
    status: { type: String, enum: ['ACTIVE_FAMILY', 'DISABLED'], default: 'ACTIVE_FAMILY', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true, collection: 'intelligence_configuration_families' });

schema.index({ companyId: 1, code: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });

const IntelligenceConfigurationFamily = mongoose.models.IntelligenceConfigurationFamily
    || mongoose.model('IntelligenceConfigurationFamily', schema);
export { IntelligenceConfigurationFamily };
export default IntelligenceConfigurationFamily;
