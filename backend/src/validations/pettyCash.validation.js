import Joi from 'joi';

const objectId = Joi.string().hex().length(24);

const settings = {
    body: Joi.object().keys({
        financialYear: Joi.string().required(),
        openingBalance: Joi.number(),
        pettyCashLedgerId: objectId.allow(null, ''),
        pettyCashCashBankAccountId: objectId.allow(null, ''),
        replenishmentCashBankAccountId: objectId.allow(null, ''),
        isActive: Joi.boolean(),
    }),
};

const createEntry = {
    body: Joi.object().keys({
        date: Joi.date().iso().required(),
        externalVoucherNo: Joi.string().allow(''),
        billNo: Joi.string().allow(''),
        ledgerId: objectId.allow(null, ''),
        accountHead: Joi.string().allow(''),
        narration: Joi.string().allow(''),
        payment: Joi.number().min(0).default(0),
        receipt: Joi.number().min(0).default(0),
        remarks: Joi.string().allow(''),
        financialYear: Joi.string(),
        postNow: Joi.boolean(),
    }),
};

const listEntries = {
    query: Joi.object().keys({
        financialYear: Joi.string(),
        status: Joi.string().valid('draft', 'posted', 'cancelled'),
        entryKind: Joi.string().valid('payment', 'receipt'),
        ledgerId: objectId,
        createdBy: objectId,
        fromDate: Joi.date().iso(),
        toDate: Joi.date().iso(),
        search: Joi.string().allow(''),
        page: Joi.number().integer().min(1),
        limit: Joi.number().integer().min(1).max(500),
    }),
};

const report = {
    query: Joi.object().keys({
        financialYear: Joi.string(),
        reportType: Joi.string().valid('book', 'daily', 'monthly', 'account_head', 'voucher', 'bill', 'missing_attachments'),
        entryKind: Joi.string().valid('payment', 'receipt'),
        ledgerId: objectId,
        createdBy: objectId,
        fromDate: Joi.date().iso(),
        toDate: Joi.date().iso(),
    }),
};

const importUpload = {
    body: Joi.object().keys({
        financialYear: Joi.string().required(),
    }),
};

const batchId = {
    params: Joi.object().keys({ batchId: objectId.required() }),
};

const approveImport = {
    params: Joi.object().keys({ batchId: objectId.required() }),
    body: Joi.object().keys({
        rowNumbers: Joi.array().items(Joi.number().integer().min(1)).min(1).optional(),
    }),
};

export default {
    settings,
    createEntry,
    listEntries,
    report,
    importUpload,
    batchId,
    approveImport,
};
