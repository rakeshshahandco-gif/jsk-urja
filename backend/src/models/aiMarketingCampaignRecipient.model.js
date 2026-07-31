import mongoose from 'mongoose';
import {
    DUPLICATE_STATUSES, ELIGIBILITY_STATUSES, FREQUENCY_STATUSES, ROLE_MATCH_LEVELS,
} from '../services/dataExtractor/marketingIntelligence/constants.js';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    campaignDraftId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiMarketingCampaignDraft', required: true, index: true },
    recipientKey: { type: String, trim: true, default: '', index: true },
    extractedLeadId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    crmLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null, index: true },
    crmCustomerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    contactIntelligenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    companyName: { type: String, trim: true, default: '' },
    contactName: { type: String, trim: true, default: '' },
    role: { type: String, trim: true, default: '' },
    department: { type: String, trim: true, default: '' },
    seniority: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
    normalizedEmail: { type: String, trim: true, default: '', index: true },
    phone: { type: String, trim: true, default: '' },
    normalizedPhone: { type: String, trim: true, default: '', index: true },
    channelEligibility: { type: [String], default: [] },
    verification: { type: mongoose.Schema.Types.Mixed, default: null },
    source: { type: String, trim: true, default: '' },
    sourceUrl: { type: String, trim: true, default: '' },
    confidence: { type: Number, default: 0 },
    whySelected: { type: String, trim: true, default: '' },
    roleMatch: { type: String, enum: ROLE_MATCH_LEVELS, default: 'MANUAL_REVIEW_REQUIRED' },
    alternativeContacts: { type: [mongoose.Schema.Types.Mixed], default: [] },
    eligibilityStatus: { type: String, enum: ELIGIBILITY_STATUSES, default: 'MANUAL_REVIEW_REQUIRED', index: true },
    exclusionReason: { type: String, trim: true, default: '' },
    duplicateStatus: { type: String, enum: DUPLICATE_STATUSES, default: 'UNIQUE', index: true },
    duplicateGroupKey: { type: String, trim: true, default: '' },
    optOutResult: { type: mongoose.Schema.Types.Mixed, default: null },
    frequencyResult: { type: mongoose.Schema.Types.Mixed, default: null },
    productRecommendationId: { type: mongoose.Schema.Types.ObjectId, default: null },
    personalizationValues: { type: mongoose.Schema.Types.Mixed, default: null },
    userDecision: { type: String, trim: true, default: 'PENDING' },
    included: { type: Boolean, default: false, index: true },
    locked: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

schema.index({ companyId: 1, campaignDraftId: 1, recipientKey: 1 }, { unique: true });
schema.index({ companyId: 1, campaignDraftId: 1, eligibilityStatus: 1 });

export const AiMarketingCampaignRecipient = mongoose.models.AiMarketingCampaignRecipient
    || mongoose.model('AiMarketingCampaignRecipient', schema);
