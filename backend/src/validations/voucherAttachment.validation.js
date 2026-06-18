import Joi from 'joi';

const objectId = Joi.string().hex().length(24);

const voucherType = Joi.string().valid(
    'purchase_invoice',
    'sales_invoice',
    'expense_voucher',
    'payment_voucher',
    'receipt_voucher',
    'delivery_challan',
    'customer_master',
    'supplier_master',
    'petty_cash',
);

const list = {
    query: Joi.object().keys({
        voucherType,
        voucherId: objectId,
        page: Joi.number().integer().min(1),
        limit: Joi.number().integer().min(1).max(200),
        sortBy: Joi.string(),
    }),
};

const listByVoucher = {
    params: Joi.object().keys({
        voucherType: voucherType.required(),
        voucherId: objectId.required(),
    }),
};

const search = {
    query: Joi.object().keys({
        searchBy: Joi.string().valid('billNo', 'voucherNo', 'partyName', 'lastSaved').default('lastSaved'),
        search: Joi.string().allow(''),
        limit: Joi.number().integer().min(1).max(100),
    }),
};

const missing = {
    query: Joi.object().keys({
        category: Joi.string().valid('purchase', 'expense', 'dispatch').default('purchase'),
        limit: Joi.number().integer().min(1).max(200),
    }),
};

const upload = {
    body: Joi.object().keys({
        voucherType: voucherType.required(),
        voucherId: objectId.required(),
        voucherNumber: Joi.string().allow(''),
        partyName: Joi.string().allow(''),
        billNo: Joi.string().allow(''),
        amount: Joi.number(),
        voucherDate: Joi.date().iso(),
        source: Joi.string().valid('upload', 'scan', 'mobile_scan'),
        label: Joi.string().allow(''),
    }),
};

const remove = {
    params: Joi.object().keys({ id: objectId.required() }),
};

export default {
    list,
    listByVoucher,
    search,
    missing,
    upload,
    remove,
};
