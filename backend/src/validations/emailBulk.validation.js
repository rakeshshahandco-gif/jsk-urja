import Joi from 'joi';
import {
    EMAIL_BULK_CAMPAIGN_STATUSES,
    EMAIL_BULK_SEND_MODES,
    EMAIL_BULK_RECIPIENT_SOURCES,
    EMAIL_BULK_ATTACHMENT_TYPES,
    EMAIL_BULK_SEND_CONTENT_TYPES,
} from '../constants/emailBulk.constants.js';

const objectId = Joi.string().hex().length(24);

const attachmentRefSchema = Joi.object({
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
    states: Joi.array().items(Joi.string()),
    cities: Joi.array().items(Joi.string()),
    activeOnly: Joi.boolean(),
    inactiveOnly: Joi.boolean(),
    selectedCustomerIds: Joi.array().items(objectId),
    selectedSupplierIds: Joi.array().items(objectId),
});

const campaignBody = {
    campaignName: Joi.string().required(),
    recipientSource: Joi.string().valid(...EMAIL_BULK_RECIPIENT_SOURCES).required(),
    filters: filtersSchema,
    templateId: objectId.allow(null, ''),
    subject: Joi.string().allow(''),
    bodyText: Joi.string().allow(''),
    bodyHtml: Joi.string().allow(''),
    sendContentType: Joi.string().valid(...EMAIL_BULK_SEND_CONTENT_TYPES),
    attachments: Joi.array().items(attachmentRefSchema),
    sendMode: Joi.string().valid(...EMAIL_BULK_SEND_MODES),
    scheduleType: Joi.string().valid('now', 'later', 'batch'),
    scheduledStartAt: Joi.alternatives().try(Joi.date().iso(), Joi.string().valid('')).allow(null).empty(['', null]),
    timezone: Joi.string(),
    sendWindowStart: Joi.string(),
    sendWindowEnd: Joi.string(),
    dailyLimit: Joi.number().min(1),
    batchSize: Joi.number().min(1),
    gapBetweenBatchesMs: Joi.number().min(0),
    uploadFilePath: Joi.string().allow(''),
    manualEmails: Joi.array().items(Joi.string()),
    testSendEmail: Joi.string().allow(''),
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
        defaultSendMode: Joi.string().valid(...EMAIL_BULK_SEND_MODES),
        defaultBatchSize: Joi.number().min(1),
        defaultTimezone: Joi.string(),
    }),
};

const template = {
    body: Joi.object().keys({
        templateName: Joi.string().required(),
        category: Joi.string().allow(''),
        subject: Joi.string().allow(''),
        bodyText: Joi.string().allow(''),
        bodyHtml: Joi.string().allow(''),
        sendContentType: Joi.string().valid(...EMAIL_BULK_SEND_CONTENT_TYPES),
        attachmentType: Joi.string().valid(...EMAIL_BULK_ATTACHMENT_TYPES),
        attachments: Joi.array().items(attachmentRefSchema),
        isActive: Joi.boolean(),
    }),
};

const blacklist = {
    body: Joi.object().keys({
        email: Joi.string().email().required(),
        reason: Joi.string().allow(''),
        source: Joi.string().valid('manual', 'unsubscribe', 'do_not_send', 'bounce'),
        notes: Joi.string().allow(''),
    }),
};

const preview = {
    body: Joi.object().keys({
        recipientSource: Joi.string().valid(...EMAIL_BULK_RECIPIENT_SOURCES).required(),
        filters: filtersSchema,
        manualEmails: Joi.array().items(Joi.string()),
        uploadFilePath: Joi.string().allow(''),
    }),
};

const testSend = {
    body: Joi.object().keys({
        email: Joi.string().email().required(),
    }),
};

export default {
    settings,
    template,
    blacklist,
    createCampaign: { body: Joi.object().keys(campaignBody) },
    updateCampaign: { body: Joi.object().keys(campaignBody), params: Joi.object().keys({ id: objectId.required() }) },
    preview,
    testSend: { ...testSend, params: Joi.object().keys({ id: objectId.required() }) },
    listCampaigns: {
        query: Joi.object().keys({
            status: Joi.string().valid(...EMAIL_BULK_CAMPAIGN_STATUSES),
            limit: Joi.number().min(1).max(500),
        }),
    },
};
