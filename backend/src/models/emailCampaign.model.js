import mongoose from 'mongoose';
import {
    EMAIL_BULK_CAMPAIGN_STATUSES,
    EMAIL_BULK_SEND_MODES,
    EMAIL_BULK_RECIPIENT_SOURCES,
    EMAIL_BULK_SEND_CONTENT_TYPES,
} from '../constants/emailBulk.constants.js';
import platformAttachmentRefSchema from './platformAttachmentRef.schema.js';

const filterSchema = new mongoose.Schema(
    {
        customerTypes: [{ type: String }],
        industryTypes: [{ type: String }],
        states: [{ type: String }],
        cities: [{ type: String }],
        activeOnly: { type: Boolean, default: false },
        inactiveOnly: { type: Boolean, default: false },
        selectedCustomerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }],
        selectedSupplierIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' }],
    },
    { _id: false },
);

const emailCampaignSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        campaignName: { type: String, required: true, trim: true },
        status: { type: String, enum: EMAIL_BULK_CAMPAIGN_STATUSES, default: 'Draft', index: true },
        recipientSource: { type: String, enum: EMAIL_BULK_RECIPIENT_SOURCES, required: true },
        filters: { type: filterSchema, default: () => ({}) },
        templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailTemplate', default: null },
        subject: { type: String, trim: true, default: '' },
        bodyText: { type: String, trim: true, default: '' },
        bodyHtml: { type: String, trim: true, default: '' },
        sendContentType: { type: String, enum: EMAIL_BULK_SEND_CONTENT_TYPES, default: 'text_only' },
        attachments: { type: [platformAttachmentRefSchema], default: [] },
        sendMode: { type: String, enum: EMAIL_BULK_SEND_MODES, default: 'SAFE' },
        scheduleType: { type: String, enum: ['now', 'later', 'batch'], default: 'now' },
        scheduledStartAt: { type: Date, default: null },
        timezone: { type: String, default: 'Asia/Kolkata' },
        sendWindowStart: { type: String, default: '09:00' },
        sendWindowEnd: { type: String, default: '19:00' },
        dailyLimit: { type: Number, default: 200 },
        batchSize: { type: Number, default: 20 },
        gapBetweenBatchesMs: { type: Number, default: 86400000 },
        totalRecipients: { type: Number, default: 0 },
        sentCount: { type: Number, default: 0 },
        failedCount: { type: Number, default: 0 },
        skippedCount: { type: Number, default: 0 },
        dailySentToday: { type: Number, default: 0 },
        dailySentDate: { type: String, default: '' },
        lastProcessedAt: { type: Date, default: null },
        startedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
        uploadFilePath: { type: String, default: '' },
        manualEmails: [{ type: String }],
        testSendEmail: { type: String, default: '' },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

emailCampaignSchema.index({ companyId: 1, status: 1, scheduledStartAt: 1 });

const EmailCampaign = mongoose.model('EmailCampaign', emailCampaignSchema);
export default EmailCampaign;
