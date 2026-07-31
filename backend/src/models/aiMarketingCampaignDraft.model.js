import mongoose from 'mongoose';
import {
    CAMPAIGN_STATUSES, CAMPAIGN_TYPES, CHANNEL_DRAFT_TYPES, HANDOFF_STATUSES, MESSAGE_STATUSES,
} from '../services/dataExtractor/marketingIntelligence/constants.js';

const historySchema = new mongoose.Schema({
    at: { type: Date, default: Date.now },
    action: { type: String, trim: true, default: '' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    previousStatus: { type: String, trim: true, default: '' },
    resultingStatus: { type: String, trim: true, default: '' },
    reason: { type: String, trim: true, default: '' },
    sourceType: { type: String, trim: true, default: 'system' },
}, { _id: false });

const approvalSchema = new mongoose.Schema({
    audienceApproved: { type: Boolean, default: false },
    recipientsApproved: { type: Boolean, default: false },
    messageApproved: { type: Boolean, default: false },
    contentApproved: { type: Boolean, default: false },
    scheduleApproved: { type: Boolean, default: false },
    handoffApproved: { type: Boolean, default: false },
    audienceApprovedAt: { type: Date, default: null },
    recipientsApprovedAt: { type: Date, default: null },
    messageApprovedAt: { type: Date, default: null },
    contentApprovedAt: { type: Date, default: null },
    scheduleApprovedAt: { type: Date, default: null },
    handoffApprovedAt: { type: Date, default: null },
    audienceApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    recipientsApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    messageApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    contentApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    scheduleApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    handoffApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: false });

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    financialYear: { type: String, trim: true, default: '' },
    name: { type: String, trim: true, required: true },
    campaignType: { type: String, enum: CAMPAIGN_TYPES, default: 'MANUAL_CUSTOM', index: true },
    channelDraftType: { type: String, enum: CHANNEL_DRAFT_TYPES, default: 'EXPORT_ONLY', index: true },
    objective: { type: String, trim: true, default: '' },
    language: { type: String, trim: true, default: 'en' },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: 'DRAFT', index: true },
    audienceFilters: { type: mongoose.Schema.Types.Mixed, default: {} },
    audienceFilterFingerprint: { type: String, trim: true, default: '', index: true },
    audienceStats: { type: mongoose.Schema.Types.Mixed, default: null },
    productReferences: { type: [mongoose.Schema.Types.Mixed], default: [] },
    documentReferences: { type: [mongoose.Schema.Types.Mixed], default: [] },
    templateReference: { type: mongoose.Schema.Types.Mixed, default: null },
    messageDraft: { type: mongoose.Schema.Types.Mixed, default: null },
    messageStatus: { type: String, enum: MESSAGE_STATUSES, default: 'DRAFT' },
    messageNotSent: { type: Boolean, default: true },
    messageReviewRequired: { type: Boolean, default: true },
    personalizationPreview: { type: mongoose.Schema.Types.Mixed, default: null },
    translatedDraft: { type: mongoose.Schema.Types.Mixed, default: null },
    scheduleDraft: { type: mongoose.Schema.Types.Mixed, default: null },
    safeModeSuggestions: { type: mongoose.Schema.Types.Mixed, default: null },
    approvals: { type: approvalSchema, default: () => ({}) },
    handoffStatus: { type: String, enum: HANDOFF_STATUSES, default: 'NOT_READY', index: true },
    handoffPackage: { type: mongoose.Schema.Types.Mixed, default: null },
    outdatedReasons: { type: [String], default: [] },
    locked: { type: Boolean, default: false },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    idempotencyKey: { type: String, trim: true, default: '', index: true },
    version: { type: Number, default: 1 },
    engineVersion: { type: String, trim: true, default: 'marketing-intelligence-v1' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    history: { type: [historySchema], default: [] },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

schema.index({ companyId: 1, status: 1, createdAt: -1 });
schema.index({ companyId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $gt: '' } } });

export const AiMarketingCampaignDraft = mongoose.models.AiMarketingCampaignDraft
    || mongoose.model('AiMarketingCampaignDraft', schema);
