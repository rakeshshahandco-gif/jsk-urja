import Joi from 'joi';
import {
    WHATSAPP_BULK_CAMPAIGN_STATUSES,
    WHATSAPP_BULK_SEND_MODES,
    WHATSAPP_BULK_RECIPIENT_SOURCES,
    WHATSAPP_BULK_ATTACHMENT_TYPES,
    WHATSAPP_BULK_SEND_CONTENT_TYPES,
} from '../constants/whatsappBulk.constants.js';

const objectId = Joi.string().hex().length(24);

const imageAttachmentSchema = Joi.object({
    attachmentId: Joi.string().allow(''),
    fileName: Joi.string().required(),
    filePath: Joi.string().required(),
    fileUrl: Joi.string().allow(''),
    mimeType: Joi.string().allow(''),
    sizeBytes: Joi.number().min(0),
    checksum: Joi.string().allow(''),
    companyId: objectId.allow(null, ''),
    financialYearId: objectId.allow(null, ''),
    createdBy: objectId.allow(null, ''),
}).allow(null);

const filtersSchema = Joi.object({
    customerTypes: Joi.array().items(Joi.string()),
    industryTypes: Joi.array().items(Joi.string()),
    businessCategory: Joi.string().allow('', 'All'),
    states: Joi.array().items(Joi.string()),
    cities: Joi.array().items(Joi.string()),
    activeOnly: Joi.boolean(),
    inactiveOnly: Joi.boolean(),
    selectedCustomerIds: Joi.array().items(objectId),
    selectedRecipientKeys: Joi.array().items(Joi.string()),
});

const campaignBody = {
    campaignName: Joi.string().required(),
    recipientSource: Joi.string().valid(...WHATSAPP_BULK_RECIPIENT_SOURCES).required(),
    filters: filtersSchema,
    matterId: objectId.allow(null, ''),
    messageBody: Joi.string().allow(''),
    sendContentType: Joi.string().valid(...WHATSAPP_BULK_SEND_CONTENT_TYPES),
    attachmentPath: Joi.string().allow(''),
    imageAttachment: imageAttachmentSchema,
    sendMode: Joi.string().valid(...WHATSAPP_BULK_SEND_MODES),
    scheduleType: Joi.string().valid('now', 'later', 'batch'),
    scheduledStartAt: Joi.alternatives().try(
        Joi.date().iso(),
        Joi.string().valid(''),
    ).allow(null).empty(['', null]),
    timezone: Joi.string(),
    sendWindowStart: Joi.string(),
    sendWindowEnd: Joi.string(),
    dailyLimit: Joi.number().min(1),
    batchSize: Joi.number().min(1),
    gapBetweenBatchesMs: Joi.number().min(0),
    uploadFilePath: Joi.string().allow(''),
    manualNumbers: Joi.array().items(Joi.string()),
    testSendMobile: Joi.string().allow(''),
};

const settings = {
    body: Joi.object().keys({
        enabled: Joi.boolean(),
        enableFastMode: Joi.boolean(),
        safeDelayMinMs: Joi.number().min(0),
        safeDelayMaxMs: Joi.number().min(0),
        pauseAfterMessages: Joi.number().min(1),
        pauseDurationMs: Joi.number().min(0),
        dailyLimit: Joi.number().min(1),
        retryFailedMessages: Joi.boolean(),
        sendWindowStart: Joi.string(),
        sendWindowEnd: Joi.string(),
        defaultSendMode: Joi.string().valid(...WHATSAPP_BULK_SEND_MODES),
        defaultBatchSize: Joi.number().min(1),
        defaultTimezone: Joi.string(),
    }),
};

const matter = {
    body: Joi.object().keys({
        matterName: Joi.string().required(),
        category: Joi.string().allow(''),
        industry: Joi.string().allow(''),
        language: Joi.string().allow(''),
        messageBody: Joi.string().allow(''),
        sendContentType: Joi.string().valid(...WHATSAPP_BULK_SEND_CONTENT_TYPES),
        attachmentType: Joi.string().valid(...WHATSAPP_BULK_ATTACHMENT_TYPES),
        attachmentPath: Joi.string().allow(''),
        attachmentOriginalName: Joi.string().allow(''),
        imageAttachment: imageAttachmentSchema,
        isActive: Joi.boolean(),
    }).custom((value, helpers) => {
        const mode = value.sendContentType || 'text_only';
        if (mode === 'text_only' && !String(value.messageBody || '').trim()) {
            return helpers.error('any.custom', { message: 'Message body is required for text-only matter' });
        }
        if (mode !== 'text_only' && !value.imageAttachment?.filePath && !value.attachmentPath) {
            return helpers.error('any.custom', { message: 'Image attachment is required for image send modes' });
        }
        if (mode === 'image_with_caption' && !String(value.messageBody || '').trim()) {
            return helpers.error('any.custom', { message: 'Caption is required for image + caption matter' });
        }
        return value;
    }, 'matter send content validation'),
};

const blacklist = {
    body: Joi.object().keys({
        mobile: Joi.string().required(),
        reason: Joi.string().allow(''),
        source: Joi.string().valid('manual', 'unsubscribe', 'do_not_send'),
        notes: Joi.string().allow(''),
    }),
};

const preview = {
    body: Joi.object().keys({
        recipientSource: Joi.string().valid(...WHATSAPP_BULK_RECIPIENT_SOURCES).required(),
        filters: filtersSchema,
        manualNumbers: Joi.array().items(Joi.string()),
        uploadFilePath: Joi.string().allow(''),
    }),
};

const testSend = {
    body: Joi.object().keys({
        mobile: Joi.string().required(),
    }),
};

export default {
    settings,
    matter,
    blacklist,
    createCampaign: { body: Joi.object().keys(campaignBody) },
    updateCampaign: { body: Joi.object().keys(campaignBody), params: Joi.object().keys({ id: objectId.required() }) },
    preview,
    testSend: { ...testSend, params: Joi.object().keys({ id: objectId.required() }) },
    listCampaigns: {
        query: Joi.object().keys({
            status: Joi.string().valid(...WHATSAPP_BULK_CAMPAIGN_STATUSES),
            limit: Joi.number().min(1).max(500),
        }),
    },
};
