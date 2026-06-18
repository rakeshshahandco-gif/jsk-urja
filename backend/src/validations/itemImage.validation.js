import Joi from 'joi';
import { ITEM_IMAGE_TYPES } from '../constants/itemImage.constants.js';

const objectId = Joi.string().hex().length(24);

const listByItem = {
    params: Joi.object({
        itemId: objectId.required(),
    }),
    query: Joi.object({
        imageType: Joi.string().valid(...ITEM_IMAGE_TYPES).optional(),
        companyId: objectId.optional(),
    }),
};

const upload = {
    params: Joi.object({
        itemId: objectId.required(),
    }),
    body: Joi.object({
        imageType: Joi.string().valid(...ITEM_IMAGE_TYPES).required(),
        source: Joi.string().valid('upload', 'mobile_scan', 'replace').optional(),
        companyId: objectId.optional(),
        scanMode: Joi.string().optional(),
    }),
};

const imageId = {
    params: Joi.object({
        imageId: objectId.required(),
    }),
    query: Joi.object({
        companyId: objectId.optional(),
    }),
};

const replace = {
    params: Joi.object({
        imageId: objectId.required(),
    }),
    body: Joi.object({
        source: Joi.string().valid('upload', 'mobile_scan', 'replace').optional(),
        companyId: objectId.optional(),
    }),
};

export default {
    listByItem,
    upload,
    getImage: imageId,
    replace,
    remove: imageId,
};
