import Joi from 'joi';

const objectId = Joi.string().hex().length(24);

const STATUS = ['new', 'contacted', 'qualified', 'quotation', 'negotiation', 'won', 'lost', 'hold'];
const SOURCE = ['whatsapp', 'manual', 'call', 'email', 'visit', 'other'];
const PRIORITY = ['high', 'medium', 'low'];
const ASSET = ['catalog', 'datasheet', 'brochure', 'image', 'details', 'video'];
const CHANNEL = ['whatsapp', 'email', 'link'];

const productItem = Joi.object().keys({
    catalogProductId: objectId.required(),
    quantity: Joi.number().min(0).default(0),
    requirementNote: Joi.string().allow('').max(2000),
});

const whatsappBlock = Joi.object().keys({
    messageText: Joi.string().allow('').max(20000),
    receivedAt: Joi.date(),
    threadRef: Joi.string().allow('').max(200),
    attachments: Joi.array().items(
        Joi.object().keys({
            url: Joi.string().allow('').max(2000),
            name: Joi.string().allow('').max(200),
            mime: Joi.string().allow('').max(120),
        }),
    ),
});

const baseLeadBody = {
    customerId: objectId.allow(null, ''),
    customerName: Joi.string().allow('').max(200),
    customerMobile: Joi.string().allow('').max(40),
    customerEmail: Joi.string().allow('').max(200),
    source: Joi.string().valid(...SOURCE),
    status: Joi.string().valid(...STATUS),
    priority: Joi.string().valid(...PRIORITY),
    assignedTo: objectId.allow(null, ''),
    nextFollowUpDate: Joi.date().allow(null),
    whatsapp: whatsappBlock,
    products: Joi.array().items(productItem),
    notes: Joi.string().allow('').max(20000),
};

const create = {
    body: Joi.object().keys(baseLeadBody).min(1),
};

const update = {
    params: Joi.object().keys({ id: objectId.required() }),
    body: Joi.object().keys(baseLeadBody).min(1),
};

const getOne = { params: Joi.object().keys({ id: objectId.required() }) };
const remove = { params: Joi.object().keys({ id: objectId.required() }) };

const list = {
    query: Joi.object().keys({
        search: Joi.string().allow(''),
        status: Joi.string().valid(...STATUS),
        source: Joi.string().valid(...SOURCE),
        assignedTo: objectId,
        page: Joi.number().integer().min(1),
        limit: Joi.number().integer().min(1).max(200),
        sortBy: Joi.string(),
    }),
};

const fromWhatsApp = {
    body: Joi.object().keys({
        messageText: Joi.string().min(1).max(20000).required(),
        customerMobile: Joi.string().allow('').max(40),
        customerName: Joi.string().allow('').max(200),
        whatsappChatId: Joi.string().allow('').max(200),
        whatsappName: Joi.string().allow('').max(200),
        rawWhatsAppId: Joi.string().allow('').max(200),
        normalizedMobile: Joi.string().allow('').max(40),
        receivedAt: Joi.date(),
        threadRef: Joi.string().allow('').max(200),
        attachments: Joi.array().items(
            Joi.object().keys({
                url: Joi.string().allow('').max(2000),
                name: Joi.string().allow('').max(200),
                mime: Joi.string().allow('').max(120),
            }),
        ),
        assignedTo: objectId.allow(null, ''),
        priority: Joi.string().valid(...PRIORITY),
        notes: Joi.string().allow('').max(20000),
    }),
};

const shareAsset = {
    params: Joi.object().keys({ id: objectId.required() }),
    body: Joi.object().keys({
        catalogProductId: objectId.required(),
        assetType: Joi.string().valid(...ASSET).required(),
        channel: Joi.string().valid(...CHANNEL).default('whatsapp'),
        url: Joi.string().allow('').max(2000),
    }),
};

const activities = {
    params: Joi.object().keys({ id: objectId.required() }),
    query: Joi.object().keys({
        limit: Joi.number().integer().min(1).max(500),
    }),
};

export default { create, update, getOne, remove, list, fromWhatsApp, shareAsset, activities };
