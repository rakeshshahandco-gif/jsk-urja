import Joi from 'joi';

const objectId = Joi.string().hex().length(24);

const upsertBody = {
    name: Joi.string().min(1).max(200),
    code: Joi.string().min(1).max(60),
    category: Joi.string().allow('').max(120),
    shortDescription: Joi.string().allow('').max(2000),
    detailedDescription: Joi.string().allow('').max(20000),
    technicalSpecs: Joi.object().unknown(true),
    imageUrl: Joi.string().allow('').max(2000),
    catalogPdfUrl: Joi.string().allow('').max(2000),
    datasheetPdfUrl: Joi.string().allow('').max(2000),
    brochureUrl: Joi.string().allow('').max(2000),
    videoUrl: Joi.string().allow('').max(2000),
    linkedItemId: objectId.allow('', null),
    isActive: Joi.boolean(),
};

const create = {
    body: Joi.object().keys({
        ...upsertBody,
        name: upsertBody.name.required(),
        code: upsertBody.code.required(),
    }),
};

const update = {
    params: Joi.object().keys({ id: objectId.required() }),
    body: Joi.object().keys(upsertBody).min(1),
};

const getOne = { params: Joi.object().keys({ id: objectId.required() }) };
const remove = { params: Joi.object().keys({ id: objectId.required() }) };

const list = {
    query: Joi.object().keys({
        search: Joi.string().allow(''),
        category: Joi.string().allow(''),
        isActive: Joi.boolean(),
        page: Joi.number().integer().min(1),
        limit: Joi.number().integer().min(1).max(200),
        sortBy: Joi.string(),
    }),
};

const uploadAsset = {
    params: Joi.object().keys({ id: objectId.required() }),
    query: Joi.object().keys({
        assetType: Joi.string().valid('image', 'catalog', 'datasheet', 'brochure').required(),
    }),
};

export default { create, update, getOne, remove, list, uploadAsset };
