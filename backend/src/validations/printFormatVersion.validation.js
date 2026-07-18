import Joi from 'joi';
import {
    PRINT_FORMAT_VERSION_DOCUMENT_TYPES,
    PRINT_FORMAT_VERSION_ORIENTATIONS,
    PRINT_FORMAT_VERSION_PAPER_SIZES,
    PRINT_FORMAT_VERSION_STATUSES,
} from '../constants/printFormatVersion.constants.js';

const objectId = Joi.string().hex().length(24);
const statusField = Joi.string().uppercase().valid(...PRINT_FORMAT_VERSION_STATUSES);

const margins = Joi.object({
    top: Joi.number().optional(),
    right: Joi.number().optional(),
    bottom: Joi.number().optional(),
    left: Joi.number().optional(),
    unit: Joi.string().optional(),
}).optional();

const listQuery = {
    query: Joi.object({
        companyId: objectId.optional(),
        documentType: Joi.string().uppercase().valid(...PRINT_FORMAT_VERSION_DOCUMENT_TYPES).optional(),
        status: statusField.optional(),
    }),
};

const idParams = {
    params: Joi.object({ id: objectId.required() }),
};

const createBody = {
    body: Joi.object({
        companyId: objectId.required(),
        documentType: Joi.string().uppercase().valid(...PRINT_FORMAT_VERSION_DOCUMENT_TYPES).required(),
        formatVersion: Joi.string().trim().max(80).optional(),
        name: Joi.string().trim().min(1).max(160).optional(),
        paperSize: Joi.string().valid(...PRINT_FORMAT_VERSION_PAPER_SIZES).optional(),
        orientation: Joi.string().valid(...PRINT_FORMAT_VERSION_ORIENTATIONS).optional(),
        margins,
        layoutSnapshot: Joi.object().unknown(true).optional(),
        notes: Joi.string().allow('').max(4000).optional(),
        formPrintLockId: objectId.allow(null).optional(),
        goldenReferenceId: objectId.allow(null).optional(),
    }),
};

const copyBody = {
    params: Joi.object({ id: objectId.required() }),
    body: Joi.object({
        companyId: objectId.optional(),
        documentType: Joi.string().uppercase().valid(...PRINT_FORMAT_VERSION_DOCUMENT_TYPES).optional(),
        formatVersion: Joi.string().trim().max(80).optional(),
        name: Joi.string().trim().min(1).max(160).optional(),
        notes: Joi.string().allow('').max(4000).optional(),
    }).optional(),
};

const updateBody = {
    params: Joi.object({ id: objectId.required() }),
    body: Joi.object({
        name: Joi.string().trim().min(1).max(160).optional(),
        paperSize: Joi.string().valid(...PRINT_FORMAT_VERSION_PAPER_SIZES).optional(),
        orientation: Joi.string().valid(...PRINT_FORMAT_VERSION_ORIENTATIONS).optional(),
        margins,
        layoutSnapshot: Joi.object().unknown(true).optional(),
        notes: Joi.string().allow('').max(4000).optional(),
        formPrintLockId: objectId.allow(null).optional(),
        goldenReferenceId: objectId.allow(null).optional(),
    }).min(1),
};

const previewQuery = {
    params: Joi.object({ id: objectId.required() }),
    query: Joi.object({
        documentId: objectId.optional(),
        documentNumber: Joi.string().trim().max(80).optional(),
    }),
};

export default {
    list: listQuery,
    get: idParams,
    create: createBody,
    copy: copyBody,
    update: updateBody,
    approve: idParams,
    setDefault: idParams,
    lock: idParams,
    archive: idParams,
    preview: previewQuery,
    registry: {},
};
