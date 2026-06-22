import mongoose from 'mongoose';
import {
    WHATSAPP_BULK_CAMPAIGN_STATUSES,
    WHATSAPP_BULK_SEND_MODES,
    WHATSAPP_BULK_RECIPIENT_SOURCES,
    WHATSAPP_BULK_SEND_CONTENT_TYPES,
} from '../constants/whatsappBulk.constants.js';
import whatsappBulkAttachmentRefSchema from './whatsappBulkAttachmentRef.schema.js';

const filterSchema = new mongoose.Schema(
    {
        customerTypes: [{ type: String }],
        industryTypes: [{ type: String }],
        states: [{ type: String }],
        cities: [{ type: String }],
        activeOnly: { type: Boolean, default: false },
        inactiveOnly: { type: Boolean, default: false },
        selectedCustomerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }],
    },
    { _id: false },
);

const whatsappBulkCampaignSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        campaignName: { type: String, required: true, trim: true },
        status: { type: String, enum: WHATSAPP_BULK_CAMPAIGN_STATUSES, default: 'Draft', index: true },
        recipientSource: { type: String, enum: WHATSAPP_BULK_RECIPIENT_SOURCES, required: true },
        filters: { type: filterSchema, default: () => ({}) },
        matterId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppBulkMatter', default: null },
        messageBody: { type: String, trim: true, default: '' },
        sendContentType: { type: String, enum: WHATSAPP_BULK_SEND_CONTENT_TYPES, default: 'text_only' },
        attachmentPath: { type: String, trim: true, default: '' },
        imageAttachment: { type: whatsappBulkAttachmentRefSchema, default: null },
        sendMode: { type: String, enum: WHATSAPP_BULK_SEND_MODES, default: 'SAFE' },
        scheduleType: { type: String, enum: ['now', 'later', 'batch'], default: 'now' },
        scheduledStartAt: { type: Date, default: null },
        timezone: { type: String, default: 'Asia/Kolkata' },
        sendWindowStart: { type: String, default: '09:00' },
        sendWindowEnd: { type: String, default: '19:00' },
        dailyLimit: { type: Number, default: 100 },
        batchSize: { type: Number, default: 25 },
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
        manualNumbers: [{ type: String }],
        testSendMobile: { type: String, default: '' },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

whatsappBulkCampaignSchema.index({ companyId: 1, status: 1, scheduledStartAt: 1 });

const WhatsAppBulkCampaign = mongoose.model('WhatsAppBulkCampaign', whatsappBulkCampaignSchema);
export default WhatsAppBulkCampaign;
