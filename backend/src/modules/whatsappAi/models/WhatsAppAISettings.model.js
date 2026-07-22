import mongoose from 'mongoose';
import { softDeleteAuditFields } from './sharedFields.js';
import {
    WHATSAPP_AI_DEFAULT_SETTINGS,
    WHATSAPP_AI_MODES,
} from '../constants/whatsappAi.constants.js';

const workingHoursSchema = new mongoose.Schema(
    {
        timezone: { type: String, default: 'Asia/Kolkata', trim: true, maxlength: 64 },
        // Window objects only (day/from/to). Never store secrets or large blobs.
        windows: { type: [mongoose.Schema.Types.Mixed], default: [] },
    },
    { _id: false },
);

const whatsAppAISettingsSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
        enabled: { type: Boolean, default: WHATSAPP_AI_DEFAULT_SETTINGS.enabled },
        mode: { type: String, enum: WHATSAPP_AI_MODES, default: WHATSAPP_AI_DEFAULT_SETTINGS.mode },
        defaultLanguage: { type: String, default: WHATSAPP_AI_DEFAULT_SETTINGS.defaultLanguage, trim: true, maxlength: 16 },
        welcomeMessage: { type: String, default: '', trim: true, maxlength: 2000 },
        workingHoursEnabled: { type: Boolean, default: false },
        workingHours: { type: workingHoursSchema, default: () => ({ ...WHATSAPP_AI_DEFAULT_SETTINGS.workingHours }) },
        outsideWorkingHoursMessage: { type: String, default: '', trim: true, maxlength: 1000 },
        botSessionUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        autoLeadDraftEnabled: { type: Boolean, default: false },
        humanEscalationEnabled: { type: Boolean, default: true },
        confidenceThresholdHigh: { type: Number, default: 80, min: 0, max: 100 },
        confidenceThresholdMedium: { type: Number, default: 60, min: 0, max: 100 },
        confidenceThresholdLow: { type: Number, default: 0, min: 0, max: 100 },
        maxMessagesPerMinute: { type: Number, default: 10, min: 1, max: 120 },
        maxMessagesPerConversation: { type: Number, default: 200, min: 1, max: 5000 },
        approvedProductCategories: { type: [String], default: [] },
        featureVersion: { type: String, default: '1a', trim: true, maxlength: 32 },
        ...softDeleteAuditFields,
    },
    { timestamps: true, collection: 'whatsapp_ai_settings' },
);

// One settings doc per company (active). Unique companyId — no separate field index.
whatsAppAISettingsSchema.index(
    { companyId: 1 },
    { unique: true, name: 'uniq_company_settings_active', partialFilterExpression: { isDeleted: false } },
);

const WhatsAppAISettings = mongoose.models.WhatsAppAISettings
    || mongoose.model('WhatsAppAISettings', whatsAppAISettingsSchema);

export default WhatsAppAISettings;
